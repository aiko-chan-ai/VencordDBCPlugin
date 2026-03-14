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
import definePlugin, { OptionType } from "@utils/types";
import { Channel, Guild, Role, type UserStore as UserStoreType } from "@vencord/discord-types";
import { DraftType } from "@vencord/discord-types/enums";
import { findByCodeLazy, findByProps, findByPropsLazy, findStore } from "@webpack";
import {
    Alerts,
    ChannelStore,
    Constants,
    DraftStore,
    EmojiStore,
    FluxDispatcher,
    GuildMemberStore,
    GuildRoleStore,
    GuildStore,
    IconUtils,
    MessageActions,
    NavigationRouter,
    PermissionsBits,
    PresenceStore,
    React,
    RestAPI,
    showToast,
    Toasts,
    UserStore,
    VoiceStateStore
} from "@webpack/common";

import AuthBoxMultiTokenLogin from "./components/AuthBoxMultiTokenLogin";
import AuthBoxTokenLogin, { inputModule } from "./components/AuthBoxTokenLogin";
// Components
import { IconEmbedSvg } from "./icon.svg";
import type { EmojiGuildData, Group, List, MemberPatch, OpItem, Ops } from "./typing/index.d.ts";
import { originalSessionStorage, RegExToken } from "./utils/common";
import db from "./utils/database";
import { hasEmbedPerms } from "./utils/fakeNitroPlugin";
import { doIdentifyFirstPatch, handleClosePatch, handleDispatchPatch, openPrivateChannelPatch, updateGuildSubscriptionsPatch, voiceStateUpdatePatch } from "./utils/patches";
import { SnowflakeUtil } from "./utils/SnowflakeUtil";
import { PendingReplyStore, uploadFile } from "./utils/voiceMessagePlugin";

const GetToken = findByPropsLazy("getToken", "setToken");
const LoginToken = findByPropsLazy("loginToken", "login");
const murmurhash = findByPropsLazy("v3", "v2");
const GetApplicationId = findByPropsLazy("getToken", "getId", "getSessionId");

const getDraft = (channelId: string) => DraftStore.getDraft(channelId, DraftType.ChannelMessage);

const BotClientLogger = new Logger("BotClient", "#f5bde6");

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

let currentMessageHandler: ((event: MessageEvent) => Promise<void>) | null = null;

const requestOpenMessageEditorWindow = (
    channelId: string,
    messageId: string | null,
    mode: "create" | "edit",
    hasComponentV2: boolean,
    initMessage: any,
) => {
    if (currentMessageHandler) {
        window.removeEventListener("message", currentMessageHandler);
    }
    window.BotClientNative.requestOpenMessageEditorWindow();
    currentMessageHandler = async event => {
        if (event.source === window && event.data === "forward-editor-port") {
            const port = event.ports[0];
            if (window.editorPort) {
                window.editorPort.close();
            } else {
                window.editorPort = null;
            }
            window.editorPort = port;
            port.onmessage = async event => {
                BotClientLogger.info("Received message from Editor", event.data);
                const webMessage = event.data as {
                    action: "send" | "edit";
                    profile: {
                        username: string;
                        avatar_url: string;
                        token: string;
                    };
                    messages: { _id: string; data: any; }[];
                    files: { name; size; type; buffer: ArrayBuffer; }[];
                    type: string;
                };
                if (webMessage.type === "submit") {
                    if (webMessage.files.length > 0) {
                        showToast("Uploading attachments... Please be patient", Toasts.Type.MESSAGE);
                    }
                    const attachments: {
                        id: string;
                        filename: string;
                        uploaded_filename: string;
                    }[] = [];
                    for (let index_file = 0; index_file < webMessage.files.length; index_file++) {
                        const f = webMessage.files[index_file];
                        const blob = new Blob([f.buffer], { type: f.type });
                        await uploadFile(channelId, f.name, f.type, blob)
                            .then(res => {
                                attachments.push({
                                    id: index_file.toString(),
                                    filename: res.filename,
                                    uploaded_filename: res.uploadedFilename,
                                });
                            })
                            .then(() => {
                                BotClientLogger.info(
                                    `File uploaded: ${f.name} (${f.size} bytes) - ${index_file + 1}/${webMessage.files.length}`,
                                );
                            })
                            .catch(e => {
                                BotClientLogger.error(e);
                                showToast(`Failed to upload file: ${f.name}`, Toasts.Type.FAILURE);
                            });
                    }
                    const message = webMessage.messages[0].data;
                    if (webMessage.action === "send") {
                        RestAPI.post({
                            url: Constants.Endpoints.MESSAGES(channelId),
                            body: {
                                ...message,
                                attachments,
                            },
                        })
                            .then(() => {
                                // Clear draft after sending message
                                // Clear reply
                                FluxDispatcher.dispatch({ type: "DELETE_PENDING_REPLY", channelId });
                                // Clear Draft message
                                FluxDispatcher.dispatch({
                                    type: "DRAFT_CLEAR",
                                    channelId,
                                    draftType: DraftType.ChannelMessage,
                                });
                                // Clear attachments
                                FluxDispatcher.dispatch({
                                    type: "UPLOAD_ATTACHMENT_CLEAR_ALL_FILES",
                                    channelId,
                                    draftType: DraftType.ChannelMessage,
                                });
                                return showToast("Message has been sent successfully", Toasts.Type.SUCCESS);
                            })
                            .catch(e => {
                                return sendBotMessage(channelId, {
                                    content: `\`❌\` An error occurred during sending message\nDiscord API Error [${e.body.code}]: ${e.body.message}`,
                                });
                            });
                    } else if (webMessage.action === "edit") {
                        RestAPI.patch({
                            url: `/channels/${channelId}/messages/${messageId}`,
                            body: {
                                // Clear content and embeds if they are not included in the edited message to prevent duplication since Editor always sends the full message object instead of just the diff
                                content: null,
                                embeds: [],
                                ...message,
                                attachments,
                            },
                        })
                            .then(() => {
                                return showToast("Message has been edited successfully!", Toasts.Type.SUCCESS);
                            })
                            .catch(e => {
                                return sendBotMessage(channelId, {
                                    content: `\`❌\` An error occurred during editing message\nDiscord API Error [${e.body.code}]: ${e.body.message}`,
                                });
                            });
                    }
                }
            };
            const currentUser = UserStore.getCurrentUser();
            port.start();
            // Initial data for Editor
            // Emojis
            const emojis: EmojiGuildData[] = [];
            // Application Emojis
            if (window.applicationEmojis && Array.isArray(window.applicationEmojis)) {
                emojis.push({
                    guild_id: null,
                    icon_url: currentUser.getAvatarURL(),
                    name: "Application Emojis",
                    emojis: window.applicationEmojis,
                });
            }
            for (const guild of GuildStore.getGuildsArray()) {
                const obj: EmojiGuildData = {
                    guild_id: guild.id,
                    name: guild.name,
                    icon_url: IconUtils.getGuildIconURL({
                        id: guild.id,
                        icon: guild.icon,
                        size: 512,
                        canAnimate: true,
                    }),
                    emojis: [],
                };
                const guildEmojis = EmojiStore.getUsableGuildEmoji(guild.id);
                for (const emoji of guildEmojis) {
                    obj.emojis.push({
                        id: emoji.id,
                        name: emoji.name,
                        animated: emoji.animated,
                    });
                }
                emojis.push(obj);
            }
            const initData = {
                type: "init",
                profile: {
                    username: currentUser.username,
                    avatar_url: currentUser.getAvatarURL(),
                    token: "<not actually used>",
                },
                mode: {
                    type: mode, // create | edit
                    messageType: hasComponentV2 ? "components-v2" : "standard", // standard | components-v2
                },
                messages: [
                    {
                        data: initMessage,
                        _id: crypto.randomUUID(), // Just a random ID for Editor to identify the message, not related to actual Discord message ID
                    },
                ],
                emojis,
                timestamp: Date.now(),
                timestring: new Date().toLocaleString(),
            };
            BotClientLogger.info("Posting initial data to Editor", initData);
            port.postMessage(initData);
        }
    };
    window.addEventListener("message", currentMessageHandler);
};

const CreateAdvancedMessageEditor: ChatBarButtonFactory = prop => {
    const handle = () => {
        const channelId = prop.channel.id;
        // New message
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
                            You are trying to send a embed, however you do not have permissions to embed links in the
                            current channel.
                        </Paragraph>
                    </div>
                ),
            });
        }
        // idk how to pass attachments to Editor
        const reply = PendingReplyStore.getPendingReply(channelId);
        const content = getDraft(channelId) || undefined;
        requestOpenMessageEditorWindow(channelId, null, "create", false, {
            content,
            message_reference: reply ? MessageActions.getSendMessageOptionsForReply(reply)?.messageReference : null,
        });
    };
    return (
        <ChatBarButton onClick={handle} tooltip="Advanced Message Editor (Beta)">
            <IconEmbedSvg />
        </ChatBarButton>
    );
};

const EditAdvancedMessageEditor = msg => {
    const handler = async () => {
        showToast("Fetching message...", Toasts.Type.MESSAGE, {
            position: Toasts.Position.TOP,
        });
        // Fetch raw msg from discord
        const msgRaw = await RestAPI.get({
            url: `/channels/${msg.channel_id}/messages/${msg.id}`,
        });
        const channelId = msg.channel_id;
        const messageId = msg.id;
        requestOpenMessageEditorWindow(
            channelId,
            messageId,
            "edit",
            (msgRaw.body.flags & (1 << 15)) !== 0,
            msgRaw.body,
        );
    };
    if (msg.author.id === GetApplicationId.getId()) {
        return {
            label: "Advanced Message Editor (Beta)",
            icon: IconEmbedSvg,
            message: msg,
            channel: ChannelStore.getChannel(msg.channel_id),
            onClick: handler,
            onContextMenu: handler,
        };
    } else {
        return null;
    }
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
            find: "unranked_game_entries.map",
            replacement: [
                {
                    // let e=n?c?.unranked_game_entries.map(e=>e.content):c?.entries.map(e=>e.content);
                    match: /(\w+\?\w+\?\.unranked_game_entries\.map\(\w+=>\w+\.content\):\w+\?\.entries\.map\(\w+=>\w+\.content\))/,
                    replace: "[]",
                },
            ],
        },
        {
            // Remove/Patch unused bot ws opcode
            find: "voiceServerPing(){",
            replacement: [
                {
                    match: /(updateGuildSubscriptions\(\w+\){)/,
                    replace: "$& return $self.updateGuildSubscriptionsPatch(arguments[0]);",
                },
                // Leave / Switch VoiceChannel
                {
                    match: /(voiceStateUpdate\()(\w+)(\){)/,
                    replace: "$& $2 = $self.voiceStateUpdatePatch($2, this.send.bind(this));",
                },
                // Disable Events:
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
            ],
        },
        {
            // Patch opcode 2 (identify) and events
            find: "window.GLOBAL_ENV.GATEWAY_ENDPOINT;",
            replacement: [
                {
                    // Patch Close code
                    // _handleClose(e,t,n){
                    match: /(_handleClose\()(\w+)(,)(\w+)(,)(\w+)(\){)/,
                    //      $1               $2  $3  $4  $5  $6    $7
                    // e = event, t = closeCode, n = reason
                    replace: "$& $4=$self.handleClosePatch($2, $4, $6);",
                },
                // Handle Events
                {
                    // _handleDispatch(e,t,n){
                    // e = data, t = eventName, n = N ???
                    match: /(_handleDispatch\()(\w+)(,)(\w+)(,)(\w+)(\){)/,
                    //      $1                  $2  $3  $4  $5  $6    $7
                    replace: "$& $2=$self.handleDispatchPatch($2,$4,$6,this.dispatcher.receiveDispatch.bind(this.dispatcher),$self);if(!$2)return;",
                },
                // _doIdentify
                {
                    match: /(this\.token=)(\w+)(,)(\w+)(\.verbose\("\[IDENTIFY\]"\);)/,
                    //       $1            $2   $3  $4       $5
                    replace: "$& $2=$2.replace(/bot/gi,\"\").trim();this.token=$2;const botInfo = await $self.doIdentifyFirstPatch($2, $self, this._handleClose.bind(this));if(!botInfo)return;"
                },
                // Sharding
                {
                    match: /(token:\w+)(,capabilities:)/,
                    replace: "$1,intents:botInfo.intents,shard:[parseInt($self.sessionStorage.getItem('currentShard')||0),botInfo.allShards]$2",
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
                    replace: "$1 0},",
                },
                {
                    // If user account is already logged in, proceed to log out
                    // if(e.user.bot){ (old)
                    // e.user.bot?X({type:"LOGOUT"}):E.A.ready.measure... (new)
                    match: /(\w+)\.user\.bot\?/,
                    replace: "!$1.user.bot?",
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
                    //       $1                          $2
                    replace: "openPrivateChannel(e){return $self.openPrivateChannelPatch(e, this, $self);},$1_$2",
                },
                {
                    match: /(closePrivateChannel\(\w+\){)/,
                    replace: "$& if ($self.settings.store.saveDirectMessage) $self.db.handleClosePrivateChannel(Vencord.Webpack.Common.UserStore.getCurrentUser().id, arguments[0]);",
                },
            ],
        },
        // Fix unread message
        {
            find: "}getOldestUnreadMessageId(",
            replacement: [
                {
                    match: /(}getOldestUnreadMessageId\(\w+\){)/,
                    replace: "$&return null;",
                },
                {
                    match: /(}getOldestUnreadTimestamp\(\w+\){)/,
                    replace: "$&return 0;",
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
        // === Apply Patches from Vesktop ===
        // src > renderer > patches > windowsTitleBar.tsx
        {
            find: ".USE_OSX_NATIVE_TRAFFIC_LIGHTS",
            replacement: [
                {
                    match: /case \i\.\i\.WINDOWS:/,
                    replace: 'case "WEB":',
                },
            ],
        },
        // Visual Refresh
        {
            find: '"refresh-title-bar-small"',
            replacement: [
                {
                    match: /\i===\i\.PlatformTypes\.WINDOWS/g,
                    replace: "true",
                },
                {
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
        // src > renderer > patches > devtoolsFixes.ts
        // Discord Web blocks the devtools keybin on mac specifically, disable that
        {
            find: '"mod+alt+i"',
            replacement: {
                match: /"discord\.com"===location\.host/,
                replace: "false",
            },
        },
        {
            // Custom patch
            // Instead of trying to precisely identify which events should “hide” the token in localStorage, I chose to disable this feature entirely.
            // This client is intended for power users anyway - no one would leave their token exposed while opening devtools, right?
            find: ".setDevtoolsCallbacks(",
            replacement: [
                // from noDevtoolsWarning plugin
                // If noDevtoolsWarning plugin is enabled, this patch won't work.
                {
                    match: /if\(null!=\i&&"0.0.0"===\i\.app\.getVersion\(\)\)/,
                    replace: "if(true)",
                },
                // ? - from Vesktop
                {
                    match: /if\(null!=(\i)\)(?=.{0,50}\1\.window\.setDevtoolsCallbacks)/,
                    replace: "if(true)",
                },
            ],
        },
        // src > renderer > patches > enableNotificationsByDefault.ts
        {
            find: '"NotificationSettingsStore',
            replacement: {
                match: /\.isPlatformEmbedded(?=\?\i\.\i\.ALL)/g,
                replace: "$&||true",
            },
        },
        // src > renderer > patches > hideDownloadAppsButton.ts
        {
            find: '"app-download-button"',
            replacement: {
                match: /return(?=.{0,50}id:"app-download-button")/,
                replace: "return null;return",
            },
        },
        // src > renderer > patches > taskBarFlash.ts
        {
            find: ".flashFrame(!0)",
            replacement: {
                match: /(\i)&&\i\.\i\.taskbarFlash&&\i\.\i\.flashFrame\(!0\)/,
                replace: "BotClientNative.flashFrame(true)",
            },
        },
        // === End Vesktop Patches ===
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
                    if (messages.length < 2) {
                        return sendBotMessage(ctx.channel.id, {
                            content: "Not enough messages to delete (messages must be less than 14 days old)",
                        });
                    }
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
                        const allShards = parseInt((originalSessionStorage.getItem("allShards") as string) || "0");
                        if (id < 0 || id + 1 > allShards) {
                            sendBotMessage(ctx.channel.id, {
                                content: `### Invalid shardId\n🚫 Must be greater than or equal to **0** and less than or equal to **${allShards - 1}**.\n**${id}** is an invalid number`,
                            });
                        } else {
                            originalSessionStorage.setItem("currentShard", id as any);
                            LoginToken.loginToken(GetToken.getToken());
                        }
                        break;
                    }
                    case "guild": {
                        const guild = findOption<string>(subCommand.options, "id", "");
                        const allShards = parseInt((originalSessionStorage.getItem("allShards") as string) || "0");
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
                        originalSessionStorage.setItem("currentShard", shardId as any);
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
        /*
        Object.keys(RelationshipsModule).forEach(a => {
            RelationshipsModule[a] = function () {
                showToast(
                    `${window.BotClientNative.getBotClientName()} cannot use Relationships Module`,
                    Toasts.Type.FAILURE,
                );
                return Promise.reject(`${window.BotClientNative.getBotClientName()} cannot use Relationships Module`);
            };
        });
        */
        const methodsToBlock = [
            "sendRequest",
            "addRelationship",
            "acceptFriendRequest",
            "cancelFriendRequest",
            "removeFriend",
            "blockUser",
            "unblockUser",
            "removeRelationship",
            "updateRelationship",
            "fetchRelationships",
            "confirmClearPendingRelationships",
            "clearPendingRelationships",
            "clearPendingSpamAndIgnored",
            "ignoreUser",
            "unignoreUser",
        ];
        for (const method of methodsToBlock) {
            if (typeof RelationshipsModule[method] === "function") {
                RelationshipsModule[method] = function () {
                    showToast(
                        `${window.BotClientNative.getBotClientName()} cannot use Relationships Module`,
                        Toasts.Type.FAILURE,
                    );
                    return Promise.reject(
                        `${window.BotClientNative.getBotClientName()} cannot use Relationships Module`,
                    );
                };
            }
        }
        // Patch getCurrentUser in UserStore
        const UserStorePatch = findStore("UserStore") as UserStoreType;
        UserStorePatch.getCurrentUser = function () {
            const user = UserStorePatch.getUsers()[GetApplicationId.getId()];
            if (!user) return user;
            user.desktop = true;
            user.mobile = true;
            // @ts-expect-error ignore
            user.premiumState = {
                premiumSubscriptionType: 4,
                premiumSource: 1,
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
        InviteModule.acceptInvite = async function (e) {
            if (parseInt(originalSessionStorage.getItem("allShards") || "0") > 1) {
                const invite = await this.resolveInvite(e.inviteKey);
                const guildId = invite.invite.guild_id;
                const channelId = invite.invite.channel.id;
                if (!guildId) {
                    Toasts.show({
                        message: `${window.BotClientNative.getBotClientName()} cannot join guilds`,
                        id: Toasts.genId(),
                        type: Toasts.Type.FAILURE,
                    });
                    throw new Error(`${window.BotClientNative.getBotClientName()} cannot join guilds`);
                } else {
                    const res = await RestAPI.get({
                        url: "/guilds/" + guildId,
                    }).catch(e => e);
                    if (res.ok) {
                        const shardId = Number(
                            (BigInt(guildId) >> 22n) %
                            BigInt(parseInt(originalSessionStorage.getItem("allShards") || "0")),
                        );
                        originalSessionStorage.setItem("currentShard", shardId.toString());
                        await LoginToken.loginToken(GetToken.getToken());
                        return NavigationRouter.transitionToGuild(guildId, channelId);
                    } else {
                        Toasts.show({
                            message: `${window.BotClientNative.getBotClientName()} cannot join guilds`,
                            id: Toasts.genId(),
                            type: Toasts.Type.FAILURE,
                        });
                        throw new Error(`${window.BotClientNative.getBotClientName()} cannot join guilds`);
                    }
                }
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
            return Promise.reject(`${window.BotClientNative.getBotClientName()} cannot use Guild Templates`);
        };
    },
    chatBarButton: {
        icon: IconEmbedSvg,
        render: CreateAdvancedMessageEditor,
    },
    messagePopoverButton: {
        icon: IconEmbedSvg,
        render: EditAdvancedMessageEditor,
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
        const sortedLists = [...allLists.values()].sort(
            (a, b) =>
                // group.id = role.id
                (guildRoles[b.group.id]?.position ?? 0) - (guildRoles[a.group.id]?.position ?? 0),
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
    // Permission cache to avoid recomputing for every member on each event
    _permissionCache: new Map<string, boolean>(),
    _cachedGuildId: null as string | null,
    _cachedChannelId: null as string | null,
    _invalidatePermCache() {
        this._permissionCache.clear();
        this._cachedGuildId = null;
        this._cachedChannelId = null;
    },
    _invalidatePermCacheForMember(channelId: string, userId: string) {
        this._permissionCache.delete(`${channelId}:${userId}`);
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
        // Invalidate permission cache when guild/channel context changes
        if (guild.id !== this._cachedGuildId || channel.id !== this._cachedChannelId) {
            this._permissionCache.clear();
            this._cachedGuildId = guild.id;
            this._cachedChannelId = channel.id;
        }

        // Invalidate cache based on event type
        switch (location) {
            case "GuildRoleUpdate":
            case "GuildRoleCreate":
            case "GuildRoleDelete":
                // Role changes can affect any member's permissions
                this._permissionCache.clear();
                break;
            case "GuildMemberUpdate":
                // Only the updated member's permissions may have changed
                if (anyLog?.user?.id) {
                    this._invalidatePermCacheForMember(channel.id, anyLog.user.id);
                }
                break;
            case "GuildMemberAdd":
                // New member — no cache entry yet, nothing to invalidate
                break;
            case "GuildMemberRemove":
                // Remove stale cache entry
                if (anyLog?.user?.id) {
                    this._invalidatePermCacheForMember(channel.id, anyLog.user.id);
                }
                break;
            // PresenceUpdates, ChannelPreload: permissions unchanged, skip invalidation
        }

        // GuildMembers Patch
        const allMembers = GuildMemberStore.getMembers(guild.id);
        const memberCount = allMembers.length;
        const membersOffline: MemberPatch[] = [];
        const membersOnline: MemberPatch[] = [];

        for (const m of allMembers) {
            const cacheKey = `${channel.id}:${m.userId}`;
            let canView = this._permissionCache.get(cacheKey);
            if (canView === undefined) {
                canView = !!(
                    computePermissions({
                        user: { id: m.userId },
                        context: guild,
                        overwrites: channel.permissionOverwrites,
                    }) & PermissionsBits.VIEW_CHANNEL
                );
                this._permissionCache.set(cacheKey, canView);
            }
            if (canView) {
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
        }

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
        if (!RegExToken.test((state || "").trim())) {
            showToast("Login Failure: Invalid token", Toasts.Type.FAILURE);
            BotClientLogger.error("Login Failure: Invalid token", state);
            return;
        } else {
            originalSessionStorage.setItem("currentShard", "0");
            LoginToken.loginToken(state);
        }
    },
    async fixPreloadedUserSettings() {
        let userId = GetApplicationId.getId();
        const stopTime = Date.now() + 10000;
        while (!userId) {
            if (Date.now() > stopTime) {
                BotClientLogger.error("Failed to get application ID after 10 seconds");
                return;
            }
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
    get sessionStorage() {
        return originalSessionStorage;
    },
    // Patches
    updateGuildSubscriptionsPatch,
    voiceStateUpdatePatch,
    handleClosePatch,
    handleDispatchPatch,
    doIdentifyFirstPatch,
    openPrivateChannelPatch,
});
