const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
	buildTemplateComponents,
	phoneDigits,
	toE164,
} = require('../dist/nodes/WaMatrix/shared/utils');

test('phone numbers normalise to the format WaMatrix stores', () => {
	assert.equal(phoneDigits('+91 98765-43210'), '919876543210');
	assert.equal(toE164('+91 98765 43210'), '+919876543210');
	assert.equal(toE164('919876543210'), '+919876543210');
	assert.equal(toE164('0123456789'), null);
	assert.equal(toE164('12345'), null);
	assert.equal(toE164(''), null);
});

test('no variables means no components, so the API sees none', () => {
	assert.deepEqual(buildTemplateComponents({}), []);
	assert.deepEqual(buildTemplateComponents({ headerType: 'text', headerText: '' }), []);
});

test('body variables keep their order', () => {
	assert.deepEqual(buildTemplateComponents({ bodyVariables: ['Asha', '#A123'] }), [
		{
			type: 'body',
			parameters: [
				{ type: 'text', text: 'Asha' },
				{ type: 'text', text: '#A123' },
			],
		},
	]);
});

test('media headers, document filenames and URL buttons use the Cloud API shapes', () => {
	const components = buildTemplateComponents({
		headerType: 'document',
		headerMediaUrl: 'https://example.com/i.pdf',
		headerDocumentFilename: 'invoice.pdf',
		buttonVariables: [{ index: 1, value: 'order/42' }],
	});

	assert.deepEqual(components, [
		{
			type: 'header',
			parameters: [
				{
					type: 'document',
					document: { link: 'https://example.com/i.pdf', filename: 'invoice.pdf' },
				},
			],
		},
		{
			type: 'button',
			sub_type: 'url',
			index: '1',
			parameters: [{ type: 'text', text: 'order/42' }],
		},
	]);
});

test('a text header becomes a header text parameter', () => {
	assert.deepEqual(buildTemplateComponents({ headerType: 'text', headerText: 'Diwali' }), [
		{ type: 'header', parameters: [{ type: 'text', text: 'Diwali' }] },
	]);
});
