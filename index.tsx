/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

/*
! Todo: These are the things I need to fix every time I update Vencord and Discord.
Ref: https://github.com/aiko-chan-ai/DiscordBotClient/issues/183
*/

import { ChatBarButton, ChatBarButtonFactory } from "@api/ChatButtons";
import { ApplicationCommandInputType, ApplicationCommandOptionType, findOption, sendBotMessage } from "@api/Commands";
import { definePluginSettings } from "@api/Settings";
import { Paragraph } from "@components/Paragraph";
import { getCurrentChannel, getCurrentGuild } from "@utils/discord";
import { Logger } from "@utils/Logger";
import { openModal } from "@utils/modal";
import definePlugin, { OptionType } from "@utils/types";
import { Channel, Guild, Role, type UserStore } from "@vencord/discord-types";
import { findByCodeLazy, findByProps, findByPropsLazy, findStore } from "@webpack";
import {
    Alerts,
    ChannelStore,
    Constants,
    DraftType,
    FluxDispatcher,
    GuildMemberStore,
    GuildRoleStore,
    GuildStore,
    MessageActions,
    NavigationRouter,
    PermissionsBits,
    PresenceStore,
    React,
    RestAPI,
    showToast,
    Toasts,
    VoiceStateStore,
} from "@webpack/common";

import AuthBoxMultiTokenLogin from "./components/AuthBoxMultiTokenLogin";
import AuthBoxTokenLogin, { inputModule } from "./components/AuthBoxTokenLogin";
// Components
import EmbedEditorModal from "./components/EmbedEditor";
import { IconEmbedSvg } from "./icon.svg";
import type { Group, List, MemberPatch, OpItem, Ops } from "./typing/index.d.ts";
import db from "./utils/database";
import { hasEmbedPerms } from "./utils/fakeNitroPlugin";
import { getAttachments, getDraft } from "./utils/previewMessagePlugin";
import { SnowflakeUtil } from "./utils/SnowflakeUtil";
import { PendingReplyStore } from "./utils/voiceMessagePlugin";

const GetToken = findByPropsLazy("getToken", "setToken");
const LoginToken = findByPropsLazy("loginToken", "login");
const murmurhash = findByPropsLazy("v3", "v2");
const GetApplicationId = findByPropsLazy("getToken", "getId", "getSessionId");

const BotClientLogger = new Logger("BotClient", "#f5bde6");

// Patch sessionStorage to prevent Discord from deleting it
(() => {
    const desc = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    if (!desc) {
        BotClientLogger.error("Cannot find sessionStorage descriptor");
        return;
    }
    Object.defineProperty(window, "sessionStorage", {
        configurable: false,
        enumerable: true,
        get() {
            if (!desc.get) {
                BotClientLogger.error("Cannot get sessionStorage");
                return undefined;
            }
            return desc.get.call(window);
        }
    });
})();

// PermissionStore.computePermissions is not the same function and doesn't work here
const computePermissions: (options: {
    user?: { id: string; } | string | null;
    context?: Guild | Channel | null;
    overwrites?: Channel["permissionOverwrites"] | null;
    roles?: undefined; // !?
    checkElevated?: boolean /* = true */;
    excludeGuildPermissions?: boolean /* = false */;
}) => bigint = findByCodeLazy(".getCurrentUser()", ".computeLurkerPermissionsAllowList()");
/*
function M(e) {
    var t, n, r;
    let i, {
        user: a,
        context: o,
        overwrites: s,
        roles: l,
        checkElevated: u = !0,
        excludeGuildPermissions: p = !1
    } = e;
    if (null == a) return T;
    let g = "string" == typeof a ? a : a.id,
        y = N;
    if (o instanceof f.Sf) {
        if (o.isScheduledForDeletion()) return T;
        if (f.Ec.has(o.type)) {
            let e = h.Z.getChannel(o.parent_id);
            if (null == e || e.isScheduledForDeletion()) return T;
            let t = g === (null == (n = b.default.getCurrentUser()) ? void 0 : n.id) && d.Z.hasJoined(o.id);
            return j(o, M({
                user: a,
                context: e,
                overwrites: s,
                roles: l,
                checkElevated: u,
                excludeGuildPermissions: p
            }), t)
        }
        y = null != (r = o.computeLurkerPermissionsAllowList()) ? r : y, s = null != s ? I({}, o.permissionOverwrites, s) : o.permissionOverwrites;
        let e = o.getGuildId();
        i = null != e ? E.Z.getGuild(e) : null
    } else s = null != s ? s : {}, i = o;
    if (null == i) return T;
    if (!(g === (null == (t = b.default.getCurrentUser()) ? void 0 : t.id) && c.Z.isViewingRoles(i.id)) && (0, _.eM)(i, g)) return D(S, i, g, u);
    let O = m.ZP.getMember(i.id, g);
    return x({
        userId: g,
        member: O,
        guild: i,
        overwrites: s,
        roles: l,
        checkElevated: u,
        excludeGuildPermissions: p,
        lurkerPermissionsMask: y
    })
}*/

const EmbedButton: ChatBarButtonFactory = prop => {
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
                body: (
                    <div>
                        <Paragraph>
                            You are trying to send a embed, however you do not have permissions to embed
                            links in the current channel.
                        </Paragraph>
                    </div>
                ),
            });
        }
        return openModal(props => (
            <EmbedEditorModal
                modalProps={props}
                callbackSendEmbed={async function (data, msg) {
                    // waiting for attachments
                    const attachments = await getAttachments(channelId);
                    const reply = PendingReplyStore.getPendingReply(channelId);
                    const content = getDraft(channelId) || undefined;
                    if (Vencord.Plugins.plugins.BotClient.settings!.store.clearDraftAfterSendingEmbed) {
                        // Clear reply
                        if (reply) FluxDispatcher.dispatch({ type: "DELETE_PENDING_REPLY", channelId });
                        // Clear Draft message
                        if (content) {
                            FluxDispatcher.dispatch({
                                type: "DRAFT_CLEAR",
                                channelId,
                                draftType: DraftType.ChannelMessage,
                            });
                        }
                        // Clear attachments (not delete)
                        if (attachments.length) {
                            FluxDispatcher.dispatch({
                                type: "UPLOAD_ATTACHMENT_CLEAR_ALL_FILES",
                                channelId,
                                draftType: DraftType.ChannelMessage,
                            });
                        }
                    }
                    if (attachments.length > 0) {
                        showToast("Uploading attachments... Please be patient", Toasts.Type.MESSAGE);
                        await Promise.all(
                            attachments.map(a => {
                                if (a.status === "COMPLETED") {
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
                            }),
                        );
                    }
                    // Clear stickers :??? 404 not found ;-;
                    RestAPI.post({
                        url: Constants.Endpoints.MESSAGES(channelId),
                        body: {
                            embeds: [data],
                            content,
                            attachments: attachments.map((a, index) => {
                                return {
                                    id: index,
                                    filename: a.filename,
                                    uploaded_filename: a.uploadedFilename,
                                };
                            }),
                            message_reference: reply
                                ? MessageActions.getSendMessageOptionsForReply(reply)?.messageReference
                                : null,
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
                }}
                isCreate={true}
            />
        ));
    };
    return (
        <ChatBarButton onClick={handle} tooltip="Embed Maker">
            <IconEmbedSvg />
        </ChatBarButton>
    );
};

export default definePlugin({
    name: "BotClient",
    description: "Patch the current version of Discord to allow the use of bot accounts",
    authors: [
        {
            name: "Elysia",
            id: 721746046543331449n,
        },
    ],
    enabledByDefault: true,
    dependencies: ["UserSettingsAPI"],
    settings: definePluginSettings({
        showMemberList: {
            description: "Allow fetching member list sidebar",
            type: OptionType.BOOLEAN,
            default: true,
            restartNeeded: false,
        },
        memberListThrottleDelay: {
            description: "The interval at which the member list sidebar is updated (seconds)",
            type: OptionType.NUMBER,
            default: 2,
            restartNeeded: false,
        },
        embedChatButton: {
            description: "Add a button to show the Embed Editor modal in the chat bar",
            type: OptionType.BOOLEAN,
            default: true,
            restartNeeded: true,
        },
        embedEditMessageButton: {
            description: "Add a button to show Embed Editor modal in messages",
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
            description:
                "Whether or not to save private channels to storage? If disabled, all cached private channels will be cleared",
            type: OptionType.BOOLEAN,
            default: true,
            restartNeeded: false,
            onChange: (value: boolean) => {
                if (!value) db.clearDMsCache(GetApplicationId.getId());
            },
        },
        overrideVoiceChannelBitrate: {
            description:
                "Enable bitrate override for voice channels you join. Higher bitrate may increase network usage.",
            type: OptionType.BOOLEAN,
            default: false,
            onChange: (value: boolean) => {
                if (value) {
                    const kbps = Vencord.Plugins.plugins.BotClient!.settings!.store.bitrateVoiceChannel;
                    BotClientLogger.log(`[Enable Override] Set default voice channel bitrate to ${kbps} kbps`);
                    FluxDispatcher.dispatch({
                        type: "SET_CHANNEL_BITRATE",
                        bitrate: Math.floor(kbps * 1000),
                    });
                    showToast("Voice channel bitrate override enabled", Toasts.Type.SUCCESS);
                    showToast(
                        "For the best voice quality, please disable echo cancellation and Krisp.",
                        Toasts.Type.SUCCESS,
                    );
                } else {
                    // Get current voice channel bitrate
                    const channelId = VoiceStateStore.getVoiceStateForUser(GetApplicationId.getId())?.channelId;
                    if (!channelId) return;
                    const channel = ChannelStore.getChannel(channelId);
                    BotClientLogger.log(`[Disable Override] Set voice channel bitrate to ${channel?.bitrate} bps`);
                    showToast("Voice channel bitrate override disabled", Toasts.Type.SUCCESS);
                    FluxDispatcher.dispatch({
                        type: "SET_CHANNEL_BITRATE",
                        bitrate: channel.bitrate,
                    });
                }
            },
        },
        bitrateVoiceChannel: {
            description: "Set the default bitrate for voice channels you join (in kbps)",
            type: OptionType.NUMBER,
            default: 128,
            hidden: true,
            onChange: (kbps: number) => {
                BotClientLogger.log(`[Command] Set default voice channel bitrate to ${kbps} kbps`);
                FluxDispatcher.dispatch({
                    type: "SET_CHANNEL_BITRATE",
                    bitrate: Math.floor(kbps * 1000),
                });
            },
        },
    }),
    required: true,
    patches: [
        // AuthBox (Token)
        {
            // ???
            find: "}get canShowChooseAccount(){return this.props.hasLoggedInAccounts}loginOrSSO(",
            replacement: [
                {
                    // Function: renderDefaultForm(e){...}
                    /**
                     * i.jsx)(p.Fmo, {
                            children: (0,
                            i.jsxs)(E.eB, {
                                className: J.QX,
                                children: [(0, <- Here
                                i.jsx)(R.A, {
                                    alpha2: o.alpha2,
                                    countryCode: o.code.split(" ")[0],
                                    className: J.SX,
                                    label: q.intl.string(q.t.tUjnxr),
                                    error: null != (t = this.renderError("login")) ? t : this.renderError("email"),
                                    onChange: (e, t) => this.setState({
                                        login: e,
                                        loginPrefix: t
                                    }),
                                    setRef: this.setLoginRef,
                                    autoCapitalize: "none",
                                    autoComplete: "username webauthn",
                                    autoCorrect: "off",
                                    spellCheck: "false",
                                    value: this.state.login,
                                    autoFocus: !d && !c && !u,
                                    required: !0
                                }), (0,
                                i.jsx)(E.pd, {
                                    label: q.intl.string(q.t["CIGa+7"]),
                                    error: this.renderError("password"),
                                    onChange: e => this.setState({
                                        password: e
                                    }),
                                    name: "password",
                                    type: "password",
                                    setRef: this.setPasswordRef,
                                    autoComplete: "current-password",
                                    spellCheck: "false",
                                    autoFocus: d && !c && !u,
                                    value: this.state.password,
                                    required: !0
                                }),
                     */
                    match: /(?<=className:[\w.]+,)children:\[(?=\(0,[\w.]+\)\([\w.]+,{alpha2:)/,
                    replace: function (str, ...args) {
                        return "children:[$self.renderTokenLogin()],children_:[";
                    },
                },
                {
                    // QR Modules (QRLogin disable)
                    match: "renderDefaultForm(!0)", // !0 = true => Enabled
                    replace: "renderDefaultForm(!1)",
                },
            ],
        },
        // AuthBox2 (Switch Account)
        {
            // todo
            find: 'componentWillUnmount(){window.removeEventListener("keydown",this.handleTabOrEnter),this.state.conditionalMediationAbortController.abort()}hasError(',
            replacement: [
                {
                    // {className:L.mainLoginContainer,children:(0,o.jsxs)(b.gO,{children:[(0,o.jsx)(x.Z,{alpha2 (old)
                    // {className:F.Eh,children:(0,n.jsxs)(b.eB,{children:[(0,n.jsx)(A.A,{alpha2:t.alpha2 (new)
                    match: /children:\[(?=\(0,[\w.]+\)\([\w.]+,{alpha2:)/,
                    replace: function (str, ...args) {
                        return "children:[$self.renderTokenLoginMultiAccount()],children_:[";
                    },
                },
                {
                    // Button "Continue"
                    match: "onClick:this.handleLogin,",
                    replace: "onClick:$self.validateTokenAndLogin,onClick_:this.handleLogin,",
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
                    // _handleDispatch(e,t,n){
                    // e = eventName, t = data, n = N ???
                    replace: function (str, ...args) {
                        const data = args[1];
                        const eventName = args[3];
                        const N = args[5]; // compressionAnalytics ??? | Default: null
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
            // https://discord.com/developers/docs/resources/channel#channel-object
            $self.db.handleOpenPrivateChannel(
                Vencord.Webpack.Common.UserStore.getCurrentUser().id,
                channel.recipients[0].id,
                channel.id
            );
            $self.console.debug("[Client > Electron] Add Private channel (From MESSAGE_CREATE event)");
        }
    }).catch((err) => {
        $self.console.debug("[Client > Electron] Get from /channels/" + ${data}.channel_id + " error", err);
    }).finally((i) => {
        return this.dispatcher.receiveDispatch(${data}, ${eventName}, ${N});
    });
}
if ("READY_SUPPLEMENTAL" === ${eventName}) {
    $self.console.log("[Client]: Ready Supplemental event", ${data});
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
    // Set Presence
    Vencord.Webpack.findByProps('getSocket').getSocket().send(3, {
        status,
        since: null,
        activities,
        afk: false
    });
    // Patch fixPreloadedUserSettings
    $self.fixPreloadedUserSettings();
    // Application Emojis
    $self.getApplicationEmojis();
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
    
    // Private Channels
    const defaultPrivateChannel = BotClientNative.getPrivateChannelDefault();
    if ($self.settings.store.saveDirectMessage) {
        $self.db.queryAllPrivateChannel(${data}.user.id).then(dms => {
            dms.map(channel => this.dispatcher.receiveDispatch(channel.data, "CHANNEL_CREATE", null));
        });
    }

    // It's not working (cannot using await)
    // ${data}.user_settings_proto = await $self.db.getPreloadedUserSettingsBase64(${data}.user.id);

    // CurrentUser
    ${data}.user.premium = true;
    ${data}.user.premium_type = 2;
    ${data}.user.mfa_enabled = 1;
    ${data}.user.purchased_flags = 3;
    ${data}.user.phone = '33550336';
    ${data}.user.verified = true;
    ${data}.user.mobile = true;
    ${data}.user.desktop = true;
    ${data}.user.nsfw_allowed = true;
    ${data}.user.email = ${data}.user.id + '@cyrene.moe'; 
    ${data}.user.age_verification_status = 3;

    // Empty Arrays
    ${data}.sessions = [];
    ${data}.relationships = [];
    ${data}.connected_accounts = [];
    ${data}.broadcaster_user_ids = [];
    ${data}.linked_users = [];
    ${data}.guild_join_requests = [];

    // Null values
    ${data}.tutorial = null;
    ${data}.pending_payments = null;
    ${data}.analytics_token = null;
    // ${data}.apex_experiments = null; ????

    // Number values
    ${data}.explicit_content_scan_version = 2;
    ${data}.friend_suggestion_count = 0;

    // Objects values
    ${data}.read_state = {
        version: 0,
        partial: false,
        entries: [],
    };
    ${data}.auth = {
        authenticator_types: [2, 3],
    }
    ${data}.consents = {
        personalization: {
            consented: false,
        },
    };
    ${data}.notification_settings = {
        flags: 0,
    };
    ${data}.user_guild_settings = {
        entries: [],
        version: 0,
        partial: false,
    };

    // Other values
    ${data}.country_code = "US";
    ${data}.private_channels = [defaultPrivateChannel];
    ${data}.guild_experiments = BotClientNative.getGuildExperiments();
    ${data}.experiments = BotClientNative.getUserExperiments(experiments, ${data}.user.id);
    ${data}.apex_experiments = BotClientNative.getApexExperiments(${data}.user.id);
    ${data}.auth_session_id_hash = btoa("aiko-chan-ai/DiscordBotClient");
    ${data}.static_client_session_id = crypto.randomUUID();
    ${data}.users = [
        defaultPrivateChannel.recipients[0],
        ...(${data}.users || []),
    ];
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
// Session Storage
if (window.sessionStorage.getItem('currentShard') == null || parseInt(window.sessionStorage.getItem('currentShard')) + 1 > botInfo.allShards) {
    window.sessionStorage.setItem('currentShard', 0);
}
window.sessionStorage.setItem('lasestGuildIdVoiceConnect', '0');
$self.console.log("[Client > Electron] Bot Intents:", intents, "Shard ID:", parseInt(window.sessionStorage.getItem('currentShard')), "(All:", botInfo.allShards, ")");
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
                    // if(e.user.bot){ (old)
                    // e.user.bot?X({type:"LOGOUT"}):E.A.ready.measure... (new)
                    match: /(\w+)\.user\.bot\?/,
                    replace: (str, ...args) => {
                        return `!${args[0]}.user.bot?`;
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
        // Max attachment size 10MB = 10485760
        // https://discord.com/developers/docs/change-log#default-file-upload-limit-change
        {
            find: 'PREMIUM_TENURE_1_MONTH="premium_tenure_1_month_v2"',
            replacement: [
                {
                    match: /(\d):{fileSize:\w+}/g,
                    replace: "$1:{fileSize:10485760}",
                },
            ],
        },
        // Deny stickers to be sent everywhere - From FakeNitro plugin
        {
            find: "canUseCustomStickersEverywhere:",
            replacement: {
                match: /(?<=canUseCustomStickersEverywhere:)\i/,
                replace: "()=>false",
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
                        let {recipientIds: t, joinCall: n=!1, joinCallVideo: i=!1, location: o, onBeforeTransition: a, navigateToChannel: s=!0} = e; // Copy from original code
                        let l = this._getRecipients(t); // user_ids[];
                        let userId = l[0];
                        if (!userId) {
                            $self.console.error("Cannot open private channel without user ID", e, l);
                            Vencord.Webpack.Common.Toasts.show({
                                message: "Cannot open private channel without user ID",
                                id: Vencord.Webpack.Common.Toasts.genId(),
                                type: Vencord.Webpack.Common.Toasts.Type.FAILURE,
                            });
                            return null;
                        }
                        if (Vencord.Webpack.Common.UserStore.getUser(userId)?.bot) {
                            Vencord.Webpack.Common.Toasts.show({
                                message: "Cannot send messages to this bot",
                                id: Vencord.Webpack.Common.Toasts.genId(),
                                type: Vencord.Webpack.Common.Toasts.Type.FAILURE,
                            });
                            return null;
                        }
                        const result = await this.openPrivateChannel_.apply(this, arguments);
                        if ($self.settings.store.saveDirectMessage) {
                            $self.db.handleOpenPrivateChannel(
                                Vencord.Webpack.Common.UserStore.getCurrentUser().id,
                                userId,
                                result
                            );
                            $self.console.debug("[Client > Electron] Add Private channel (From openPrivateChannel function)");
                        }
                        return result;
                        },${first}_${second}`;
                    },
                },
                {
                    match: /closePrivateChannel\(\w+\){/,
                    replace: function (str) {
                        return `${str}if ($self.settings.store.saveDirectMessage) $self.db.handleClosePrivateChannel(Vencord.Webpack.Common.UserStore.getCurrentUser().id, arguments[0]);`;
                    },
                },
            ],
        },
        // Fix unread message
        {
            find: "}getOldestUnreadMessageId(",
            replacement: [
                {
                    match: /}getOldestUnreadMessageId\(\w+\){/,
                    replace: function (strOriginal) {
                        return `${strOriginal}return null;`;
                    },
                },
                {
                    match: /}getOldestUnreadTimestamp\(\w+\){/,
                    replace: function (strOriginal) {
                        return `${strOriginal}return 0;`;
                    },
                },
            ],
        },
        // Emoji
        {
            find: "}searchWithoutFetchingLatest(",
            replacement: [
                {
                    match: /;return{unlocked:this\.getSearchResultsOrder\((\w+)\.unlocked/,
                    replace:
                        ";$self.getApplicationEmojis();$1.unlocked = [...$1.unlocked, ...(window.applicationEmojis || []).filter(o => o.name?.toLowerCase().includes(arguments[0].query?.toLowerCase()))];return{unlocked:this.getSearchResultsOrder($1.unlocked",
                },
            ],
        },
        // Support link
        {
            find: '"support.discord.com"',
            replacement: [
                {
                    match: '"support.discord.com"',
                    replace: '"github.com/aiko-chan-ai/DiscordBotClient/discussions#"',
                },
            ],
        },
        // Vesktop
        // src > renderer > patches > windowsTitleBar.tsx
        {
            find: ".wordmarkWindows",
            replacement: [
                {
                    // TODO: Fix eslint rule

                    match: /case \i\.\i\.WINDOWS:/,
                    replace: 'case "WEB":',
                },
            ],
        },
        // Visual Refresh
        {
            find: ".systemBar,",
            replacement: [
                {
                    // TODO: Fix eslint rule

                    match: /\i===\i\.PlatformTypes\.WINDOWS/g,
                    replace: "true",
                },
                {
                    // TODO: Fix eslint rule

                    match: /\i===\i\.PlatformTypes\.WEB/g,
                    replace: "false",
                },
            ],
        },
        // src > renderer > patches > windowMethods.tsx
        {
            find: ",setSystemTrayApplications",
            replacement: [
                {
                    match: /\i\.window\.(close|minimize|maximize)/g,
                    replace: "BotClientNative.$1",
                },
                {
                    // TODO: Fix eslint rule

                    match: /(focus(\(\i\)){).{0,150}?\.focus\(\i,\i\)/,
                    replace: "$1BotClientNative.focus$2",
                },
                // Todo: Hardware Acceleration
            ],
        },
        // High bitrate
        {
            find: '{type:"SET_CHANNEL_BITRATE",bitrate:',
            replacement: [
                {
                    match: /({type:"SET_CHANNEL_BITRATE",bitrate:)(\w+\.bitrate)}/,
                    replace:
                        "$1 $self.settings.store.overrideVoiceChannelBitrate ? Math.floor($self.settings.store.bitrateVoiceChannel * 1000) : $2}",
                },
            ],
        },
    ],
    commands: [
        {
            name: "ping",
            description: "Ping pong!",
            inputType: ApplicationCommandInputType.BUILT_IN,
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
                    const oldId = SnowflakeUtil.generate(Date.now() - 1209600000);
                    const { body } = await RestAPI.get({
                        url: Constants.Endpoints.MESSAGES(ctx.channel.id) + `?limit=${amount}`,
                    });
                    const messages = body.filter(m => BigInt(m.id) > BigInt(oldId)).map(m => m.id);
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
            inputType: ApplicationCommandInputType.BUILT_IN,
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
                        },
                    ],
                },
            ],
            execute: async (opts, ctx) => {
                BotClientLogger.debug(opts, ctx);
                const subCommand = opts[0];
                switch (subCommand.name) {
                    case "shard": {
                        const id = findOption<number>(subCommand.options, "id", 0);
                        const allShards = parseInt(window.sessionStorage.getItem("allShards") as string);
                        if (id < 0 || id + 1 > allShards) {
                            sendBotMessage(ctx.channel.id, {
                                content: `### Invalid shardId\n🚫 Must be greater than or equal to **0** and less than or equal to **${allShards - 1}**.\n**${id}** is an invalid number`,
                            });
                        } else {
                            window.sessionStorage.setItem("currentShard", id as any);
                            LoginToken.loginToken(GetToken.getToken());
                        }
                        break;
                    }
                    case "guild": {
                        const guild = findOption<string>(subCommand.options, "id", "");
                        const allShards = parseInt(window.sessionStorage.getItem("allShards") as string);
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
                        window.sessionStorage.setItem("currentShard", shardId as any);
                        await LoginToken.loginToken(GetToken.getToken());
                        NavigationRouter.transitionToGuild(guild);
                        break;
                    }
                }
            },
        },
        {
            name: "override",
            description: "Override settings",
            inputType: ApplicationCommandInputType.BUILT_IN,
            options: [
                {
                    description: "Override voice channel bitrate",
                    name: "bitrate",
                    type: ApplicationCommandOptionType.SUB_COMMAND,
                    options: [
                        {
                            name: "value",
                            description: "Bitrate value (Kbps)",
                            required: true,
                            type: ApplicationCommandOptionType.INTEGER,
                        },
                    ],
                },
            ],
            execute: async (opts, ctx) => {
                BotClientLogger.debug(opts, ctx);
                const subCommand = opts[0];
                switch (subCommand.name) {
                    case "bitrate": {
                        if (!Vencord.Plugins.plugins.BotClient.settings!.store.overrideVoiceChannelBitrate) {
                            return sendBotMessage(ctx.channel.id, {
                                content: "🚫 You must enable `Override Voice Channel Bitrate` in settings first",
                            });
                        }
                        const kbps = findOption<number>(subCommand.options, "value", 128);
                        if (!Number.isInteger(kbps)) {
                            return sendBotMessage(ctx.channel.id, {
                                content: `🚫 **${kbps}** is not a valid integer`,
                            });
                        }
                        if (kbps < 6 || kbps > 5000) {
                            return sendBotMessage(ctx.channel.id, {
                                content: `🚫 Must be greater than or equal to **6** and less than or equal to **5000** Kbps.\n**${kbps}** is an invalid number`,
                            });
                        }
                        Vencord.Plugins.plugins.BotClient.settings!.store.bitrateVoiceChannel = kbps;
                        sendBotMessage(ctx.channel.id, {
                            content: `✅ Set voice channel bitrate to **${kbps}** Kbps`,
                        });
                        break;
                    }
                }
            },
        },
    ],
    flux: {
        GUILD_MEMBER_LIST_UPDATE(data) {
            BotClientLogger.debug(
                "botClient#updateGuildMembersList()",
                "FluxDispatcher#GUILD_MEMBER_LIST_UPDATE",
                data,
            );
        },
        /*
        USER_SETTINGS_PROTO_UPDATE: async function (data) {
            const botId = GetApplicationId.getId();
            if (data.partial) {
                BotClientLogger.debug(
                    "FluxDispatcher#USER_SETTINGS_PROTO_UPDATE",
                    data,
                );
                // Preloaded User Settings
                if (data.settings.type === 1) {
                    const preloaded = await db.getPreloadedUserSettings(botId);
                    // Try update
                    Object.keys(data.settings.proto).forEach(key => {
                        preloaded[key] = data.settings.proto[key];
                    });
                    // Save to IndexedDB
                    await db.SetPreloadedUserSettings(botId, preloaded);
                }
                // Frecency User Settings
                if (data.settings.type === 2) {
                    const frecency = await db.getFrecencyUserSettings(botId);
                    // Try update
                    Object.keys(data.settings.proto).forEach(key => {
                        frecency[key] = data.settings.proto[key];
                    });
                    // Save to IndexedDB
                    await db.SetFrecencyUserSettings(botId, frecency);
                }
            }
        }
        */
    },
    dynamicPatchModules() {
        // Patch Relationships modules
        const RelationshipsModule = findByProps("fetchRelationships", "sendRequest", "removeFriend");
        Object.keys(RelationshipsModule).forEach(
            a => {
                RelationshipsModule[a] = function () {
                    showToast(`${window.BotClientNative.getBotClientName()} cannot use Relationships Module`, Toasts.Type.FAILURE);
                    return Promise.reject(`${window.BotClientNative.getBotClientName()} cannot use Relationships Module`);
                };
            },
        );
        // Patch getCurrentUser in UserStore
        const UserStorePatch = findStore("UserStore") as UserStore;
        UserStorePatch.getCurrentUser = function () {
            const user = UserStorePatch.getUsers()[GetApplicationId.getId()];
            if (!user) return user;
            user.desktop = true;
            user.mobile = true;
            // @ts-expect-error ignore
            user.premiumState = {
                premiumSubscriptionType: 4,
                premiumSource: 1
            };
            user.purchasedFlags = 3; // https://docs.discord.food/resources/user#purchased-flags
            user.premiumType = 2; // https://docs.discord.food/resources/user#premium-type
            user.premiumUsageFlags = 4; // https://docs.discord.food/resources/user#purchased-flags
            // @ts-expect-error ignore
            user.premium = true;
            user.mfaEnabled = true;
            user.verified = true;
            user.nsfwAllowed = true;
            user.phone = "33550336"; // https://x.com/StarRailVerse1/status/1939186090222490046
            user.email = user.id + "@cyrene.moe";
            return user;
        };
        // Invite Module
        const InviteModule = findByProps("acceptInvite", "resolveInvite");
        InviteModule.acceptInvite = function (e) {
            if (parseInt(window.sessionStorage.getItem("allShards") || "0") > 1) {
                // eslint-disable-next-line no-async-promise-executor
                return new Promise(async (resolve, reject) => {
                    const invite = await this.resolveInvite(e.inviteKey);
                    const guildId = invite.invite.guild_id;
                    const channelId = invite.invite.channel.id;
                    if (!guildId) {
                        Toasts.show({
                            message: `${window.BotClientNative.getBotClientName()} cannot join guilds`,
                            id: Toasts.genId(),
                            type: Toasts.Type.FAILURE,
                        });
                        reject(`${window.BotClientNative.getBotClientName()} cannot join guilds`);
                    } else {
                        const res = await RestAPI.get({
                            url: "/guilds/" + guildId
                        }).catch(e => e);
                        if (res.ok) {
                            const shardId = Number((BigInt(guildId) >> 22n) % BigInt(parseInt(window.sessionStorage.getItem("allShards") || "0")));
                            window.sessionStorage.setItem("currentShard", shardId.toString());
                            await LoginToken.loginToken(GetToken.getToken());
                            resolve(NavigationRouter.transitionToGuild(guildId, channelId));
                        } else {
                            Toasts.show({
                                message: `${window.BotClientNative.getBotClientName()} cannot join guilds`,
                                id: Toasts.genId(),
                                type: Toasts.Type.FAILURE,
                            });
                            reject(`${window.BotClientNative.getBotClientName()} cannot join guilds`);
                        }
                    }
                }
                );
            } else {
                Toasts.show({
                    message: `${window.BotClientNative.getBotClientName()} cannot join guilds`,
                    id: Toasts.genId(),
                    type: Toasts.Type.FAILURE,
                });
                return Promise.reject(`${window.BotClientNative.getBotClientName()} cannot join guilds`);
            }
        };
        // GuildTemplateModule
        const GuildTemplateModule = findByProps("loadTemplatesForGuild", "resolveGuildTemplate");
        GuildTemplateModule.loadTemplatesForGuild = function (e) {
            Promise.reject(`${window.BotClientNative.getBotClientName()} cannot use Guild Templates`);
        };
    },
    chatBarButton: {
        icon: IconEmbedSvg,
        render: EmbedButton,
    },
    messagePopoverButton: {
        icon: IconEmbedSvg,
        render: msg => {
            const handler = async () => {
                showToast("Fetching message...", Toasts.Type.MESSAGE, {
                    position: Toasts.Position.TOP,
                });
                // Fetch raw msg from discord
                const msgRaw = await RestAPI.get({
                    url: `/channels/${msg.channel_id}/messages/${msg.id}`,
                });
                openModal(props => (
                    <EmbedEditorModal
                        modalProps={props}
                        callbackSendEmbed={function (data, msgData) {
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
                        }}
                        messageRaw={msgRaw.body}
                        isCreate={false}
                    />
                ));
            };
            if (
                msg.author.id === GetApplicationId.getId() &&
                msg.embeds.filter(e => e.type === "rich").length > 0
            ) {
                return {
                    label: "Embed Editor",
                    icon: IconEmbedSvg,
                    message: msg,
                    channel: ChannelStore.getChannel(msg.channel_id),
                    onClick: handler,
                    onContextMenu: handler,
                };
            } else {
                return null;
            }
        }
    },
    start() {
        // Patch Modules
        this.dynamicPatchModules();

        const funcUpdateGuildMembersList = this.throttle(
            this.updateGuildMembersList.bind(this),
            this.settings.store.memberListThrottleDelay * 1000,
        );

        FluxDispatcher.subscribe("GUILD_MEMBER_UPDATE", data => {
            // BotClientLogger.debug("GUILD_MEMBER_UPDATE", data);
            const guildId = getCurrentChannel()?.guild_id;
            if (data.guildId === guildId) {
                funcUpdateGuildMembersList("GuildMemberUpdate", data);
            }
        });

        FluxDispatcher.subscribe("GUILD_MEMBER_ADD", data => {
            // BotClientLogger.debug("GUILD_MEMBER_ADD", data);
            const guildId = getCurrentChannel()?.guild_id;
            if (data.guildId === guildId) {
                funcUpdateGuildMembersList("GuildMemberAdd", data);
            }
        });

        FluxDispatcher.subscribe("GUILD_MEMBER_REMOVE", data => {
            // BotClientLogger.debug("GUILD_MEMBER_REMOVE", data);
            const guildId = getCurrentChannel()?.guild_id;
            if (data.guildId === guildId) {
                funcUpdateGuildMembersList("GuildMemberRemove", data);
            }
        });

        FluxDispatcher.subscribe("PRESENCE_UPDATES", data => {
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

        FluxDispatcher.subscribe("CHANNEL_PRELOAD", data => {
            // BotClientLogger.debug("CHANNEL_PRELOAD", data);
            this.updateGuildMembersList("ChannelPreload", data);
        });

        FluxDispatcher.subscribe("GUILD_ROLE_UPDATE", data => {
            // BotClientLogger.debug("GUILD_ROLE_UPDATE", data);
            const guildId = getCurrentChannel()?.guild_id;
            if (data.guildId === guildId) {
                funcUpdateGuildMembersList("GuildRoleUpdate", data);
            }
        });

        FluxDispatcher.subscribe("GUILD_ROLE_CREATE", data => {
            // BotClientLogger.debug("GUILD_ROLE_CREATE", data);
            const guildId = getCurrentChannel()?.guild_id;
            if (data.guildId === guildId) {
                funcUpdateGuildMembersList("GuildRoleCreate", data);
            }
        });

        FluxDispatcher.subscribe("GUILD_ROLE_DELETE", data => {
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
                timeoutId = setTimeout(
                    () => {
                        func(...args);
                        lastCall = new Date().getTime();
                    },
                    delay - (now - lastCall),
                );
            }
        };
    },
    // Guild Member List
    calculateMemberListId(channel: Channel, everyonePermHasViewChannel: bigint) {
        const VIEW = PermissionsBits.VIEW_CHANNEL;
        const perms: string[] = [];
        let hasDeny = false;

        for (const { id, allow, deny } of Object.values(channel.permissionOverwrites)) {
            if (allow & VIEW) {
                perms.push(`allow:${id}`);
            } else if (deny & VIEW) {
                perms.push(`deny:${id}`);
                hasDeny = true;
            }
        }

        if (!hasDeny && everyonePermHasViewChannel > 0n) {
            return "everyone";
        }

        const hashInput = perms.sort().join(",");
        return murmurhash.v3(hashInput).toString();
    },
    makeGroup(onlineMembers: MemberPatch[], offlineMembers: MemberPatch[], guildRoles: Record<string, Role>) {
        const ops: OpItem[] = [];
        const groups: Group[] = [];
        const allLists = new Map<string, List>();
        // Online members
        for (const member of onlineMembers) {
            const idList = member.hoistRoleId || "online";
            let list = allLists.get(idList);
            if (!list) {
                list = {
                    group: {
                        id: idList,
                        count: 0,
                    },
                    members: [],
                };
                allLists.set(idList, list);
            }
            list.group.count++;
            list.members.push(member);
        }
        // Sorting roles by position
        const sortedLists = [...allLists.values()].sort((a, b) =>
            // group.id = role.id
            (guildRoles[b.group.id]?.position ?? 0) - (guildRoles[a.group.id]?.position ?? 0)
        );
        // Sorting members by nickname
        for (const list of sortedLists) {
            ops.push({ group: list.group });

            list.members
                .sort((a, b) => (a.nick || "").localeCompare(b.nick || ""))
                .forEach(m => ops.push({ member: m }));

            groups.push(list.group);
        }
        // Offline members
        if (offlineMembers.length) {
            const offlineGroup = { id: "offline", count: offlineMembers.length };
            ops.push({ group: offlineGroup });
            for (const m of offlineMembers) ops.push({ member: m });
            groups.push(offlineGroup);
        }
        return {
            ops,
            groups,
        };
    },
    updateGuildMembersList(location: string = "unknown", anyLog?: any) {
        if (!this.settings.store.showMemberList) {
            return false;
        }
        const guild = anyLog?.type === "CHANNEL_PRELOAD" ? GuildStore.getGuild(anyLog.guildId) : getCurrentGuild();
        if (!guild) {
            BotClientLogger.error("botClient#updateGuildMembersList()", "Invalid Guild");
            return false;
        }
        const channel =
            anyLog?.type === "CHANNEL_PRELOAD" ? ChannelStore.getChannel(anyLog.channelId) : getCurrentChannel();
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
            BotClientLogger.error("botClient#updateGuildMembersList()", "Invalid Channel", channel);
            return false;
        }
        // Convert guild roles to object
        const guildRolesArray = GuildRoleStore.getSortedRoles(guild.id);
        const guildRoles: Record<string, Role> = {};
        guildRolesArray.map(r => (guildRoles[r.id] = r));
        // MemberListId
        const memberListId = this.calculateMemberListId(
            channel,
            guildRoles[guild.id].permissions & PermissionsBits.VIEW_CHANNEL,
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
        ] as Ops[];

        FluxDispatcher.dispatch({
            guildId: guild.id,
            id: memberListId,
            ops,
            groups: groups.groups,
            onlineCount: membersOnline.length,
            memberCount: memberCount,
            type: "GUILD_MEMBER_LIST_UPDATE",
            log: {
                message: `Emitted by: ${location}`,
                data: anyLog,
            },
        });

        return true;
    },
    // React Component Login
    renderTokenLogin() {
        return <AuthBoxTokenLogin></AuthBoxTokenLogin>;
    },
    renderTokenLoginMultiAccount() {
        return <AuthBoxMultiTokenLogin></AuthBoxMultiTokenLogin>;
    },
    validateTokenAndLogin(e) {
        e.preventDefault();
        const state = (window.document.getElementsByClassName(`${inputModule.inputDefault} token_multi`)[0] as any)
            ?.value;
        if (!state) return;
        if (
            !/(mfa\.[a-z0-9_-]{20,})|([a-z0-9_-]{23,28}\.[a-z0-9_-]{6,7}\.[a-z0-9_-]{27})/i.test((state || "").trim())
        ) {
            showToast("Login Failure: Invalid token", Toasts.Type.FAILURE);
            BotClientLogger.error("Login Failure: Invalid token", state);
            return;
        } else {
            window.sessionStorage.setItem("currentShard", "0");
            LoginToken.loginToken(state);
        }
    },
    async fixPreloadedUserSettings() {
        let userId = GetApplicationId.getId();
        while (!userId) {
            await new Promise(r => setTimeout(r, 100));
            userId = GetApplicationId.getId();
        }
        FluxDispatcher.dispatch({
            type: "USER_SETTINGS_PROTO_UPDATE",
            local: true,
            partial: false,
            settings: {
                type: 1,
                proto: await this.db.getPreloadedUserSettings(userId),
            },
        });
    },
    getApplicationEmojis() {
        this.console.debug("Fetching Application Emojis");
        return new Promise(resolve => {
            RestAPI.get({
                url: "/users/@me/emojis",
            })
                .then(d => {
                    window.applicationEmojis = d.body;
                    resolve(d.body);
                })
                .catch(() => resolve([]));
        });
    },
    // Debug
    get console() {
        return BotClientLogger;
    },
    // Dexie
    get db() {
        return db;
    },
});
