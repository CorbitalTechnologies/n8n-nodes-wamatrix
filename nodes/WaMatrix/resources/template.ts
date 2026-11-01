import type { INodeProperties } from 'n8n-workflow';
import { getManyFields, idField, unwrapData } from '../shared/descriptions';

const forTemplate = { resource: ['template'] };

export const templateDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: forTemplate },
		options: [
			{
				name: 'Get',
				value: 'get',
				action: 'Get a template',
				routing: {
					request: { method: 'GET', url: '=/templates/{{ $parameter.templateId }}' },
					output: unwrapData,
				},
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many templates',
				routing: { request: { method: 'GET', url: '/templates' }, output: unwrapData },
			},
			{
				name: 'Sync',
				value: 'sync',
				action: 'Sync templates',
				description: 'Queue a refresh of every connected account’s templates from Meta',
				routing: { request: { method: 'POST', url: '/templates/sync' }, output: unwrapData },
			},
		],
		default: 'getAll',
	},
	idField('Template ID', 'templateId', { resource: ['template'], operation: ['get'] }, 'The WaMatrix template ID'),
	...getManyFields({ resource: ['template'], operation: ['getAll'] }, 'page'),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['template'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Category',
				name: 'category',
				type: 'options',
				options: [
					{ name: 'Authentication', value: 'authentication' },
					{ name: 'Marketing', value: 'marketing' },
					{ name: 'Utility', value: 'utility' },
				],
				default: 'utility',
				routing: { send: { type: 'query', property: 'category' } },
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{ name: 'Approved', value: 'APPROVED' },
					{ name: 'Paused', value: 'PAUSED' },
					{ name: 'Pending', value: 'PENDING' },
					{ name: 'Rejected', value: 'REJECTED' },
				],
				default: 'APPROVED',
				routing: { send: { type: 'query', property: 'status' } },
			},
			{
				displayName: 'WhatsApp Account Name or ID',
				name: 'accountId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getWhatsAppAccounts' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				routing: { send: { type: 'query', property: 'channel_id' } },
			},
		],
	},
];
