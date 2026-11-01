import type { INodeProperties } from 'n8n-workflow';
import { contactLocator, idField, phoneNumberSelect, unwrapData } from '../shared/descriptions';
import { buildTemplateData, resolveRecipient } from '../shared/hooks';

const forMessage = { resource: ['message'] };
const forSend = { resource: ['message'], operation: ['sendText', 'sendTemplate'] };
const forTemplate = { resource: ['message'], operation: ['sendTemplate'] };
const forTemplateFields = { ...forTemplate, variablesInput: ['fields'] };

export const messageDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: forMessage },
		options: [
			{
				name: 'Get',
				value: 'get',
				action: 'Get a message',
				description: 'Get a message and its delivery status',
				routing: {
					request: { method: 'GET', url: '=/messages/{{ $parameter.messageId }}' },
					output: unwrapData,
				},
			},
			{
				name: 'Send Template',
				value: 'sendTemplate',
				action: 'Send a template message',
				description: 'Send an approved template. Works at any time, also outside the 24-hour window.',
				routing: {
					request: { method: 'POST', url: '/messages', body: { type: 'template' } },
					send: { preSend: [resolveRecipient, buildTemplateData] },
					output: unwrapData,
				},
			},
			{
				name: 'Send Text',
				value: 'sendText',
				action: 'Send a text message',
				description: 'Send a free-form text. Only works within 24 hours of the customer’s last message.',
				routing: {
					request: { method: 'POST', url: '/messages', body: { type: 'text' } },
					send: { preSend: [resolveRecipient] },
					output: unwrapData,
				},
			},
		],
		default: 'sendTemplate',
	},

	idField('Message ID', 'messageId', { resource: ['message'], operation: ['get'] }, 'The ID returned when the message was sent'),

	phoneNumberSelect(forSend),
	{
		displayName: 'Send To',
		name: 'sendTo',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: forSend },
		options: [
			{ name: 'Phone Number', value: 'phone', description: 'Find the contact by phone number' },
			{ name: 'Existing Contact', value: 'contact', description: 'Pick a WaMatrix contact' },
		],
		default: 'phone',
	},
	{
		displayName: 'Phone Number',
		name: 'phoneNumber',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. +919876543210',
		description: 'Recipient phone number in international format, with country code',
		displayOptions: { show: { ...forSend, sendTo: ['phone'] } },
	},
	{
		displayName: 'Create Contact If Missing',
		name: 'createContact',
		type: 'boolean',
		default: true,
		description: 'Whether to create a WaMatrix contact when no contact has this phone number',
		displayOptions: { show: { ...forSend, sendTo: ['phone'] } },
	},
	{
		displayName: 'Contact Name',
		name: 'contactName',
		type: 'string',
		default: '',
		description: 'First name for the new contact. Defaults to the phone number.',
		displayOptions: { show: { ...forSend, sendTo: ['phone'], createContact: [true] } },
	},
	contactLocator({ ...forSend, sendTo: ['contact'] }),

	{
		displayName: 'Message',
		name: 'text',
		type: 'string',
		required: true,
		default: '',
		typeOptions: { rows: 4 },
		description: 'Up to 4,096 characters. WhatsApp formatting like *bold* and _italic_ works.',
		displayOptions: { show: { resource: ['message'], operation: ['sendText'] } },
		routing: { send: { type: 'body', property: 'body' } },
	},

	{
		displayName: 'Template Name or ID',
		name: 'templateId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getTemplates', loadOptionsDependsOn: ['channelId'] },
		required: true,
		default: '',
		description:
			'Approved templates of the selected WhatsApp number. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: forTemplate },
		routing: { send: { type: 'body', property: 'template_id', value: '={{ Number($value) }}' } },
	},
	{
		displayName: 'Variables Input',
		name: 'variablesInput',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: forTemplate },
		options: [
			{ name: 'Using Fields Below', value: 'fields' },
			{ name: 'Using JSON', value: 'json', description: 'Pass the WhatsApp components array yourself' },
		],
		default: 'fields',
	},
	{
		displayName: 'Header',
		name: 'headerType',
		type: 'options',
		displayOptions: { show: forTemplateFields },
		options: [
			{ name: 'Document', value: 'document' },
			{ name: 'Image', value: 'image' },
			{ name: 'No Header Variable', value: 'none' },
			{ name: 'Text Variable', value: 'text' },
			{ name: 'Video', value: 'video' },
		],
		default: 'none',
		description: 'Match the header the template was approved with',
	},
	{
		displayName: 'Header Text',
		name: 'headerText',
		type: 'string',
		required: true,
		default: '',
		description: 'Value for the {{1}} variable in the header',
		displayOptions: { show: { ...forTemplateFields, headerType: ['text'] } },
	},
	{
		displayName: 'Header Media URL',
		name: 'headerMediaUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://example.com/invoice.pdf',
		description: 'Public HTTPS link to the file. WhatsApp downloads it when sending.',
		displayOptions: { show: { ...forTemplateFields, headerType: ['image', 'video', 'document'] } },
	},
	{
		displayName: 'Document Filename',
		name: 'headerDocumentFilename',
		type: 'string',
		default: '',
		placeholder: 'invoice.pdf',
		description: 'File name the customer sees',
		displayOptions: { show: { ...forTemplateFields, headerType: ['document'] } },
	},
	{
		displayName: 'Body Variables',
		name: 'bodyVariables',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true, sortable: true },
		placeholder: 'Add Variable',
		default: {},
		description: 'Values for {{1}}, {{2}}, … in the template body, in order',
		displayOptions: { show: forTemplateFields },
		options: [
			{
				displayName: 'Variable',
				name: 'values',
				values: [{ displayName: 'Value', name: 'value', type: 'string', default: '' }],
			},
		],
	},
	{
		displayName: 'URL Button Variables',
		name: 'buttonVariables',
		type: 'fixedCollection',
		typeOptions: { multipleValues: true },
		placeholder: 'Add Button Variable',
		default: {},
		description: 'Dynamic suffix for URL buttons that end in {{1}}',
		displayOptions: { show: forTemplateFields },
		options: [
			{
				displayName: 'Button',
				name: 'values',
				values: [
					{
						displayName: 'Button Position',
						name: 'index',
						type: 'number',
						typeOptions: { minValue: 0, maxValue: 9 },
						default: 0,
						description: 'Position of the button in the template, starting at 0',
					},
					{ displayName: 'Value', name: 'value', type: 'string', default: '' },
				],
			},
		],
	},
	{
		displayName: 'Components (JSON)',
		name: 'componentsJson',
		type: 'json',
		default: '[\n  {\n    "type": "body",\n    "parameters": [{ "type": "text", "text": "value" }]\n  }\n]',
		description: 'The WhatsApp Cloud API template "components" array',
		displayOptions: { show: { ...forTemplate, variablesInput: ['json'] } },
	},

	{
		displayName: 'Options',
		name: 'options',
		type: 'collection',
		placeholder: 'Add Option',
		default: {},
		displayOptions: { show: forSend },
		options: [
			{
				displayName: 'Idempotency Key',
				name: 'idempotencyKey',
				type: 'string',
				default: '',
				description:
					'Your own reference for this send, up to 64 characters, stored with the message. Use a new value for every send.',
				routing: { send: { type: 'body', property: 'idempotency_key' } },
			},
		],
	},
];
