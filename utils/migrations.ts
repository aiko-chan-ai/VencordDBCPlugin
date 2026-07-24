/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import Dexie, { type EntityTable,type Transaction } from "dexie";

import type {
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

const schemaV1 = {
    PrivateChannel: "channelId, botId",
    PreloadedUserSettings: "botId",
    FrecencyUserSettings: "botId",
};

function migrateToVersion2(transaction: Transaction) {
    return transaction
        .table<PreloadedUserSettingsEntry>("PreloadedUserSettings")
        .clear();
}

export function registerMigrations(database: Dexie) {
    database.version(1).stores(schemaV1);
    database.version(2)
        .stores(schemaV1)
        .upgrade(migrateToVersion2);
}
