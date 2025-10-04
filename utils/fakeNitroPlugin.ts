/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import {
    ChannelStore,
    PermissionsBits,
    PermissionStore,
} from "@webpack/common";

export function hasPermission(channelId: string, permission: bigint) {
    const channel = ChannelStore.getChannel(channelId);

    if (!channel || channel.isPrivate()) return true;

    return PermissionStore.can(permission, channel);
}

export const hasEmbedPerms = (channelId: string) => hasPermission(channelId, PermissionsBits.EMBED_LINKS);
