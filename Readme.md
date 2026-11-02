## Vencord Plugin for [DiscordBotClient](https://github.com/aiko-chan-ai/DiscordBotClient/)

**Overview:**  
This plugin enables logging in with a bot account.

This repository includes the BotClient plugin and all necessary components.

Install it in your Vencord repo under `src/userplugins/botClient/**/*`.

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
