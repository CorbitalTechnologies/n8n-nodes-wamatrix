import {
	NodeApiError,
	type IDataObject,
	type IExecuteSingleFunctions,
	type IHookFunctions,
	type IHttpRequestMethods,
	type ILoadOptionsFunctions,
	type IN8nHttpFullResponse,
	type INode,
	type IWebhookFunctions,
	type JsonObject,
} from 'n8n-workflow';

export type WaMatrixContext =
	| IExecuteSingleFunctions
	| IHookFunctions
	| ILoadOptionsFunctions
	| IWebhookFunctions;

export const DEFAULT_BASE_URL = 'https://api.wamatrix.io';

export function apiBaseUrl(baseUrl: unknown): string {
	const url = typeof baseUrl === 'string' && baseUrl.trim() !== '' ? baseUrl.trim() : DEFAULT_BASE_URL;
	return `${url.replace(/\/+$/, '')}/api/v1`;
}

/**
 * n8n's default error for a 4xx is a generic "Your request is invalid", which hides
 * WaMatrix's own message ("The 24-hour messaging window has expired…") and its
 * error_code. This keeps both, plus any field validation messages.
 */
export function waMatrixApiError(node: INode, response: IN8nHttpFullResponse): NodeApiError {
	const body = (typeof response.body === 'object' && response.body !== null ? response.body : {}) as IDataObject;
	const fieldErrors = Object.entries((body.errors as Record<string, string[]>) ?? {}).map(
		([field, messages]) => `${field}: ${([] as string[]).concat(messages).join(' ')}`,
	);
	const details = [body.error_code ? `Error code: ${body.error_code as string}` : '', ...fieldErrors];

	return new NodeApiError(node, body as JsonObject, {
		message: (body.message as string) || `WaMatrix returned HTTP ${response.statusCode}`,
		description: details.filter(Boolean).join('\n') || undefined,
		httpCode: String(response.statusCode),
	});
}

/**
 * One authenticated call to the WaMatrix REST API. `path` is relative to /api/v1.
 */
export async function waMatrixApiRequest(
	this: WaMatrixContext,
	method: IHttpRequestMethods,
	path: string,
	qs: IDataObject = {},
	body?: IDataObject,
): Promise<IDataObject> {
	const credentials = await this.getCredentials('waMatrixApi');

	const response = (await this.helpers.httpRequestWithAuthentication.call(this, 'waMatrixApi', {
		method,
		url: `${apiBaseUrl(credentials.baseUrl)}${path}`,
		qs,
		body,
		json: true,
		ignoreHttpStatusErrors: true,
		returnFullResponse: true,
	})) as IN8nHttpFullResponse;

	if (response.statusCode >= 400) {
		throw waMatrixApiError(this.getNode(), response);
	}
	return (response.body ?? {}) as IDataObject;
}

/**
 * Every row of a page-paginated list endpoint (contacts, templates, groups, …).
 * Only used for dropdowns, so it stops at `maxPages` to keep the editor fast.
 */
export async function waMatrixApiRequestAllPages(
	this: WaMatrixContext,
	path: string,
	qs: IDataObject = {},
	maxPages = 10,
): Promise<IDataObject[]> {
	const rows: IDataObject[] = [];

	for (let page = 1; page <= maxPages; page++) {
		const response = await waMatrixApiRequest.call(this, 'GET', path, { ...qs, page, per_page: 100 });
		rows.push(...((response.data as IDataObject[]) ?? []));

		const meta = (response.meta as IDataObject) ?? {};
		if (!meta.last_page || (meta.current_page as number) >= (meta.last_page as number)) {
			break;
		}
	}

	return rows;
}
