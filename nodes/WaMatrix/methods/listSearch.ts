import type { IDataObject, ILoadOptionsFunctions, INodeListSearchResult } from 'n8n-workflow';
import { waMatrixApiRequest } from '../shared/transport';

export async function searchContacts(
	this: ILoadOptionsFunctions,
	filter?: string,
	paginationToken?: string,
): Promise<INodeListSearchResult> {
	const page = paginationToken ? Number(paginationToken) : 1;
	const qs: IDataObject = { page, per_page: 50 };
	if (filter) {
		qs.search = filter;
	}

	const response = await waMatrixApiRequest.call(this, 'GET', '/contacts', qs);
	const meta = (response.meta as IDataObject) ?? {};

	return {
		results: ((response.data as IDataObject[]) ?? []).map((contact) => ({
			name: [contact.display_name, contact.phone].filter(Boolean).join(' · '),
			value: String(contact.id),
		})),
		paginationToken:
			(meta.current_page as number) < (meta.last_page as number) ? String(page + 1) : undefined,
	};
}
