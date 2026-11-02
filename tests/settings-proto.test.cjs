const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");
const { MessageType, ScalarType, LongType } = require("@protobuf-ts/runtime");

function load(name, require, globals = {}) {
    const module = { exports: {} };
    const source = fs.readFileSync(path.join(__dirname, "../utils", name), "utf8");
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
        { exports: module.exports, module, require, Uint8Array, atob, btoa, ...globals });
    return module.exports;
}

function codecs() {
    const nested = new MessageType("Test.Notifications", [
        { no: 1, name: "last_seen_id", kind: "scalar", T: ScalarType.FIXED64, L: LongType.STRING },
        { no: 2, name: "enabled", kind: "scalar", T: ScalarType.BOOL }
    ]);
    const native = new MessageType("Test.Settings", [
        { no: 1, name: "notifications", kind: "message", T: () => nested },
        { no: 2, name: "locale", kind: "scalar", T: ScalarType.STRING, opt: true },
        { no: 3, name: "payload", kind: "scalar", T: ScalarType.BYTES, opt: true }
    ]);
    const store = { getFullState: () => ({ 1: { ProtoClass: native }, 2: { ProtoClass: native } }) };
    const exports = load("native-settings-proto.ts", () => ({ findStoreLazy: () => store }));
    return { native, store, facade: exports.PreloadedUserSettings };
}

test("legacy records are rehydrated using the active schema before serialization", () => {
    const { native, facade } = codecs();
    const legacy = { notifications: { enabled: true } };
    assert.throws(() => native.toBinary(legacy));
    const hydrated = facade.create(legacy);
    assert.equal(hydrated.notifications.lastSeenId, "0");
    assert.equal(hydrated.notifications.enabled, true);
    assert.equal(legacy.notifications.lastSeenId, undefined);
    assert.equal(facade.fromBase64(facade.toBase64(hydrated)).notifications.enabled, true);
});

test("base64 serialization supports large settings and full-width fixed64 values", () => {
    const { facade } = codecs();
    const message = facade.create({ notifications: { lastSeenId: "18446744073709551615" }, payload: new Uint8Array(200000).fill(255) });
    const restored = facade.fromBase64(facade.toBase64(message));
    assert.equal(restored.payload.length, 200000);
    assert.equal(restored.notifications.lastSeenId, "18446744073709551615");
    assert.throws(() => facade.fromBase64("not base64!"));
});

test("a missing native codec fails clearly; later schema changes use the current codec", () => {
    const { facade, store } = codecs();
    store.getFullState = () => ({});
    assert.throws(() => facade.create(), /codec is not ready/);
    const updated = new MessageType("Test.NewSettingsSchema", [
        { no: 1, name: "new_snowflake", kind: "scalar", T: ScalarType.FIXED64, L: LongType.STRING },
    ]);
    store.getFullState = () => ({ 1: { ProtoClass: updated } });
    const value = facade.create({});
    assert.equal(value.newSnowflake, "0");
    assert.equal(facade.fromBase64(facade.toBase64(value)).newSnowflake, "0");
});

function bridge() {
    const { facade } = codecs();
    const records = new Map(), writes = [];
    let user = "bot-a", gate;
    const db = {
        getPreloadedUserSettings: async id => { if (gate) await gate; return facade.create(records.get(`1:${id}`) || { locale: "en-US" }); },
        getFrecencyUserSettings: async id => facade.create(records.get(`2:${id}`) || {}),
        SetPreloadedUserSettings: async (id, value) => { records.set(`1:${id}`, value); writes.push(id); },
        SetFrecencyUserSettings: async (id, value) => { records.set(`2:${id}`, value); writes.push(id); }
    };
    const exports = load("settings-proto.ts", name => {
        if (name === "@webpack/common") return { UserStore: { getCurrentUser: () => ({ id: user }) } };
        if (name === "./database") return { __esModule: true, default: db };
        if (name === "./proto") return { PreloadedUserSettings: facade, FrecencyUserSettings: facade };
        throw Error(`Unexpected import: ${name}`);
    });
    return { ...exports, facade, db, records, writes, setUser: value => { user = value; }, hold: value => { gate = value; } };
}

test("local GET/PATCH preserve unrelated settings and isolate both bot and settings type", async () => {
    const run = bridge(), request = run.settingsProtoHelpers.settingsProtoRequest;
    const patch = run.facade.toBase64(run.facade.create({ notifications: { enabled: true } }));
    const result = await request(1, patch);
    const parsed = run.facade.fromBase64(result.body.settings);
    assert.equal(parsed.locale, "en-US");
    assert.equal(parsed.notifications.enabled, true);
    assert.equal(run.facade.fromBase64((await request(2)).body.settings).notifications, undefined);
    run.setUser("bot-b");
    assert.equal(run.facade.fromBase64((await request(1)).body.settings).notifications, undefined);
});

test("simultaneous local patches are serialized instead of losing one update", async () => {
    const run = bridge(), request = run.settingsProtoHelpers.settingsProtoRequest;
    const first = request(1, run.facade.toBase64(run.facade.create({ notifications: { enabled: true } })));
    const second = request(1, run.facade.toBase64(run.facade.create({ locale: "vi" })));
    await Promise.all([first, second]);
    const saved = run.records.get("1:bot-a");
    assert.equal(saved.notifications.enabled, true);
    assert.equal(saved.locale, "vi");
});

test("malformed patches leave persisted settings untouched and do not poison later requests", async () => {
    const run = bridge(), request = run.settingsProtoHelpers.settingsProtoRequest;
    await assert.rejects(request(1, "bad base64!"));
    assert.equal(run.writes.length, 0);
    assert.equal((await request(1)).status, 200);
    await assert.rejects(request(3));
});

test("account switches while loading cannot apply another bot's settings", async () => {
    const run = bridge();
    let release;
    run.hold(new Promise(resolve => { release = resolve; }));
    const update = run.facade.toBase64(run.facade.create({ locale: "vi" }));
    const loading = run.settingsProtoHelpers.settingsProtoRequest(1, update);
    await Promise.resolve();
    run.setUser("bot-b");
    release();
    await assert.rejects(loading, /account|session/i);
    assert.equal(run.writes.length, 0);
});

test("logged-out requests fail before reading or writing settings", async () => {
    const run = bridge();
    run.setUser(null);
    run.db.getPreloadedUserSettings = () => assert.fail("Unexpected database read");
    await assert.rejects(run.settingsProtoHelpers.settingsProtoRequest(1), /No active bot session/);
    assert.equal(run.writes.length, 0);
});

test("frecency requests do not wait for an unrelated preloaded-settings request", async () => {
    const run = bridge();
    let release;
    run.hold(new Promise(resolve => { release = resolve; }));
    const first = run.settingsProtoHelpers.settingsProtoRequest(1);
    await Promise.resolve();
    try {
        const result = await Promise.race([
            run.settingsProtoHelpers.settingsProtoRequest(2),
            new Promise(resolve => setImmediate(() => resolve(null))),
        ]);
        assert.ok(result, "An unrelated settings type must not be blocked behind the first request");
        assert.equal(result.status, 200);
    } finally {
        release();
        await first;
    }
});

test("disk write failures are reported instead of acknowledging unsaved settings", async () => {
    const run = bridge();
    run.db.SetPreloadedUserSettings = async () => { throw Error("disk full"); };
    const update = run.facade.toBase64(run.facade.create({ locale: "vi" }));
    await assert.rejects(run.settingsProtoHelpers.settingsProtoRequest(1, update), /disk full/);
    assert.equal(run.records.size, 0);
    assert.equal((await run.settingsProtoHelpers.settingsProtoRequest(1)).status, 200, "A failed write releases the queue");
});
