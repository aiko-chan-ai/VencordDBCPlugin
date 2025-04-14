## Vencord Plugin for Discord Bot Client

### All Changes Made So Far:

#### ~~`browser/manifest.json` & `scripts/build/buildWeb.mjs` & `src/plugins/_core/settings.tsx`~~
No need anymore since I’ve written a script to do it automatically.

#### ~~`src/webpack/patchWebpack.ts` & `src/plugins/_core/noTrack.ts`~~
The patch code is no longer needed because Vencord has changed the way it handles URLs.

#### `src/userplugins/botClient/**/*` (this repo)
- Contains botClient plugin and necessary components.

> Things to Check Before Updating/Fixing the BotClient Plugin

1. **Check if Vencord is actually running**  
    Look for a line similar to this: 

    ![img](https://i.imgur.com/qXkMCqm.png)

    If it shows up, that means Webpack is active.

2. **Review all patch-related lines**  
    Search for log lines like this:  

    ![img](https://i.imgur.com/ysLJWa1.png)

    and make sure the patch code is still valid and correctly applied.

3. **Test all plugin functionalities**  
   You should check the features according to the following list: https://github.com/aiko-chan-ai/DiscordBotClient/issues/183


> The above is a summary of the changes to help contributors identify what has been modified compared to the original Vencord repository.