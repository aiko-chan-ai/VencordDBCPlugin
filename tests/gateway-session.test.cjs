const assert = require('node:assert/strict');
const { test } = require('node:test');
const runtime = require('./helpers/gateway-runtime.cjs');
const plain = value => JSON.parse(JSON.stringify(value));

test('failed bot validation closes with authentication failure and preserves stored shard settings', async () => {
    const run = runtime(), closed = [];
    Object.assign(run.info, { success: false, message: 'Invalid credentials' });
    run.storage.set('currentShard', '2');
    assert.equal(await run.doIdentifyFirstPatch('test-token', run.self, (...args) => closed.push(args)), null);
    assert.deepEqual(closed[0], [true, 4004, 'Invalid credentials']);
    assert.equal(run.storage.get('currentShard'), '2');
    assert.equal(run.storage.has('allShards'), false);
    assert.equal(run.toasts[0].variant, 'critical');
});

test('identify keeps a valid shard and resets missing or out-of-range shards', async () => {
    for (const [previous, expected] of [[undefined, '0'], ['1', '1'], ['3', '0']]) {
        const run = runtime();
        if (previous !== undefined) run.storage.set('currentShard', previous);
        assert.equal(await run.doIdentifyFirstPatch('test-token', run.self, () => assert.fail('Unexpected login failure')), run.info);
        assert.equal(run.storage.get('currentShard'), expected);
        assert.equal(run.storage.get('allShards'), '3');
    }
});

test('invalid/disallowed intents become login failures; other close codes stay intact', () => {
    const run = runtime();
    for (const code of [4013, 4014]) assert.equal(run.handleClosePatch({}, code, ''), 4004);
    for (const code of [1000, 4004, 4010]) assert.equal(run.handleClosePatch({}, code, ''), code);
    assert.equal(run.toasts.length, 2);
});

test('first voice connection never disconnects a nonexistent guild', () => {
    const run = runtime(), sends = [];
    const state = { guildId: 'guild-a', channelId: 'voice-a', videoStreamParameters: ['unsupported'] };
    assert.equal(run.voiceStateUpdatePatch(state, (...args) => sends.push(args)), state);
    assert.equal(state.videoStreamParameters, null);
    assert.equal(sends.length, 0);
});

test('switching voice guilds disconnects only the previous guild; leaving uses its actual ID', () => {
    const run = runtime(), sends = [], send = (op, data) => sends.push({ op, data });
    run.voiceStateUpdatePatch({ guildId: 'guild-a' }, send);
    sends.length = 0;
    run.voiceStateUpdatePatch({ guildId: 'guild-a', channelId: 'another' }, send);
    assert.equal(sends.length, 0);
    run.voiceStateUpdatePatch({ guildId: 'guild-b', selfMute: true, selfDeaf: false }, send);
    assert.deepEqual(plain(sends), [{ op: 4, data: { guild_id: 'guild-a', channel_id: null, self_mute: true, self_deaf: false } }]);
    assert.equal(run.voiceStateUpdatePatch({ guildId: null, channelId: null }, send).guildId, 'guild-b');
    assert.equal(run.voiceStateUpdatePatch({ guildId: null, channelId: null }, send).guildId, null);
});

test('a fresh identify clears the previous voice guild before another account/session connects', async () => {
    const run = runtime();
    run.voiceStateUpdatePatch({ guildId: 'previous-account-guild' }, () => {});
    await run.doIdentifyFirstPatch('test-token', run.self, () => {});
    assert.equal(run.voiceStateUpdatePatch({ guildId: null }, () => {}).guildId, null);
});

test('READY replays saved DMs after dispatch and keeps existing users without injecting settings objects', async () => {
    const run = runtime(), dm = { id: 'saved-dm', type: 1 };
    run.self.db.queryAllPrivateChannel = async id => { assert.equal(id, 'current-bot'); return [{ data: dm }]; };
    const data = { user: { id: 'current-bot' }, users: [{ id: 'existing-user' }] };
    assert.equal(run.dispatch(data, 'READY'), data);
    await Promise.resolve();
    assert.equal(run.received.length, 0);
    run.timers.forEach(callback => callback());
    assert.equal(run.received[0].event, 'CHANNEL_CREATE');
    assert.equal(run.received[0].data, dm);
    assert.deepEqual(plain(data.users).map(user => user.id), ['system-user', 'existing-user']);
    assert.equal(data.user_settings_proto, undefined);
    assert.deepEqual(plain(data.experiments), [[123, 0, 1, -1, 1, 0, 0, 0]]);
});

test('READY_SUPPLEMENTAL restores plain custom status and loads application emojis', () => {
    const run = runtime();
    run.setPresence('dnd', { text: 'working', emojiId: 'unsupported-for-bots' });
    run.dispatch({}, 'READY_SUPPLEMENTAL');
    assert.deepEqual(plain(run.sent), [{ op: 3, data: {
        status: 'dnd', since: null, activities: [{ name: 'Custom Status', type: 4, state: 'working' }], afk: false,
    } }]);
    assert.equal(run.emojiLoads(), 1);
    const empty = runtime();
    empty.dispatch({}, 'READY_SUPPLEMENTAL');
    assert.equal(empty.sent[0].data.status, 'online');
    assert.equal(empty.sent[0].data.activities.length, 0);
});
