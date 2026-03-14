/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findStoreLazy } from "@webpack";
import { ChannelStore, FluxDispatcher, RestAPI, Toasts, UserStore } from "@webpack/common";

import { originalSessionStorage } from "./common";

// Vencord.Webpack.findByProps('getSocket').getSocket()
const GatewayConnectionStore: {
    getSocket: () => ({
        send: (op: number, data: any) => void;
    });
} = findStoreLazy("GatewayConnectionStore");

// Vencord.Webpack.findByProps('getGuildExperimentBucket').getRegisteredExperiments()
const ExperimentStore: {
    getRegisteredExperiments: () => ({
        [id: string]: any;
    });
} = findStoreLazy("ExperimentStore");

let latestGuildIdVoiceConnect: string = "0";

export async function updateGuildSubscriptionsPatch(data: {
    [guildId: string]: Partial<
        {
            thread_member_lists: string[]; // ThreadIds[]
            channels: {
                [channelId: string]: [number, number]; // [rangeStart, rangeEnd]
            };
            activities: boolean;
            threads: boolean;
            typing: boolean;
        }
    >;
}) {
    const threadId = Object.values(data)?.[0]?.thread_member_lists?.[0];
    const guildId = Object.keys(data)?.[0];
    // This function runs before transitionTo actually applies the new data.
    if (threadId && guildId) {
        // https://docs.discord.com/developers/resources/channel#list-thread-members
        const { body } = await RestAPI.get({
            url: `/channels/${threadId}/thread-members`, // '/channels/' + threadId + '/thread-members?with_member=true',
            query: {
                with_member: true,
            },
        });
        if (!body || !Array.isArray(body) || body.length === 0) return;
        FluxDispatcher.dispatch({
            threadId,
            guildId,
            members: body.map(_ => ({
                ..._,
                presence: null,
            })),
            type: "THREAD_MEMBER_LIST_UPDATE",
        });
    }
    return;
}

export function voiceStateUpdatePatch(data: {
    guildId: string | null;
    channelId: string | null;
    selfMute: boolean;
    selfDeaf: boolean;
    selfVideo: boolean;
    preferredRegion: null;
    preferredRegions: null;
    videoStreamParameters: null;
    flags: number;
}, callback: (op: number, data: any) => void) {
    // Overwrite videoStreamParameters to null
    data.videoStreamParameters = null;
    if (data.guildId) {
        // Switching VoiceChannel
        if (data.guildId !== latestGuildIdVoiceConnect) {
            // Send Disconnect for previous Guild
            callback(4, {
                guild_id: latestGuildIdVoiceConnect,
                channel_id: null,
                self_mute: data.selfMute,
                self_deaf: data.selfDeaf,
            });
            // Switch Guild
            latestGuildIdVoiceConnect = data.guildId;
        } // else, just update the current VoiceState without disconnecting
    } else {
        // Leaving VoiceChannel
        data.guildId = (latestGuildIdVoiceConnect === "0") ? null : latestGuildIdVoiceConnect;
        latestGuildIdVoiceConnect = "0";
    }
    return data;
}

export function handleClosePatch(event: any, closeCode: number, reason: string) {
    if (closeCode === 4013) {
        Toasts.show({
            message: "Login Failure: Invalid intent(s), Logout...",
            id: Toasts.genId(),
            type: Toasts.Type.FAILURE,
        });
        closeCode = 4004;
    } else if (closeCode === 4014) {
        Toasts.show({
            message: "Login Failure: Disallowed intent(s), Logout...",
            id: Toasts.genId(),
            type: Toasts.Type.FAILURE,
        });
        closeCode = 4004;
    }
    return closeCode;
}

export function handleDispatchPatch(data: any, eventName: string, n: any, receiveDispatch: (data: any, eventName: string, n: any) => void, self: any) {
    if (eventName === "MESSAGE_CREATE" && !data.guild_id && !ChannelStore.getChannel(data.channel_id)) {
        RestAPI.get({
            url: `/channels/${data.channel_id}`,
        }).then((d: any) => d.body).then(channel => {
            receiveDispatch(channel, "CHANNEL_CREATE", n);
            // https://discord.com/developers/docs/resources/channel#channel-object-channel-types
            // 1 = DM
            if (self.settings.store.saveDirectMessage && channel.type === 1) {
                // https://discord.com/developers/docs/resources/channel#channel-object
                self.db.handleOpenPrivateChannel(
                    UserStore.getCurrentUser().id,
                    channel.recipients[0].id,
                    channel.id
                );
                self.console.debug("[Client > Electron] Add Private channel (From MESSAGE_CREATE event)");
            }
        }).catch((err: any) => {
            self.console.debug(`[Client > Electron] Get from /channels/${data.channel_id} error`, err);
        }).finally(() => {
            return receiveDispatch(data, eventName, n);
        });
        return false;
    }
    if (eventName === "READY_SUPPLEMENTAL") {
        self.console.log("[Client]: Ready Supplemental event", data);
        // Patch Status
        const status = Vencord.Api.UserSettings.getUserSetting("status", "status")?.getSetting() || "online";
        const customStatus = Vencord.Api.UserSettings.getUserSetting("status", "customStatus")?.getSetting();
        const activities: any[] = [];
        if (customStatus) {
            activities.push({
                "name": "Custom Status",
                "type": 4,
                "state": customStatus.text,
                // Bot cannot use emoji;
            });
        }
        // Set Presence
        GatewayConnectionStore.getSocket().send(3, {
            status,
            since: null,
            activities,
            afk: false
        });
        // Patch fixPreloadedUserSettings
        self.fixPreloadedUserSettings();
        // Application Emojis
        self.getApplicationEmojis();
    }
    if (eventName === "READY") {
        self.console.log("[Client]: Ready event", data);
        // Experiments
        const experiments = Object.entries(ExperimentStore.getRegisteredExperiments())
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => {
                const titleA = a.title.toLowerCase();
                const titleB = b.title.toLowerCase();
                return titleA < titleB ? -1 : titleA > titleB ? 1 : 0;
            })
            .filter(exp => exp.type === "user");

        // Private Channels
        const defaultPrivateChannel = window.BotClientNative.getPrivateChannelDefault();
        if (self.settings.store.saveDirectMessage) {
            self.db.queryAllPrivateChannel(data.user.id).then(dms => {
                dms.map(channel => receiveDispatch(channel.data, "CHANNEL_CREATE", null));
            });
        }

        // It's not working (cannot using await)
        // ${data}.user_settings_proto = await $self.db.getPreloadedUserSettingsBase64(${data}.user.id);

        // CurrentUser
        data.user.premium = true;
        data.user.premium_type = 2;
        data.user.mfa_enabled = 1;
        data.user.purchased_flags = 3;
        data.user.phone = "33550336";
        data.user.verified = true;
        data.user.mobile = true;
        data.user.desktop = true;
        data.user.nsfw_allowed = true;
        data.user.email = `${data.user.id}@cyrene.moe`;
        data.user.age_verification_status = 3;

        // Empty Arrays
        data.sessions = [];
        data.relationships = [];
        data.connected_accounts = [];
        data.broadcaster_user_ids = [];
        data.linked_users = [];
        data.guild_join_requests = [];

        // Null values
        data.tutorial = null;
        data.pending_payments = null;
        data.analytics_token = null;
        // ${data}.apex_experiments = null; ????

        // Number values
        data.explicit_content_scan_version = 2;
        data.friend_suggestion_count = 0;

        // Objects values
        data.read_state = {
            version: 0,
            partial: false,
            entries: [],
        };
        data.auth = {
            authenticator_types: [2, 3],
        };
        data.consents = {
            personalization: {
                consented: false,
            },
        };
        data.notification_settings = {
            flags: 0,
        };
        data.user_guild_settings = {
            entries: [],
            version: 0,
            partial: false,
        };

        // Other values
        data.country_code = "US";
        data.private_channels = [defaultPrivateChannel];
        data.guild_experiments = window.BotClientNative.getGuildExperiments();
        data.experiments = window.BotClientNative.getUserExperiments(experiments, data.user.id);
        data.apex_experiments = window.BotClientNative.getApexExperiments(data.user.id);
        data.auth_session_id_hash = btoa("aiko-chan-ai/DiscordBotClient");
        data.static_client_session_id = crypto.randomUUID();
        data.users = [
            defaultPrivateChannel.recipients[0],
            ...(data.users || []),
        ];
    }
    return data;
}

export async function doIdentifyFirstPatch(token: string, self: any, handleCloseCallback: (event: any, closeCode: number, reason: string) => void) {
    const botInfo = await window.BotClientNative.getBotInfo(token);
    self.console.log("[Electron > Client] Discord Bot metadata", botInfo);
    if (!botInfo.success) {
        Toasts.show({
            message: `Login Failure: ${botInfo.message}`,
            id: Toasts.genId(),
            type: Toasts.Type.FAILURE,
        });
        handleCloseCallback(true, 4004, botInfo.message);
        return null;
    }
    const { intents, allShards } = botInfo;
    originalSessionStorage.setItem("allShards", botInfo.allShards);
    // Session Storage
    if (originalSessionStorage.getItem("currentShard") === null || parseInt(originalSessionStorage.getItem("currentShard")!) + 1 > allShards) {
        originalSessionStorage.setItem("currentShard", "0");
    }
    // Reset Voice State
    latestGuildIdVoiceConnect = "0";
    self.console.log(`[Client > Electron] Bot Intents: ${intents} Shard ID: ${originalSessionStorage.getItem("currentShard")} (All: ${botInfo.allShards} )`);
    Toasts.show({
        message: `Bot Intents: ${intents}`,
        id: Toasts.genId(),
        type: Toasts.Type.SUCCESS,
    });
    Toasts.show({
        message: `Shard ID: ${originalSessionStorage.getItem("currentShard")} (All: ${botInfo.allShards})`,
        id: Toasts.genId(),
        type: Toasts.Type.SUCCESS,
    });
    return botInfo;
}

export async function openPrivateChannelPatch(e: any, this_args: any, self: any) {
    const { recipientIds: t, joinCall: n = !1, joinCallVideo: i = !1, location: o, onBeforeTransition: a, navigateToChannel: s = !0 } = e; // Copy from original code
    const l = this_args._getRecipients(t); // user_ids[];
    const userId = l[0];
    if (!userId) {
        self.console.error("Cannot open private channel without user ID", e, l);
        Toasts.show({
            message: "Cannot open private channel without user ID",
            id: Toasts.genId(),
            type: Toasts.Type.FAILURE,
        });
        return null;
    }
    if (UserStore.getUser(userId)?.bot) {
        Toasts.show({
            message: "Cannot send messages to this bot",
            id: Toasts.genId(),
            type: Toasts.Type.FAILURE,
        });
        return null;
    }
    const result = await this_args.openPrivateChannel_(e);
    if (self.settings.store.saveDirectMessage) {
        self.db.handleOpenPrivateChannel(
            Vencord.Webpack.Common.UserStore.getCurrentUser().id,
            userId,
            result
        );
        self.console.debug("[Client > Electron] Add Private channel (From openPrivateChannel function)");
    }
    return result;
}
