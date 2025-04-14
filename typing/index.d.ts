import { GuildMember } from "discord-types/general";

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

export type Ops = {
    group: Group;
} | {
    member: MemberPatch;
};

export type List = {
    group: Group;
    members: MemberPatch[];
};