// End-to-end check for the WaMatrix Trigger in a running n8n (`n8n start`):
// activation registers the webhook, signed deliveries start the workflow, unsigned or
// tampered ones are refused, and deliveries still verify after an n8n restart.
//
//   N8N_BIN=<path to n8n executable> node scripts/e2e/trigger.js
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const { createHarness, credential } = require('./harness');
const { startMockApi, TOKEN } = require('./mock-api');

const N8N_PORT = 5699;
const WEBHOOK_PATH = 'wamatrix-e2e';

const workflow = {
	id: 'wamatrixTriggerE2E',
	name: 'WaMatrix Trigger E2E',
	active: true,
	nodes: [
		{
			id: 'trigger',
			name: 'WaMatrix Trigger',
			// A package in <userFolder>/.n8n/custom loads as CUSTOM.*, the same as `n8n-node dev`.
			type: 'CUSTOM.waMatrixTrigger',
			typeVersion: 1,
			position: [0, 0],
			webhookId: WEBHOOK_PATH,
			parameters: { events: ['messageReceived'] },
			credentials: credential,
		},
		{
			id: 'echo',
			name: 'Echo',
			type: 'CUSTOM.waMatrix',
			typeVersion: 1,
			position: [300, 0],
			parameters: {
				resource: 'message',
				operation: 'sendText',
				channelId: 2,
				sendTo: 'phone',
				phoneNumber: '={{ $json.from }}',
				text: '=echo: {{ $json.text }} ({{ $json.contact_name }})',
			},
			credentials: credential,
		},
	],
	connections: { 'WaMatrix Trigger': { main: [[{ node: 'Echo', type: 'main', index: 0 }]] } },
	settings: { executionOrder: 'v1' },
};

const delivery = JSON.stringify({
	event: 'messages',
	tenant_id: 7,
	channel_id: 2,
	payload: {
		metadata: { display_phone_number: '15550001111', phone_number_id: '1098' },
		contacts: [{ profile: { name: 'Asha' }, wa_id: '919876543210' }],
		messages: [
			{
				from: '919876543210',
				id: 'wamid.1',
				timestamp: '1761904800',
				type: 'text',
				text: { body: 'hello' },
			},
		],
	},
	timestamp: new Date().toISOString(),
});

const sign = (body, secret) => `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

async function waitFor(check, what) {
	for (let i = 0; i < 60; i++) {
		const value = await check();
		if (value) return value;
		await new Promise((resolve) => setTimeout(resolve, 500));
	}
	throw new Error(`Timed out waiting for ${what}`);
}

async function main() {
	const { server, state, port } = await startMockApi();
	const n8n = createHarness({ N8N_WEBHOOK_URL: `http://127.0.0.1:${N8N_PORT}/` });
	let n8nServer;

	try {
		await n8n.importCredential(port, TOKEN);
		await n8n.importWorkflow(workflow);
		await n8n.run(['publish:workflow', `--id=${workflow.id}`]);
		n8nServer = await n8n.startServer(N8N_PORT);

		// Activation registered exactly one subscription, for the URL and events it needs.
		const webhookUrl = `http://127.0.0.1:${N8N_PORT}/webhook/${WEBHOOK_PATH}/webhook`;
		await waitFor(() => state.webhooks.length === 1, 'the trigger to register its webhook');
		const [registration] = state.webhooks;
		assert.equal(registration.url, webhookUrl);
		assert.deepEqual(registration.events, ['messages']);
		assert.match(registration.description, /^n8n: WaMatrix Trigger E2E/);

		const post = (body, signature) =>
			fetch(webhookUrl, {
				method: 'POST',
				headers: {
					'Content-Type': 'application/json',
					...(signature ? { 'X-Webhook-Signature': signature } : {}),
				},
				body,
			});

		// Unsigned, wrongly signed and tampered requests never start the workflow.
		assert.equal((await post(delivery)).status, 401);
		assert.equal((await post(delivery, sign(delivery, 'wrong-secret-000000'))).status, 401);
		assert.equal(
			(await post(delivery.replace('hello', 'HACKED'), sign(delivery, registration.secret))).status,
			401,
		);

		// A correctly signed delivery runs the workflow with the friendly fields.
		assert.equal((await post(delivery, sign(delivery, registration.secret))).status, 200);
		const echo = await waitFor(
			() => state.requests.find((r) => r.method === 'POST' && r.path === '/api/v1/messages'),
			'the workflow to send its echo',
		);
		assert.equal(echo.body.body, 'echo: hello (Asha)');
		assert.equal(echo.body.contact_id, 1);
		assert.equal(state.requests.filter((r) => r.path === '/api/v1/messages').length, 1);

		// After a restart n8n serves the same registration (it does not re-run the webhook
		// hooks for already-active workflows): no duplicate, and the secret kept in static
		// data still verifies deliveries.
		await n8nServer.stop();
		n8nServer = await n8n.startServer(N8N_PORT);
		const second = delivery.replace('hello', 'again');
		// /healthz answers before n8n has re-activated its workflows, so wait for the route.
		const status = await waitFor(async () => {
			const { status } = await post(second, sign(second, registration.secret));
			return status === 404 ? false : status;
		}, 'the webhook to be served again');
		assert.equal(status, 200);
		await waitFor(
			() =>
				state.requests.some(
					(r) => r.path === '/api/v1/messages' && r.body.body === 'echo: again (Asha)',
				),
			'the workflow to run after the restart',
		);
		assert.equal(state.webhooks.length, 1);
		assert.equal(
			state.requests.filter((r) => r.method === 'POST' && r.path === '/api/v1/webhooks').length,
			1,
		);

		console.log(
			'Trigger E2E passed: registration, signature checks, delivery, delivery after restart',
		);
	} catch (error) {
		if (n8nServer) console.error(n8nServer.log().slice(-4000));
		throw error;
	} finally {
		if (n8nServer) await n8nServer.stop();
		server.close();
	}
}

main().catch((error) => {
	console.error(error);
	process.exit(1);
});
