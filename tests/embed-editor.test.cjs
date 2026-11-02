const assert = require("node:assert/strict");
const { readFileSync } = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");
const vm = require("node:vm");
const ts = require("typescript");

// Load the real declarations without booting Discord's webpack runtime.
function loadDeclarations(file, names, globals = {}) {
    const source = ts.createSourceFile(file, readFileSync(path.join(__dirname, "..", file), "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    const declarations = [];
    function visit(node) {
        if (ts.isFunctionDeclaration(node) && names.includes(node.name?.text)
            || ts.isVariableStatement(node) && node.declarationList.declarations.some(declaration => names.includes(declaration.name.text))) {
            declarations.push(node);
        } else {
            ts.forEachChild(node, visit);
        }
    }
    visit(source);
    const code = ts.transpileModule(declarations.map(node => node.getText(source)).join("\n"), {
        compilerOptions: { jsx: ts.JsxEmit.React, module: ts.ModuleKind.CommonJS }
    }).outputText;
    return vm.runInNewContext(`${code}\n({ ${names.join(", ")} })`, { ...globals, URL, Date });
}

function editorRuntime() {
    const sent = [], patched = [], dispatched = [], advanced = [], modals = [];
    const globals = {
        React: { createElement: (type, props) => ({ type, props }) },
        ChatBarButton: "chat-button", IconEmbedSvg: "icon", EmbedEditorModal: "embed-modal",
        OptionType: { SELECT: "select" },
        definePluginSettings(def) {
            const store = Object.fromEntries(Object.entries(def).map(([key, option]) => [key, option.default ?? option.options?.find(value => value.default)?.value]));
            return { def, store, use: () => store };
        },
        getDraft: () => "draft content", hasEmbedPerms: () => true,
        PendingReplyStore: { getPendingReply: () => ({ messageId: "reply" }) },
        MessageActions: { getSendMessageOptionsForReply: () => ({ messageReference: { message_id: "reply" } }) },
        UploadAttachmentStore: { getUploads: () => [] },
        FluxDispatcher: { dispatch: event => dispatched.push(event) },
        DraftType: { ChannelMessage: 0 }, MessageFlags: { IS_COMPONENTS_V2: 32768 },
        Constants: { Endpoints: { MESSAGES: id => `/channels/${id}/messages`, MESSAGE: (id, msg) => `/channels/${id}/messages/${msg}` } },
        RestAPI: {
            post: async request => sent.push(request), patch: async request => patched.push(request),
            get: async () => ({ body: { content: "keep content", embeds: [{ type: "rich", title: "before" }], attachments: [{ id: "file" }], components: [{ type: 1 }], flags: 4 } })
        },
        GetApplicationId: { getId: () => "bot" }, ChannelStore: { getChannel: () => ({}) },
        showToast() {}, Alerts: { show() {} },
        requestOpenMessageEditorWindow: (...args) => advanced.push(args),
        openModal: render => modals.push(render({ onClose() {}, transitionState: 1 }))
    };
    const code = loadDeclarations("index.tsx", ["settings", "CreateMessageEditor", "EditMessageEditor"], globals);
    return { ...code, globals, sent, patched, dispatched, advanced, modals };
}

test("advanced is the default; the same chat button opens the selected editor", async () => {
    const runtime = editorRuntime();
    assert.equal(runtime.settings.store.messageEditor, "advanced");
    const props = { channel: { id: "12345678901234567" }, type: { analyticsName: "normal" } };
    runtime.CreateMessageEditor(props).props.onClick();
    assert.equal(runtime.advanced.length, 1);
    assert.equal(runtime.modals.length, 0);
    runtime.settings.store.messageEditor = "legacy";
    runtime.CreateMessageEditor(props).props.onClick();
    assert.equal(runtime.advanced.length, 1);
    assert.equal(runtime.modals.length, 1);
    await runtime.modals[0].props.callbackSendEmbed({ title: "new" });
    assert.equal(runtime.sent[0].body.content, "draft content");
    assert.equal(runtime.sent[0].body.message_reference.message_id, "reply");
    assert.equal(runtime.sent[0].body.embeds[0].title, "new");
    assert.equal(runtime.dispatched.length, 3);
});

test("legacy edit only patches embeds and does not offer to edit another bot or Components V2", async () => {
    const runtime = editorRuntime();
    const msg = { id: "message", channel_id: "channel", author: { id: "bot" }, embeds: [{ type: "rich" }], flags: 4 };
    runtime.EditMessageEditor(msg).onClick();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(runtime.advanced.length, 1);
    runtime.settings.store.messageEditor = "legacy";
    await runtime.EditMessageEditor(msg).onClick();
    await runtime.modals[0].props.callbackSendEmbed({}, { embeds: [{ title: "after" }] });
    assert.deepEqual(Object.keys(runtime.patched[0].body), ["embeds"]);
    assert.equal(runtime.patched[0].body.embeds[0].title, "after");
    assert.equal(runtime.EditMessageEditor({ ...msg, author: { id: "other" } }), null);
    assert.equal(runtime.EditMessageEditor({ ...msg, flags: 32768 }), null);
});

test("failed legacy send keeps the draft, reply, and uploads", async () => {
    const runtime = editorRuntime();
    runtime.settings.store.messageEditor = "legacy";
    runtime.globals.RestAPI.post = async () => { throw new Error("send failed"); };
    runtime.CreateMessageEditor({ channel: { id: "12345678901234567" } }).props.onClick();
    await assert.rejects(runtime.modals[0].props.callbackSendEmbed({ title: "retry me" }), /send failed/);
    assert.equal(runtime.dispatched.length, 0);
});

test("legacy creation sends completed and pending attachments with their metadata", async () => {
    const runtime = editorRuntime();
    runtime.settings.store.messageEditor = "legacy";
    const file = { type: "image/png" };
    runtime.globals.UploadAttachmentStore.getUploads = () => [
        { status: "COMPLETED", filename: "ready.png", uploadedFilename: "ready-upload", item: { file } },
        { status: "NOT_STARTED", filename: "pending.png", spoiler: true, description: "alt text", item: { file } }
    ];
    const uploads = [];
    runtime.globals.uploadFile = async (...args) => {
        uploads.push(args);
        return { uploadedFilename: "pending-upload" };
    };
    // Reload to include the upload boundary in the VM globals.
    const { CreateMessageEditor, settings } = loadDeclarations("index.tsx", ["settings", "CreateMessageEditor"], runtime.globals);
    settings.store.messageEditor = "legacy";
    CreateMessageEditor({ channel: { id: "12345678901234567" } }).props.onClick();
    await runtime.modals[0].props.callbackSendEmbed({ image: { url: "attachment://ready.png" } });
    assert.equal(uploads.length, 1);
    assert.equal(uploads[0][1], "pending.png");
    const attachments = runtime.sent[0].body.attachments;
    assert.equal(attachments[0].uploaded_filename, "ready-upload");
    assert.equal(attachments[1].uploaded_filename, "pending-upload");
    assert.equal(attachments[1].filename, "SPOILER_pending.png");
    assert.equal(attachments[1].description, "alt text");
});

test("legacy embed serialization preserves timestamps, attachments, fields, and validates colors", () => {
    const { extractEmbedState, buildEmbedFromState } = loadDeclarations("components/EmbedEditor.tsx", ["extractEmbedState", "embedColorToHex", "buildEmbedFromState"]);
    const timestamp = "2025-01-01T00:00:00.000Z";
    const state = { ...extractEmbedState({ title: "keep", color: 0, timestamp }), fields: [{ name: "field", value: "value", inline: true }, { name: "", value: "" }], image: "attachment://image.png" };
    const embed = buildEmbedFromState(state, timestamp);
    assert.equal(embed.timestamp, timestamp);
    assert.equal(embed.color, 0);
    assert.equal(embed.fields.length, 1);
    assert.equal(embed.image.url, "attachment://image.png");
    assert.equal(buildEmbedFromState({ ...state, color: "#ffffgg", footerTimestamp: false }).color, undefined);
    assert.equal(buildEmbedFromState({ ...state, footerTimestamp: false }).timestamp, undefined);
});

test("switching embeds saves the current edits before loading the next embed", () => {
    let saved, selected, loaded;
    const original = [{ title: "before" }, { title: "second" }];
    const { handleSliderChange } = loadDeclarations("components/EmbedEditor.tsx", ["handleSliderChange"], {
        indexE: 0, richEmbeds: original, currentEmbed: { title: "edited" },
        setRichEmbeds: value => { saved = value; }, setIndexE: value => { selected = value; }, loadEmbed: value => { loaded = value; }
    });
    handleSliderChange(2);
    assert.equal(saved[0].title, "edited");
    assert.equal(original[0].title, "before");
    assert.equal(selected, 1);
    assert.equal(loaded.title, "second");
});

test("the modal stays open after an empty submission or API error, and closes after success", async () => {
    let closed = 0, submitted = 0;
    const globals = {
        submitting: false, currentEmbed: {}, richEmbeds: [], indexE: 0,
        setSubmitting() {}, showToast() {}, messageRaw: undefined,
        modalProps: { onClose: () => closed++ }, callbackSendEmbed: async () => { submitted++; throw new Error("save failed"); }
    };
    await loadDeclarations("components/EmbedEditor.tsx", ["handleSubmit"], globals).handleSubmit();
    assert.equal(submitted, 0);
    assert.equal(closed, 0);
    globals.currentEmbed = { title: "try me" };
    await loadDeclarations("components/EmbedEditor.tsx", ["handleSubmit"], globals).handleSubmit();
    assert.equal(submitted, 1);
    assert.equal(closed, 0);
    globals.callbackSendEmbed = async () => submitted++;
    await loadDeclarations("components/EmbedEditor.tsx", ["handleSubmit"], globals).handleSubmit();
    assert.equal(closed, 1);
});
