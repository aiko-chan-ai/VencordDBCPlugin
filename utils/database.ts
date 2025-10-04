/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Logger } from "@utils/Logger";
import Dexie, { type EntityTable } from "dexie";

import {
    DefaultFrecencyUserSettings,
    DefaultPreloadedUserSettings,
    FrecencyUserSettings,
    PreloadedUserSettings,
} from "./proto";

export interface Channel {
    channelId: string; // primary key
    botId: string; // indexed
    data: Record<string, any>; // json
}

export interface PreloadedUserSettingsEntry {
    botId: string; // primary key
    data: PreloadedUserSettings; // protobuf
}

export interface FrecencyUserSettingsEntry {
    botId: string; // primary key
    data: FrecencyUserSettings; // protobuf
}

export type DexieExtended = Dexie & {
    PrivateChannel: EntityTable<Channel, "channelId">;
    PreloadedUserSettings: EntityTable<PreloadedUserSettingsEntry, "botId">;
    FrecencyUserSettings: EntityTable<FrecencyUserSettingsEntry, "botId">;
};

const logger = new Logger("BotClient:Database", "#B3EBF2");

export class BotClientDatabase {
    #db: DexieExtended;
    get database() {
        return this.#db;
    }
    constructor(name: string) {
        this.#db = new Dexie(name) as DexieExtended;
        this.init();
    }
    init() {
        logger.log("Initializing database");
        this.database.version(1).stores({
            PrivateChannel: "channelId, botId",
            PreloadedUserSettings: "botId",
            FrecencyUserSettings: "botId",
        });
    }
    queryAllPrivateChannel(botId: string) {
        logger.log("Querying all private channels for bot", botId);
        return this.database.PrivateChannel.where("botId").equals(botId).toArray();
    }
    handleOpenPrivateChannel(botId: string, userId: string, channelId: string) {
        logger.log("Opening private channel", { botId, userId, channelId });
        return this.database.PrivateChannel.put({
            botId,
            channelId,
            data: {
                type: 1,
                recipients: [
                    {
                        id: userId,
                    },
                ],
                last_message_id: null,
                is_spam: false,
                id: channelId,
                flags: 0,
            },
        });
    }
    handleClosePrivateChannel(botId: string, channelId: string) {
        logger.log("Closing private channel", { botId, channelId });
        return this.database.PrivateChannel.where({ botId, channelId }).delete();
    }
    clearDMsCache(botId: string) {
        logger.log("Clearing DMs cache for bot", botId);
        return this.database.PrivateChannel.where("botId").equals(botId).delete();
    }
    async getPreloadedUserSettings(botId: string) {
        logger.log("Getting preloaded user settings for bot", botId);
        const v = await this.database.PreloadedUserSettings.get(botId);
        if (!v) {
            logger.warn("No preloaded user settings found, creating default");
            await this.database.PreloadedUserSettings.put({
                botId,
                data: DefaultPreloadedUserSettings,
            });
            return DefaultPreloadedUserSettings;
        } else {
            // v.data.userContent = DefaultPreloadedUserSettings.userContent;
            return v.data;
        }
    }
    async getFrecencyUserSettings(botId: string) {
        logger.log("Getting frecency user settings for bot", botId);
        const v = await this.database.FrecencyUserSettings.get(botId);
        if (!v) {
            logger.warn("No frecency user settings found, creating default");
            await this.database.FrecencyUserSettings.put({
                botId,
                data: DefaultFrecencyUserSettings,
            });
            return DefaultFrecencyUserSettings;
        } else {
            return v.data;
        }
    }
    async getPreloadedUserSettingsBase64(botId: string) {
        const data = await this.getPreloadedUserSettings(botId);
        return PreloadedUserSettings.toBase64(data);
    }
    async getFrecencyUserSettingsBase64(botId: string) {
        const data = await this.getFrecencyUserSettings(botId);
        return FrecencyUserSettings.toBase64(data);
    }
}

const db = new BotClientDatabase(window.BotClientNative.getBotClientName());

export default db;

window.protoAPI.GetPreloadedUserSettings(async (botId: string) => {
    const settings = await db.getPreloadedUserSettings(botId);
    window.protoAPI.GetPreloadedUserSettingsResponse(botId, PreloadedUserSettings.toBase64(settings));
});

window.protoAPI.SetPreloadedUserSettings(async (botId: string, settings: string) => {
    const decoded = PreloadedUserSettings.fromBase64(settings);
    await db.database.PreloadedUserSettings.put({
        botId,
        data: decoded,
    });
});

window.protoAPI.GetFrecencyUserSettings(async (botId: string) => {
    const settings = await db.getFrecencyUserSettings(botId);
    window.protoAPI.GetFrecencyUserSettingsResponse(botId, FrecencyUserSettings.toBase64(settings));
});

window.protoAPI.SetFrecencyUserSettings(async (botId: string, settings: string) => {
    const decoded = FrecencyUserSettings.fromBase64(settings);
    await db.database.FrecencyUserSettings.put({
        botId,
        data: decoded,
    });
});
