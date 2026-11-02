const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const { test } = require('node:test');
const vm = require('node:vm');
const ts = require('typescript');

const moduleSource = readFileSync(join(__dirname, '../utils/patches.ts'), 'utf8');
const mod = { exports: {} };
let requestedExperiments;
vm.runInNewContext(ts.transpileModule(moduleSource, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
    module: mod, exports: mod.exports,
    require: () => ({ findStoreLazy: () => ({ getRegisteredExperiments: () => ({ titleless: { type: 'user' }, guild: { type: 'guild' } }) }) }),
    btoa, crypto,
    window: { BotClientNative: {
        getPrivateChannelDefault: () => ({ recipients: [{}] }), getGuildExperiments: () => [], getApexExperiments: () => ({}),
        getUserExperiments: ids => { requestedExperiments = JSON.parse(JSON.stringify(ids)); return []; },
    } },
});
const handle = (data, event = 'GUILD_CREATE') => mod.exports.handleDispatchPatch(data, event);

test('full bot guild snapshots finish active thread loading, including empty guilds', () => {
    for (const threads of [[], [{ id: 'thread' }]]) {
        const guild = { threads };
        assert.equal(handle(guild), guild);
        assert.equal(guild.has_threads_subscription, true);
        assert.equal(guild.threads, threads);
    }
});

test('unavailable or incomplete snapshots never claim the thread list is loaded', () => {
    for (const guild of [{ unavailable: true }, { unavailable: true, threads: [] }, {}, { threads: null }]) {
        handle(guild);
        assert.equal(guild.has_threads_subscription, undefined);
    }
    const event = { threads: [] };
    handle(event, 'THREAD_LIST_SYNC');
    assert.equal(event.has_threads_subscription, undefined);
});

test('READY does not require experiment display titles to inject assignments', () => {
    const data = { user: { id: 'bot' } };
    mod.exports.handleDispatchPatch(data, 'READY', null, null, { console: { log() {} }, settings: { store: { saveDirectMessage: false } } });
    assert.deepEqual(requestedExperiments, [{ id: 'titleless' }]);
    assert.deepEqual(data.experiments, []);
});
