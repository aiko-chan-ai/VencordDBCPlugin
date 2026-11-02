/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Patch } from "@utils/types";
import { ChannelActionCreators, showToast, UserStore } from "@webpack/common";

interface NewMessageProps {
    channel?: unknown;
    selectedUsers: ReadonlySet<string>;
    query: string;
    onClose(): void;
    onComplete?(channelId: string): void;
}

interface NewMessageModal {
    props: NewMessageProps;
    setState(state: { botClientOpeningDm: boolean; }): void;
}

const pending = new WeakSet<NewMessageModal>();

export function parseUserId(value: unknown): string | undefined {
    if (typeof value !== "string") return;
    const id = value.trim();
    if (/^[1-9]\d{16,19}$/.test(id) && BigInt(id) <= 18446744073709551615n) return id;
}

function shouldCreateDMFromId(props: NewMessageProps) {
    return !props.channel;
}

async function createDMFromId(modal: NewMessageModal) {
    if (pending.has(modal)) return false;
    const { selectedUsers, query } = modal.props;
    if (selectedUsers.size > 1) {
        showToast({ text: "Bots can only open a DM with one person.", variant: "critical" });
        return false;
    }
    const id = parseUserId(selectedUsers.size === 1 ? [...selectedUsers][0] : query);
    if (!id) {
        showToast({ text: "Select a user or enter a valid Discord User ID.", variant: "critical" });
        return false;
    }
    if (id === UserStore.getCurrentUser()?.id) {
        showToast({ text: "You cannot open a DM with yourself.", variant: "critical" });
        return false;
    }
    pending.add(modal);
    modal.setState({ botClientOpeningDm: true });
    let completed = false;
    try {
        const channelId = await ChannelActionCreators.openPrivateChannel({ recipientIds: [id], location: "New Message" });
        if (!channelId) return false;
        modal.props.onComplete?.(channelId);
        modal.props.onClose();
        completed = true;
        return true;
    } catch (error) {
        const details = error as { body?: { message?: string; }; message?: string; } | undefined;
        showToast({ text: `Could not open DM: ${details?.body?.message ?? details?.message ?? "Please try again."}`, variant: "critical" });
        return false;
    } finally {
        pending.delete(modal);
        if (!completed) modal.setState({ botClientOpeningDm: false });
    }
}

export const directMessageHelpers = { shouldCreateDMFromId, createDMFromId };

export const directMessagePatch: Omit<Patch, "plugin"> = {
    find: "getCreateGroupButtonAction()",
    replacement: [
        {
            match: /(getRemaining\(\)\{)/,
            replace: "$1if(!this.props.channel)return 1-this.props.selectedUsers.size;",
        },
        {
            match: /(shouldShowNitroCapRoadblock\(\)\{return )/,
            replace: "$1!!this.props.channel&&",
        },
        {
            match: /(shouldShowPersonLimitCounter\(\)\{)/,
            replace: "$1if(!this.props.channel)return false;",
        },
        {
            match: /(getSubtitle\(\)\{)/,
            replace: '$1if(!this.props.channel)return "Choose one person to start a DM.";',
        },
        {
            match: /(allowNonFriendRecipientPicker\(\)\{return )/,
            replace: "$1!this.props.channel||",
        },
        {
            match: /(handleInviteUsers=\(\)=>\{)/,
            replace: "$1if($self.shouldCreateDMFromId(this.props))return $self.createDMFromId(this);",
        },
        {
            match: /(getCreateGroupButtonAction\(\)\{.{0,600}?return\{variant:"primary",disabled:)(\i)(?=,onClick:this\.handleInviteUsers)/,
            replace: "$1$2||!!this.state.botClientOpeningDm,loading:!!this.state.botClientOpeningDm",
        },
        {
            match: /(placeholder:)(0===\i\.size\?\i\.intl\.string\(\i\.t(?:\.\i|\["[^"]+"\])\):"")/,
            replace: '$1this.props.channel||this.props.selectedUsers.size>0?$2:"Search or enter a User ID"',
        },
        {
            match: /helperText:(\i\.intl\.string\(\i\?\i\.t\.\i:\i\.t\.\i\)),placeholder:/,
            replace: 'helperText:this.props.channel?$1:"Select one person or enter their User ID.",placeholder:',
        },
    ],
};
