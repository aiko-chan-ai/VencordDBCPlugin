const assert = require('node:assert/strict');
const { test } = require('node:test');
const runtime = require('./helpers/gateway-runtime.cjs');
const settle = () => new Promise(setImmediate);
const plain = value => JSON.parse(JSON.stringify(value));

test('an unknown DM hydrates its channel before delivering the message exactly once', async () => {
    const run = runtime(), message = { channel_id: 'dm', content: 'incoming' };
    assert.equal(run.dispatch(message, 'MESSAGE_CREATE'), false);
    assert.equal(run.received.length, 0);
    assert.equal(run.requests[0].options.url, '/channels/dm');
    const channel = { id: 'dm', type: 1, recipients: [{ id: 'person' }] };
    run.requests[0].resolve({ body: channel });
    await settle();
    assert.deepEqual(run.received.map(event => event.event), ['CHANNEL_CREATE', 'MESSAGE_CREATE']);
    assert.equal(run.received[1].data, message);
    assert.equal(run.received[1].sequence, 42);
    assert.deepEqual(run.saved, [['current-bot', 'person', 'dm']]);
});

test('channel lookup failures still deliver the incoming DM once, without saving an invalid channel', async () => {
    const run = runtime(), message = { channel_id: 'missing' };
    run.dispatch(message, 'MESSAGE_CREATE');
    run.requests[0].reject(new Error('Missing access'));
    await settle();
    assert.deepEqual(run.received.map(event => event.event), ['MESSAGE_CREATE']);
    assert.equal(run.saved.length, 0);
});

test('cached DMs, guild messages and unrelated events need no hydration request', () => {
    const run = runtime();
    run.channels.set('known', { id: 'known' });
    for (const [message, event] of [[{ channel_id: 'known' }, 'MESSAGE_CREATE'], [{ channel_id: 'guild-channel', guild_id: 'guild' }, 'MESSAGE_CREATE'], [{ channel_id: 'unknown' }, 'MESSAGE_UPDATE']]) {
        assert.equal(run.dispatch(message, event), message);
    }
    assert.equal(run.requests.length, 0);
});

test('the DM persistence preference disables saved-channel writes without dropping messages', async () => {
    const run = runtime();
    run.self.settings.store.saveDirectMessage = false;
    run.dispatch({ channel_id: 'dm' }, 'MESSAGE_CREATE');
    run.requests[0].resolve({ body: { id: 'dm', type: 1, recipients: [{ id: 'person' }] } });
    await settle();
    assert.equal(run.saved.length, 0);
    assert.equal(run.received.length, 2);
});

test('opening a private channel rejects empty recipients and known bots before the API call', async () => {
    const run = runtime(), action = { _getRecipients: value => value ?? [], openPrivateChannel_: () => assert.fail('Unexpected API call') };
    assert.equal(await run.openPrivateChannelPatch({ recipientIds: [] }, action, run.self), null);
    run.users.set('other-bot', { bot: true });
    assert.equal(await run.openPrivateChannelPatch({ recipientIds: ['other-bot'] }, action, run.self), null);
    assert.equal(run.toasts.length, 2);
});

test('opening a DM preserves native options and saves only successful results', async () => {
    const run = runtime(), options = { recipientIds: ['person'], navigateToChannel: false, joinCall: false };
    const action = { _getRecipients: value => value, openPrivateChannel_: async value => { assert.equal(value, options); return 'dm'; } };
    assert.equal(await run.openPrivateChannelPatch(options, action, run.self), 'dm');
    assert.deepEqual(run.saved, [['current-bot', 'person', 'dm']]);
    run.saved.length = 0;
    action.openPrivateChannel_ = async () => { throw new Error('Cannot send messages'); };
    await assert.rejects(run.openPrivateChannelPatch(options, action, run.self), /Cannot send/);
    assert.equal(run.saved.length, 0);
});

test('thread-member subscriptions keep member data and tolerate empty/malformed lists', async () => {
    const run = runtime();
    await run.updateGuildSubscriptionsPatch({});
    await run.updateGuildSubscriptionsPatch({ guild: { channels: {} } });
    assert.equal(run.requests.length, 0);
    for (const body of [[], null, {}]) {
        const pending = run.updateGuildSubscriptionsPatch({ guild: { thread_member_lists: ['thread'] } });
        run.requests.at(-1).resolve({ body });
        await pending;
    }
    assert.equal(run.dispatched.length, 0);
    const pending = run.updateGuildSubscriptionsPatch({ guild: { thread_member_lists: ['thread'] } });
    run.requests.at(-1).resolve({ body: [{ user_id: 'person', member: { nick: 'member' } }] });
    await pending;
    assert.deepEqual(plain(run.dispatched), [{ type: 'THREAD_MEMBER_LIST_UPDATE', threadId: 'thread', guildId: 'guild',
        members: [{ user_id: 'person', member: { nick: 'member' }, presence: null }],
    }]);
});
