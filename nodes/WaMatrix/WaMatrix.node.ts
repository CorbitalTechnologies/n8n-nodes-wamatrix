import { NodeConnectionTypes, type INodeType, type INodeTypeDescription } from 'n8n-workflow';
import { searchContacts } from './methods/listSearch';
import {
	getAuthenticationTemplates,
	getContactGroups,
	getContactLabels,
	getContactSources,
	getContactStatuses,
	getPhoneNumbers,
	getTemplates,
	getWhatsAppAccounts,
} from './methods/loadOptions';
import { channelDescription } from './resources/channel';
import { contactDescription } from './resources/contact';
import { contactGroupDescription } from './resources/contactGroup';
import { conversationDescription } from './resources/conversation';
import { messageDescription } from './resources/message';
import { otpDescription } from './resources/otp';
import { templateDescription } from './resources/template';

export class WaMatrix implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'WaMatrix',
		name: 'waMatrix',
		icon: { light: 'file:../../icons/wamatrix.svg', dark: 'file:../../icons/wamatrix.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{ $parameter["operation"] + ": " + $parameter["resource"] }}',
		description: 'Send WhatsApp messages and manage contacts with WaMatrix',
		defaults: { name: 'WaMatrix' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'waMatrixApi', required: true }],
		requestDefaults: {
			// Errors are raised by throwOnApiError so WaMatrix's message reaches the user.
			ignoreHttpStatusErrors: true,
			baseURL: '={{ ($credentials.baseUrl || "https://api.wamatrix.io").replace(/\\/+$/, "") + "/api/v1" }}',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
			},
		},
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{ name: 'Channel', value: 'channel' },
					{ name: 'Contact', value: 'contact' },
					{ name: 'Contact Group', value: 'contactGroup' },
					{ name: 'Conversation', value: 'conversation' },
					{ name: 'Message', value: 'message' },
					{ name: 'OTP', value: 'otp' },
					{ name: 'Template', value: 'template' },
				],
				default: 'message',
			},
			...messageDescription,
			...contactDescription,
			...contactGroupDescription,
			...conversationDescription,
			...templateDescription,
			...channelDescription,
			...otpDescription,
		],
	};

	methods = {
		loadOptions: {
			getAuthenticationTemplates,
			getContactGroups,
			getContactLabels,
			getContactSources,
			getContactStatuses,
			getPhoneNumbers,
			getTemplates,
			getWhatsAppAccounts,
		},
		listSearch: {
			searchContacts,
		},
	};
}
