import { createHmac, timingSafeEqual } from 'crypto';
import type { IDataObject } from 'n8n-workflow';

/**
 * Body of a WaMatrix Webhook Forwarding request (ForwardWebhookJob). `event` is the
 * Meta webhook field and `payload` is Meta's untouched `value` object.
 */
export interface ForwardedWebhook {
	event?: unknown;
	tenant_id?: number;
	channel_id?: number;
	payload?: IDataObject;
	timestamp?: string;
}

export type TriggerEvent =
	| 'messageReceived'
	| 'messageStatus'
	| 'templateStatus'
	| 'templateQuality'
	| 'otherEvents';

export const MESSAGE_STATUSES = ['sent', 'delivered', 'read', 'failed'] as const;

/**
 * Forwardable Meta fields other than the three the trigger maps to friendly events.
 * Mirrors WebhookForwardingService::availableEvents() in WaMatrix.
 */
export const OTHER_FIELDS = [
	'account_alerts',
	'account_review_update',
	'account_settings_update',
	'account_update',
	'automatic_events',
	'business_capability_update',
	'business_status_update',
	'calls',
	'flows',
	'group_lifecycle_update',
	'group_participants_update',
	'group_settings_update',
	'group_status_update',
	'history',
	'message_echoes',
	'message_template_components_update',
	'messaging_handovers',
	'partner_solutions',
	'payment_configuration_update',
	'phone_number_name_update',
	'phone_number_quality_update',
	'security',
	'template_category_update',
	'tracking_events',
	'user_id_update',
	'user_preferences',
	'web_app_data_sync',
	'web_message_echoes',
];

/**
 * The WaMatrix event names a subscription needs for the trigger's selected events.
 */
export function subscribedFields(events: string[]): string[] {
	const fields = new Set<string>();
	if (events.includes('messageReceived') || events.includes('messageStatus')) {
		fields.add('messages');
	}
	if (events.includes('templateStatus')) {
		fields.add('message_template_status_update');
	}
	if (events.includes('templateQuality')) {
		fields.add('message_template_quality_update');
	}
	if (events.includes('otherEvents')) {
		OTHER_FIELDS.forEach((field) => fields.add(field));
	}
	return [...fields].sort();
}

/**
 * Checks `X-Webhook-Signature: sha256=<hex>` against the raw request body.
 */
export function verifySignature(rawBody: Buffer | string, header: unknown, secret: string): boolean {
	if (typeof header !== 'string' || !header.startsWith('sha256=')) {
		return false;
	}

	const expected = createHmac('sha256', secret).update(rawBody).digest();
	const received = Buffer.from(header.slice('sha256='.length), 'hex');

	return received.length === expected.length && timingSafeEqual(received, expected);
}

/**
 * True when the signed `timestamp` is further than `maxAgeSeconds` from now (in
 * either direction). A value of 0 turns the check off.
 */
export function isStale(timestamp: unknown, maxAgeSeconds: number, now = Date.now()): boolean {
	if (!maxAgeSeconds) {
		return false;
	}
	const sentAt = typeof timestamp === 'string' ? Date.parse(timestamp) : NaN;
	return Number.isNaN(sentAt) || Math.abs(now - sentAt) > maxAgeSeconds * 1000;
}

/**
 * "+<digits>" for a phone number; business-scoped user ids (WhatsApp usernames) pass through.
 */
function asPhone(id: unknown): string | null {
	if (typeof id !== 'string' || id === '') {
		return null;
	}
	return /^\d+$/.test(id) ? `+${id}` : id;
}

function isoFromUnix(seconds: unknown): string | null {
	const value = Number(seconds);
	return Number.isFinite(value) && value > 0 ? new Date(value * 1000).toISOString() : null;
}

const MEDIA_TYPES = ['image', 'video', 'audio', 'document', 'sticker'];

/**
 * The human-readable part of an inbound message, whatever its type.
 */
function messageText(message: IDataObject): string | null {
	const type = message.type as string;
	const part = (message[type] as IDataObject) ?? {};

	switch (type) {
		case 'text':
			return (part.body as string) ?? null;
		case 'button':
			return (part.text as string) ?? null;
		case 'interactive': {
			const reply = (part.button_reply ?? part.list_reply) as IDataObject | undefined;
			return (reply?.title as string) ?? null;
		}
		case 'reaction':
			return (part.emoji as string) ?? null;
		case 'location':
			return [part.name, part.address].filter(Boolean).join(', ') || null;
		default:
			return (part.caption as string) ?? null;
	}
}

function replyId(message: IDataObject): string | null {
	const part = (message[message.type as string] as IDataObject) ?? {};
	if (message.type === 'button') {
		return (part.payload as string) ?? null;
	}
	if (message.type === 'interactive') {
		const reply = (part.button_reply ?? part.list_reply) as IDataObject | undefined;
		return (reply?.id as string) ?? null;
	}
	return null;
}

function messageItems(body: ForwardedWebhook, base: IDataObject): IDataObject[] {
	const value = body.payload ?? {};
	const names = new Map<string, string>();
	for (const contact of (value.contacts as IDataObject[]) ?? []) {
		names.set(contact.wa_id as string, ((contact.profile as IDataObject)?.name as string) ?? '');
	}

	return ((value.messages as IDataObject[]) ?? []).map((message) => {
		const type = message.type as string;
		const part = (message[type] as IDataObject) ?? {};
		const from = message.from as string;

		return {
			event: 'message.received',
			message_id: message.id,
			from: asPhone(from),
			contact_name: names.get(from) || null,
			type,
			text: messageText(message),
			reply_id: replyId(message),
			reply_to_message_id: (message.context as IDataObject)?.id ?? null,
			media: MEDIA_TYPES.includes(type)
				? {
						id: part.id ?? null,
						mime_type: part.mime_type ?? null,
						filename: part.filename ?? null,
						caption: part.caption ?? null,
					}
				: null,
			sent_at: isoFromUnix(message.timestamp),
			...base,
			raw: message,
		};
	});
}

function statusItems(body: ForwardedWebhook, base: IDataObject, statuses: string[]): IDataObject[] {
	return (((body.payload ?? {}).statuses as IDataObject[]) ?? [])
		.filter((status) => statuses.length === 0 || statuses.includes(status.status as string))
		.map((status) => {
			const errors = (status.errors as IDataObject[]) ?? [];
			const pricing = (status.pricing as IDataObject) ?? {};

			return {
				event: 'message.status',
				message_id: status.id,
				status: status.status,
				recipient: asPhone(status.recipient_id),
				pricing_category: pricing.category ?? null,
				billable: pricing.billable ?? null,
				error_code: errors[0]?.code ?? null,
				error_message: (errors[0]?.message ?? errors[0]?.title) ?? null,
				updated_at: isoFromUnix(status.timestamp),
				...base,
				raw: status,
			};
		});
}

function templateItem(body: ForwardedWebhook, base: IDataObject, kind: 'status' | 'quality'): IDataObject {
	const value = body.payload ?? {};
	const template = {
		meta_template_id: value.message_template_id ?? null,
		template_name: value.message_template_name ?? null,
		template_language: value.message_template_language ?? null,
	};

	if (kind === 'status') {
		return {
			event: 'template.status',
			status: value.event ?? null,
			reason: value.reason ?? null,
			...template,
			...base,
			raw: value,
		};
	}

	return {
		event: 'template.quality',
		previous_quality: value.previous_quality_score ?? null,
		quality: value.new_quality_score ?? null,
		...template,
		...base,
		raw: value,
	};
}

/**
 * Splits one forwarded webhook into the n8n items the user subscribed to. A single
 * Meta `messages` delivery can hold several messages and status updates; each becomes
 * its own item.
 */
export function toItems(body: ForwardedWebhook, events: string[], statuses: string[] = []): IDataObject[] {
	const field = String(body.event);
	const base: IDataObject = {
		phone_number_id: ((body.payload?.metadata as IDataObject)?.phone_number_id as string) ?? null,
		business_phone_number:
			((body.payload?.metadata as IDataObject)?.display_phone_number as string) ?? null,
		channel_id: body.channel_id ?? null,
		workspace_id: body.tenant_id ?? null,
		received_at: body.timestamp ?? null,
	};

	if (field === 'messages') {
		return [
			...(events.includes('messageReceived') ? messageItems(body, base) : []),
			...(events.includes('messageStatus') ? statusItems(body, base, statuses) : []),
		];
	}

	if (field === 'message_template_status_update') {
		return events.includes('templateStatus') ? [templateItem(body, base, 'status')] : [];
	}

	if (field === 'message_template_quality_update') {
		return events.includes('templateQuality') ? [templateItem(body, base, 'quality')] : [];
	}

	return events.includes('otherEvents') ? [{ event: field, ...base, payload: body.payload ?? null }] : [];
}
