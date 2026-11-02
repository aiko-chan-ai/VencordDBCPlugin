const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

function runtime() {
    const requests = [], clock = { now: 1000 };
    let user = { id: "bot-a" }, changes = 0;
    const common = {
        UserStore: { getCurrentUser: () => user },
        RestAPI: { get: () => new Promise((resolve, reject) => requests.push({ resolve, reject })) },
        EmojiStore: {
            emojiFrecencyWithoutFetchingLatest: { markDirty() {} },
            emojiReactionFrecencyWithoutFetchingLatest: { markDirty() {} },
            emitChange: () => changes++
        }
    };
    const module = { exports: {} };
    const source = fs.readFileSync(path.join(__dirname, "../utils/application-emojis.ts"), "utf8");
    const code = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const window = {};
    vm.runInNewContext(code, {
        exports: module.exports, module, window, console: { warn() {} },
        Date: class extends Date { static now() { return clock.now; } },
        require(name) {
            if (name === "@webpack/common") return common;
            if (name === "@webpack") return { findByPropsLazy: () => ({ EmojiIntention: { CHAT: 3, REACTION: 0, AUTO_SUGGESTION: 9, DEFAULT_REACT_EMOJI: 13 } }) };
            throw Error(`Unexpected import: ${name}`);
        }
    });
    return { helpers: module.exports.applicationEmojiHelpers, category: module.exports.APPLICATION_EMOJI_CATEGORY,
        requests, clock, window, setUser: value => { user = value; }, changes: () => changes };
}

async function loaded(items = [{ id: "123", name: "app_emoji", animated: true }]) {
    const run = runtime(), pending = run.helpers.getApplicationEmojis();
    run.requests[0].resolve({ body: items });
    await pending;
    return run;
}

test("fetch once, normalize API emojis for Discord, and notify the picker", async () => {
    const run = runtime();
    const first = run.helpers.getApplicationEmojis();
    const second = run.helpers.getApplicationEmojis();
    assert.equal(run.requests.length, 1);
    run.requests[0].resolve({ body: [{ id: "123", name: "app", animated: true }, null, { id: "123", name: "duplicate" }, { id: "bad" }] });
    await Promise.all([first, second]);
    const [emoji] = run.helpers.getApplicationEmojisForPicker();
    assert.equal(emoji.id, "123");
    assert.equal(emoji.type, 1);
    assert.equal(emoji.guildId, "0");
    assert.equal(emoji.require_colons, true);
    assert.equal(emoji.animated, true);
    assert.equal(emoji.roles.length, 0);
    assert.equal(run.helpers.getApplicationEmojisForPicker().length, 1);
    assert.equal(run.helpers.getApplicationEmoji("123"), emoji);
    assert.equal(run.changes(), 1);
});

test("an empty API response is cached instead of fetched on each picker render", async () => {
    const run = await loaded([]);
    await run.helpers.getApplicationEmojis();
    run.helpers.getApplicationEmojisForPicker();
    assert.equal(run.requests.length, 1);
    assert.equal(run.window.applicationEmojis.length, 0);
    const native = ["recent", "people"];
    assert.equal(run.helpers.getEmojiCategories(native), native);
    let sections = 0;
    run.helpers.addApplicationEmojiSection(() => sections++, { pickerIntention: 3 });
    assert.equal(sections, 0);
});

test("an application that removes all emojis loses its section and stale ID lookups", async () => {
    const run = await loaded();
    run.clock.now += 6 * 60 * 1000;
    const refresh = run.helpers.getApplicationEmojis();
    run.requests[1].resolve({ body: [] });
    await refresh;
    assert.equal(run.helpers.getApplicationEmoji("123"), undefined);
    const native = ["recent", "custom", "people"];
    assert.equal(run.helpers.getEmojiCategories(native), native);
});

test("a late response from the previous bot cannot replace the current bot's emojis", async () => {
    const run = runtime(), first = run.helpers.getApplicationEmojis();
    run.setUser({ id: "bot-b" });
    const second = run.helpers.getApplicationEmojis();
    run.requests[0].resolve({ body: [{ id: "1", name: "old_bot" }] });
    await first;
    assert.equal(run.helpers.getApplicationEmoji("1"), undefined);
    run.requests[1].resolve({ body: [{ id: "2", name: "new_bot" }] });
    await second;
    assert.equal(run.helpers.getApplicationEmoji("2").name, "new_bot");
    assert.equal(run.window.applicationEmojis[0].id, "2");
});

test("refresh errors keep the usable cache and back off before retrying", async () => {
    const run = await loaded();
    run.clock.now += 6 * 60 * 1000;
    const refresh = run.helpers.getApplicationEmojis();
    run.requests[1].reject(new Error("network unavailable"));
    await refresh;
    assert.equal(run.helpers.getApplicationEmoji("123").name, "app_emoji");
    await run.helpers.getApplicationEmojis();
    assert.equal(run.requests.length, 2);
});

test("the dedicated category is stable and does not modify native guild categories", async () => {
    const run = await loaded(), source = ["favorites", "recent", "custom", "people"];
    const categories = run.helpers.getEmojiCategories(source);
    assert.equal(source.length, 4);
    assert.equal(categories.indexOf(run.category), 2);
    assert.equal(run.helpers.getEmojiCategories(source), categories);
    assert.equal(run.helpers.getEmojiCategories(categories), categories);
    let resets = 0;
    const context = { reset: () => resets++ };
    run.helpers.refreshApplicationEmojiContext(context);
    run.helpers.refreshApplicationEmojiContext(context);
    assert.equal(resets, 1);
    run.helpers.clearApplicationEmojis();
    assert.equal(run.window.applicationEmojis.length, 0);
    assert.equal(run.helpers.getApplicationEmoji("123"), undefined);
});

test("the native grid receives a custom section only for supported emoji intentions", async () => {
    const run = await loaded(), sections = [];
    const add = (emojis, category) => sections.push({ emojis, category });
    run.helpers.addApplicationEmojiSection(add, { pickerIntention: 3 });
    assert.equal(sections[0].emojis[0].id, "123");
    assert.equal(sections[0].category.sectionId, run.category);
    assert.equal(sections[0].category.isNitroLocked, false);
    assert.equal(sections[0].category.guild, undefined);
    assert.equal(sections[0].category.pack, undefined);
    run.helpers.addApplicationEmojiSection(add, { pickerIntention: 12 });
    run.helpers.addApplicationEmojiSection(add, { pickerIntention: 14 });
    assert.equal(sections.length, 1);
    assert.equal(run.helpers.canUseApplicationEmojis(0), true);
    assert.equal(run.helpers.canUseApplicationEmojis(14), false);
});

test("large application collections remain indexed without a display limit", async () => {
    const run = await loaded(Array.from({ length: 2000 }, (_, index) => ({ id: String(index + 1), name: `app_${index}` })));
    assert.equal(run.helpers.getApplicationEmojisForPicker().length, 2000);
    assert.equal(run.helpers.getApplicationEmoji("2000").name, "app_1999");
});

test("the picker patch cannot be consumed by the constants module before reaching the renderer", () => {
    const module = { exports: {} };
    const source = fs.readFileSync(path.join(__dirname, "../utils/application-emoji-patches.ts"), "utf8");
    vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, {
        exports: module.exports, module,
        require: () => ({ APPLICATION_EMOJI_CATEGORY: "Application Emojis" })
    });
    const gridPatch = module.exports.applicationEmojiPatches.find(patch => Array.isArray(patch.replacement)
        && patch.replacement.some(replacement => replacement.replace.includes("vcAddApplicationEmojiSection")));
    // The constants module and renderer both mention EMOJI_PICKER_CONSTANTS_EMOJI_LIST_PADDING_TOP.
    const constants = "a.xI(A.A.EMOJI_PICKER_CONSTANTS_EMOJI_LIST_PADDING_TOP)";
    const renderer = "v=I.getGroupedCustomEmoji();return s.useMemo(()=>{a.xI(A.A.EMOJI_PICKER_CONSTANTS_EMOJI_LIST_PADDING_TOP)})";
    assert.equal(constants.includes(gridPatch.find), false);
    assert.equal(renderer.includes(gridPatch.find), true);
});
