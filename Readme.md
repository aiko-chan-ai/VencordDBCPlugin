## Vencord Plugin for [DiscordBotClient](https://github.com/aiko-chan-ai/DiscordBotClient/)

**Overview:**  
This plugin enables logging in with a bot account.

This repository includes the BotClient plugin and all necessary components.

Install it in your Vencord repo under `src/userplugins/botClient/**/*`.

### Tests

From the DBC app root, run `npm run test:botclient`. From this plugin directory,
run `node tests/run.cjs`. This discovers every `tests/*.test.cjs` file without
shell globbing, and returns a nonzero exit code on failure. No new dependencies,
Discord login or network access are needed for these offline checks.

| Area | Checks |
| --- | --- |
| Login and Gateway | Invalid credentials/intents, shard selection, voice transitions, session reset, READY DM replay and presence |
| Direct messages | Channel hydration before message delivery, failures, persistence preference, one recipient, ID validation and repeated clicks |
| Forum/media | Active-thread completion, empty/unavailable guild snapshots |
| Application emojis | Empty lists, refresh/backoff, account switching, native picker indexing and section filtering |
| Message editor | Editor selection, attachments, drafts/replies after failure, legacy embed validation |
| Settings protobuf | Current native codecs, legacy records, fixed64, large payloads, concurrent updates, account switches and failed writes |
| Patch checker and errors | Vencord regex canonicalization, ambiguous anchors, missing matches, invalid JavaScript, grouped rollback and API error paths |

Filter a run with `npm run test:botclient -- --test-name-pattern="DM|voice"`
or `node tests/run.cjs --test-name-pattern="DM|voice"`.

The tests execute the plugin's TypeScript. Discord/IPC/storage boundaries are
controlled in memory; protobuf tests use the real installed protobuf runtime.
They do not replace integration checks for IndexedDB migrations, real Discord
permissions, sending messages, voice transport or the advanced editor app.

#### Checking a Discord/Vencord update

1. Run the offline tests, then typecheck/build Vencord with
   `pnpm exec tsc --noEmit --skipLibCheck`, `pnpm buildWeb --dev` and `pnpm build --dev` from the Vencord
   directory. `--skipLibCheck` avoids the current root Electron/standalone Electron
   declaration conflict; it still checks plugin source.
2. Install the new extension and restart DBC so the running plugin matches the
   source you are testing. Start it with
   `npm start -- --remote-debugging-port=9222 --remote-debugging-address=127.0.0.1`.
3. Run `npm run test:botclient:live` from the DBC root, or
   `node tests/check-discord-patches.cjs 9222` from the plugin directory.

The live command checks the **running plugin's** patches against original loaded
Discord factories, in declaration order. It reports the anchor, module IDs,
failed replacement and syntax errors without invoking the factories or sending
messages. It checks every active BotClient patch, not just the recent features.

`UNLOADED` is an incomplete check and exits nonzero: the chunk may not be loaded,
or Discord may have changed the anchor. Open the relevant view and retry. Login
chunks may be absent in an automatically logged-in session. For a full developer
run, enable ConsoleShortcuts in a development build and run
`await loadLazyChunks()` in DevTools before retrying; this downloads additional
Discord chunks. `FAIL` means an ambiguous anchor, ineffective replacement or
invalid patched code. A live pass confirms patch compatibility, not every UI
behavior or interaction with another plugin.

### Message editor

In the BotClient plugin settings, choose **Message Editor**:

- **Advanced Message Editor (Beta)** (default): edit messages, embeds, and components.
- **Embed Editor (Legacy)**: use the original Embed Builder modal, restored from `EmbedEditor.tsx.bak` and the integration before commit `97947e1`.

The existing chat bar and message buttons open the selected editor. No restart is needed when switching editors. The legacy message button appears for your own messages with rich embeds. To edit Components V2 messages, select the advanced editor in settings.

Run editor regression checks from this plugin directory with `node --test tests/embed-editor.test.cjs`.

### Application Emojis

The emoji picker includes an **Application Emojis** section for the current bot.
The native picker grid, search and autocomplete share the same emoji index;
application emojis are usable in chats and reactions without Nitro or the
external-emoji permission. Guild emoji collections are unchanged.

The cache is scoped to the logged-in bot, refreshes every five minutes and merges
concurrent requests. Empty applications have no extra section. The section icon
uses the bot's avatar, including Discord's default avatar when none is configured.

Run `node --test tests/application-emojis.test.cjs` for regression checks.
After rebuilding the extension, restart DBC to reload cached content scripts.

### Open a DM by User ID

**Create Message → New Message** accepts a User ID directly in its search field,
including when there are no friends or guilds. Click **Create Message** to use
the normal DM creation/cache path. No message is sent automatically.

Invalid/self IDs are rejected locally. API failures keep the modal and input
open for retry, and repeated clicks are blocked while a request is pending.
Selecting a search result uses the same direct DM path.
New Message allows one recipient only, whether selected with the mouse/keyboard
or entered as a User ID. Group DM creation is blocked for bot accounts.

Run `node --test tests/create-dm-by-id.test.cjs` for regression checks.

### Forum and media posts

Bot guild snapshots finish active-thread loading, including guilds with no
active threads. Forum/media previews fetch the actual starter message and its
attachments; only an Unknown Message response counts as a deleted starter.
Archived pages retain Discord's `has_more` and archive timestamp cursor.

Run `node --test tests/forum-threads.test.cjs` for the loading-state checks.
The DBC app also tests preview routes, permissions and archive pagination.

> **Instructions and Notes for Updating This Plugin to the Latest Version**

1. **Review All Patch-Related Lines**  
   Search for log lines like the following:  
   ![img](https://i.imgur.com/ysLJWa1.png)  
   Ensure that the patch code is still valid and correctly applied.

2. **Test All Plugin Functionality**  
   Verify the features listed here: [Issue #183](https://github.com/aiko-chan-ai/DiscordBotClient/issues/183)
