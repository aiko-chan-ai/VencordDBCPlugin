/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Patch } from "@utils/types";
import { UserStore } from "@webpack/common";

import db from "./database";
import { FrecencyUserSettings, PreloadedUserSettings } from "./proto";

const requests = new Map<string, Promise<unknown>>();

async function settingsProtoRequest(type: number, update?: string) {
    if (type !== 1 && type !== 2) throw new Error("Unsupported user settings type.");
    const botId = UserStore.getCurrentUser()?.id;
    if (!botId) throw new Error("No active bot session.");
    const key = `${botId}:${type}`;
    const task = (requests.get(key) ?? Promise.resolve()).catch(() => {}).then(async () => {
        const assertAccount = () => {
            if (UserStore.getCurrentUser()?.id !== botId) throw new Error("The bot account changed during a settings request.");
        };
        assertAccount();
        const codec = type === 1 ? PreloadedUserSettings : FrecencyUserSettings;
        const current = type === 1 ? await db.getPreloadedUserSettings(botId) : await db.getFrecencyUserSettings(botId);
        assertAccount();
        if (update !== undefined) {
            const partial = codec.fromBase64(update);
            for (const key of Object.keys(partial)) current[key] = partial[key];
        }
        const settings = codec.toBase64(current);
        if (update !== undefined) {
            if (type === 1) await db.SetPreloadedUserSettings(botId, current);
            else await db.SetFrecencyUserSettings(botId, current);
        }
        assertAccount();
        return { status: 200, body: { settings }, headers: {} };
    });
    requests.set(key, task);
    try { return await task; } finally { if (requests.get(key) === task) requests.delete(key); }
}

export const settingsProtoHelpers = { settingsProtoRequest };

export const settingsProtoPatch: Omit<Patch, "plugin"> = {
    find: "UserSettingsProtoLastWriteTimes",
    group: true,
    replacement: [
        {
            match: /\i\.\i\.get\(\{url:\i\.\i\.USER_SETTINGS_PROTO\(this\.type\),rejectWithError:!1\}\)/,
            replace: "$self.settingsProtoRequest(this.type)",
        },
        {
            match: /\i\.\i\.patch\(\{url:\i\.\i\.USER_SETTINGS_PROTO\(this\.type\),body:\{settings:(\i),required_data_version:\i\.offlineEditDataVersion\},rejectWithError:!1\}\)/,
            replace: "$self.settingsProtoRequest(this.type,$1)",
        },
    ],
};
