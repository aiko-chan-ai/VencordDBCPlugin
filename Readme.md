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

> **Instructions and Notes for Updating This Plugin to the Latest Version**

1. **Review All Patch-Related Lines**  
   Search for log lines like the following:  
   ![img](https://i.imgur.com/ysLJWa1.png)  
   Ensure that the patch code is still valid and correctly applied.

2. **Test All Plugin Functionality**  
   Verify the features listed here: [Issue #183](https://github.com/aiko-chan-ai/DiscordBotClient/issues/183)
