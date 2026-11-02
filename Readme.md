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

> **Instructions and Notes for Updating This Plugin to the Latest Version**

1. **Review All Patch-Related Lines**  
   Search for log lines like the following:  
   ![img](https://i.imgur.com/ysLJWa1.png)  
   Ensure that the patch code is still valid and correctly applied.

2. **Test All Plugin Functionality**  
   Verify the features listed here: [Issue #183](https://github.com/aiko-chan-ai/DiscordBotClient/issues/183)
