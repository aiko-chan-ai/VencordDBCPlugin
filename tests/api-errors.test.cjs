const assert = require('node:assert/strict');
const { test } = require('node:test');
const load = require('./helpers/load-typescript.cjs');
const { extractApiErrors, buildDiscordAPIErrorMessage } = load('utils/common.ts', {}, { window: { sessionStorage: {} } });
const plain = value => JSON.parse(JSON.stringify(value));

test('Discord validation errors preserve nested array/object paths and request-level errors', () => {
    const error = { errors: {
        _errors: [{ code: 'INVALID_FORM_BODY', message: 'Invalid request' }],
        embeds: { 0: { fields: { 2: { value: { _errors: [{ code: 'BASE_TYPE_REQUIRED', message: 'Required' }] } } } } },
        attachments: { 1: { filename: { _errors: [{ code: 'INVALID_FILENAME', message: 'Invalid filename' }] } } },
    } };
    assert.deepEqual(plain(extractApiErrors(error)), [
        { path: 'root (Request Level)', code: 'INVALID_FORM_BODY', message: 'Invalid request' },
        { path: 'embeds[0].fields[2].value', code: 'BASE_TYPE_REQUIRED', message: 'Required' },
        { path: 'attachments[1].filename', code: 'INVALID_FILENAME', message: 'Invalid filename' },
    ]);
});

test('errors without nested details still show the Discord status and message', () => {
    for (const error of [undefined, null, {}, { errors: {} }]) assert.equal(extractApiErrors(error).length, 0);
    const text = buildDiscordAPIErrorMessage({ code: 50007, message: 'Cannot send messages to this user', unrelated: 'DO_NOT_INCLUDE' });
    assert.match(text, /50007.*Cannot send messages to this user/);
    assert.ok(!text.includes('DO_NOT_INCLUDE'));
});
