import type { INodeProperties } from 'n8n-workflow';
import { getManyFields, idField, phoneNumberSelect, unwrapData } from '../shared/descriptions';

const forConversation = { resource: ['conversation'] };

export const conversationDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: forConversation },
		options: [
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many conversations',
				description: 'List conversations, newest first',
				routing: { request: { method: 'GET', url: '/conversations' }, output: unwrapData },
			},
			{
				name: 'Get Messages',
				value: 'getMessages',
				action: 'Get messages in a conversation',
				description: 'Message history of one conversation, newest first',
				routing: {
					request: { method: 'GET', url: '=/conversations/{{ $parameter.conversationId }}/messages' },
					output: unwrapData,
				},
			},
		],
		default: 'getAll',
	},
	idField(
		'Conversation ID',
		'conversationId',
		{ resource: ['conversation'], operation: ['getMessages'] },
		'The conversation to read, for example from Get Many or a sent message',
	),
	...getManyFields({ resource: ['conversation'], operation: ['getAll'] }, 'cursor'),
	...getManyFields({ resource: ['conversation'], operation: ['getMessages'] }, 'cursor'),
	{
		displayName: 'Filters',
		name: 'filters',
		type: 'collection',
		placeholder: 'Add Filter',
		default: {},
		displayOptions: { show: { resource: ['conversation'], operation: ['getAll'] } },
		options: [
			{
				displayName: 'Contact ID',
				name: 'contactId',
				type: 'string',
				default: '',
				routing: { send: { type: 'query', property: 'contact_id' } },
			},
			{
				...phoneNumberSelect({}),
				required: false,
				displayOptions: undefined,
				description:
					'Only conversations on this number. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
				routing: { send: { type: 'query', property: 'channel_id' } },
			},
			{
				displayName: 'Status',
				name: 'status',
				type: 'options',
				options: [
					{ name: 'Assigned', value: 'assigned' },
					{ name: 'Closed', value: 'closed' },
					{ name: 'Open', value: 'open' },
					{ name: 'Pending', value: 'pending' },
					{ name: 'Resolved', value: 'resolved' },
				],
				default: 'open',
				routing: { send: { type: 'query', property: 'status' } },
			},
		],
	},
];
