import type { INodeProperties } from 'n8n-workflow';
import { idField, unwrapData } from '../shared/descriptions';

export const channelDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: { resource: ['channel'] } },
		options: [
			{
				name: 'Get',
				value: 'get',
				action: 'Get a channel',
				description: 'Get one connected account and its phone numbers',
				routing: {
					request: { method: 'GET', url: '=/channels/{{ $parameter.channelAccountId }}' },
					output: unwrapData,
				},
			},
			{
				name: 'Get Many',
				value: 'getAll',
				action: 'Get many channels',
				description: 'List connected accounts (WhatsApp and others) with their phone numbers',
				routing: { request: { method: 'GET', url: '/channels' }, output: unwrapData },
			},
		],
		default: 'getAll',
	},
	idField(
		'Channel ID',
		'channelAccountId',
		{ resource: ['channel'], operation: ['get'] },
		'The account ID, as listed by Get Many',
	),
];
