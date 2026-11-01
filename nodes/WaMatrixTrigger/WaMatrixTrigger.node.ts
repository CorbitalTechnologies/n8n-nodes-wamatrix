import {
	NodeApiError,
	NodeConnectionTypes,
	type IDataObject,
	type IHookFunctions,
	type INodeType,
	type INodeTypeDescription,
	type IWebhookFunctions,
	type IWebhookResponseData,
	type JsonObject,
} from 'n8n-workflow';
import { waMatrixApiRequest } from '../WaMatrix/shared/transport';
import {
	isStale,
	MESSAGE_STATUSES,
	subscribedFields,
	toItems,
	verifySignature,
	type ForwardedWebhook,
} from './events';

function isManual(this: IHookFunctions | IWebhookFunctions): boolean {
	return this.getNodeParameter('registration', 'automatic') === 'manual';
}

function sameFields(registered: unknown, wanted: string[]): boolean {
	const current = Array.isArray(registered) ? [...(registered as string[])].sort() : [];
	return current.length === wanted.length && current.every((field, i) => field === wanted[i]);
}

export class WaMatrixTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WaMatrix Trigger',
		name: 'waMatrixTrigger',
		icon: { light: 'file:../../icons/wamatrix.svg', dark: 'file:../../icons/wamatrix.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{ $parameter["events"].join(", ") }}',
		description: 'Starts the workflow on WhatsApp messages, delivery updates and template changes',
		defaults: { name: 'WaMatrix Trigger' },
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'waMatrixApi', required: true }],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Events',
				name: 'events',
				type: 'multiOptions',
				required: true,
				default: ['messageReceived'],
				options: [
					{
						name: 'All Other Events',
						value: 'otherEvents',
						description: 'Every other WhatsApp webhook event, passed through unchanged',
					},
					{
						name: 'Message Received',
						value: 'messageReceived',
						description: 'A customer sent a message',
					},
					{
						name: 'Message Status Updated',
						value: 'messageStatus',
						description: 'A sent message was delivered, read or failed',
					},
					{
						name: 'Template Quality Updated',
						value: 'templateQuality',
						description: 'A template’s quality rating changed',
					},
					{
						name: 'Template Status Updated',
						value: 'templateStatus',
						description: 'Meta approved, rejected or paused a template',
					},
				],
			},
			{
				displayName: 'Registration',
				name: 'registration',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Automatic',
						value: 'automatic',
						description: 'Registers the webhook in WaMatrix on activation and removes it afterwards',
					},
					{
						name: 'Manual',
						value: 'manual',
						description: 'Paste the webhook URL into WaMatrix yourself',
					},
				],
				default: 'automatic',
			},
			{
				displayName:
					'In WaMatrix, open Settings → Webhook Forwarding, paste this node’s Production URL, choose method POST and tick the matching events ("Messages" for message events). Put the same secret in the credential’s Webhook Signing Secret to have requests verified.',
				name: 'manualNotice',
				type: 'notice',
				default: '',
				displayOptions: { show: { registration: ['manual'] } },
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Message Statuses',
						name: 'statuses',
						type: 'multiOptions',
						default: [],
						description: 'Only these delivery statuses start the workflow. Leave empty for all.',
						options: MESSAGE_STATUSES.map((status) => ({
							name: status.charAt(0).toUpperCase() + status.slice(1),
							value: status,
						})),
					},
					{
						displayName: 'Reject Requests Older Than (Seconds)',
						name: 'maxAgeSeconds',
						type: 'number',
						typeOptions: { minValue: 0 },
						default: 0,
						description:
							'Replay protection based on the signed timestamp. 0 turns it off. Allow for WaMatrix retries, which can arrive up to about two minutes late.',
					},
				],
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				if (isManual.call(this)) {
					return true;
				}

				const staticData = this.getWorkflowStaticData('node');
				if (staticData.webhookId === undefined) {
					return false;
				}

				const response = await waMatrixApiRequest.call(this, 'GET', '/webhooks');
				const registered = ((response.data as IDataObject[]) ?? []).find(
					(webhook) => webhook.id === staticData.webhookId,
				);
				const wanted = subscribedFields(this.getNodeParameter('events', []) as string[]);

				if (
					registered !== undefined &&
					registered.url === this.getNodeWebhookUrl('default') &&
					sameFields(registered.events, wanted)
				) {
					return true;
				}

				// Gone, moved, or subscribed to different events: start again.
				if (registered !== undefined) {
					await waMatrixApiRequest.call(this, 'DELETE', `/webhooks/${registered.id as number}`);
				}
				delete staticData.webhookId;
				delete staticData.webhookSecret;
				return false;
			},

			async create(this: IHookFunctions): Promise<boolean> {
				if (isManual.call(this)) {
					return true;
				}

				const response = await waMatrixApiRequest.call(this, 'POST', '/webhooks', {}, {
					url: this.getNodeWebhookUrl('default'),
					events: subscribedFields(this.getNodeParameter('events', []) as string[]),
					description: `n8n: ${this.getWorkflow().name ?? 'workflow'}`.slice(0, 255),
				});
				const webhook = response.data as IDataObject;

				const staticData = this.getWorkflowStaticData('node');
				staticData.webhookId = webhook.id;
				staticData.webhookSecret = webhook.secret;
				return true;
			},

			async delete(this: IHookFunctions): Promise<boolean> {
				if (isManual.call(this)) {
					return true;
				}

				const staticData = this.getWorkflowStaticData('node');
				if (staticData.webhookId !== undefined) {
					try {
						await waMatrixApiRequest.call(this, 'DELETE', `/webhooks/${staticData.webhookId as number}`);
					} catch (error) {
						// Already removed in WaMatrix: nothing left to clean up.
						if ((error as NodeApiError).httpCode !== '404') {
							throw new NodeApiError(this.getNode(), error as JsonObject);
						}
					}
				}

				delete staticData.webhookId;
				delete staticData.webhookSecret;
				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const request = this.getRequestObject();
		const response = this.getResponseObject();

		const reject = (status: number, message: string): IWebhookResponseData => {
			response.status(status).json({ message });
			return { noWebhookResponse: true };
		};

		// Automatic registration always gets a secret from WaMatrix; manual setup uses
		// the one the user put in the credential, if any.
		let secret: string;
		if (isManual.call(this)) {
			const credentials = await this.getCredentials('waMatrixApi');
			secret = typeof credentials.webhookSecret === 'string' ? credentials.webhookSecret : '';
		} else {
			secret = String(this.getWorkflowStaticData('node').webhookSecret ?? '');
			if (secret === '') {
				return reject(401, 'Webhook is not registered');
			}
		}

		if (secret !== '') {
			const rawBody = (request as unknown as { rawBody?: Buffer }).rawBody;
			if (
				rawBody === undefined ||
				!verifySignature(rawBody, request.headers['x-webhook-signature'], secret)
			) {
				return reject(401, 'Invalid signature');
			}
		}

		const body = this.getBodyData() as ForwardedWebhook;
		if (typeof body?.event !== 'string') {
			return reject(400, 'Not a WaMatrix webhook');
		}

		const options = this.getNodeParameter('options', {}) as IDataObject;
		if (isStale(body.timestamp, (options.maxAgeSeconds as number) ?? 0)) {
			return reject(400, 'Request is too old');
		}

		const items = toItems(
			body,
			this.getNodeParameter('events', []) as string[],
			(options.statuses as string[]) ?? [],
		);

		if (items.length === 0) {
			return { webhookResponse: { received: true } };
		}

		return { workflowData: [this.helpers.returnJsonArray(items)] };
	}
}
