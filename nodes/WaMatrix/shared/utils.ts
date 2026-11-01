import type { IDataObject } from 'n8n-workflow';

/**
 * Digits only, no leading "+", so "+91 98765-43210" and "919876543210" compare equal.
 */
export function phoneDigits(phone: unknown): string {
	return String(phone ?? '').replace(/\D/g, '');
}

/**
 * The international format WaMatrix stores ("+" then 7–15 digits), or null when the input
 * can't be one.
 */
export function toE164(phone: unknown): string | null {
	const digits = phoneDigits(phone);
	return /^[1-9]\d{6,14}$/.test(digits) ? `+${digits}` : null;
}

export type HeaderType = 'none' | 'text' | 'image' | 'video' | 'document';

export interface TemplateParameterInput {
	headerType?: HeaderType;
	headerText?: string;
	headerMediaUrl?: string;
	headerDocumentFilename?: string;
	bodyVariables?: string[];
	buttonVariables?: Array<{ index: number; value: string }>;
}

/**
 * Turns the node's friendly template fields into the Meta `components` array the
 * WaMatrix API forwards. Empty sections are left out, because the API rejects a
 * send whose parameter count differs from the template's.
 */
export function buildTemplateComponents(input: TemplateParameterInput): IDataObject[] {
	const components: IDataObject[] = [];
	const headerType = input.headerType ?? 'none';

	if (headerType === 'text' && (input.headerText ?? '') !== '') {
		components.push({ type: 'header', parameters: [{ type: 'text', text: input.headerText }] });
	}

	if (headerType === 'image' || headerType === 'video' || headerType === 'document') {
		const media: IDataObject = { link: input.headerMediaUrl ?? '' };
		if (headerType === 'document' && (input.headerDocumentFilename ?? '') !== '') {
			media.filename = input.headerDocumentFilename;
		}
		components.push({ type: 'header', parameters: [{ type: headerType, [headerType]: media }] });
	}

	const body = input.bodyVariables ?? [];
	if (body.length > 0) {
		components.push({
			type: 'body',
			parameters: body.map((text) => ({ type: 'text', text: String(text) })),
		});
	}

	for (const button of input.buttonVariables ?? []) {
		components.push({
			type: 'button',
			sub_type: 'url',
			index: String(button.index),
			parameters: [{ type: 'text', text: String(button.value) }],
		});
	}

	return components;
}
