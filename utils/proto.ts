/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FrecencyUserSettings, PreloadedUserSettings } from "discord-protos";

export { FrecencyUserSettings, PreloadedUserSettings };

export const DefaultPreloadedUserSettings = PreloadedUserSettings.create({
    versions: { clientVersion: 20, serverVersion: 0, dataVersion: 6265 },
    inbox: { currentTab: 1, viewedTutorial: true },
    voiceAndVideo: {
        afkTimeout: { value: 600 },
        streamNotificationsEnabled: { value: true },
        nativePhoneIntegrationEnabled: { value: true },
    },
    textAndImages: {
        emojiPickerCollapsedSections: [],
        stickerPickerCollapsedSections: [],
        soundboardPickerCollapsedSections: [],
        dmSpamFilterV2: 0,
        searchProvider: 0,
        inlineAttachmentMedia: { value: true },
        inlineEmbedMedia: { value: true },
        gifAutoPlay: { value: true },
        renderEmbeds: { value: true },
        renderReactions: { value: true },
        animateEmoji: { value: true },
        animateStickers: { value: 1 },
        enableTtsCommand: { value: true },
        messageDisplayCompact: { value: false },
        explicitContentFilter: { value: 1 },
        viewNsfwGuilds: { value: true },
        convertEmoticons: { value: true },
        expressionSuggestionsEnabled: { value: false },
        viewNsfwCommands: { value: true },
    },
    notifications: {
        notificationCenterAckedBeforeId: 0n,
        focusModeExpiresAtMs: 0n,
        reactionNotifications: 0,
        gameActivityNotifications: 1,
        customStatusPushNotifications: 0,
        showInAppNotifications: { value: true },
        notifyFriendsOnGoLive: { value: false },
        enableProfileUpdatesNotifications: { value: true },
        notifyFriendsOnProfileUpdate: { value: false },
    },
    privacy: {
        restrictedGuildIds: [],
        defaultGuildsRestricted: false,
        allowAccessibilityDetection: false,
        activityRestrictedGuildIds: [],
        defaultGuildsActivityRestricted: 0,
        activityJoiningRestrictedGuildIds: [],
        messageRequestRestrictedGuildIds: [],
        guildsLeaderboardOptOutDefault: 0,
        slayerSdkReceiveDmsInGame: 0,
        defaultGuildsActivityRestrictedV2: 3,
        profileVisibility: 1,
        allowActivityPartyPrivacyFriends: { value: true },
        detectPlatformAccounts: { value: true },
        passwordless: { value: true },
        contactSyncEnabled: { value: true },
        friendSourceFlags: { value: 14 },
        friendDiscoveryFlags: { value: 0 },
        defaultMessageRequestRestricted: { value: false },
        dropsOptedOut: { value: true },
        hideLegacyUsername: { value: true },
        quests3PDataOptedOut: { value: true },
    },
    debug: {},
    gameLibrary: { disableGamesTab: { value: false } },
    status: {
        statusExpiresAtMs: 0n,
        statusCreatedAtMs: {
            value: 0n,
        },
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
        timestampHourCycle: 2,
        launchPadMode: 0,
        uiDensity: 0,
        swipeRightToLeftMode: 0,
        defaultGuildThemePreference: 0,
        darkSidebar: false,
    },
    guildFolders: { folders: [], guildPositions: [] },
    audioContextSettings: {
        user: {},
        stream: {},
    },
    communities: {
        disableHomeAutoNav: { value: false },
    },
    clips: {
        allowVoiceRecording: { value: false },
    },
    applications: {
        appSettings: {},
    },
    inAppFeedbackSettings: {
        inAppFeedbackStates: {},
    },
    userContent: {
        lastReceivedChangelogId: 0n,
        dismissedContents: new Uint8Array(100).map(a => ~a),
        recurringDismissibleContentStates: {},
        lastGiftIntentDismissedAtMs: 0n,
        lastDismissedOutboundPromotionStartDate: {
            value: "",
        },
        premiumTier0ModalDismissedAt: {
            seconds: 0n,
            nanos: 0,
        },
        guildOnboardingUpsellDismissedAt: {
            seconds: 0n,
            nanos: 0,
        },
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
