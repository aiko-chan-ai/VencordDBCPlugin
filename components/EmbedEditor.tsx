/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { BaseText } from "@components/BaseText";
import { Button } from "@components/Button";
import { Card } from "@components/Card";
import { Flex } from "@components/Flex";
import { FormSwitch } from "@components/FormSwitch";
import { Heading } from "@components/Heading";
import { DeleteIcon } from "@components/Icons";
import {
    ModalCloseButton,
    ModalContent,
    ModalFooter,
    ModalHeader,
    ModalProps,
    ModalRoot,
    ModalSize,
} from "@utils/modal";
import { useForceUpdater } from "@utils/react";
import { findComponentByCodeLazy } from "@webpack";
import { React, Slider, TextArea, TextInput } from "@webpack/common";
import type { PropsWithChildren } from "react";

/** Compatibility with Discord's old FormSwitch */
function FormSwitchCompat(props: PropsWithChildren<any>) {
    return <FormSwitch {...props} title={props.children ?? ""} description={props.note} />;
}

// Code from clientTheme plugin
const ColorPicker = findComponentByCodeLazy(
    "#{intl::USER_SETTINGS_PROFILE_COLOR_SELECT_COLOR}",
    ".BACKGROUND_PRIMARY)",
);

const colorPresets = [
    "#FF5733",
    "#FFBD33",
    "#DBFF33",
    "#75FF33",
    "#33FF57",
    "#33DBFF",
    "#3375FF",
    "#5733FF",
    "#BD33FF",
    "#FF33DB",
    "#FF3375",
    "#FF3333",
    "#FF7F33",
    "#33FF3A",
    "#33FF8A",
    "#33FFC1",
    "#333FFF",
    "#7F33FF",
    "#FF33C1",
    "#FF337F",
];

const useDebounce = (callback, delay) => {
    const debouncedFunction = React.useRef<any>(null);

    React.useEffect(() => {
        debouncedFunction.current = callback;
    }, [callback]);

    return React.useCallback(
        (...args) => {
            if (debouncedFunction.current) {
                const handler = setTimeout(() => {
                    debouncedFunction.current(...args);
                }, delay);

                return () => {
                    clearTimeout(handler);
                };
            }
        },
        [delay],
    );
};

export default function EmbedEditorModal({
    modalProps,
    callbackSendEmbed,
    messageRaw,
    isCreate,
}: {
    modalProps: ModalProps;
    callbackSendEmbed: (data: any, msg: any) => void;
    messageRaw?: any;
    isCreate?: boolean;
}) {
    const [indexE, setIndexE] = React.useState(0);
    // Msg
    let firstEmbed: any;
    if (messageRaw?.embeds?.length) {
        messageRaw.embeds = messageRaw.embeds.filter(e => e.type === "rich");
        firstEmbed = messageRaw.embeds[indexE];
    }

    const text = "ヾ(≧▽≦*)o";
    // Author
    const [authorTitle, setAuthorTitle] = React.useState<string>(firstEmbed?.author?.name);
    const [authorURL, setAuthorURL] = React.useState<string>(firstEmbed?.author?.url);
    const [authorImage, setAuthorImage] = React.useState<string>(firstEmbed?.author?.icon_url);
    // Body
    const [title, setTitle] = React.useState<string>(firstEmbed?.title);
    const [description, setDescription] = React.useState<string>(firstEmbed?.description);
    const [url, setURL] = React.useState<string>(firstEmbed?.url);
    const [color, setColor] = React.useState<string>(
        (typeof firstEmbed === "object" && "color" in firstEmbed
            ? "#" + firstEmbed.color.toString(16)
            : undefined) as string,
    );
    // Image
    const [image, setImage] = React.useState<string>(firstEmbed?.image?.url);
    const [thumbnail, setThumbnail] = React.useState<string>(firstEmbed?.thumbnail?.url);
    // Fields
    const [fields, setFields] = React.useState<
        {
            name: string;
            value: string;
            inline: boolean;
        }[]
    >([
        ...(firstEmbed?.fields ? firstEmbed.fields : []),
        {
            name: "",
            value: "",
            inline: false,
        },
    ]);
    if (fields.length > 25) fields.splice(25);
    // Footer
    const [footerTitle, setFooterTitle] = React.useState<string>(firstEmbed?.footer?.text);
    const [footerURL, setFooterURL] = React.useState<string>(firstEmbed?.footer?.icon_url);
    const [footerTimestamp, setFooterTimestamp] = React.useState<boolean>(!!firstEmbed?.timestamp);

    const debouncedSetColor = useDebounce((newColor: string) => {
        setColor(newColor);
    }, 100);

    /*
	function onPickColor(color: number) {
		const hexColor = color.toString(16).padStart(6, '0');
		setColor(hexColor);
	}*/

    const update = useForceUpdater();

    function handlerAddField(index: number, prop: string, value: unknown) {
        fields[index][prop] = value;
        const f = fields[fields.length - 1];
        if (f.name.length && f.value.length && fields.length <= 25) {
            fields.push({
                name: "",
                value: "",
                inline: false,
            });
        }
        if (
            fields[index].name.length === 0 &&
            fields[index].value.length === 0 &&
            prop !== "inline" &&
            fields.length > 1
        ) {
            fields.splice(index, 1);
        }
        update();
    }

    return (
        <ModalRoot {...modalProps} size={ModalSize.DYNAMIC}>
            <ModalHeader>
                <BaseText size="lg" weight="bold" style={{ flexGrow: 1 }}>
                    Embed Builder
                </BaseText>
                <ModalCloseButton onClick={modalProps.onClose}></ModalCloseButton>
            </ModalHeader>
            <ModalContent>
                <Flex flexDirection="column" style={{ padding: 12 }}>
                    <Card style={{ padding: "1em 1em 0" }}>
                        <Heading style={{ width: "fit-content" }} tag="h3">
                            Author
                        </Heading>
                        <Flex flexDirection="row" style={{ padding: 12 }}>
                            <div style={{ flex: 1, marginLeft: 0 }}>
                                <Heading>Name</Heading>
                                <TextArea
                                    onChange={setAuthorTitle}
                                    placeholder={text}
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
                                        placeholder={text}
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
                                        {/*
										// Currently is not working
										<ColorPicker
											color={parseInt(color, 16)}
											onChange={onPickColor}
											showEyeDropper={false}
											suggestedColors={colorPresets}
										/>
                                        */}
                                        <div style={{ flex: 1 }}>
                                            <input
                                                type="color"
                                                name="embed-color-picker"
                                                value={color}
                                                onChange={event => {
                                                    const hex = event.target.value;
                                                    debouncedSetColor(hex);
                                                }}
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
                            <div
                                style={{
                                    marginRight: 0,
                                    width: "20vw",
                                    flex: 1,
                                }}
                            >
                                <Heading>Description</Heading>
                                <TextArea
                                    onChange={setDescription}
                                    placeholder={text}
                                    rows={8}
                                    spellCheck={false}
                                    maxLength={4096}
                                    value={description}
                                />
                            </div>
                        </Flex>
                    </Card>
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
                    <Card style={{ padding: "1em 1em 0" }}>
                        <Heading style={{ width: "fit-content" }} tag="h3">
                            Fields
                        </Heading>
                        <Flex flexDirection="column" style={{ padding: 12 }}>
                            {fields.map((field, index) => (
                                <React.Fragment key={`embed-1-fields-${index}`}>
                                    <Heading>Field {index + 1}</Heading>
                                    <Flex flexDirection="row" style={{ gap: 0 }}>
                                        <Flex
                                            flexDirection="row"
                                            style={{
                                                flexGrow: 1,
                                                gap: "0.5em",
                                                paddingRight: 12,
                                            }}
                                        >
                                            <div
                                                style={{
                                                    flex: 1,
                                                    marginLeft: 0,
                                                }}
                                            >
                                                <TextArea
                                                    placeholder="Name"
                                                    value={field.name}
                                                    onChange={value => handlerAddField(index, "name", value)}
                                                    spellCheck={false}
                                                    maxLength={256}
                                                    rows={1}
                                                />
                                            </div>
                                            <div
                                                style={{
                                                    flex: 1,
                                                    marginRight: 0,
                                                }}
                                            >
                                                <TextArea
                                                    onChange={value => handlerAddField(index, "value", value)}
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
                                            onClick={() => {
                                                if (fields.length > 1) {
                                                    fields.splice(index, 1);
                                                }
                                                update();
                                            }}
                                            style={{
                                                background: "none",
                                                color: "var(--status-danger)",
                                                ...(field.name.length && field.value.length
                                                    ? {}
                                                    : {
                                                          visibility: "hidden",
                                                          pointerEvents: "none",
                                                      }),
                                            }}
                                        >
                                            <DeleteIcon />
                                        </Button>
                                    </Flex>
                                    <FormSwitchCompat
                                        value={field.inline}
                                        onChange={value => handlerAddField(index, "inline", value)}
                                        hideBorder
                                    >
                                        Inline
                                    </FormSwitchCompat>
                                </React.Fragment>
                            ))}
                        </Flex>
                    </Card>
                    <Card style={{ padding: "1em 1em 0" }}>
                        <Heading style={{ width: "fit-content" }} tag="h3">
                            Footer
                        </Heading>
                        <Flex flexDirection="row" style={{ padding: 12 }}>
                            <div style={{ flex: 1, marginLeft: 0 }}>
                                <Heading>Title</Heading>
                                <TextArea
                                    onChange={setFooterTitle}
                                    placeholder={text}
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
                            <FormSwitchCompat
                                value={footerTimestamp}
                                onChange={setFooterTimestamp}
                                note="Displays the current time"
                                hideBorder
                            >
                                Timestamp
                            </FormSwitchCompat>
                        </div>
                    </Card>
                    {isCreate ? (
                        <span></span>
                    ) : (
                        <Card style={{ padding: "1em 1em 0" }}>
                            <Heading style={{ width: "fit-content" }} tag="h3">
                                Select Embeds (Edit mode)
                            </Heading>
                            <Flex flexDirection="row" style={{ padding: 12 }}>
                                <Slider
                                    minValue={1}
                                    maxValue={(messageRaw?.embeds?.length || 0) + 1}
                                    asValueChanges={(va: number) => {
                                        va = Math.round(va);
                                        setIndexE(va - 1);
                                        setFields([
                                            ...(firstEmbed?.fields ? firstEmbed.fields : []),
                                            {
                                                name: "",
                                                value: "",
                                                inline: false,
                                            },
                                        ]);
                                        if (fields.length > 25) {
                                            fields.splice(25);
                                        }
                                        // Author
                                        if (typeof firstEmbed?.author?.name === "string") {
                                            setAuthorTitle(firstEmbed?.author?.name);
                                        }
                                        if (typeof firstEmbed?.author?.url === "string") {
                                            setAuthorURL(firstEmbed?.author?.url);
                                        }
                                        if (typeof firstEmbed?.author?.icon_url === "string") {
                                            setAuthorImage(firstEmbed?.author?.icon_url);
                                        }
                                        // Body
                                        if (typeof firstEmbed?.title === "string") {
                                            setTitle(firstEmbed?.title);
                                        }
                                        if (typeof firstEmbed?.description === "string") {
                                            setDescription(firstEmbed?.description);
                                        }
                                        if (typeof firstEmbed?.url === "string") {
                                            setURL(firstEmbed?.url);
                                        }
                                        if (
                                            typeof firstEmbed === "object" &&
                                            "color" in firstEmbed &&
                                            typeof firstEmbed?.color === "number"
                                        ) {
                                            setColor("#" + firstEmbed.color.toString(16));
                                        }
                                        // Image
                                        if (typeof firstEmbed?.image?.url === "string") {
                                            setImage(firstEmbed?.image?.url);
                                        }
                                        if (typeof firstEmbed?.thumbnail?.url === "string") {
                                            setThumbnail(firstEmbed?.thumbnail?.url);
                                        }
                                        // Footer
                                        if (typeof firstEmbed?.footer?.text === "string") {
                                            setFooterTitle(firstEmbed?.footer?.text);
                                        }
                                        if (typeof firstEmbed?.footer?.icon_url === "string") {
                                            setFooterURL(firstEmbed?.footer?.icon_url);
                                        }
                                        setFooterTimestamp(!!firstEmbed?.timestamp);
                                    }}
                                    initialValue={1}
                                    orientation={"vertical"}
                                    onValueRender={(va: number) => String(Math.round(va))}
                                    stickToMarkers={true}
                                    markers={Array.from(new Array(messageRaw?.embeds?.length || 0), (_, i) => i + 1)}
                                />
                            </Flex>
                        </Card>
                    )}
                </Flex>
            </ModalContent>
            <ModalFooter>
                <Flex flexDirection="row" style={{ gap: 12 }}>
                    <Button
                        onClick={() => {
                            modalProps.onClose();
                            // Build Embed
                            const embed: {
                                [key: string]: any;
                            } = {};
                            if (title) embed.title = title;
                            if (description) embed.description = description;
                            if (url && URL.canParse(url)) embed.url = url;
                            if (color) {
                                let c = color;
                                if (c.startsWith("#")) {
                                    c = c.slice(1);
                                }
                                if (c.length > 6 || Number.isNaN(parseInt(c, 16))) {
                                    // skip
                                } else {
                                    embed.color = parseInt(c, 16);
                                }
                            }
                            const ava = fields.filter(f => f.name.length && f.value.length);
                            if (ava.length) embed.fields = ava;
                            if (authorTitle) {
                                embed.author = {
                                    name: authorTitle,
                                };
                                if (authorURL && URL.canParse(authorURL)) {
                                    embed.author.url = authorURL;
                                }
                                if (authorImage && URL.canParse(authorImage)) {
                                    embed.author.icon_url = authorImage;
                                }
                            }
                            if (footerTitle) {
                                embed.footer = {
                                    text: footerTitle,
                                };
                                if (footerURL && URL.canParse(footerURL)) {
                                    embed.footer.icon_url = footerURL;
                                }
                            }
                            if (footerTimestamp) {
                                embed.timestamp = new Date().toISOString();
                            }
                            if (image && URL.canParse(image)) {
                                embed.image = {
                                    url: image,
                                };
                            }
                            if (thumbnail && URL.canParse(thumbnail)) {
                                embed.thumbnail = {
                                    url: thumbnail,
                                };
                            }
                            if (Object.keys(embed).length) {
                                // callback
                                if (messageRaw) {
                                    messageRaw.embeds[indexE] = embed;
                                    const data = {
                                        attachments: messageRaw.attachments,
                                        flags: messageRaw.flags,
                                        embeds: messageRaw.embeds,
                                    };
                                    callbackSendEmbed(embed, data);
                                } else {
                                    callbackSendEmbed(embed, undefined);
                                }
                            }
                        }}
                    >
                        {isCreate ? "Create it !" : "Edit it !"}
                    </Button>
                </Flex>
            </ModalFooter>
        </ModalRoot>
    );
}
