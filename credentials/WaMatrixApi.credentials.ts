import type {
	IAuthenticateGeneric,
	Icon,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class WaMatrixApi implements ICredentialType {
	name = 'waMatrixApi';

	displayName = 'WaMatrix API';

	icon: Icon = { light: 'file:../icons/wamatrix.svg', dark: 'file:../icons/wamatrix.dark.svg' };

	documentationUrl = 'https://github.com/CorbitalTechnologies/n8n-nodes-wamatrix#credentials';

	properties: INodeProperties[] = [
		{
			displayName: 'API Token',
			name: 'apiToken',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'Workspace API token from Settings → API Keys in your WaMatrix dashboard. Grant it the scopes for the operations you use.',
		},
		{
			displayName: 'API URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.wamatrix.io',
			description: 'Change only if your workspace uses a different API host',
		},
		{
			displayName: 'Webhook Signing Secret',
			name: 'webhookSecret',
			type: 'string',
			typeOptions: { password: true },
			default: '',
			description:
				'Only for the WaMatrix Trigger in Manual registration mode: the secret set under Settings → Webhook Forwarding. Automatic registration gets its own secret.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiToken}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}',
			url: '/api/v1/ping',
			method: 'GET',
		},
	};
}
