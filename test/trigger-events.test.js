const { test } = require('node:test');
const assert = require('node:assert/strict');
const { createHmac } = require('node:crypto');
const {
	isStale,
	subscribedFields,
	toItems,
	verifySignature,
} = require('../dist/nodes/WaMatrixTrigger/events');

const SECRET = 'a-forwarding-secret-1234';
const sign = (body, secret = SECRET) =>
	`sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;

// What ForwardWebhookJob sends: PHP json_encode output, slashes escaped.
const rawBody =
	'{"event":"messages","tenant_id":7,"channel_id":3,"payload":{"x":"a\\/b"},"timestamp":"2026-10-31T10:00:00+00:00"}';

test('accepts a signature made over the exact raw body', () => {
	assert.equal(verifySignature(Buffer.from(rawBody), sign(rawBody), SECRET), true);
});

test('rejects a wrong secret, a re-serialised body, a missing prefix and junk', () => {
	assert.equal(verifySignature(rawBody, sign(rawBody, 'other-secret-12345'), SECRET), false);
	assert.equal(verifySignature(JSON.stringify(JSON.parse(rawBody)), sign(rawBody), SECRET), false);
	assert.equal(verifySignature(rawBody, sign(rawBody).slice('sha256='.length), SECRET), false);
	assert.equal(verifySignature(rawBody, 'sha256=zz', SECRET), false);
	assert.equal(verifySignature(rawBody, undefined, SECRET), false);
});

test('staleness check is off at 0 and rejects old, future and missing timestamps', () => {
	const now = Date.parse('2026-10-31T10:00:00Z');
	assert.equal(isStale(undefined, 0, now), false);
	assert.equal(isStale('2026-10-31T09:59:00Z', 300, now), false);
	assert.equal(isStale('2026-10-31T09:50:00Z', 300, now), true);
	assert.equal(isStale('2026-10-31T10:10:00Z', 300, now), true);
	assert.equal(isStale('not a date', 300, now), true);
});

const messagesWebhook = {
	event: 'messages',
	tenant_id: 7,
	channel_id: 3,
	timestamp: '2026-10-31T10:00:00+00:00',
	payload: {
		messaging_product: 'whatsapp',
		metadata: { display_phone_number: '15550001111', phone_number_id: '1098' },
		contacts: [{ profile: { name: 'Asha' }, wa_id: '919876543210' }],
		messages: [
			{
				from: '919876543210',
				id: 'wamid.T',
				timestamp: '1761904800',
				type: 'text',
				text: { body: 'Hi' },
			},
			{
				from: '919876543210',
				id: 'wamid.B',
				timestamp: '1761904801',
				type: 'interactive',
				context: { id: 'wamid.ORIG' },
				interactive: { type: 'button_reply', button_reply: { id: 'yes', title: 'Yes please' } },
			},
			{
				from: '919876543210',
				id: 'wamid.I',
				timestamp: '1761904802',
				type: 'image',
				image: { id: 'MEDIA1', mime_type: 'image/jpeg', caption: 'receipt' },
			},
		],
		statuses: [
			{
				id: 'wamid.S1',
				status: 'delivered',
				timestamp: '1761904803',
				recipient_id: '919876543210',
			},
			{
				id: 'wamid.S2',
				status: 'failed',
				timestamp: '1761904804',
				recipient_id: '919876543210',
				errors: [{ code: 131047, title: 'Re-engagement message' }],
			},
		],
	},
};

test('one messages delivery becomes one item per message, with friendly fields', () => {
	const items = toItems(messagesWebhook, ['messageReceived']);
	assert.equal(items.length, 3);

	const [text, button, image] = items;
	assert.equal(text.event, 'message.received');
	assert.equal(text.from, '+919876543210');
	assert.equal(text.contact_name, 'Asha');
	assert.equal(text.text, 'Hi');
	assert.equal(text.sent_at, '2025-10-31T10:00:00.000Z');
	assert.equal(text.phone_number_id, '1098');
	assert.equal(text.workspace_id, 7);
	assert.equal(text.media, null);

	assert.equal(button.text, 'Yes please');
	assert.equal(button.reply_id, 'yes');
	assert.equal(button.reply_to_message_id, 'wamid.ORIG');

	assert.deepEqual(image.media, {
		id: 'MEDIA1',
		mime_type: 'image/jpeg',
		filename: null,
		caption: 'receipt',
	});
	assert.equal(image.text, 'receipt');
});

test('status updates honour the status filter and surface the Meta error', () => {
	const all = toItems(messagesWebhook, ['messageStatus']);
	assert.deepEqual(
		all.map((i) => i.status),
		['delivered', 'failed'],
	);
	assert.equal(all[1].error_code, 131047);
	assert.equal(all[1].error_message, 'Re-engagement message');

	const failedOnly = toItems(messagesWebhook, ['messageStatus'], ['failed']);
	assert.deepEqual(
		failedOnly.map((i) => i.message_id),
		['wamid.S2'],
	);
});

test('unselected events produce nothing, so the workflow does not start', () => {
	assert.deepEqual(toItems(messagesWebhook, ['templateStatus']), []);
});

test('business-scoped user ids are passed through without a + prefix', () => {
	const webhook = {
		event: 'messages',
		payload: {
			messages: [{ from: 'US.13491208655302741918', id: 'w', type: 'text', text: { body: 'x' } }],
		},
	};
	assert.equal(toItems(webhook, ['messageReceived'])[0].from, 'US.13491208655302741918');
});

test('template status and quality updates map to their own events', () => {
	const status = toItems(
		{
			event: 'message_template_status_update',
			payload: {
				event: 'REJECTED',
				message_template_id: 99,
				message_template_name: 'order_update',
				message_template_language: 'en_US',
				reason: 'INVALID_FORMAT',
			},
		},
		['templateStatus'],
	);
	assert.equal(status[0].event, 'template.status');
	assert.equal(status[0].status, 'REJECTED');
	assert.equal(status[0].template_name, 'order_update');

	const quality = toItems(
		{
			event: 'message_template_quality_update',
			payload: {
				previous_quality_score: 'GREEN',
				new_quality_score: 'YELLOW',
				message_template_name: 'promo',
			},
		},
		['templateQuality'],
	);
	assert.equal(quality[0].quality, 'YELLOW');
	assert.equal(quality[0].previous_quality, 'GREEN');
});

test('other events pass through only when selected', () => {
	const webhook = { event: 'phone_number_quality_update', payload: { event: 'FLAGGED' } };
	assert.deepEqual(toItems(webhook, ['messageReceived']), []);
	assert.equal(toItems(webhook, ['otherEvents'])[0].event, 'phone_number_quality_update');
});

test('subscription fields cover exactly what the selected events need', () => {
	assert.deepEqual(subscribedFields(['messageReceived', 'messageStatus']), ['messages']);
	assert.deepEqual(subscribedFields(['templateStatus']), ['message_template_status_update']);

	const everything = subscribedFields([
		'otherEvents',
		'messageReceived',
		'templateStatus',
		'templateQuality',
	]);
	assert.equal(everything.length, 31);
	assert.equal(new Set(everything).size, 31);
});
