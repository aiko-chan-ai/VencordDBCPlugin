/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import type { Patch } from "@utils/types";

import { APPLICATION_EMOJI_CATEGORY } from "./application-emojis";

const category = JSON.stringify(APPLICATION_EMOJI_CATEGORY);

export const applicationEmojiPatches: Omit<Patch, "plugin">[] = [
    {
        find: "}searchWithoutFetchingLatest(",
        replacement: [
            {
                match: /get categories\(\)\{return (\i)\}/,
                replace: "get categories(){return $self.getEmojiCategories($1)}",
            },
            {
                match: /(static get\(\i\)\{)(?=return void 0===\i&&\(\i=null\))/,
                replace: "$1$self.refreshApplicationEmojiContext(this);",
            },
            {
                match: /getIndexablePackEmojis\(\)\.forEach/,
                replace: "getIndexablePackEmojis().concat($self.getApplicationEmojisForPicker()).forEach",
            },
            {
                match: /(getCustomEmojiById\((\i)\)\{)/,
                replace: "$1const vcApplicationEmoji=$self.getApplicationEmoji($2);if(vcApplicationEmoji)return vcApplicationEmoji;",
            },
            {
                match: /(getUsableCustomEmojiById\((\i)\)\{return \i\(\),)/,
                replace: "$1$self.getApplicationEmoji($2)??",
            },
            {
                match: /(\i\.\i\.getByName\((\i)\)\?\?)(\i\(\2\))/,
                replace: "$1($self.getApplicationEmoji($2)??$3)",
            },
        ],
    },
    {
        find: ".getEmojiUnavailableReasons({categoryEmojis:",
        replacement: {
            match: /(\.categories\.reduce\(\((\i),(\i)\)=>\{)/,
            replace: `$1if($3===${category}&&!$self.canUseApplicationEmojis(arguments[0]))return $2;`,
        },
    },
    {
        find: ".getGroupedCustomEmoji();return",
        replacement: [
            {
                match: /function (\i)\(\i,\i\)\{(?=let \i=new Map,\i=\i\.has\(\i\.sectionId\))/,
                replace: "const vcAddApplicationEmojiSection=options=>$self.addApplicationEmojiSection($1,options);$&",
            },
            {
                match: /(for\(let (\i) of \i\)\{)(?=if\(\2===\i\)for\(let \i of \i\))/,
                replace: `$1if($2===${category}){vcAddApplicationEmojiSection(arguments[0]);continue;}`,
            },
            {
                match: /(\i\.memo\(function\((\i)\)\{)(?=let\{categoryId:\i,\.\.\.\i\}=\2)/,
                replace: `$1if($2.categoryId===${category})return $self.renderApplicationEmojiIcon($2);`,
            },
        ],
    },
    {
        find: /sanitizeEmojiName\(\i\)\{/,
        replacement: {
            match: /(function \i\((\i)\)\{)(?=let\{emoji:\i,channel:)/,
            replace: "$1const vcApplicationEmoji=$self.getApplicationEmoji($2.emoji?.id);if(vcApplicationEmoji?.available&&$self.canUseApplicationEmojis($2.intention))return null;",
        },
    },
];
