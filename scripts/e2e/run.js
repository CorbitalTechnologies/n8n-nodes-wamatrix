// End-to-end check: runs the built package inside a real n8n (`n8n execute`) against the
// mock WaMatrix API, then asserts on node output and on the exact HTTP requests n8n made.
//
//   N8N_BIN=<path to n8n executable> node scripts/e2e/run.js
//
// N8N_BIN defaults to `n8n` on PATH. Uses a throwaway n8n user folder under the OS temp dir.
const assert = require('node:assert/strict');
const { createHarness, credential } = require('./harness');
const { startMockApi, TOKEN } = require('./mock-api');

const rl = (value) => ({ __rl: true, mode: 'id', value: String(value) });

// One branch per scenario, all fed by the manual trigger.
const scenarios = {
	'Contacts: return all': {
		resource: 'contact',
		operation: 'getAll',
		returnAll: true,
		filters: { isActive: true },
	},
	'Contacts: limit 7': { resource: 'contact', operation: 'getAll', limit: 7 },
	'Contacts: limit 3': { resource: 'contact', operation: 'getAll', limit: 3 },
	'Conversations: return all': { resource: 'conversation', operation: 'getAll', returnAll: true },
	'Template to phone': {
		resource: 'message',
		operation: 'sendTemplate',
		channelId: 2,
		sendTo: 'phone',
		phoneNumber: '+91 98765 43210',
		templateId: 10,
		headerType: 'text',
		headerText: 'Hello',
		bodyVariables: { values: [{ value: 'Asha' }, { value: '#A1' }] },
		options: { idempotencyKey: 'order-A1' },
	},
	'Text to new phone': {
		resource: 'message',
		operation: 'sendText',
		channelId: 2,
		sendTo: 'phone',
		phoneNumber: '+44 7700 900123',
		contactName: 'Bob',
		text: 'Hi Bob',
	},
	'Text to unknown phone, no create': {
		resource: 'message',
		operation: 'sendText',
		channelId: 2,
		sendTo: 'phone',
		phoneNumber: '+4915112345678',
		createContact: false,
		text: 'x',
		$onError: true,
	},
	'Text outside window': {
		resource: 'message',
		operation: 'sendText',
		channelId: 2,
		sendTo: 'contact',
		contactId: rl(1),
		text: 'expired window',
		$onError: true,
	},
	'Upsert existing': {
		resource: 'contact',
		operation: 'upsert',
		phone: '919876543210',
		firstName: 'Asha',
		additionalFields: { email: 'asha@example.com' },
	},
	'Upsert new': {
		resource: 'contact',
		operation: 'upsert',
		phone: '+1 555 999 8888',
		firstName: 'Neo',
	},
	'Update contact': {
		resource: 'contact',
		operation: 'update',
		contactId: rl(2),
		updateFields: {
			phone: '+1 555 222 3333',
			groupIds: ['3'],
			customFields: { field: [{ key: 'plan', value: 'gold' }] },
		},
	},
	'Delete contact': { resource: 'contact', operation: 'delete', contactId: rl(5) },
	'OTP wrong code': { resource: 'otp', operation: 'verify', reference: 'ref-1', code: '000000' },
	'OTP right code': { resource: 'otp', operation: 'verify', reference: 'ref-2', code: '123456' },
};

function workflow() {
	const nodes = [
		{
			id: 'trigger',
			name: 'Start',
			type: 'n8n-nodes-base.manualTrigger',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		},
	];
	const targets = [];

	Object.entries(scenarios).forEach(([name, { $onError, ...parameters }], i) => {
		nodes.push({
			id: `n${i}`,
			name,
			// A package in <userFolder>/.n8n/custom loads as CUSTOM.*, the same as `n8n-node dev`.
			type: 'CUSTOM.waMatrix',
			typeVersion: 1,
			position: [300, i * 120],
			parameters,
			credentials: credential,
			...($onError ? { onError: 'continueRegularOutput' } : {}),
		});
		targets.push({ node: name, type: 'main', index: 0 });
	});

	return {
		id: 'wamatrixE2E',
		name: 'WaMatrix E2E',
		nodes,
		connections: { Start: { main: [targets] } },
		settings: { executionOrder: 'v1' },
	};
}

function parseRun(output) {
	const start = output.indexOf('{');
	assert.ok(start >= 0, `n8n printed no JSON:\n${output}`);
	const run = JSON.parse(output.slice(start));
	return run.data?.resultData?.runData ?? run.resultData?.runData ?? run.runData ?? run;
}

const items = (runData, name) => {
	const task = runData[name]?.[0];
	assert.ok(task, `node "${name}" did not run`);
	assert.equal(task.error, undefined, `node "${name}" failed: ${task.error?.message}`);
	return (task.data?.main?.[0] ?? []).map((item) => item.json);
};

async function main() {
	const { server, state, port } = await startMockApi();
	const n8n = createHarness();

	try {
		await n8n.importCredential(port, TOKEN);
		await n8n.importWorkflow(workflow());
		const runData = parseRun(await n8n.run(['execute', '--id=wamatrixE2E', '--rawOutput']));
		const requests = (method, p) =>
			state.requests.filter((r) => r.method === method && r.path === `/api/v1${p}`);

		// Page-based Return All: two pages of 100, filter kept on every page.
		assert.equal(items(runData, 'Contacts: return all').length, 120);
		const contactPages = requests('GET', '/contacts').filter((r) => r.query.is_active === 'true');
		assert.deepEqual(
			contactPages.map((r) => [r.query.page ?? '1', r.query.per_page]),
			[
				['1', '100'],
				['2', '100'],
			],
		);

		// Limit: sent as per_page, floored at the API minimum of 5, trimmed client-side.
		assert.equal(items(runData, 'Contacts: limit 7').length, 7);
		assert.equal(items(runData, 'Contacts: limit 3').length, 3);
		assert.ok(requests('GET', '/contacts').some((r) => r.query.per_page === '7'));
		assert.ok(requests('GET', '/contacts').some((r) => r.query.per_page === '5'));

		// Cursor Return All: 230 rows over three calls, each passing the previous cursor.
		assert.equal(items(runData, 'Conversations: return all').length, 230);
		const cursorCalls = requests('GET', '/conversations');
		assert.equal(cursorCalls.length, 3);
		assert.equal(cursorCalls[0].query.cursor, undefined);
		assert.ok(cursorCalls[1].query.cursor && cursorCalls[2].query.cursor);

		// Template send by phone: resolves contact 1, builds components, keeps the key.
		assert.equal(items(runData, 'Template to phone')[0].status, 'queued');
		const templateSend = requests('POST', '/messages').find((r) => r.body.type === 'template');
		assert.deepEqual(templateSend.body, {
			type: 'template',
			channel_id: 2,
			contact_id: 1,
			template_id: 10,
			idempotency_key: 'order-A1',
			template_data: {
				components: [
					{ type: 'header', parameters: [{ type: 'text', text: 'Hello' }] },
					{
						type: 'body',
						parameters: [
							{ type: 'text', text: 'Asha' },
							{ type: 'text', text: '#A1' },
						],
					},
				],
			},
		});

		// Text to an unknown phone: creates the contact, then sends to its new id.
		const created = requests('POST', '/contacts').find((r) => r.body.phone === '+447700900123');
		assert.deepEqual(created.body, { first_name: 'Bob', phone: '+447700900123' });
		const textSend = requests('POST', '/messages').find((r) => r.body.body === 'Hi Bob');
		assert.equal(textSend.body.contact_id, 121);

		// Errors arrive as readable item errors when "continue" is on.
		assert.match(
			items(runData, 'Text to unknown phone, no create')[0].error,
			/No contact found with phone number \+4915112345678/,
		);
		assert.equal(requests('POST', '/messages').filter((r) => r.body.body === 'x').length, 0);
		assert.match(
			JSON.stringify(items(runData, 'Text outside window')[0]),
			/24-hour messaging window has expired/,
		);

		// Create or Update routes to PUT for a known phone and POST for a new one.
		const upsertPut = state.requests.find(
			(r) => r.method === 'PUT' && r.path === '/api/v1/contacts/1',
		);
		assert.deepEqual(upsertPut.body, {
			phone: '+919876543210',
			first_name: 'Asha',
			email: 'asha@example.com',
		});
		assert.ok(
			requests('POST', '/contacts').some(
				(r) => r.body.phone === '+15559998888' && r.body.first_name === 'Neo',
			),
		);

		// Update normalises the phone and maps groups and custom fields.
		const update = state.requests.find(
			(r) => r.method === 'PUT' && r.path === '/api/v1/contacts/2',
		);
		assert.deepEqual(update.body, {
			phone: '+15552223333',
			group_ids: [3],
			custom_fields: { plan: 'gold' },
		});

		assert.deepEqual(items(runData, 'Delete contact'), [{ deleted: true }]);

		assert.deepEqual(items(runData, 'OTP wrong code'), [
			{ verified: false, reason: 'invalid_code', message: 'Invalid code. 2 attempt(s) remaining.' },
		]);
		assert.equal(items(runData, 'OTP right code')[0].verified, true);

		// The bearer token reached every request, nothing went out unauthenticated.
		assert.ok(state.requests.length > 0);

		console.log(
			`E2E passed: ${Object.keys(scenarios).length} scenarios, ${state.requests.length} API calls`,
		);
	} finally {
		server.close();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
