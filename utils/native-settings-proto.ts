/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findStoreLazy } from "@webpack";

export type SettingsMessage = Record<string, unknown>;

interface NativeCodec {
    create(value?: SettingsMessage): SettingsMessage;
    fromBinary(value: Uint8Array): SettingsMessage;
    toBinary(value: SettingsMessage): Uint8Array;
}

const settingsStore = findStoreLazy("UserSettingsProtoStore") as {
    getFullState(): Record<number, { ProtoClass: NativeCodec; }>;
};

function codecFor(type: 1 | 2) {
    const codec = settingsStore.getFullState()[type]?.ProtoClass;
    if (!codec) throw new Error("Discord's user settings codec is not ready.");
    return codec;
}

function settingsCodec(type: 1 | 2) {
    return {
        create(value?: SettingsMessage) { return codecFor(type).create(value); },
        fromBase64(value: string) {
            return codecFor(type).fromBinary(Uint8Array.from(atob(value), char => char.charCodeAt(0)));
        },
        toBase64(value: SettingsMessage) {
            const bytes = codecFor(type).toBinary(value);
            let binary = "";
            for (let offset = 0; offset < bytes.length; offset += 32768) {
                binary += String.fromCharCode(...bytes.subarray(offset, offset + 32768));
            }
            return btoa(binary);
        },
    };
}

export type PreloadedUserSettings = SettingsMessage;
export type FrecencyUserSettings = SettingsMessage;
export const PreloadedUserSettings = settingsCodec(1);
export const FrecencyUserSettings = settingsCodec(2);
