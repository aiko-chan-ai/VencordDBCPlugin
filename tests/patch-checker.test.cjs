const assert = require('node:assert/strict');
const { test } = require('node:test');
const check = require('./helpers/check-patches.cjs');
const load = require('./helpers/load-typescript.cjs');
const { canonicalizeFind, canonicalizeReplacement } = load('../../utils/patches.ts', {
    './intlHash': { runtimeHashMessageKey: () => { throw Error('Unexpected intl hash in this fixture'); } },
});

function patch(find, match, replace, options = {}) {
    const value = { find, replacement: [{ match, replace }], ...options };
    canonicalizeFind(value);
    for (const replacement of [value.replacement].flat()) canonicalizeReplacement(replacement, 'plugin');
    return value;
}

test('the verifier uses real Vencord identifier canonicalization and accepts method-style factories', () => {
    const item = patch('anchor', /return \i\(/, 'return $self.call(');
    assert.equal(check([item], { 42: '42(e){const anchor=true;return e()}' })[0].status, 'PASS');
});

test('an anchor collision fails instead of choosing the first matching constants/renderer module', () => {
    const item = patch('anchor', 'return 1', 'return 2');
    assert.equal(check([item], { 1: '1(){const anchor=0;return 1}', 2: '2(){const anchor=0;return 1}' })[0].status, 'FAIL');
});

test('missing chunks, stale replacements and syntax errors cannot produce a passing result', () => {
    const factories = { 1: '1(){const anchor=0;return 1}' };
    assert.equal(check([patch('missing', 'return 1', 'return 2')], factories)[0].status, 'UNLOADED');
    assert.equal(check([patch('anchor', 'return 7', 'return 2')], factories)[0].status, 'FAIL');
    assert.equal(check([patch('anchor', 'return 1', 'return )')], factories)[0].status, 'FAIL');
    assert.equal(check([patch('anchor', 'return 1', 'return 1')], factories)[0].status, 'FAIL');
});

test('disabled/build-gated patches are skipped and global regexes are reusable', () => {
    const item = patch(/anchor/g, /return 1/g, 'return 2');
    const factories = { 1: '1(){const anchor=0;return 1}' };
    for (let i = 0; i < 2; i++) assert.equal(check([item], factories)[0].status, 'PASS');
    assert.equal(check([{ ...item, predicate: () => false }], factories)[0].status, 'SKIP');
    assert.equal(check([{ ...item, fromBuild: 200 }], factories, 100)[0].status, 'SKIP');
});

test('replacements run in order and grouped failure rolls back before the next patch', () => {
    const factories = { 1: '1(){const anchor=0;return 1}' };
    const first = patch('anchor', 'return 1', 'return 2', { group: true });
    first.replacement.push({ match: 'missing', replace: 'changed' });
    const second = patch('anchor', 'return 1', 'return 3');
    assert.deepEqual(check([first, second], factories).map(result => result.status), ['FAIL', 'PASS']);
    first.noWarn = true;
    assert.equal(check([first], factories)[0].status, 'FAIL', 'A grouped rollback must not be reported as compatible');
});

test('later replacements and patches see earlier edits to the same factory', () => {
    const first = patch('anchor', 'return 1', 'return 2');
    first.replacement.push({ match: 'return 2', replace: 'return 3' });
    const second = patch('anchor', 'return 3', 'return 4');
    const results = check([first, second], { 1: '1(){const anchor=0;return 1}' });
    assert.deepEqual(results.map(result => result.status), ['PASS', 'PASS']);
    assert.equal(results[0].replacements, 2);
});

test('all-module patches accept multiple matches, and verification never executes factory bodies', () => {
    const item = patch('throw', 'throw Error', 'return Error', { all: true });
    const result = check([item], { 1: '1(){throw Error("must not execute")}', 2: '2(){throw Error("must not execute")}' })[0];
    assert.equal(result.status, 'PASS');
    assert.equal(result.replacements, 2);
});

test('emoji availability matches the definition, not lazy upload/settings callers', () => {
    const { applicationEmojiPatches } = load('utils/application-emoji-patches.ts', {
        './application-emojis': { APPLICATION_EMOJI_CATEGORY: 'Application Emojis' },
    });
    const availability = applicationEmojiPatches.at(-1);
    canonicalizeFind(availability);
    const matches = value => new RegExp(availability.find.source, availability.find.flags).test(value);
    assert.equal(matches('const service={sanitizeEmojiName(name){return name}}'), true);
    for (const caller of ['service.sanitizeEmojiName(name)', 'return service.sanitizeEmojiName(file.name)', 'onCommit(){service.sanitizeEmojiName(value)}']) {
        assert.equal(matches(caller), false);
    }
});
