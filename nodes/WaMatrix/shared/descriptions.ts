import type { IDataObject, IDisplayOptions, INodeProperties } from 'n8n-workflow';
import { deletedOutput, throwOnApiError } from './hooks';

type Show = NonNullable<IDisplayOptions['show']>;

/**
 * A connected WhatsApp phone number. Its id is what the API calls `channel_id` on a send.
 */
export function phoneNumberSelect(show: Show, overrides: Partial<INodeProperties> = {}): INodeProperties {
	return {
		displayName: 'WhatsApp Number Name or ID',
		name: 'channelId',
		type: 'options',
		typeOptions: { loadOptionsMethod: 'getPhoneNumbers' },
		required: true,
		default: '',
		description:
			'The WhatsApp number to send from. Choose from the list, or specify an ID using an <a href="https://docs.n8n.io/code/expressions/">expression</a>.',
		displayOptions: { show },
		routing: { send: { type: 'body', property: 'channel_id', value: '={{ Number($value) }}' } },
		...overrides,
	};
}

export function contactLocator(show: Show, overrides: Partial<INodeProperties> = {}): INodeProperties {
	return {
		displayName: 'Contact',
		name: 'contactId',
		type: 'resourceLocator',
		default: { mode: 'list', value: '' },
		required: true,
		displayOptions: { show },
		modes: [
			{
				displayName: 'From List',
				name: 'list',
				type: 'list',
				placeholder: 'Search by name or phone…',
				typeOptions: { searchListMethod: 'searchContacts', searchable: true },
			},
			{
				displayName: 'ID',
				name: 'id',
				type: 'string',
				placeholder: 'e.g. 42',
				validation: [
					{
						type: 'regex',
						properties: { regex: '^[0-9]+$', errorMessage: 'A contact ID is a number' },
					},
				],
			},
		],
		...overrides,
	};
}

export function idField(
	displayName: string,
	name: string,
	show: Show,
	description: string,
): INodeProperties {
	return {
		displayName,
		name,
		type: 'string',
		required: true,
		default: '',
		description,
		displayOptions: { show },
	};
}

/**
 * Return All + Limit for a list endpoint, with the right paging style. Page-based lists
 * report `meta.current_page/last_page`; conversation lists use an opaque `meta.next_cursor`.
 * The API clamps `per_page` to 5–100, so a smaller limit still fetches 5 and trims.
 *
 * n8n evaluates `request` before the first call too (`$response` is `{}` then) and
 * shallow-merges it over the request options, so `qs` must carry the original query
 * (filters, per_page) forward and tolerate the empty first response. The engine resolves
 * an expression string in place of the `qs` object; the type just doesn't say so.
 */
export function getManyFields(show: Show, paging: 'page' | 'cursor'): INodeProperties[] {
	const pagination =
		paging === 'page'
			? {
					continue: '={{ $response.body.meta.current_page < $response.body.meta.last_page }}',
					request: {
						qs: '={{ Object.assign({}, $request.qs, { page: $response.body ? $response.body.meta.current_page + 1 : 1 }) }}' as unknown as IDataObject,
					},
				}
			: {
					continue: '={{ !!$response.body.meta.next_cursor }}',
					request: {
						qs: '={{ Object.assign({}, $request.qs, $response.body ? { cursor: $response.body.meta.next_cursor } : {}) }}' as unknown as IDataObject,
					},
				};

	return [
		{
			displayName: 'Return All',
			name: 'returnAll',
			type: 'boolean',
			default: false,
			description: 'Whether to return all results or only up to a given limit',
			displayOptions: { show },
			routing: {
				send: { paginate: '={{ $value }}', type: 'query', property: 'per_page', value: '100' },
				operations: { pagination: { type: 'generic', properties: pagination } },
			},
		},
		{
			displayName: 'Limit',
			name: 'limit',
			type: 'number',
			typeOptions: { minValue: 1, maxValue: 100 },
			default: 50,
			description: 'Max number of results to return',
			displayOptions: { show: { ...show, returnAll: [false] } },
			routing: {
				send: { type: 'query', property: 'per_page', value: '={{ Math.max(5, $value) }}' },
				output: { maxResults: '={{ $value }}' },
			},
		},
	];
}

/**
 * Raises API errors, then unwraps the `{ data: … }` envelope so each row becomes one item.
 */
export const unwrapData = {
	postReceive: [throwOnApiError, { type: 'rootProperty' as const, properties: { property: 'data' } }],
};

/**
 * For 204 deletes: raise API errors, otherwise output `{ deleted: true }`.
 */
export const deletedData = { postReceive: [throwOnApiError, deletedOutput] };
