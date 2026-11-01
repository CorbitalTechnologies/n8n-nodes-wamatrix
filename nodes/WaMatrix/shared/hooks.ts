import {
	NodeOperationError,
	type IDataObject,
	type IExecuteSingleFunctions,
	type IHttpRequestOptions,
	type IN8nHttpFullResponse,
	type INodeExecutionData,
} from 'n8n-workflow';
import { waMatrixApiError, waMatrixApiRequest } from './transport';
import { buildTemplateComponents, phoneDigits, toE164, type HeaderType } from './utils';

/**
 * The contact whose stored phone has exactly these digits. The API search is a
 * substring match, so every hit is re-checked here.
 */
async function findContactByPhone(
	this: IExecuteSingleFunctions,
	phone: string,
): Promise<IDataObject | undefined> {
	const digits = phoneDigits(phone);
	const response = await waMatrixApiRequest.call(this, 'GET', '/contacts', {
		search: digits,
		per_page: 100,
	});

	return ((response.data as IDataObject[]) ?? []).find(
		(contact) => phoneDigits(contact.phone) === digits,
	);
}

function body(requestOptions: IHttpRequestOptions): IDataObject {
	if (typeof requestOptions.body !== 'object' || requestOptions.body === null) {
		requestOptions.body = {};
	}
	return requestOptions.body as IDataObject;
}

function requirePhone(this: IExecuteSingleFunctions, parameterName: string): string {
	const raw = this.getNodeParameter(parameterName) as string;
	const phone = toE164(raw);
	if (phone === null) {
		throw new NodeOperationError(
			this.getNode(),
			`"${raw}" is not a valid phone number`,
			{ description: 'Use international format with the country code, for example +919876543210' },
		);
	}
	return phone;
}

/**
 * Message sends: turn "Send To" into the `contact_id` the API needs. A phone number is
 * matched to an existing contact, or a contact is created when the user allows it.
 */
export async function resolveRecipient(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	if (this.getNodeParameter('sendTo') === 'contact') {
		body(requestOptions).contact_id = Number(
			this.getNodeParameter('contactId', undefined, { extractValue: true }),
		);
		return requestOptions;
	}

	const phone = requirePhone.call(this, 'phoneNumber');
	let contact = await findContactByPhone.call(this, phone);

	if (contact === undefined) {
		if (!(this.getNodeParameter('createContact', true) as boolean)) {
			throw new NodeOperationError(this.getNode(), `No contact found with phone number ${phone}`, {
				description: 'Turn on "Create Contact If Missing" or create the contact first',
			});
		}

		const name = (this.getNodeParameter('contactName', '') as string).trim();
		const created = await waMatrixApiRequest.call(this, 'POST', '/contacts', {}, {
			first_name: name !== '' ? name : phone,
			phone,
		});
		contact = created.data as IDataObject;
	}

	body(requestOptions).contact_id = contact.id;
	return requestOptions;
}

/**
 * Template sends: build `template_data.components` from the variable fields, or take
 * the raw JSON the user supplied.
 */
export async function buildTemplateData(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	let components: IDataObject[];

	if (this.getNodeParameter('variablesInput', 'fields') === 'json') {
		const raw = this.getNodeParameter('componentsJson', '[]');
		try {
			components = (typeof raw === 'string' ? JSON.parse(raw) : raw) as IDataObject[];
		} catch {
			throw new NodeOperationError(this.getNode(), 'Components (JSON) is not valid JSON');
		}
		if (!Array.isArray(components)) {
			throw new NodeOperationError(this.getNode(), 'Components (JSON) must be an array');
		}
	} else {
		const bodyRows = this.getNodeParameter('bodyVariables.values', []) as Array<{ value: string }>;
		const buttonRows = this.getNodeParameter('buttonVariables.values', []) as Array<{
			index: number;
			value: string;
		}>;
		components = buildTemplateComponents({
			headerType: this.getNodeParameter('headerType', 'none') as HeaderType,
			headerText: this.getNodeParameter('headerText', '') as string,
			headerMediaUrl: this.getNodeParameter('headerMediaUrl', '') as string,
			headerDocumentFilename: this.getNodeParameter('headerDocumentFilename', '') as string,
			bodyVariables: bodyRows.map((row) => row.value),
			buttonVariables: buttonRows,
		});
	}

	if (components.length > 0) {
		body(requestOptions).template_data = { components };
	}
	return requestOptions;
}

/**
 * Contact "Create or Update": update the contact that has this phone number, otherwise
 * create it. WaMatrix has no upsert endpoint, so this looks the phone up first.
 */
export async function routeContactUpsert(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	const phone = requirePhone.call(this, 'phone');
	const existing = await findContactByPhone.call(this, phone);

	body(requestOptions).phone = phone;
	if (existing !== undefined) {
		requestOptions.method = 'PUT';
		requestOptions.url = `/contacts/${existing.id as number}`;
	}
	return requestOptions;
}

/**
 * Contact Create: send the phone in the stored international format.
 */
export async function normalizeContactPhone(
	this: IExecuteSingleFunctions,
	requestOptions: IHttpRequestOptions,
): Promise<IHttpRequestOptions> {
	body(requestOptions).phone = requirePhone.call(this, 'phone');
	return requestOptions;
}

/**
 * OTP Verify: a wrong, expired or used-up code is an answer, not a failure. Return
 * `verified: false` with the reason so the workflow can branch on it.
 */
export async function otpVerifyOutcome(
	this: IExecuteSingleFunctions,
	items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	const payload = (response.body ?? {}) as IDataObject;

	if (response.statusCode >= 200 && response.statusCode < 300) {
		return [{ json: { verified: true, ...((payload.data as IDataObject) ?? {}) } }];
	}

	if (response.statusCode === 422) {
		return [
			{
				json: {
					verified: false,
					reason: payload.error_code ?? 'invalid_code',
					message: payload.message ?? '',
				},
			},
		];
	}

	throw waMatrixApiError(this.getNode(), response);
}

/**
 * Every declarative request ignores HTTP errors (see requestDefaults) so this can raise
 * them with WaMatrix's own message and error_code instead of n8n's generic text.
 */
export async function throwOnApiError(
	this: IExecuteSingleFunctions,
	items: INodeExecutionData[],
	response: IN8nHttpFullResponse,
): Promise<INodeExecutionData[]> {
	if (response.statusCode >= 400) {
		throw waMatrixApiError(this.getNode(), response);
	}
	return items;
}

/**
 * Delete endpoints answer 204 with no body; give the workflow something to read.
 */
export async function deletedOutput(
	this: IExecuteSingleFunctions,
	items: INodeExecutionData[],
): Promise<INodeExecutionData[]> {
	return items.map(() => ({ json: { deleted: true } }));
}
