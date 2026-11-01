import type { INodeProperties } from 'n8n-workflow';
import { contactLocator, deletedData, getManyFields, unwrapData } from '../shared/descriptions';

const forGroup = { resource: ['contactGroup'] };
const forMembership = { resource: ['contactGroup'], operation: ['addContact', 'removeContact', 'getMembers'] };

export const contactGroupDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: forGroup },
		options: [
			{
				name: 'Add Contact',
				value: 'addContact',
				action: 'Add a contact to a group',
				routing: {
					request: { method: 'POST', url: '=/groups/{{ $parameter.groupId }}/contacts' },
					output: unwrapData,
				},
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many groups',
				routing: { request: { method: 'GET', url: '/groups' }, output: unwrapData },
			},
			{
				name: 'Get Members',
				value: 'getMembers',
				action: 'Get contacts in a group',
				routing: {
					request: { method: 'GET', url: '=/groups/{{ $parameter.groupId }}/contacts' },
					output: unwrapData,
				},
			},
			{
				name: 'Remove Contact',
				value: 'removeContact',
				action: 'Remove a contact from a group',
				routing: {
					request: {
						method: 'DELETE',
						url: '=/groups/{{ $parameter.groupId }}/contacts/{{ $parameter.contactId }}',
					},
					output: deletedData,
				},
			},
		],
		default: 'addContact',
	},
	{
		displayName: 'Group Name or ID',
		name: 'groupId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getContactGroups' },
		required: true,
		default: '',
		description:
			'Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>',
		displayOptions: { show: forMembership },
	},
	contactLocator(
		{ resource: ['contactGroup'], operation: ['addContact', 'removeContact'] },
		{
			routing: {
				send: { type: 'body', property: 'contact_id', value: '={{ Number($value) }}' },
			},
		},
	),
	...getManyFields({ resource: ['contactGroup'], operation: ['getAll', 'getMembers'] }, 'page'),
];
