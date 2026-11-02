/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Button } from "@components/Button";
import { Card } from "@components/Card";
import ErrorBoundary from "@components/ErrorBoundary";
import { Flex } from "@components/Flex";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { DeleteIcon } from "@components/Icons";
import { RenderModalProps } from "@vencord/discord-types";
import { Modal, React, showToast, Slider, TextArea, TextInput } from "@webpack/common";

const PLACEHOLDER_TEXT = "ヾ(≧▽≦*)o";
const MAX_FIELDS = 25;

// --- Helper utilities ---

interface EmbedField {
    name: string;
    value: string;
    inline: boolean;
}

function embedColorToHex(embed: any): string | undefined {
    if (typeof embed === "object" && embed !== null && "color" in embed && typeof embed.color === "number") {
        return "#" + embed.color.toString(16).padStart(6, "0");
    }
    return undefined;
}

function createEmptyField(): EmbedField {
    return { name: "", value: "", inline: false };
}

function initFieldsFromEmbed(embed: any): EmbedField[] {
    const base: EmbedField[] = embed?.fields?.map((f: EmbedField) => ({ ...f })) ?? [];
    if (base.length < MAX_FIELDS) base.push(createEmptyField());
    return base.slice(0, MAX_FIELDS);
}

function extractEmbedState(embed: any) {
    return {
        authorTitle: embed?.author?.name ?? "",
        authorURL: embed?.author?.url ?? "",
        authorImage: embed?.author?.icon_url ?? "",
        title: embed?.title ?? "",
        description: embed?.description ?? "",
        url: embed?.url ?? "",
        color: embedColorToHex(embed) ?? "",
        image: embed?.image?.url ?? "",
        thumbnail: embed?.thumbnail?.url ?? "",
        footerTitle: embed?.footer?.text ?? "",
        footerURL: embed?.footer?.icon_url ?? "",
        footerTimestamp: !!embed?.timestamp,
    };
}

function buildEmbedFromState(state: ReturnType<typeof extractEmbedState> & { fields: EmbedField[] }, timestamp?: string) {
    const embed: Record<string, any> = {};

    if (state.title) embed.title = state.title;
    if (state.description) embed.description = state.description;
    if (state.url && URL.canParse(state.url)) embed.url = state.url;

    if (/^#[\da-f]{6}$/i.test(state.color)) {
        embed.color = parseInt(state.color.slice(1), 16);
    }

    const validFields = state.fields.filter(f => f.name.length > 0 && f.value.length > 0);
    if (validFields.length) embed.fields = validFields;

    if (state.authorTitle) {
        embed.author = { name: state.authorTitle };
        if (state.authorURL && URL.canParse(state.authorURL)) embed.author.url = state.authorURL;
        if (state.authorImage && URL.canParse(state.authorImage)) embed.author.icon_url = state.authorImage;
    }

    if (state.footerTitle) {
        embed.footer = { text: state.footerTitle };
        if (state.footerURL && URL.canParse(state.footerURL)) embed.footer.icon_url = state.footerURL;
    }

    if (state.footerTimestamp) embed.timestamp = timestamp ?? new Date().toISOString();
    if (state.image && URL.canParse(state.image)) embed.image = { url: state.image };
    if (state.thumbnail && URL.canParse(state.thumbnail)) embed.thumbnail = { url: state.thumbnail };

    return embed;
}

// --- Component ---

function EmbedEditorModal({
    modalProps,
    callbackSendEmbed,
    messageRaw,
    isCreate,
}: {
    modalProps: RenderModalProps;
    callbackSendEmbed: (data: any, msg?: { embeds: any[]; }) => Promise<void>;
    messageRaw?: any;
    isCreate?: boolean;
}) {
    const [richEmbeds, setRichEmbeds] = React.useState<any[]>(
        () => messageRaw?.embeds?.filter((e: any) => e.type === "rich") ?? [],
    );

    const [indexE, setIndexE] = React.useState(0);
    const [submitting, setSubmitting] = React.useState(false);

    // Initialize state from first embed (useState ignores initial value after mount)
    const initialEmbed = richEmbeds[0];
    const initial = extractEmbedState(initialEmbed);

    // Author
    const [authorTitle, setAuthorTitle] = React.useState(initial.authorTitle);
    const [authorURL, setAuthorURL] = React.useState(initial.authorURL);
    const [authorImage, setAuthorImage] = React.useState(initial.authorImage);
    // Body
    const [title, setTitle] = React.useState(initial.title);
    const [description, setDescription] = React.useState(initial.description);
    const [url, setURL] = React.useState(initial.url);
    const [color, setColor] = React.useState(initial.color);
    // Image
    const [image, setImage] = React.useState(initial.image);
    const [thumbnail, setThumbnail] = React.useState(initial.thumbnail);
    // Fields — lazy initializer to avoid recreating array each render
    const [fields, setFields] = React.useState<EmbedField[]>(() => initFieldsFromEmbed(initialEmbed));
    // Footer
    const [footerTitle, setFooterTitle] = React.useState(initial.footerTitle);
    const [footerURL, setFooterURL] = React.useState(initial.footerURL);
    const [footerTimestamp, setFooterTimestamp] = React.useState(initial.footerTimestamp);

    // Immutable field update — no more direct state mutation + useForceUpdater hack
    const handleFieldChange = React.useCallback((index: number, prop: string, value: unknown) => {
        setFields(prev => {
            const next = prev.map((f, i) => (i === index ? { ...f, [prop]: value } : f));
            const current = next[index];

            // Remove empty non-last fields
            if (prop !== "inline" && !current.name.length && !current.value.length && next.length > 1) {
                next.splice(index, 1);
                return next;
            }

            // Auto-add empty field when last field is filled
            const last = next[next.length - 1];
            if (last.name.length > 0 && last.value.length > 0 && next.length < MAX_FIELDS) {
                next.push(createEmptyField());
            }

            return next;
        });
    }, []);

    const handleDeleteField = React.useCallback((index: number) => {
        setFields(prev => (prev.length > 1 ? prev.filter((_, i) => i !== index) : prev));
    }, []);

    // Load all form state from a given embed object
    const loadEmbed = React.useCallback((embed: any) => {
        const s = extractEmbedState(embed);
        setAuthorTitle(s.authorTitle);
        setAuthorURL(s.authorURL);
        setAuthorImage(s.authorImage);
        setTitle(s.title);
        setDescription(s.description);
        setURL(s.url);
        setColor(s.color);
        setImage(s.image);
        setThumbnail(s.thumbnail);
        setFooterTitle(s.footerTitle);
        setFooterURL(s.footerURL);
        setFooterTimestamp(s.footerTimestamp);
        setFields(initFieldsFromEmbed(embed));
    }, []);

    const currentEmbed = buildEmbedFromState({
        title, description, url, color, fields,
        authorTitle, authorURL, authorImage,
        footerTitle, footerURL, footerTimestamp,
        image, thumbnail,
    }, richEmbeds[indexE]?.timestamp);

    const handleSliderChange = (value: number) => {
        const newIndex = Math.round(value) - 1;
        if (newIndex === indexE) return;
        const updatedEmbeds = [...richEmbeds];
        if (Object.keys(currentEmbed).length) updatedEmbeds[indexE] = currentEmbed;
        setRichEmbeds(updatedEmbeds);
        setIndexE(newIndex);
        loadEmbed(updatedEmbeds[newIndex]);
    };

    const handleSubmit = async () => {
        if (submitting) return;
        if (!Object.keys(currentEmbed).length) {
            showToast({ text: "Add some content to the embed first", variant: "critical" });
            return;
        }
        const updatedEmbeds = [...richEmbeds];
        updatedEmbeds[indexE] = currentEmbed;
        setSubmitting(true);
        try {
            await callbackSendEmbed(currentEmbed, messageRaw ? { embeds: updatedEmbeds } : undefined);
            modalProps.onClose();
        } catch (e: any) {
            showToast({ text: `Failed to save embed: ${e?.body?.message ?? e?.message ?? String(e)}`, variant: "critical" });
        } finally {
            setSubmitting(false);
        }
    };

    // Memoize slider markers to avoid recreation each render
    const sliderMarkers = React.useMemo(
        () => Array.from({ length: Math.min(richEmbeds.length + 1, 10) }, (_, i) => i + 1),
        [richEmbeds.length],
    );

    return (
        <Modal
            {...modalProps}
            size="lg"
            title="Embed Builder"
            actions={[{ text: isCreate ? "Create it !" : "Edit it !", variant: "primary", onClick: handleSubmit, loading: submitting, disabled: submitting }]}
        >
            <Flex flexDirection="column" style={{ padding: 12 }}>
                {/* Author */}
                <Card style={{ padding: "1em 1em 0" }}>
                    <Heading style={{ width: "fit-content" }} tag="h3">
                        Author
                    </Heading>
                    <Flex flexDirection="row" style={{ padding: 12 }}>
                        <div style={{ flex: 1, marginLeft: 0 }}>
                            <Heading>Name</Heading>
                            <TextArea
                                onChange={setAuthorTitle}
                                placeholder={PLACEHOLDER_TEXT}
                                rows={1}
                                spellCheck={false}
                                maxLength={256}
                                value={authorTitle}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <Heading>URL</Heading>
                            <TextInput
                                placeholder="https://discord.com/"
                                onChange={setAuthorURL}
                                value={authorURL}
                                spellCheck={false}
                            />
                        </div>
                        <div style={{ flex: 1, marginRight: 0 }}>
                            <Heading>Image URL</Heading>
                            <TextInput
                                placeholder="https://i.imgur.com/image.png"
                                onChange={setAuthorImage}
                                value={authorImage}
                                spellCheck={false}
                            />
                        </div>
                    </Flex>
                </Card>

                {/* Body */}
                <Card style={{ padding: "1em 1em 0" }}>
                    <Heading style={{ width: "fit-content" }} tag="h3">
                        Body
                    </Heading>
                    <Flex flexDirection="row" style={{ padding: 12 }}>
                        <div style={{ marginLeft: 0, width: "33%" }}>
                            <div>
                                <Heading>Title</Heading>
                                <TextArea
                                    onChange={setTitle}
                                    placeholder={PLACEHOLDER_TEXT}
                                    rows={1}
                                    spellCheck={false}
                                    maxLength={256}
                                    value={title}
                                />
                            </div>
                            <div>
                                <Heading>URL</Heading>
                                <TextInput
                                    placeholder="https://discord.com/"
                                    onChange={setURL}
                                    value={url}
                                    spellCheck={false}
                                />
                            </div>
                            <div>
                                <Heading>Color</Heading>
                                <Flex flexDirection="row">
                                    <div style={{ width: "90%" }}>
                                        <TextInput placeholder={color} spellCheck={false} disabled={true} />
                                    </div>
                                    <div style={{ flex: 1 }}>
                                        <input
                                            type="color"
                                            name="embed-color-picker"
                                            value={color || "#000000"}
                                            onChange={e => setColor(e.target.value)}
                                            style={{
                                                border: "none",
                                                height: "3.2em",
                                                boxShadow: "none",
                                                padding: 0,
                                                background: "none",
                                            }}
                                        />
                                    </div>
                                </Flex>
                            </div>
                        </div>
                        <div style={{ marginRight: 0, width: "20vw", flex: 1 }}>
                            <Heading>Description</Heading>
                            <TextArea
                                onChange={setDescription}
                                placeholder={PLACEHOLDER_TEXT}
                                rows={8}
                                spellCheck={false}
                                maxLength={4096}
                                value={description}
                            />
                        </div>
                    </Flex>
                </Card>

                {/* Image */}
                <Card style={{ padding: "1em 1em 0" }}>
                    <Heading style={{ width: "fit-content" }} tag="h3">
                        Image
                    </Heading>
                    <Flex flexDirection="row" style={{ padding: 12 }}>
                        <div style={{ flex: 1, marginLeft: 0 }}>
                            <Heading>Thumbnail URL</Heading>
                            <TextInput
                                placeholder="https://i.imgur.com/image.png"
                                onChange={setThumbnail}
                                value={thumbnail}
                                spellCheck={false}
                            />
                        </div>
                        <div style={{ flex: 1, marginRight: 0 }}>
                            <Heading>Image URL</Heading>
                            <TextInput
                                placeholder="attachment://image.png"
                                onChange={setImage}
                                value={image}
                                spellCheck={false}
                            />
                        </div>
                    </Flex>
                </Card>

                {/* Fields */}
                <Card style={{ padding: "1em 1em 0" }}>
                    <Heading style={{ width: "fit-content" }} tag="h3">
                        Fields
                    </Heading>
                    <Flex flexDirection="column" style={{ padding: 12 }}>
                        {fields.map((field, index) => (
                            <React.Fragment key={`embed-field-${index}`}>
                                <Heading>Field {index + 1}</Heading>
                                <Flex flexDirection="row" style={{ gap: 0 }}>
                                    <Flex
                                        flexDirection="row"
                                        style={{ flexGrow: 1, gap: "0.5em", paddingRight: 12 }}
                                    >
                                        <div style={{ flex: 1, marginLeft: 0 }}>
                                            <TextArea
                                                placeholder="Name"
                                                value={field.name}
                                                onChange={(v: string) => handleFieldChange(index, "name", v)}
                                                spellCheck={false}
                                                maxLength={256}
                                                rows={1}
                                            />
                                        </div>
                                        <div style={{ flex: 1, marginRight: 0 }}>
                                            <TextArea
                                                onChange={(v: string) => handleFieldChange(index, "value", v)}
                                                placeholder="Value"
                                                rows={1}
                                                spellCheck={false}
                                                maxLength={1024}
                                                value={field.value}
                                            />
                                        </div>
                                    </Flex>
                                    <Button
                                        size={"min"}
                                        onClick={() => handleDeleteField(index)}
                                        style={{
                                            background: "none",
                                            color: "var(--status-danger)",
                                            ...(field.name.length && field.value.length
                                                ? {}
                                                : { visibility: "hidden", pointerEvents: "none" }),
                                        }}
                                    >
                                        <DeleteIcon />
                                    </Button>
                                </Flex>
                                <FormSwitch
                                    title="Inline"
                                    value={field.inline}
                                    onChange={(v: boolean) => handleFieldChange(index, "inline", v)}
                                    hideBorder
                                />
                            </React.Fragment>
                        ))}
                    </Flex>
                </Card>

                {/* Footer */}
                <Card style={{ padding: "1em 1em 0" }}>
                    <Heading style={{ width: "fit-content" }} tag="h3">
                        Footer
                    </Heading>
                    <Flex flexDirection="row" style={{ padding: 12 }}>
                        <div style={{ flex: 1, marginLeft: 0 }}>
                            <Heading>Title</Heading>
                            <TextArea
                                onChange={setFooterTitle}
                                placeholder={PLACEHOLDER_TEXT}
                                rows={1}
                                spellCheck={false}
                                maxLength={2048}
                                value={footerTitle}
                            />
                        </div>
                        <div style={{ flex: 1 }}>
                            <Heading>Image URL</Heading>
                            <TextInput
                                placeholder="https://i.imgur.com/image.png"
                                onChange={setFooterURL}
                                value={footerURL}
                                spellCheck={false}
                            />
                        </div>
                    </Flex>
                    <div style={{ flex: 1, marginRight: 0 }}>
                        <FormSwitch
                            title="Timestamp"
                            value={footerTimestamp}
                            onChange={setFooterTimestamp}
                            description="Displays the current time for new embeds"
                            hideBorder
                        />
                    </div>
                </Card>

                {/* Embed selector (edit mode only) */}
                {!isCreate && (
                    <Card style={{ padding: "1em 1em 0" }}>
                        <Heading style={{ width: "fit-content" }} tag="h3">
                            Select Embeds (Edit mode)
                        </Heading>
                        <Flex flexDirection="row" style={{ padding: 12 }}>
                            <Slider
                                minValue={1}
                                maxValue={Math.min(richEmbeds.length + 1, 10)}
                                asValueChanges={handleSliderChange}
                                initialValue={1}
                                orientation="vertical"
                                onValueRender={(va: number) => String(Math.round(va))}
                                stickToMarkers={true}
                                markers={sliderMarkers}
                            />
                        </Flex>
                    </Card>
                )}
            </Flex>
        </Modal>
    );
}

export default ErrorBoundary.wrap(EmbedEditorModal, { noop: false });
