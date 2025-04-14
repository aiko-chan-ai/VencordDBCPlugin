/*
 * Vencord, a modification for Discord's desktop app
 * Copyright (c) 2022 Vendicated and contributors
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 3 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <https://www.gnu.org/licenses/>.
*/

/*
! Todo: These are the things I need to fix every time I update Vencord and Discord.
Ref: https://github.com/aiko-chan-ai/DiscordBotClient/issues/183
*/

import type { Group, List, MemberPatch, Ops } from "./typing/index.d.ts";
import { addChatBarButton, ChatBarButton, removeChatBarButton } from "@api/ChatButtons";
import {
    ApplicationCommandInputType,
    ApplicationCommandOptionType,
    findOption,
    sendBotMessage,
} from "@api/Commands";
import { addMessagePopoverButton, removeMessagePopoverButton } from "@api/MessagePopover";
import { definePluginSettings } from "@api/Settings";
import {
    getCurrentChannel,
    getCurrentGuild,
} from "@utils/discord";
import { Logger } from "@utils/Logger";
import { openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { findByProps, findByPropsLazy, findStoreLazy, findByCodeLazy, findStore } from "@webpack";
import {
    Alerts,
    ChannelStore,
    Constants,
    FluxDispatcher,
    Forms,
    GuildMemberStore,
    GuildStore,
    MessageActions,
    NavigationRouter,
    PermissionsBits,
    PresenceStore,
    React,
    RestAPI,
    showToast,
    Toasts,
    UserStore,
    DraftType,
} from "@webpack/common";
import { getAttachments, getDraft } from "./utils/messagePreviewPlugin";

import { Channel, Guild, Role } from "discord-types/general";

// Components
import EmbedEditorModal from "./components/EmbedEditor";
import AuthBoxTokenLogin from "./components/AuthBoxTokenLogin";
import AuthBoxMultiTokenLogin from "./components/AuthBoxMultiTokenLogin";

import { iconSvg } from "./icon.svg";
import { SnowflakeUtil } from "./utils/SnowflakeUtil";
import { hasEmbedPerms } from "./utils/fakeNitroPlugin";
import { PendingReplyStore } from "./utils/voiceMessagePlugin";

const GetToken = findByPropsLazy("getToken", "setToken");
const LoginToken = findByPropsLazy("loginToken", "login");
const murmurhash = findByPropsLazy("v3", "v2");

const BotClientLogger = new Logger("BotClient", "#ff88f3");

// React Module
const inputModule = findByPropsLazy("inputWrapper", "inputDefault", "inputMini");

// PermissionStore.computePermissions is not the same function and doesn't work here
const computePermissions: (options: {
    user?: { id: string; } | string | null;
    context?: Guild | Channel | null;
    overwrites?: Channel["permissionOverwrites"] | null;
    checkElevated?: boolean /* = true */;
    excludeGuildPermissions?: boolean /* = false */;
}) => bigint = findByCodeLazy(".getCurrentUser()", ".computeLurkerPermissionsAllowList()");

export default definePlugin({
    name: "BotClient",
    description:
        "Patch the current version of Discord to allow the use of bot accounts",
    authors: [
        {
            name: "Elysia",
            id: 721746046543331449n,
        },
    ],
    enabledByDefault: true,
    dependencies: ["CommandsAPI", "MessagePopoverAPI", "ChatInputButtonAPI", "UserSettingsAPI"],
    settings: definePluginSettings({
        showMemberList: {
            description: "Allow fetching member list sidebar",
            type: OptionType.BOOLEAN,
            default: true,
            restartNeeded: false,
        },
        memberListThrottleDelay: {
            description:
                "The interval at which the member list sidebar is updated (seconds)",
            type: OptionType.NUMBER,
            default: 2,
            restartNeeded: false,
        },
        embedChatButton: {
            description:
                "Add a button to show the Embed Editor modal in the chat bar",
            type: OptionType.BOOLEAN,
            default: true,
            restartNeeded: true,
        },
        embedEditMessageButton: {
            description:
                "Add a button to show Embed Editor modal in messages",
            type: OptionType.BOOLEAN,
            default: true,
            restartNeeded: true,
        },
        clearDraftAfterSendingEmbed: {
            description: "Should draft messages be deleted after sending an embed?",
            type: OptionType.BOOLEAN,
            default: true,
            restartNeeded: false,
        },
        saveDirectMessage: {
            // $self.settings.store.saveDirectMessage
            // Vencord.Plugins.plugins.BotClient.settings.store.saveDirectMessage = false
            description: "Whether or not to save private channels to storage?",
            type: OptionType.BOOLEAN,
            default: true,
            restartNeeded: false,
            onChange: (value: boolean) => {
                if (!value) window.BotClientNative.clearDMsCache(UserStore.getCurrentUser().id);
            }
        }
    }),
    required: true,
    patches: [
        // AuthBox (Token)
        {
            // ???
            find: "}get canShowChooseAccount(){return this.props.hasLoggedInAccounts}loginOrSSO(",
            replacement: [
                {
                    match: /(?<=renderDefaultForm\(\w+\)\{.+\.marginTop20,)(children:\[)/,
                    replace: function (str, ...args) {
                        return "children:[$self.renderTokenLogin()],children_:[";
                    },
                },
                {
                    // QR Modules (QRLogin disable)
                    match: "renderDefaultForm(!0)", // !0 = true => Enabled
                    replace: "renderDefaultForm(!1)",
                }
            ]
        },
        // AuthBox2 (Switch Account)
        {
            // todo
            find: `componentWillUnmount(){window.removeEventListener("keydown",this.handleTabOrEnter)}hasError(`,
            replacement: [
                {
                    match: /(?<=renderDefaultForm\(\)\{.+\.loginForm,)(children:\[)/,
                    replace: function (str, ...args) {
                        return "children:[$self.renderTokenLoginMultiAccount()],children_:[";
                    },
                },
                {
                    // Button "Continue"
                    match: /Colors\.BRAND,onClick:/,
                    replace: function (str, ...args) {
                        return "Colors.BRAND,onClick:$self.validateTokenAndLogin,onClick_:";
                    },
                }
            ]
        },
        // Don't delete sessionStorage
        {
            find: "delete window.sessionStorage",
            replacement: [
                {
                    match: /delete window\.sessionStorage/,
                    replace: "",
                },
            ],
        },
        {
            // Bot account caused the error
            find: "hasFetchedCredentials(){",
            replacement: [
                {
                    match: /hasFetchedCredentials\(\){/,
                    replace: "$&return true;",
                },
                {
                    match: /getCredentials\(\){return/,
                    replace: "$& [];",
                },
            ],
        },
        {
            // Remove/Patch unused bot ws opcode
            find: "voiceServerPing(){",
            replacement: [
                {
                    match: /updateGuildSubscriptions\((\w+)\){/,
                    replace: function (str, ...args) {
                        const data = args[0];
                        return (
                            str +
                            `const threadId = Object.values(${data})?.[0]?.thread_member_lists?.[0];
if (threadId) {
    Vencord.Webpack.Common.RestAPI
		.get({
			url: '/channels/' + threadId + '/thread-members?with_member=true',
		})
	.then((d) => d.body)
    .then(r => {
        if (!r.length) return;
        let i = {
            threadId,
            guildId: Object.keys(${data})?.[0],
            members: r.map(_ => ({
                ..._,
                presence: null,
            })),
            type: "THREAD_MEMBER_LIST_UPDATE",
        };
        Vencord.Webpack.Common.FluxDispatcher.dispatch(i);
    });
}
return;
                        `
                        );
                    },
                },
                {
                    match: /callConnect\(((\w+,?)+)?\){/,
                    replace: "$& return;",
                },
                {
                    match: /streamCreate\(((\w+,?)+)?\){/,
                    replace: "$& return;",
                },
                {
                    match: /streamWatch\(((\w+,?)+)?\){/,
                    replace: "$& return;",
                },
                {
                    match: /streamPing\(((\w+,?)+)?\){/,
                    replace: "$& return;",
                },
                {
                    match: /streamDelete\(((\w+,?)+)?\){/,
                    replace: "$& return;",
                },
                {
                    match: /streamSetPaused\(((\w+,?)+)?\){/,
                    replace: "$& return;",
                },
                {
                    match: /remoteCommand\(((\w+,?)+)?\){/,
                    replace: "$& return;",
                },
                {
                    // Leave / Switch VoiceChannel
                    match: /voiceStateUpdate\((\w+)\){/,
                    replace: (str, ...args) => {
                        const data = args[0];
                        return (
                            str +
                            `
if (${data}.guildId) {
  if (${data}.guildId !== window.sessionStorage.getItem('lasestGuildIdVoiceConnect')) {
    // Disconnect
    this.send(4, {
        guild_id: window.sessionStorage.getItem('lasestGuildIdVoiceConnect'),
        channel_id: null,
        self_mute: ${data}.selfMute,
        self_deaf: ${data}.selfDeaf,
    });
    // Switch Guild
    window.sessionStorage.setItem('lasestGuildIdVoiceConnect', ${data}.guildId);
  }
} else {
  ${data}.guildId = (window.sessionStorage.getItem('lasestGuildIdVoiceConnect') == '0') ? null : window.sessionStorage.getItem('lasestGuildIdVoiceConnect');
  window.sessionStorage.setItem('lasestGuildIdVoiceConnect', '0');
}`
                        );
                    },
                },
            ],
        },
        {
            // Patch opcode 2 (identify) and events
            find: "window.GLOBAL_ENV.GATEWAY_ENDPOINT;",
            replacement: [
                {
                    // Patch Close code
                    match: /(_handleClose\()(\w+)(,)(\w+)(,)(\w+)(\){)/,
                    replace: function (str, ...args) {
                        const closeCode = args[3];
                        return (
                            str +
                            `
if (${closeCode} === 4013) {
    Vencord.Webpack.Common.Toasts.show({
		message: "Login Failure: Invalid intent(s), Logout...",
        id: Vencord.Webpack.Common.Toasts.genId(),
        type: Vencord.Webpack.Common.Toasts.Type.FAILURE,
	});
    ${closeCode} = 4004;
} else if (${closeCode} === 4014) {
    Vencord.Webpack.Common.Toasts.show({
		message: "Login Failure: Disallowed intent(s), Logout...",
        id: Vencord.Webpack.Common.Toasts.genId(),
        type: Vencord.Webpack.Common.Toasts.Type.FAILURE,
	});
    ${closeCode} = 4004;
}`
                        );
                    },
                },
                // Event
                {
                    match: /(_handleDispatch\()(\w+)(,)(\w+)(,)(\w+)(\){)/,
                    replace: function (str, ...args) {
                        const data = args[1];
                        const eventName = args[3];
                        const N = args[5];
                        return (
                            str +
                            `
if ("MESSAGE_CREATE" === ${eventName} && !${data}.guild_id && !Vencord.Webpack.Common.ChannelStore.getChannel(${data}.channel_id)) {
    return Vencord.Webpack.Common.RestAPI.get({
        url: '/channels/' + ${data}.channel_id,
    }).then((d) => d.body).then(channel => {
        this.dispatcher.receiveDispatch(channel, "CHANNEL_CREATE", ${N});
        // https://discord.com/developers/docs/resources/channel#channel-object-channel-types
        // 1 = DM
        if ($self.settings.store.saveDirectMessage && channel.type === 1) {
            BotClientNative.handleOpenPrivateChannel(Vencord.Webpack.Common.UserStore.getCurrentUser().id, channel.recipients[0].id, channel.id);
            $self.console.log("[Client > Electron] Add Private channel (From MESSAGE_CREATE event)");
        }
    }).catch((err) => {
        $self.console.log("[Client > Electron] Get from /channels/" + ${data}.channel_id + " error", err);
    }).finally((i) => {
        return this.dispatcher.receiveDispatch(${data}, ${eventName}, ${N});
    });
}
if ("READY_SUPPLEMENTAL" === ${eventName}) {
    // Patch Status
    const status = Vencord.Api.UserSettings.getUserSetting("status", "status")?.getSetting() || 'online';
    const customStatus = Vencord.Api.UserSettings.getUserSetting("status", "customStatus")?.getSetting();
    const activities = [];
    if (customStatus) {
        activities.push({
            "name": "Custom Status",
            "type": 4,
            "state": customStatus.text,
            // Bot cannot use emoji;
        });
    }
    // WS Send;
    Vencord.Webpack.findByProps('getSocket').getSocket().send(3, {
        status,
        since: null,
        activities,
        afk: false
    });
}
if ("READY" === ${eventName}) {
$self.console.log("[Client]: Ready event", ${data});
// Experiments
const experiments = Object.entries(Vencord.Webpack.findByProps('getGuildExperimentBucket').getRegisteredExperiments())
    .map(([id, data]) => ({ id, ...data }))
    .sort((a, b) => {
        const titleA = a.title.toLowerCase();
        const titleB = b.title.toLowerCase();
        return titleA < titleB ? -1 : titleA > titleB ? 1 : 0;
    })
    .filter(exp => exp.type === "user");
const dms = BotClientNative.getPrivateChannelLogin(${data}.user.id, $self.settings.store.saveDirectMessage);
${data}.users = [
	...(${data}.users || []),
	...dms.map(c => c.recipients[0]),
];
${data}.user_settings_proto = BotClientNative.getSettingProto1(${data}.user.id);
${data}.user_guild_settings = {
	entries: [],
	version: 0,
	partial: !1,
};
(${data}.user.premium = true),
(${data}.user.premium_type = 2),
(${data}.user.mfa_enabled = 1),
(${data}.user.phone = '+1234567890'),
(${data}.user.verified = true),
(${data}.user.nsfw_allowed = true),
(${data}.user.email = 'DiscordBotClient@aiko.com');
${data}.tutorial = null;
${data}.sessions = [];
${data}.relationships = [];
${data}.read_state = {
	version: 1176,
	partial: false,
	entries: [],
};
${data}.private_channels = dms;
${data}.guild_join_requests = [];
${data}.guild_experiments = BotClientNative.getGuildExperiments();
${data}.friend_suggestion_count = 0;
${data}.experiments = BotClientNative.getUserExperiments(experiments, ${data}.user.id);
${data}.connected_accounts = [];
${data}.auth_session_id_hash = "VjFaa2MyTnRTalZOVjNCb1VqQmFNVlJHWkVkalFUMDk=";
${data}.analytics_token = null;
${data}.auth = {
	authenticator_types: [2, 3],
}
${data}.consents = {
	personalization: {
		consented: false,
	},
};
window.getApplicationEmojis();
}
`
                        );
                    },
                },
                // _doIdentify
                {
                    match: /(this\.token=)(\w+)(,)(\w+)(\.verbose\("\[IDENTIFY\]"\);)/,
                    replace: function (str, ...args) {
                        const varToken = args[1];
                        return (
                            str +
                            `
${varToken} = ${varToken}.replace(/bot/gi,"").trim();
const botInfo = await BotClientNative.getBotInfo(${varToken});
this.token = ${varToken};
$self.console.log("[Electron > Client] Discord Bot metadata", botInfo);
if (!botInfo.success) {
    Vencord.Webpack.Common.Toasts.show({
		message: "Login Failure: " + botInfo.message,
        id: Vencord.Webpack.Common.Toasts.genId(),
        type: Vencord.Webpack.Common.Toasts.Type.FAILURE,
	});
	return this._handleClose(!0, 4004, botInfo.message);
}
let intents = botInfo.intents;
window.sessionStorage.setItem('allShards', botInfo.allShards);
// session storage init
if (window.sessionStorage.getItem('currentShard') == null || parseInt(window.sessionStorage.getItem('currentShard')) + 1 > botInfo.allShards) {
    window.sessionStorage.setItem('currentShard', 0);
}
window.sessionStorage.setItem('lasestGuildIdVoiceConnect', '0');
// init custom function
window.getApplicationEmojis = function () {
	return new Promise((resolve) => {
		Vencord.Webpack.Common.RestAPI.get({
			url: '/users/@me/emojis',
		})
			.then((d) => {
				window.applicationEmojis = d.body;
				resolve(d.body);
			})
			.catch(() => resolve([]));
	});
};
$self.console.log("[Client > Electron] Bot Intents: ", intents, "Shard ID: ", parseInt(window.sessionStorage.getItem('currentShard')), "(All: ", botInfo.allShards, ")");
Vencord.Webpack.Common.Toasts.show({
	message: 'Bot Intents: ' + intents,
    id: Vencord.Webpack.Common.Toasts.genId(),
    type: Vencord.Webpack.Common.Toasts.Type.SUCCESS,
});
Vencord.Webpack.Common.Toasts.show({
	message: \`Shard ID: \${parseInt(window.sessionStorage.getItem('currentShard'))} (All: \${botInfo.allShards})\`,
    id: Vencord.Webpack.Common.Toasts.genId(),
    type: Vencord.Webpack.Common.Toasts.Type.SUCCESS,
});
                        `
                        );
                    },
                },
                // Sharding
                {
                    match: /(token:\w+)(,capabilities:)/,
                    replace: function (str, ...args) {
                        return `${args[0]},intents,shard: [parseInt(window.sessionStorage.getItem('currentShard')) || 0, parseInt(window.sessionStorage.getItem('allShards'))]${args[1]}`;
                    },
                },
            ],
        },
        {
            // Bot account caused the error
            find: "users_size:JSON.stringify",
            replacement: [
                {
                    match: /users_size:JSON.stringify\(\w+\)\.length/,
                    replace: "users_size:0",
                },
                {
                    match: /read_states_size:JSON.stringify\(\w+\)\.length/,
                    replace: "read_states_size:0",
                },
            ],
        },
        {
            // Bot account caused the error
            find: "notificationSettings:{",
            replacement: [
                {
                    match: /(notificationSettings:{flags:)([\w.]+)},/,
                    replace: function (str, ...args) {
                        return args[0] + "0},";
                    },
                },
                {
                    // If user account is already logged in, proceed to log out
                    // ? Idk why, but it patched the wrong module
                    match: /if\((\w+)\.user\.bot\)return/,
                    replace: (str, ...args) => {
                        return `if(!${args[0]}.user.bot)return`;
                    },
                },
            ],
        },
        {
            // Patch getToken & setToken function
            find: "this.encryptAndStoreTokens()",
            replacement: [
                {
                    match: /(getToken\()(\w)(\){)(.+)(},setToken)/,
                    replace: function (str, ...args) {
                        const varToken = args[1];
                        const arrayToken = args[3].match(/\w+\[\w+\]:\w+/)?.[0];
                        const body = `
this.init();
let t_ = ${varToken} ? ${arrayToken}
return t_ ? \`Bot \${t.replace(/bot/gi,"").trim()}\` : null`;
                        return `${args[0]}${args[1]}${args[2]}${body}${args[4]}`;
                    },
                },
                {
                    match: /,setToken\((\w+),(\w+)\){/,
                    replace: function (str, ...args) {
                        const token = args[0];
                        const id = args[1];
                        return (
                            str +
                            `if(${token}){${token}=${token}.replace(/bot/gi,"").trim()}`
                        );
                    },
                },
            ],
        },
        {
            find: "STARTED_ONBOARDING=8",
            replacement: [
                {
                    match: /STARTED_ONBOARDING=8/,
                    replace: "STARTED_ONBOARDING=4294967296",
                },
            ],
        },
        // Patch some unusable bot modules/methods
        {
            find: "resolveInvite:",
            replacement: [
                {
                    match: /,acceptInvite\((\w+)\){/,
                    replace: (str, ...args) => {
                        return `${str}
if (parseInt(window.sessionStorage.getItem('allShards')) > 1) {
    return new Promise(async (resolve, reject) => {
        const invite = await this.resolveInvite(${args[0]}.inviteKey);
        const guildId = invite.invite.guild_id;
        const channelId = invite.invite.channel.id;
        if (!guildId) {
        Vencord.Webpack.Common.Toasts.show({
        	message: 'Discord Bot Client cannot join guilds',
        	id: Vencord.Webpack.Common.Toasts.genId(),
        	type: Vencord.Webpack.Common.Toasts.Type.FAILURE,
        });
            reject("Discord Bot Client cannot join guilds");
        } else {
            const res = await Vencord.Webpack.Common.RestAPI.get({url:"/guilds/"+guildId}).catch(e => e);
            if (res.ok) {
                const shardId = Number((BigInt(guildId) >> 22n) % BigInt(parseInt(window.sessionStorage.getItem('allShards'))));
                window.sessionStorage.setItem('currentShard', shardId);
                await Vencord.Webpack.findByProps("loginToken").loginToken(Vencord.Webpack.findByProps("getToken").getToken());
                resolve(Vencord.Webpack.Common.NavigationRouter.transitionToGuild(guildId, channelId));
            } else {
        Vencord.Webpack.Common.Toasts.show({
        	message: 'Discord Bot Client cannot join guilds',
        	id: Vencord.Webpack.Common.Toasts.genId(),
        	type: Vencord.Webpack.Common.Toasts.Type.FAILURE,
        });
                reject("Discord Bot Client cannot join guilds");
            }
        }
    });
} else {
        Vencord.Webpack.Common.Toasts.show({
        	message: 'Discord Bot Client cannot join guilds',
        	id: Vencord.Webpack.Common.Toasts.genId(),
        	type: Vencord.Webpack.Common.Toasts.Type.FAILURE,
        });
    return Promise.reject("Discord Bot Client cannot join guilds");
}
`;
                    },
                },
            ],
        },
        {
            find: "loadTemplatesForGuild:",
            replacement: [
                {
                    match: /loadTemplatesForGuild:/,
                    replace:
                        '$& () => Promise.reject("Discord Bot Client cannot use Guild Templates"), loadTemplatesForGuild_:',
                },
            ],
        },
        // Fix Copy URL
        {
            // document.execCommand("copy")
            find: "[Utils] ClipboardUtils.copy(): assert failed: document.body",
            replacement: [
                {
                    match: /function (\w+)\((\w+)\)({)(.*?)execCommand\("copy"\)/,
                    replace: function (match, functionName, argument, bracket, codeMatch) {
                        return match.replace(`function ${functionName}(${argument}){`, `function ${functionName}(${argument}){
                            if (URL.canParse(${argument})) {
                                ${argument} = ${argument}.replace(/https:\\/\\/localhost:\\d+/, "https://discord.com");
                                ${argument} = ${argument}.replace(/\\/bot/, '');
                            }
                        `);
                    },
                },
            ],
        },
        // Max attachment size 10MB = 10485760
        // https://discord.com/developers/docs/change-log#default-file-upload-limit-change
        {
            find: 'PREMIUM_TENURE_1_MONTH="premium_tenure_1_month_v2"',
            replacement: [
                {
                    match: /(\d):{fileSize:\w+}/g,
                    replace:
                        "$1:{fileSize:10485760}",
                },
            ],
        },
        // Deny stickers to be sent everywhere - From FakeNitro plugin
        {
            find: "canUseCustomStickersEverywhere:",
            replacement: {
                match: /(?<=canUseCustomStickersEverywhere:)\i/,
                replace: "()=>false"
            },
        },
        // Try handle Private Channel
        {
            find: "async openPrivateChannel(",
            replacement: [
                {
                    match: /(async openPrivateChannel)(\(\w+\){)/,
                    replace: function (strOriginal, first, second) {
                        return `async openPrivateChannel(e){
                        // Check Bot account
                        if (Vencord.Webpack.Common.UserStore.getUser(arguments[0])?.bot) {
                            Vencord.Webpack.Common.Toasts.show({
        	                    message: "Cannot send messages to this user (User.bot = True)",
        	                    id: Vencord.Webpack.Common.Toasts.genId(),
        	                    type: Vencord.Webpack.Common.Toasts.Type.FAILURE,
                            });
                            return;
                        }
                        const result = await this.openPrivateChannel_.apply(this, arguments);
                        if ($self.settings.store.saveDirectMessage) BotClientNative.handleOpenPrivateChannel(Vencord.Webpack.Common.UserStore.getCurrentUser().id, arguments[0], result);
                        },${first}_${second}`;
                    }
                },
                {
                    match: /closePrivateChannel\(\w+\){/,
                    replace: function (str) {
                        return `${str}if ($self.settings.store.saveDirectMessage) BotClientNative.handleClosePrivateChannel(Vencord.Webpack.Common.UserStore.getCurrentUser().id, arguments[0]);`;
                    }
                }
            ]
        },
        // Fix unread message
        {
            find: "}getOldestUnreadMessageId(",
            replacement: [
                {
                    match: /}getOldestUnreadMessageId\(\w+\){/,
                    replace: function (strOriginal) {
                        return `${strOriginal}return null;`;
                    }
                },
                {
                    match: /}getOldestUnreadTimestamp\(\w+\){/,
                    replace: function (strOriginal) {
                        return `${strOriginal}return 0;`;
                    }
                },
                {
                    match: /}hasUnread\(\w+\){/,
                    replace: function (strOriginal) {
                        return `${strOriginal}return false;`;
                    }
                },
                {
                    match: /}getUnreadCount\(\w+\){/,
                    replace: function (strOriginal) {
                        return `${strOriginal}return 0;`;
                    }
                },
            ]
        },
        // Emoji
        {
            find: "}searchWithoutFetchingLatest(",
            replacement: [
                {
                    match: /;return{unlocked:this\.getSearchResultsOrder\((\w+)\.unlocked/,
                    replace: ';window.getApplicationEmojis();$1.unlocked = [...$1.unlocked, ...(window.applicationEmojis || []).filter(o => o.name?.toLowerCase().includes(arguments[0].query?.toLowerCase()))];return{unlocked:this.getSearchResultsOrder($1.unlocked'
                },
            ],
        },
        /*
        {
            find: "https://cdn.discordapp.com/assets/quests/",
            replacement: [
                {
                    match: '"https://cdn.discordapp.com/assets/quests/"',
                    replace: 'GLOBAL_ENV.MIGRATION_DESTINATION_ORIGIN + "/cdn/assets/quests/"',
                },
                {
                    match: '"https://cdn.discordapp.com/quests/"',
                    replace: 'GLOBAL_ENV.MIGRATION_DESTINATION_ORIGIN + "/cdn/quests/"',
                },
            ]
        },
        */
        // Vesktop
        // src > renderer > patches > windowsTitleBar.tsx
        {
            find: ".wordmarkWindows",
            replacement: [
                {
                    // TODO: Fix eslint rule
                    // eslint-disable-next-line no-useless-escape
                    match: /case \i\.\i\.WINDOWS:/,
                    replace: 'case "WEB":'
                }
            ]
        },
        // Visual Refresh
        {
            find: '"data-windows":',
            replacement: [
                {
                    // TODO: Fix eslint rule
                    // eslint-disable-next-line no-useless-escape
                    match: /\i===\i\.PlatformTypes\.WINDOWS/g,
                    replace: "true"
                },
                {
                    // TODO: Fix eslint rule
                    // eslint-disable-next-line no-useless-escape
                    match: /\i===\i\.PlatformTypes\.WEB/g,
                    replace: "false"
                }
            ]
        },
        // src > renderer > patches > windowMethods.tsx
        {
            find: ",setSystemTrayApplications",
            replacement: [
                {
                    // eslint-disable-next-line no-useless-escape
                    match: /\i\.window\.(close|minimize|maximize)/g,
                    replace: `BotClientNative.$1`
                },
                {
                    // TODO: Fix eslint rule
                    // eslint-disable-next-line no-useless-escape
                    match: /(focus(\(\i\)){).{0,150}?\.focus\(\i,\i\)/,
                    replace: "$1BotClientNative.focus$2"
                }
            ]
        }
    ],
    commands: [
        {
            name: "ping",
            description: "Ping pong!",
            inputType: ApplicationCommandInputType.BOT,
            execute: (opts, ctx) => {
                sendBotMessage(ctx.channel.id, { content: "Pong!" });
            },
        },
        {
            name: "purge",
            description: "Delete messages from the channel",
            inputType: ApplicationCommandInputType.BOT,
            options: [
                {
                    name: "amount",
                    description: "Input the amount of messages to delete",
                    required: true,
                    type: ApplicationCommandOptionType.INTEGER,
                },
            ],
            execute: async (opts, ctx) => {
                const amount = findOption<number>(opts, "amount", 2);
                if (amount < 2 || amount > 100) {
                    sendBotMessage(ctx.channel.id, {
                        content: `🚫 Must be greater than or equal to **2** and less than or equal to **100**.\n**${amount}** is an invalid number`,
                    });
                } else {
                    const oldId = SnowflakeUtil.generate(
                        Date.now() - 1209600000
                    );
                    const { body } = await RestAPI.get({
                        url: Constants.Endpoints.MESSAGES(ctx.channel.id) + `?limit=${amount}`
                    });
                    const messages = body
                        .filter(m => BigInt(m.id) > BigInt(oldId))
                        .map(m => m.id);
                    try {
                        await RestAPI.post({
                            url: `${Constants.Endpoints.MESSAGES(ctx.channel.id)}/bulk-delete`,
                            body: {
                                messages,
                            },
                        });
                        sendBotMessage(ctx.channel.id, {
                            content: `Deleted ${messages.length} messages`,
                        });
                    } catch {
                        sendBotMessage(ctx.channel.id, {
                            content: "Failed to delete messages",
                        });
                    }
                }
            },
        },
        {
            name: "switch",
            description: "Commands related to switch",
            inputType: ApplicationCommandInputType.BOT,
            options: [
                {
                    name: "shard",
                    description: "Login with another shard ID",
                    type: ApplicationCommandOptionType.SUB_COMMAND,
                    options: [
                        {
                            name: "id",
                            description: "Shard ID",
                            required: true,
                            type: ApplicationCommandOptionType.INTEGER,
                        },
                    ],
                },
                {
                    name: "guild",
                    description: "Switch to a guild in another shard using its ID.",
                    type: ApplicationCommandOptionType.SUB_COMMAND,
                    options: [
                        {
                            name: "id",
                            description: "Guild ID",
                            required: true,
                            type: ApplicationCommandOptionType.STRING,
                        }
                    ],
                },
            ],
            execute: async (opts, ctx) => {
                BotClientLogger.log(opts, ctx);
                const subCommand = opts[0];
                switch (subCommand.name) {
                    case "shard": {
                        const id = findOption<number>(subCommand.options, "id", 0);
                        const allShards = parseInt(window.sessionStorage.getItem('allShards') as string);
                        if (id < 0 || id + 1 > allShards) {
                            sendBotMessage(ctx.channel.id, {
                                content:
                                    `### Invalid shardId
🚫 Must be greater than or equal to **0** and less than or equal to **${allShards - 1}**.
**${id}** is an invalid number`,
                            });
                        } else {
                            window.sessionStorage.setItem('currentShard', id as any);
                            LoginToken.loginToken(GetToken.getToken());
                        }
                        break;
                    }
                    case "guild": {
                        const guild = findOption<string>(subCommand.options, "id", "");
                        const allShards = parseInt(window.sessionStorage.getItem('allShards') as string);
                        if (!/^\d{17,19}$/.test(guild)) {
                            return sendBotMessage(ctx.channel.id, {
                                content: "🚫 Invalid guild ID",
                            });
                        }
                        if (allShards === 1) {
                            return sendBotMessage(ctx.channel.id, {
                                content: "🚫 Cannot switch guild in single shard",
                            });
                        }
                        const shardId = Number((BigInt(guild) >> 22n) % BigInt(allShards));
                        window.sessionStorage.setItem('currentShard', shardId as any);
                        await LoginToken.loginToken(GetToken.getToken());
                        NavigationRouter.transitionToGuild(guild);
                        break;
                    }
                }
            },
        }
    ],
    start() {
        // Patch Relationships modules
        Object.keys(findByProps("fetchRelationships")).forEach(
            a =>
            (findByProps("fetchRelationships")[a] = function () {
                showToast("Discord Bot Client cannot use Relationships Module", Toasts.Type.FAILURE);
                return Promise.reject(
                    "Discord Bot Client cannot use Relationships Module"
                );
            })
        );

        // Patch getCurrentUser
        let UserStorePatch = findStore('UserStore');
        if (!UserStorePatch.getCurrentUser_) {
            UserStorePatch.getCurrentUser_ = UserStorePatch.getCurrentUser;
            UserStorePatch.getCurrentUser = function () {
                let user = UserStorePatch.getCurrentUser_();
                user.purchasedFlags = 3;
                user.premiumType = 2;
                user.premium = true;
                user.premiumUsageFlags = 4;
                user.mfaEnabled = true;
                user.phone = "+1234567890";
                user.verified = true;
                user.nsfwAllowed = true;
                user.email = 'DiscordBotClient@aiko.com';
                return user;
            };
        }

        if (this.settings.store.embedChatButton) {
            const plugin = this;
            addChatBarButton("EmbedButton", (prop) => {
                const handle = () => {
                    const channelId = prop.channel.id;
                    if (channelId.length < 17) {
                        return Toasts.show({
                            id: Toasts.genId(),
                            message: `Cannot send embed in this channel (analyticsName: ${prop.type.analyticsName})`,
                            type: Toasts.Type.FAILURE,
                        });
                    }
                    if (!hasEmbedPerms(channelId)) {
                        return Alerts.show({
                            title: "Hold on!",
                            body: <div>
                                <Forms.FormText>
                                    You are trying to send a embed, however you do not have permissions to embed links in the
                                    current channel.
                                </Forms.FormText>
                            </div>,
                        });
                    }
                    return openModal(props => <EmbedEditorModal modalProps={props} callbackSendEmbed={async function (data, msg) {

                        // waiting for attachments
                        const attachments = await getAttachments(channelId);
                        const reply = PendingReplyStore.getPendingReply(channelId);
                        const content = getDraft(channelId) || undefined;
                        if (plugin.settings.store.clearDraftAfterSendingEmbed) {
                            // Clear reply
                            if (reply) FluxDispatcher.dispatch({ type: "DELETE_PENDING_REPLY", channelId });
                            // Clear Draft message
                            if (content) FluxDispatcher.dispatch({
                                type: "DRAFT_CLEAR",
                                channelId,
                                draftType: DraftType.ChannelMessage,
                            });
                            // Clear attachments (not delete)
                            if (attachments.length) FluxDispatcher.dispatch({
                                type: "UPLOAD_ATTACHMENT_CLEAR_ALL_FILES",
                                channelId,
                                draftType: DraftType.ChannelMessage,
                            });
                        }
                        if (attachments.length > 0) {
                            showToast("Uploading attachments... Please be patient", Toasts.Type.MESSAGE);
                            await Promise.all(attachments.map(a => {
                                if (a.status === 'COMPLETED') {
                                    return Promise.resolve(true);
                                } else {
                                    return new Promise(r => {
                                        const callback = () => {
                                            r(true);
                                            a.removeListener("error", callback);
                                            a.removeListener("complete", callback);
                                        };
                                        a.once("error", callback);
                                        a.once("complete", callback);
                                    });
                                }
                            }));
                        }
                        // Clear stickers :??? 404 not found ;-;
                        RestAPI.post({
                            url: Constants.Endpoints.MESSAGES(channelId),
                            body: {
                                embeds: [
                                    data,
                                ],
                                content,
                                attachments: attachments.map((a, index) => {
                                    return {
                                        id: index,
                                        filename: a.filename,
                                        uploaded_filename: a.uploadedFilename,
                                    };
                                }),
                                message_reference: reply ? MessageActions.getSendMessageOptionsForReply(reply)?.messageReference : null,
                            },
                        })
                            .then(() => {
                                return showToast("Embed has been sent successfully", Toasts.Type.SUCCESS);
                            })
                            .catch(e => {
                                return sendBotMessage(channelId, {
                                    content: `\`❌\` An error occurred during sending message\nDiscord API Error [${e.body.code}]: ${e.body.message}`,
                                });
                            });
                    }} isCreate={true} />);
                };
                return (
                    <ChatBarButton onClick={handle} tooltip="Embed Maker">
                        {iconSvg()}
                    </ChatBarButton>
                );
            });
        } else {
            removeChatBarButton("EmbedButton");
        }

        if (this.settings.store.embedEditMessageButton) {
            addMessagePopoverButton("EmbedEditor", msg => {
                const handler = async () => {
                    showToast("Fetching message...", Toasts.Type.MESSAGE);
                    // Fetch raw msg from discord
                    const msgRaw = await RestAPI.get({
                        url: `/channels/${msg.channel_id}/messages/${msg.id}`,
                    });
                    openModal(props => <EmbedEditorModal modalProps={props} callbackSendEmbed={function (data, msgData) {
                        RestAPI.patch({
                            url: `/channels/${msg.channel_id}/messages/${msg.id}`,
                            body: msgData,
                        })
                            .then(() => {
                                return sendBotMessage(msg.channel_id, {
                                    content: "Embed edited!",
                                });
                            })
                            .catch(e => {
                                return sendBotMessage(msg.channel_id, {
                                    content: "Error editing embed.\n" + e.message,
                                });
                            });
                    }} messageRaw={msgRaw.body} isCreate={false} />);
                };
                if (msg.author.id === UserStore.getCurrentUser().id && msg.embeds.filter(e => e.type === "rich").length > 0) {
                    return {
                        label: "Embed Editor",
                        icon: iconSvg,
                        message: msg,
                        channel: ChannelStore.getChannel(msg.channel_id),
                        onClick: handler,
                        onContextMenu: handler,
                    };
                } else {
                    return null;
                }
            });
        } else {
            removeMessagePopoverButton("EmbedEditor");
        }


        const funcUpdateGuildMembersList = this.throttle(this.updateGuildMembersList.bind(this), this.settings.store.memberListThrottleDelay * 1000);

        FluxDispatcher.subscribe("GUILD_MEMBER_UPDATE", (data) => {
            // BotClientLogger.debug("GUILD_MEMBER_UPDATE", data);
            const guildId = getCurrentChannel()?.guild_id;
            if (data.guildId === guildId) {
                funcUpdateGuildMembersList("GuildMemberUpdate", data);
            }
        });

        FluxDispatcher.subscribe("GUILD_MEMBER_ADD", (data) => {
            // BotClientLogger.debug("GUILD_MEMBER_ADD", data);
            const guildId = getCurrentChannel()?.guild_id;
            if (data.guildId === guildId) {
                funcUpdateGuildMembersList("GuildMemberAdd", data);
            }
        });

        FluxDispatcher.subscribe("GUILD_MEMBER_REMOVE", (data) => {
            // BotClientLogger.debug("GUILD_MEMBER_REMOVE", data);
            const guildId = getCurrentChannel()?.guild_id;
            if (data.guildId === guildId) {
                funcUpdateGuildMembersList("GuildMemberRemove", data);
            }
        });

        FluxDispatcher.subscribe("PRESENCE_UPDATES", (data) => {
            // BotClientLogger.debug("PRESENCE_UPDATES", data);
            const guildId = getCurrentChannel()?.guild_id;
            if ((data.updates as any[]).find(u => u.guildId === guildId)) {
                funcUpdateGuildMembersList("PresenceUpdates", data);
            }
        });

        /*
        FluxDispatcher.subscribe("CHANNEL_SELECT", (data) => {
            // BotClientLogger.debug("CHANNEL_SELECT", data);
            if (SelectedGuildStore.getGuildId()) funcUpdateGuildMembersListForChannelSelect("ChannelSelect", data);
        });
        */

        FluxDispatcher.subscribe("CHANNEL_PRELOAD", (data) => {
            // BotClientLogger.debug("CHANNEL_PRELOAD", data);
            this.updateGuildMembersList("ChannelPreload", data);
        });

        FluxDispatcher.subscribe("GUILD_ROLE_UPDATE", (data) => {
            // BotClientLogger.debug("GUILD_ROLE_UPDATE", data);
            const guildId = getCurrentChannel()?.guild_id;
            if (data.guildId === guildId) {
                funcUpdateGuildMembersList("GuildRoleUpdate", data);
            }
        });

        FluxDispatcher.subscribe("GUILD_ROLE_CREATE", (data) => {
            // BotClientLogger.debug("GUILD_ROLE_CREATE", data);
            const guildId = getCurrentChannel()?.guild_id;
            if (data.guildId === guildId) {
                funcUpdateGuildMembersList("GuildRoleCreate", data);
            }
        });

        FluxDispatcher.subscribe("GUILD_ROLE_DELETE", (data) => {
            // BotClientLogger.debug("GUILD_ROLE_DELETE", data);
            const guildId = getCurrentChannel()?.guild_id;
            if (data.guildId === guildId) {
                funcUpdateGuildMembersList("GuildRoleDelete", data);
            }
        });
    },
    // Utils
    throttle<T extends (...args: any[]) => void>(func: T, delay: number): (...args: Parameters<T>) => void {
        if (delay <= 0) delay = 2000;
        let lastCall = 0;
        let timeoutId: ReturnType<typeof setTimeout> | null = null;
        return (...args: Parameters<T>) => {
            const now = new Date().getTime();
            if (now - lastCall >= delay) {
                func(...args);
                lastCall = now;
            } else {
                if (timeoutId) {
                    clearTimeout(timeoutId);
                }
                timeoutId = setTimeout(() => {
                    func(...args);
                    lastCall = new Date().getTime();
                }, delay - (now - lastCall));
            }
        };
    },
    // Guild Member List
    calculateMemberListId(
        channel: Channel,
        everyonePermHasViewChannel
    ) {
        let list_id = "everyone";
        const perms: string[] = [];
        let isDeny = false;
        Object.values(channel.permissionOverwrites).map(overwrite => {
            const { id, allow, deny } = overwrite;
            if (allow & PermissionsBits.VIEW_CHANNEL)
                perms.push(`allow:${id}`);
            else if (deny & PermissionsBits.VIEW_CHANNEL) {
                perms.push(`deny:${id}`);
                isDeny = true;
            }
        });
        if (isDeny) {
            list_id = murmurhash.v3(perms.sort().join(",")).toString();
        } else if (!everyonePermHasViewChannel) {
            list_id = murmurhash.v3(perms.sort().join(",")).toString();
        }
        return list_id;
    },
    makeGroup(onlineMembers: MemberPatch[], offlineMembers: MemberPatch[], guildRoles: Record<string, Role>) {
        const ops: Ops[] = [];
        const group: Group[] = [];
        const allList = new Map<string, List>();
        // Online members
        for (const member of onlineMembers) {
            const idList = member.hoistRoleId || "online";
            const list =
                allList.get(idList) ||
                {
                    group: {
                        id: idList,
                        count: 0,
                    },
                    members: [],
                };
            list.group.count++;
            list.members.push(member);
            allList.set(idList, list);
        }
        // Sorting online members
        for (const list of Array.from(
            allList,
            ([name, value]) => value
        ).sort(
            (a, b) =>
                (guildRoles[b.group.id]?.position || 0) -
                (guildRoles[a.group.id]?.position || 0)
        )) {
            ops.push({
                group: list.group,
            });
            list.members
                .sort((x, y) => (x.nick || "").localeCompare(y.nick || ""))
                .map(m => ops.push({ member: m }));
            group.push(list.group);
        }
        // Offline members
        if (offlineMembers.length > 0) {
            const list = {
                group: {
                    id: "offline",
                    count: offlineMembers.length,
                },
                members: offlineMembers,
            };
            ops.push({
                group: list.group,
            });
            list.members.map(m => ops.push({ member: m }));
            group.push(list.group);
        }
        return {
            ops,
            group,
        };
    },
    updateGuildMembersList(location: string = "unknown", anyLog?: any) {
        if (!this.settings.store.showMemberList) {
            return false;
        }
        const guild = anyLog?.type === "CHANNEL_PRELOAD" ? GuildStore.getGuild(anyLog.guildId) : getCurrentGuild();
        if (!guild) {
            BotClientLogger.error(
                'botClient#updateGuildMembersList()', "Invalid Guild",
            );
            return false;
        }
        const channel = anyLog?.type === "CHANNEL_PRELOAD" ? ChannelStore.getChannel(anyLog.channelId) : getCurrentChannel();
        if (
            !channel ||
            !channel.guild_id ||
            channel.isDM() ||
            channel.isGroupDM() ||
            channel.isMultiUserDM() ||
            channel.isGuildVoice() ||
            channel.isGuildStageVoice() ||
            channel.isDirectory()
        ) {
            BotClientLogger.error(
                'botClient#updateGuildMembersList()', "Invalid Channel",
                channel
            );
            return false;
        }
        const guildRoles = GuildStore.getRoles(guild.id);
        // MemberListId
        const memberListId = this.calculateMemberListId(
            channel,
            guildRoles[guild.id].permissions & PermissionsBits.VIEW_CHANNEL
        );
        // GuildMembers Patch
        const allMembers = GuildMemberStore.getMembers(guild.id);
        const memberCount = allMembers.length;
        const membersOffline: MemberPatch[] = [];
        const membersOnline: MemberPatch[] = [];

        allMembers.map(m => {
            if (
                computePermissions({
                    user: { id: m.userId },
                    context: guild,
                    overwrites: channel.permissionOverwrites,
                }) & PermissionsBits.VIEW_CHANNEL
            ) {
                const status = PresenceStore.getStatus(m.userId);
                const member = {
                    ...m,
                    user: {
                        id: m.userId,
                    },
                    status: status !== "invisible" ? status : "offline",
                    position: guildRoles[m.hoistRoleId]?.position || 0,
                };
                if (member.status === "offline" && memberCount <= 1000) {
                    membersOffline.push(member);
                } else if (member.status !== "offline") {
                    membersOnline.push(member);
                }
            }
        });

        const groups = this.makeGroup(membersOnline, membersOffline, guildRoles);

        const ops = [
            {
                items: groups.ops,
                op: "SYNC",
                range: [0, 99],
            },
        ];

        FluxDispatcher.dispatch({
            guildId: guild.id,
            id: memberListId,
            ops,
            groups: groups.group,
            onlineCount: membersOnline.length,
            memberCount: memberCount,
            type: "GUILD_MEMBER_LIST_UPDATE",
        });

        BotClientLogger.info(
            'botClient#updateGuildMembersList()',
            `Emitted by: ${location}`,
            anyLog,
            "FluxDispatcher.dispatch:",
            {
                guildId: guild.id,
                id: memberListId,
                ops,
                groups: groups.group,
                onlineCount: membersOnline.length,
                memberCount: memberCount,
                type: "GUILD_MEMBER_LIST_UPDATE",
            }
        );

        return true;
    },
    // React Component Login
    renderTokenLogin() {
        return (
            <AuthBoxTokenLogin>
            </AuthBoxTokenLogin>
        );
    },
    renderTokenLoginMultiAccount() {
        return (
            <AuthBoxMultiTokenLogin>
            </AuthBoxMultiTokenLogin>
        );
    },
    validateTokenAndLogin(e) {
        e.preventDefault();
        const state = (window.document.getElementsByClassName(`${inputModule.inputDefault} token_multi`)[0] as any)?.value;
        if (!state) return;
        if (!/(mfa\.[a-z0-9_-]{20,})|([a-z0-9_-]{23,28}\.[a-z0-9_-]{6,7}\.[a-z0-9_-]{27})/i.test((state || "").trim())) {
            showToast("Login Failure: Invalid token", Toasts.Type.FAILURE);
            BotClientLogger.error("Login Failure: Invalid token", state);
            return;
        } else {
            window.sessionStorage.setItem('currentShard', '0');
            LoginToken.loginToken(state);
        }
    },
    // Debug
    get console() {
        return BotClientLogger;
    }
});
