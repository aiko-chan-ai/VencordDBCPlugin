/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { GuildMember } from "@vencord/discord-types";

export interface MemberPatch extends GuildMember {
    user: {
        id: string;
    };
    status: string;
    position: number;
}

export type Group = {
    id: string;
    count: number;
};

export type Ops = OpSync;

export type OpSync = {
    items: OpItem[];
    op: "SYNC";
    range: [number, number];
};

export type OpItem = {
    group: {
        id: string;
    };
} | {
    member: MemberPatch;
};

export type List = {
    group: Group;
    members: MemberPatch[];
};
