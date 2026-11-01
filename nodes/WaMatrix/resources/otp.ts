import type { INodeProperties } from 'n8n-workflow';
import { idField, phoneNumberSelect, unwrapData } from '../shared/descriptions';
import { otpVerifyOutcome } from '../shared/hooks';

const forOtp = { resource: ['otp'] };
const forSend = { resource: ['otp'], operation: ['send'] };
const referenceUrl = '=/otp/{{ $parameter.reference }}';

export const otpDescription: INodeProperties[] = [
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: { show: forOtp },
		options: [
			{
				name: 'Get Status',
				value: 'get',
				action: 'Get an OTP status',
				routing: { request: { method: 'GET', url: referenceUrl }, output: unwrapData },
			},
			{
				name: 'Send',
				value: 'send',
				action: 'Send an OTP',
				description: 'Generate a code and send it with an authentication template',
				routing: { request: { method: 'POST', url: '/otp' }, output: unwrapData },
			},
			{
				name: 'Verify',
				value: 'verify',
				action: 'Verify an OTP',
				description: 'Check a code. Returns verified true or false instead of failing.',
				routing: {
					request: {
						method: 'POST',
						url: `${referenceUrl}/verify`,
					},
					output: { postReceive: [otpVerifyOutcome] },
				},
			},
		],
		default: 'send',
	},

	phoneNumberSelect(forSend),
	{
		displayName: 'Recipient Phone Number',
		name: 'phone',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'e.g. +919876543210',
		description: 'International format, with country code',
		displayOptions: { show: forSend },
		routing: { send: { type: 'body', property: 'phone' } },
	},
	{
		displayName: 'Authentication Template Name or ID',
		name: 'templateId',
		type: 'options',
		typeOptions: {
			loadOptionsMethod: 'getAuthenticationTemplates',
			loadOptionsDependsOn: ['channelId'],
		},
		required: true,
		default: '',
		description:
			'An approved template in the Authentication category. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show: forSend },
		routing: { send: { type: 'body', property: 'template_id', value: '={{ Number($value) }}' } },
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
				displayName: 'Expiry (Minutes)',
				name: 'expiryMinutes',
				type: 'number',
				typeOptions: { minValue: 1, maxValue: 60 },
				default: 10,
				routing: { send: { type: 'body', property: 'expiry_minutes' } },
			},
			{
				displayName: 'Purpose',
				name: 'purpose',
				type: 'string',
				default: '',
				placeholder: 'e.g. login',
				description: 'Your label for why the code was sent, up to 50 characters',
				routing: { send: { type: 'body', property: 'purpose' } },
			},
		],
	},

	idField(
		'Reference',
		'reference',
		{ resource: ['otp'], operation: ['get', 'verify'] },
		'The reference returned by Send',
	),
	{
		displayName: 'Code',
		name: 'code',
		type: 'string',
		required: true,
		default: '',
		description: 'The code the user entered',
		displayOptions: { show: { resource: ['otp'], operation: ['verify'] } },
		routing: { send: { type: 'body', property: 'code' } },
	},
];
