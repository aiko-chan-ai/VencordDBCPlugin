/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByPropsLazy } from "@webpack";
import { EmojiStore, RestAPI, UserStore } from "@webpack/common";

export const APPLICATION_EMOJI_CATEGORY = "Application Emojis";

interface ApplicationEmoji {
    id: string;
    name: string;
    animated: boolean;
    available: boolean;
    guildId: string;
    type: 1;
    require_colons: true;
    managed: false;
    roles: string[];
}

let ownerId: string | undefined;
let emojis: ApplicationEmoji[] = [];
let emojisById = new Map<string, ApplicationEmoji>();
let pending: Promise<ApplicationEmoji[]> | undefined;
let expires = 0;
let categorySource: string[] | undefined;
let categories: string[];
const contexts = new WeakMap<object, ApplicationEmoji[]>();
const emojiConstants = findByPropsLazy("EmojiIntention");

function currentUserId() {
    try { return UserStore.getCurrentUser()?.id; } catch { return undefined; }
}

function clearApplicationEmojis() {
    ownerId = undefined;
    emojis = [];
    emojisById.clear();
    pending = undefined;
    expires = 0;
    categorySource = undefined;
    window.applicationEmojis = [];
}

function normalizeEmojis(value: unknown): ApplicationEmoji[] {
    const result = new Map<string, ApplicationEmoji>();
    if (!Array.isArray(value)) return [];
    for (const emoji of value) {
        if (!emoji || typeof emoji.id !== "string" || !/^\d+$/.test(emoji.id)
            || typeof emoji.name !== "string" || !emoji.name || result.has(emoji.id)) continue;
        result.set(emoji.id, {
            id: emoji.id, name: emoji.name, animated: emoji.animated === true,
            available: emoji.available !== false, guildId: "0", type: 1,
            require_colons: true, managed: false, roles: [],
        });
    }
    return [...result.values()];
}

function getApplicationEmojis(): Promise<ApplicationEmoji[]> {
    const id = currentUserId();
    if (id !== ownerId) { clearApplicationEmojis(); ownerId = id; }
    if (!id || Date.now() < expires) return Promise.resolve(emojis);
    if (pending) return pending;
    const request = RestAPI.get({ url: "/users/@me/emojis" })
        .then(response => {
            if (ownerId !== id || currentUserId() !== id) return emojis;
            emojis = normalizeEmojis(response.body);
            emojisById = new Map(emojis.map(emoji => [emoji.id, emoji]));
            window.applicationEmojis = emojis;
            expires = Date.now() + 5 * 60 * 1000;
            categorySource = undefined;
            EmojiStore.emojiFrecencyWithoutFetchingLatest.markDirty();
            EmojiStore.emojiReactionFrecencyWithoutFetchingLatest.markDirty();
            EmojiStore.emitChange();
            return emojis;
        })
        .catch(() => {
            if (ownerId === id) {
                expires = Date.now() + 30000;
                console.warn("[BotClient] Could not refresh Application Emojis; keeping the current cache.");
            }
            return emojis;
        })
        .finally(() => { if (pending === request) pending = undefined; });
    return pending = request;
}

function getApplicationEmojisForPicker() {
    void getApplicationEmojis();
    return emojis;
}

function getApplicationEmoji(id: string | undefined) {
    getApplicationEmojisForPicker();
    return id ? emojisById.get(id) : undefined;
}

function getEmojiCategories(original: string[]) {
    if (!getApplicationEmojisForPicker().length || original.includes(APPLICATION_EMOJI_CATEGORY)) return original;
    if (categorySource !== original) {
        categorySource = original;
        categories = [...original];
        const custom = categories.indexOf("custom");
        const unicode = categories.findIndex(id => !["favorites", "recent", "top guild emoji"].includes(id));
        categories.splice(custom >= 0 ? custom : unicode >= 0 ? unicode : categories.length, 0, APPLICATION_EMOJI_CATEGORY);
    }
    return categories;
}

function refreshApplicationEmojiContext(context: { reset(): void; }) {
    try {
        const current = getApplicationEmojisForPicker();
        if (contexts.get(context) !== current) { contexts.set(context, current); context.reset(); }
    } catch { /* Keep native emoji lookup usable if Discord changes its context. */ }
}

function canUseApplicationEmojis(intention: number) {
    const { EmojiIntention } = emojiConstants;
    return [EmojiIntention.CHAT, EmojiIntention.REACTION, EmojiIntention.AUTO_SUGGESTION, EmojiIntention.DEFAULT_REACT_EMOJI].includes(intention);
}

function addApplicationEmojiSection(addSection: (emojis: ApplicationEmoji[], section: object) => void, options: { pickerIntention: number; }) {
    if (!canUseApplicationEmojis(options.pickerIntention)) return;
    const available = getApplicationEmojisForPicker().filter(emoji => emoji.available);
    if (!available.length) return;
    try {
        addSection(available, {
            type: "UNICODE", categoryId: APPLICATION_EMOJI_CATEGORY,
            sectionId: APPLICATION_EMOJI_CATEGORY, isNitroLocked: false,
        });
    } catch { /* A custom section must not break the native picker. */ }
}

export const applicationEmojiHelpers = {
    getApplicationEmojis, getApplicationEmojisForPicker, getApplicationEmoji, clearApplicationEmojis,
    getEmojiCategories, refreshApplicationEmojiContext, canUseApplicationEmojis, addApplicationEmojiSection,
};
