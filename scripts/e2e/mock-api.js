// A stand-in for the WaMatrix REST API (/api/v1) that mirrors the real response shapes:
// { data } envelopes, page meta for page-based lists, opaque cursors for conversations,
// 202 queued sends and { message, error_code, status } errors. Every request is recorded
// at GET /__requests so the E2E run can assert on exactly what n8n sent.
const http = require('node:http');

const TOKEN = 'test-token';

function createState() {
	const contacts = Array.from({ length: 120 }, (_, i) => ({
		id: i + 1,
		first_name: `Contact${i + 1}`,
		last_name: null,
		display_name: `Contact ${i + 1}`,
		phone: i === 0 ? '+919876543210' : `+1555${String(1000000 + i)}`,
		email: null,
		type: 'lead',
		is_active: true,
		contact_status_id: 1,
		contact_source_id: 1,
		group_ids: [],
		label_ids: [],
		custom_fields: {},
	}));
	const conversations = Array.from({ length: 230 }, (_, i) => ({
		id: 230 - i,
		contact_id: 1,
		channel_id: 2,
		status: 'open',
		is_window_open: true,
	}));
	return { contacts, conversations, webhooks: [], requests: [], nextMessageId: 900 };
}

function send(res, status, body) {
	res.writeHead(status, { 'Content-Type': 'application/json' });
	res.end(body === null ? '' : JSON.stringify(body));
}

const error = (res, status, message, code) =>
	send(res, status, { message, error_code: code, status });

function paginate(rows, url, defaultPerPage) {
	const perPage = Math.max(
		5,
		Math.min(100, Number(url.searchParams.get('per_page') ?? defaultPerPage)),
	);
	const page = Number(url.searchParams.get('page') ?? 1);
	const lastPage = Math.max(1, Math.ceil(rows.length / perPage));
	return {
		data: rows.slice((page - 1) * perPage, page * perPage),
		links: { next: page < lastPage ? 'next' : null, prev: null },
		meta: { per_page: perPage, current_page: page, last_page: lastPage, total: rows.length },
	};
}

function cursorPaginate(rows, url, defaultPerPage) {
	const perPage = Math.max(
		5,
		Math.min(100, Number(url.searchParams.get('per_page') ?? defaultPerPage)),
	);
	const cursor = url.searchParams.get('cursor');
	const offset = cursor ? Number(Buffer.from(cursor, 'base64').toString()) : 0;
	const next =
		offset + perPage < rows.length
			? Buffer.from(String(offset + perPage)).toString('base64')
			: null;
	return {
		data: rows.slice(offset, offset + perPage),
		links: { next: next ? 'next' : null, prev: null },
		meta: { per_page: perPage, next_cursor: next, prev_cursor: null },
	};
}

function route(state, req, res, url, body) {
	const path = url.pathname.replace(/^\/api\/v1/, '');
	const m = (re) => path.match(re);
	let match;

	if (path === '/ping' && req.method === 'GET') {
		return send(res, 200, { data: { pong: true } });
	}

	if (path === '/channels' && req.method === 'GET') {
		return send(res, 200, {
			data: [
				{
					id: 1,
					platform: 'whatsapp',
					name: 'Acme WABA',
					waba_id: '1234',
					phone_numbers: [
						{ id: 2, display_number: '+1 555 000 1111', verified_name: 'Acme', status: 'active' },
					],
				},
			],
		});
	}

	if (path === '/templates' && req.method === 'GET') {
		const all = [
			{
				id: 10,
				channel_id: 1,
				name: 'order_update',
				language: 'en_US',
				category: 'utility',
				status: 'APPROVED',
			},
			{
				id: 11,
				channel_id: 1,
				name: 'otp_code',
				language: 'en_US',
				category: 'authentication',
				status: 'APPROVED',
			},
		];
		const category = url.searchParams.get('category');
		return send(
			res,
			200,
			paginate(
				all.filter((t) => !category || t.category === category),
				url,
				50,
			),
		);
	}

	if (path === '/contacts' && req.method === 'GET') {
		let rows = state.contacts;
		const search = url.searchParams.get('search');
		if (search) {
			rows = rows.filter((c) => `${c.first_name} ${c.display_name} ${c.phone}`.includes(search));
		}
		return send(res, 200, paginate(rows, url, 50));
	}

	if (path === '/contacts' && req.method === 'POST') {
		if (!body.first_name || !/^\+?[1-9]\d{6,14}$/.test(body.phone ?? '')) {
			return send(res, 422, {
				message: 'The given data was invalid.',
				error_code: 'validation_failed',
				status: 422,
				errors: {},
			});
		}
		if (state.contacts.some((c) => c.phone === body.phone)) {
			return send(res, 422, {
				message: 'A contact with this phone number already exists.',
				error_code: 'validation_failed',
				status: 422,
				errors: { phone: ['A contact with this phone number already exists.'] },
			});
		}
		const contact = {
			id: state.contacts.length + 1,
			group_ids: [],
			label_ids: [],
			custom_fields: {},
			...body,
		};
		state.contacts.push(contact);
		return send(res, 201, { data: contact });
	}

	if ((match = m(/^\/contacts\/(\d+)$/))) {
		const contact = state.contacts.find((c) => c.id === Number(match[1]));
		if (!contact) {
			return error(res, 404, 'Contact not found.', 'not_found');
		}
		if (req.method === 'GET') return send(res, 200, { data: contact });
		if (req.method === 'PUT') return send(res, 200, { data: Object.assign(contact, body) });
		if (req.method === 'DELETE') return send(res, 204, null);
	}

	if (path === '/conversations' && req.method === 'GET') {
		return send(res, 200, cursorPaginate(state.conversations, url, 25));
	}

	if (path === '/messages' && req.method === 'POST') {
		if (body.type === 'text' && body.body === 'expired window') {
			return error(
				res,
				422,
				'The 24-hour messaging window has expired. Send a template instead.',
				'window_expired',
			);
		}
		return send(res, 202, {
			data: {
				status: 'queued',
				id: state.nextMessageId++,
				channel_id: body.channel_id,
				to: '+919876543210',
			},
		});
	}

	if ((match = m(/^\/otp\/([\w-]+)\/verify$/)) && req.method === 'POST') {
		if (body.code === '123456') {
			return send(res, 200, { data: { reference: match[1], status: 'verified' } });
		}
		return error(res, 422, 'Invalid code. 2 attempt(s) remaining.', 'invalid_code');
	}

	if (path === '/webhooks' && req.method === 'GET') {
		return send(res, 200, { data: state.webhooks.map(({ secret, ...rest }) => rest) });
	}

	if (path === '/webhooks' && req.method === 'POST') {
		const webhook = {
			id: state.webhooks.length + 1,
			secret: 'mock-secret-0123456789abcdef',
			created_at: new Date().toISOString(),
			...body,
		};
		state.webhooks.push(webhook);
		return send(res, 201, { data: webhook });
	}

	if ((match = m(/^\/webhooks\/(\d+)$/)) && req.method === 'DELETE') {
		const before = state.webhooks.length;
		state.webhooks = state.webhooks.filter((w) => w.id !== Number(match[1]));
		return before === state.webhooks.length
			? error(res, 404, 'Webhook not found.', 'not_found')
			: send(res, 204, null);
	}

	return error(res, 404, 'Not found.', 'not_found');
}

function startMockApi(port = 0) {
	const state = createState();
	const server = http.createServer((req, res) => {
		const url = new URL(req.url, 'http://localhost');
		let raw = '';
		req.on('data', (chunk) => (raw += chunk));
		req.on('end', () => {
			if (url.pathname === '/__requests') {
				return send(res, 200, state.requests);
			}
			if (url.pathname === '/__webhooks') {
				return send(res, 200, state.webhooks);
			}
			const body = raw ? JSON.parse(raw) : {};
			state.requests.push({
				method: req.method,
				path: url.pathname,
				query: Object.fromEntries(url.searchParams),
				body,
			});
			if (req.headers.authorization !== `Bearer ${TOKEN}`) {
				return error(res, 401, 'Unauthenticated.', 'unauthenticated');
			}
			route(state, req, res, url, body);
		});
	});

	return new Promise((resolve) => {
		server.listen(port, '127.0.0.1', () => resolve({ server, state, port: server.address().port }));
	});
}

module.exports = { startMockApi, TOKEN };

if (require.main === module) {
	startMockApi(Number(process.argv[2] ?? 4010)).then(({ port }) =>
		console.log(`mock WaMatrix API on ${port}`),
	);
}
