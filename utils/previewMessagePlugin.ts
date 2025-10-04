/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { generateId } from "@api/Commands";
import { CloudUpload,MessageAttachment } from "@vencord/discord-types";
import { findByPropsLazy } from "@webpack";
import { DraftStore, DraftType } from "@webpack/common";

export const UploadStore = findByPropsLazy("getUploads");

export const getDraft = (channelId: string) => DraftStore.getDraft(channelId, DraftType.ChannelMessage);

export const getImageBox = (url: string): Promise<{ width: number; height: number } | null> =>
    new Promise(res => {
        const img = new Image();
        img.onload = () => res({ width: img.width, height: img.height });

        img.onerror = () => res(null);

        img.src = url;
    });



export const getAttachments = async (channelId: string) =>
    await Promise.all(
        UploadStore.getUploads(channelId, DraftType.ChannelMessage)
            .map(async (upload: CloudUpload) => {
                const { isImage, filename, spoiler, item: { file } } = upload;
                const url = URL.createObjectURL(file);
                const attachment: MessageAttachment = {
                    id: generateId(),
                    filename: spoiler ? "SPOILER_" + filename : filename,
                    // weird eh? if i give it the normal content type the preview doenst work
                    content_type: undefined,
                    size: upload.getSize(),
                    spoiler,
                    // discord adds query params to the url, so we need to add a hash to prevent that
                    url: url + "#",
                    proxy_url: url + "#",
                };

                if (isImage) {
                    const box = await getImageBox(url);
                    if (!box) return attachment;

                    attachment.width = box.width;
                    attachment.height = box.height;
                }

                return attachment;
            })
    );

