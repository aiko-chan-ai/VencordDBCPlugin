/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FrecencyUserSettings, PreloadedUserSettings } from "discord-protos";

export { FrecencyUserSettings, PreloadedUserSettings };

export const DefaultPreloadedUserSettings = PreloadedUserSettings.create({
    versions: { clientVersion: 20, serverVersion: 0, dataVersion: 56 },
    inbox: { currentTab: 0, viewedTutorial: false },
    voiceAndVideo: {
        afkTimeout: { value: 600 },
        streamNotificationsEnabled: { value: true },
        nativePhoneIntegrationEnabled: { value: true },
    },
    textAndImages: {
        emojiPickerCollapsedSections: [],
        stickerPickerCollapsedSections: [],
        soundboardPickerCollapsedSections: [],
        dmSpamFilterV2: 1,
        inlineAttachmentMedia: { value: true },
        inlineEmbedMedia: { value: true },
        gifAutoPlay: { value: true },
        renderEmbeds: { value: true },
        renderReactions: { value: true },
        animateEmoji: { value: true },
        animateStickers: { value: 0 },
        enableTtsCommand: { value: true },
        messageDisplayCompact: { value: false },
        explicitContentFilter: { value: 1 },
        viewNsfwGuilds: { value: true },
        convertEmoticons: { value: true },
        viewNsfwCommands: { value: true },
    },
    notifications: { notificationCenterAckedBeforeId: 0n },
    privacy: {
        restrictedGuildIds: [],
        defaultGuildsRestricted: false,
        allowAccessibilityDetection: false,
        activityRestrictedGuildIds: [],
        defaultGuildsActivityRestricted: 0,
        activityJoiningRestrictedGuildIds: [],
        messageRequestRestrictedGuildIds: [],
        detectPlatformAccounts: { value: true },
        passwordless: { value: true },
        contactSyncEnabled: { value: false },
        friendSourceFlags: { value: 14 },
        friendDiscoveryFlags: { value: 0 },
        hideLegacyUsername: { value: false },
    },
    debug: {},
    gameLibrary: { disableGamesTab: { value: false } },
    status: {
        status: { value: "online" },
        showCurrentGame: { value: true },
    },
    localization: {
        locale: { value: "en-US" },
        timezoneOffset: { value: -420 },
    },
    appearance: {
        theme: 1,
        developerMode: true,
        mobileRedesignDisabled: false,
    },
    guildFolders: { folders: [], guildPositions: [] },
    audioContextSettings: {
        user: {},
        stream: {},
    },
    userContent: {
        lastReceivedChangelogId: 0n,
        dismissedContents: new Uint8Array([
            223, 155, 247, 63, 234, 215, 183, 131, 206, 163, 119, 210, 127, 80, 241, 178, 116, 63, 136, 39, 248, 238,
            255, 231, 62, 96, 245, 254, 249, 125, 248, 252, 131, 135, 253, 127, 198, 66, 14, 51, 96, 128, 151, 124, 68,
            251, 255, 242, 255, 255, 255, 223, 163, 170, 191, 63, 119, 71, 128, 131, 255, 89, 255, 63, 127, 103, 201,
            125, 246, 175, 233, 188, 219, 255, 255, 126, 252, 239,
        ]),
        recurringDismissibleContentStates: {},
    },
});

export const DefaultFrecencyUserSettings = FrecencyUserSettings.create({
    versions: {
        clientVersion: 10,
        serverVersion: 0,
        dataVersion: 2059,
    },
    favoriteGifs: {
        gifs: {},
        hideTooltip: true,
    },
    stickerFrecency: {
        stickers: {},
    },
    favoriteEmojis: { emojis: ["sparkles"] }, // Sparkle => Hanabi (Honkai Star Rail Character) ~\(≧▽≦)/~
    emojiFrecency: {
        emojis: {},
    },
    applicationCommandFrecency: {
        applicationCommands: {},
    },
    favoriteSoundboardSounds: {
        soundIds: [],
    },
});
