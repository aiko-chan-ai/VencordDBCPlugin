const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

function runtime() {
    const requests = [], toasts = [];
    const source = fs.readFileSync(path.join(__dirname, "../utils/create-dm-by-id.ts"), "utf8");
    const module = { exports: {} };
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, {
        exports: module.exports, module,
        require: () => ({
            ChannelActionCreators: { openPrivateChannel: options => new Promise((resolve, reject) => requests.push({ options, resolve, reject })) },
            UserStore: { getCurrentUser: () => ({ id: "999999999999999999" }) },
            showToast: toast => toasts.push(toast)
        })
    });
    return { ...module.exports, requests, toasts };
}

function modal(query = "123456789012345678") {
    const state = { closed: 0, completed: [] };
    const instance = {
        state: {}, setState: next => Object.assign(instance.state, next),
        props: { query, selectedUsers: new Set(),
            onClose: () => state.closed++, onComplete: id => state.completed.push(id) }
    };
    return { instance, state };
}

test("User IDs retain full precision and reject malformed or overflowing values", () => {
    const { parseUserId } = runtime();
    assert.equal(parseUserId(" 123456789012345678 "), "123456789012345678");
    assert.equal(parseUserId("18446744073709551615"), "18446744073709551615");
    for (const value of ["", "123", "012345678901234567", "18446744073709551616", "1e18", "123456789012345678,987654321012345678", "<@123456789012345678>", 123456789012345678]) {
        assert.equal(parseUserId(value), undefined);
    }
});

test("new messages use the direct DM handler with typed or selected IDs", () => {
    const { directMessageHelpers } = runtime();
    const props = modal().instance.props;
    assert.equal(directMessageHelpers.shouldCreateDMFromId(props), true);
    assert.equal(directMessageHelpers.shouldCreateDMFromId({ ...props, channel: { id: "existing" } }), false);
    assert.equal(directMessageHelpers.shouldCreateDMFromId({ ...props, selectedUsers: new Set(["user"]) }), true);
});

test("one selected recipient takes priority over the search text", async () => {
    const run = runtime(), { instance, state } = modal("another search");
    instance.props.selectedUsers = new Set(["123456789012345678"]);
    const opening = run.directMessageHelpers.createDMFromId(instance);
    assert.deepEqual(Array.from(run.requests[0].options.recipientIds), ["123456789012345678"]);
    run.requests[0].resolve("dm");
    assert.equal(await opening, true);
    assert.equal(state.closed, 1);
});

test("multiple recipients never send a group creation request or close the modal", async () => {
    const run = runtime(), { instance, state } = modal();
    instance.props.selectedUsers = new Set(["123456789012345678", "234567890123456789"]);
    assert.equal(await run.directMessageHelpers.createDMFromId(instance), false);
    assert.equal(run.requests.length, 0);
    assert.equal(state.closed, 0);
    assert.match(run.toasts[0].text, /one person/);
});

test("successful creation uses the native cached DM path and closes only after success", async () => {
    const run = runtime(), { instance, state } = modal();
    const opening = run.directMessageHelpers.createDMFromId(instance);
    assert.equal(run.requests[0].options.recipientIds[0], "123456789012345678");
    assert.equal(instance.state.botClientOpeningDm, true);
    assert.equal(state.closed, 0);
    run.requests[0].resolve("dm-channel");
    assert.equal(await opening, true);
    assert.equal(state.completed[0], "dm-channel");
    assert.equal(state.closed, 1);
});

test("repeated clicks cannot start duplicate DM requests", async () => {
    const run = runtime(), { instance } = modal();
    const first = run.directMessageHelpers.createDMFromId(instance);
    assert.equal(await run.directMessageHelpers.createDMFromId(instance), false);
    assert.equal(run.requests.length, 1);
    run.requests[0].resolve("dm");
    await first;
});

test("invalid IDs and the current bot's own ID keep the modal open without requests", async () => {
    const run = runtime();
    for (const query of ["", "not an id", "123", "999999999999999999"]) {
        const { instance, state } = modal(query);
        assert.equal(await run.directMessageHelpers.createDMFromId(instance), false);
        assert.equal(state.closed, 0);
    }
    assert.equal(run.requests.length, 0);
    assert.equal(run.toasts.length, 4);
});

test("API errors retain the query, release the loading state, and permit retry", async () => {
    const run = runtime(), { instance, state } = modal();
    const opening = run.directMessageHelpers.createDMFromId(instance);
    run.requests[0].reject({ body: { message: "Cannot send messages to this user", code: 50007 } });
    assert.equal(await opening, false);
    assert.equal(instance.state.botClientOpeningDm, false);
    assert.equal(instance.props.query, "123456789012345678");
    assert.equal(state.closed, 0);
    assert.match(run.toasts[0].text, /Cannot send messages/);
    const retry = run.directMessageHelpers.createDMFromId(instance);
    run.requests[1].resolve("dm");
    assert.equal(await retry, true);
});

test("a known bot rejected by the existing DM patch does not close the modal", async () => {
    const run = runtime(), { instance, state } = modal();
    const opening = run.directMessageHelpers.createDMFromId(instance);
    run.requests[0].resolve(null);
    assert.equal(await opening, false);
    assert.equal(state.closed, 0);
    assert.equal(instance.state.botClientOpeningDm, false);
});
