import type { IDataObject, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';
import { waMatrixApiRequest, waMatrixApiRequestAllPages } from '../shared/transport';

async function whatsAppAccounts(this: ILoadOptionsFunctions): Promise<IDataObject[]> {
	const response = await waMatrixApiRequest.call(this, 'GET', '/channels');
	return ((response.data as IDataObject[]) ?? []).filter((account) => account.platform === 'whatsapp');
}

function byName(a: INodePropertyOptions, b: INodePropertyOptions): number {
	return a.name.localeCompare(b.name);
}

export async function getPhoneNumbers(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	const options: INodePropertyOptions[] = [];

	for (const account of await whatsAppAccounts.call(this)) {
		for (const number of (account.phone_numbers as IDataObject[]) ?? []) {
			const label = [number.display_number, number.verified_name].filter(Boolean).join(' · ');
			options.push({
				name: number.status === 'active' ? label : `${label} (${number.status as string})`,
				value: number.id as number,
				description: `WhatsApp account: ${(account.name as string) ?? account.waba_id}`,
			});
		}
	}

	return options;
}

export async function getWhatsAppAccounts(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return (await whatsAppAccounts.call(this)).map((account) => ({
		name: (account.name as string) || `WABA ${account.waba_id as string}`,
		value: account.id as number,
	}));
}

/**
 * Approved templates of the WhatsApp account that owns the selected number. Templates
 * belong to the account, a send names the number, so the number's account is looked up.
 */
async function approvedTemplates(this: ILoadOptionsFunctions, category?: string): Promise<INodePropertyOptions[]> {
	const phoneNumberId = Number(this.getCurrentNodeParameter('channelId'));
	if (!phoneNumberId) {
		return [];
	}

	const account = (await whatsAppAccounts.call(this)).find((candidate) =>
		((candidate.phone_numbers as IDataObject[]) ?? []).some((number) => number.id === phoneNumberId),
	);
	if (account === undefined) {
		return [];
	}

	const qs: IDataObject = { channel_id: account.id, status: 'APPROVED' };
	if (category !== undefined) {
		qs.category = category;
	}

	const templates = await waMatrixApiRequestAllPages.call(this, '/templates', qs);
	return templates
		.map((template) => ({
			name: `${template.name as string} (${template.language as string})`,
			value: template.id as number,
			description: `Category: ${String(template.category ?? '').toLowerCase()}`,
		}))
		.sort(byName);
}

export async function getTemplates(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return await approvedTemplates.call(this);
}

export async function getAuthenticationTemplates(
	this: ILoadOptionsFunctions,
): Promise<INodePropertyOptions[]> {
	return await approvedTemplates.call(this, 'authentication');
}

async function named(this: ILoadOptionsFunctions, path: string): Promise<INodePropertyOptions[]> {
	return (await waMatrixApiRequestAllPages.call(this, path))
		.map((row) => ({ name: row.name as string, value: row.id as number }))
		.sort(byName);
}

export async function getContactStatuses(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return await named.call(this, '/statuses');
}

export async function getContactSources(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return await named.call(this, '/sources');
}

export async function getContactGroups(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return await named.call(this, '/groups');
}

export async function getContactLabels(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	return await named.call(this, '/labels');
}
