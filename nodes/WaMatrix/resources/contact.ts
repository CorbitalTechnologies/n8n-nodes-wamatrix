import type { INodeProperties } from 'n8n-workflow';
import { contactLocator, deletedData, getManyFields, unwrapData } from '../shared/descriptions';
import { normalizeContactPhone, routeContactUpsert } from '../shared/hooks';

const forContact = { resource: ['contact'] };
const forWrite = { resource: ['contact'], operation: ['create', 'upsert'] };

const contactIdUrl = '=/contacts/{{ $parameter.contactId }}';

/**
 * Optional contact fields shared by Create, Create or Update, and Update.
 */
function contactFields(includeIdentity: boolean): INodeProperties[] {
	const identity: INodeProperties[] = [
		{
			displayName: 'First Name',
			name: 'firstName',
			type: 'string',
			default: '',
			routing: { send: { type: 'body', property: 'first_name' } },
		},
		{
			displayName: 'Phone Number',
			name: 'phone',
			type: 'string',
			default: '',
			placeholder: 'e.g. +919876543210',
			description: 'International format, with country code',
			routing: {
				send: { type: 'body', property: 'phone', value: '={{ "+" + String($value).replace(/\\D/g, "") }}' },
			},
		},
	];

	return [
		...(includeIdentity ? identity : []),
		{
			displayName: 'Display Name',
			name: 'displayName',
			type: 'string',
			default: '',
			routing: { send: { type: 'body', property: 'display_name' } },
		},
		{
			displayName: 'Email',
			name: 'email',
			type: 'string',
			placeholder: 'name@email.com',
			default: '',
			routing: { send: { type: 'body', property: 'email' } },
		},
		{
			displayName: 'Group Names or IDs',
			name: 'groupIds',
			type: 'multiOptions',
			typeOptions: { loadOptionsMethod: 'getContactGroups' },
			default: [],
			description:
				'Replaces the contact’s groups. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			routing: { send: { type: 'body', property: 'group_ids', value: '={{ $value.map(Number) }}' } },
		},
		{
			displayName: 'Is Active',
			name: 'isActive',
			type: 'boolean',
			default: true,
			routing: { send: { type: 'body', property: 'is_active' } },
		},
		{
			displayName: 'Label Names or IDs',
			name: 'labelIds',
			type: 'multiOptions',
			typeOptions: { loadOptionsMethod: 'getContactLabels' },
			default: [],
			description:
				'Replaces the contact’s labels. Choose from the list, or specify IDs using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
			routing: { send: { type: 'body', property: 'label_ids', value: '={{ $value.map(Number) }}' } },
		},
		{
			displayName: 'Last Name',
			name: 'lastName',
			type: 'string',
			default: '',
			routing: { send: { type: 'body', property: 'last_name' } },
		},
		{
			displayName: 'Lifecycle Stage',
			name: 'type',
			type: 'options',
			options: [
				{ name: 'Customer', value: 'customer' },
				{ name: 'Guest', value: 'guest' },
				{ name: 'Lead', value: 'lead' },
			],
			default: 'lead',
			routing: { send: { type: 'body', property: 'type' } },
		},
		{
			displayName: 'Source Name or ID',
			name: 'sourceId',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'getContactSources' },
			default: '',
			description:
				'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			routing: { send: { type: 'body', property: 'contact_source_id', value: '={{ Number($value) }}' } },
		},
		{
			displayName: 'Status Name or ID',
			name: 'statusId',
			type: 'options',
			typeOptions: { loadOptionsMethod: 'getContactStatuses' },
			default: '',
			description:
				'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
			routing: { send: { type: 'body', property: 'contact_status_id', value: '={{ Number($value) }}' } },
		},
		{
			displayName: 'Custom Fields',
			name: 'customFields',
			type: 'fixedCollection',
			typeOptions: { multipleValues: true },
			placeholder: 'Add Custom Field',
			default: {},
			description: 'Replaces the contact’s custom fields',
			options: [
				{
					displayName: 'Field',
					name: 'field',
					values: [
						{ displayName: 'Key', name: 'key', type: 'string', default: '' },
						{ displayName: 'Value', name: 'value', type: 'string', default: '' },
					],
				},
			],
			routing: {
				send: {
					type: 'body',
					property: 'custom_fields',
					value:
						'={{ Object.fromEntries(($value.field || []).filter(f => f.key).map(f => [f.key, f.value])) }}',
				},
			},
		},
	];
}

export const contactDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: forContact },
		options: [
			{
				name: 'Create',
				value: 'create',
				action: 'Create a contact',
				description: 'Create a contact. Fails if the phone number already exists.',
				routing: {
					request: { method: 'POST', url: '/contacts' },
					send: { preSend: [normalizeContactPhone] },
					output: unwrapData,
				},
			},
			{
				name: 'Create or Update',
				value: 'upsert',
				action: 'Create or update a contact',
				description: 'Create a new record, or update the current one if it already exists (upsert)',
				routing: {
					request: { method: 'POST', url: '/contacts' },
					send: { preSend: [routeContactUpsert] },
					output: unwrapData,
				},
			},
			{
				name: 'Delete',
				value: 'delete',
				action: 'Delete a contact',
				routing: {
					request: { method: 'DELETE', url: contactIdUrl },
					output: deletedData,
				},
			},
			{
				name: 'Get',
				value: 'get',
				action: 'Get a contact',
				routing: { request: { method: 'GET', url: contactIdUrl }, output: unwrapData },
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many contacts',
				routing: { request: { method: 'GET', url: '/contacts' }, output: unwrapData },
			},
			{
				name: 'Update',
				value: 'update',
				action: 'Update a contact',
				description: 'Change only the fields you set',
				routing: { request: { method: 'PUT', url: contactIdUrl }, output: unwrapData },
			},
		],
		default: 'upsert',
	},

	{
		displayName: 'Phone Number',
		name: 'phone',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. +919876543210',
		description: 'International format, with country code',
		displayOptions: { show: forWrite },
	},
	{
		displayName: 'First Name',
		name: 'firstName',
		type: 'string',
		required: true,
		default: '',
		displayOptions: { show: forWrite },
		routing: { send: { type: 'body', property: 'first_name' } },
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: forWrite },
		options: contactFields(false),
	},

	contactLocator({ resource: ['contact'], operation: ['delete', 'get', 'update'] }),
	{
		displayName: 'Update Fields',
		name: 'updateFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: { show: { resource: ['contact'], operation: ['update'] } },
		options: contactFields(true),
	},

	...getManyFields({ resource: ['contact'], operation: ['getAll'] }, 'page'),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['contact'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Group Name or ID',
				name: 'groupId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getContactGroups' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				routing: { send: { type: 'query', property: 'group_id' } },
			},
			{
				displayName: 'Is Active',
				name: 'isActive',
				type: 'boolean',
				default: true,
				routing: { send: { type: 'query', property: 'is_active' } },
			},
			{
				displayName: 'Lifecycle Stage',
				name: 'type',
				type: 'options',
				options: [
					{ name: 'Customer', value: 'customer' },
					{ name: 'Guest', value: 'guest' },
					{ name: 'Lead', value: 'lead' },
				],
				default: 'lead',
				routing: { send: { type: 'query', property: 'type' } },
			},
			{
				displayName: 'Search',
				name: 'search',
				type: 'string',
				default: '',
				description: 'Matches name, phone number or email',
				routing: { send: { type: 'query', property: 'search' } },
			},
			{
				displayName: 'Source Name or ID',
				name: 'sourceId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getContactSources' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				routing: { send: { type: 'query', property: 'contact_source_id' } },
			},
			{
				displayName: 'Status Name or ID',
				name: 'statusId',
				type: 'options',
				typeOptions: { loadOptionsMethod: 'getContactStatuses' },
				default: '',
				description:
					'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
				routing: { send: { type: 'query', property: 'contact_status_id' } },
			},
		],
	},
];
