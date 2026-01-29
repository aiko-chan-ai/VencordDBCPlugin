/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Margins } from "@utils/margins";
import { findByPropsLazy } from "@webpack";
import { useState } from "@webpack/common";

/** I hate Discord
 * v479219:
        28731: function(e, t, n) {
            "use strict";
            e.exports = {
                discordLogo: "discordLogo__921c5",
                authBox: "authBox__921c5",
                authBoxExpanded: "authBoxExpanded__921c5 authBox__921c5",
                centeringWrapper: "centeringWrapper__921c5",
                title: "title__921c5",
                subText: "subText__921c5",
                pill: "pill__921c5",
                pillOnline: "pillOnline__921c5",
                pillIcon: "pillIcon__921c5",
                pillIconTotal: "pillIconTotal__921c5 pillIcon__921c5",
                pillIconOnline: "pillIconOnline__921c5 pillIcon__921c5",
                pillFlat: "pillFlat__921c5",
                joiningAs: "joiningAs__921c5",
                joiningAsAvatar: "joiningAsAvatar__921c5",
                joiningAsUsername: "joiningAsUsername__921c5",
                spinnerVideo: "spinnerVideo__921c5",
                image: "image__921c5",
                block: "block__921c5",
                button: "button__921c5",
                linkButton: "linkButton__921c5",
                inviteIcon: "inviteIcon__921c5",
                inviteLargeIcon: "inviteLargeIcon__921c5 inviteIcon__921c5",
                downloadButtonSubtext: "downloadButtonSubtext__921c5"
            }
        },
 * v490370
        380172(e, t, n) {
            "use strict";
            e.exports = {
                ie: "discordLogo__921c5",
                sL: "authBox__921c5",
                PR: "authBoxExpanded__921c5 authBox__921c5",
                f4: "centeringWrapper__921c5",
                DD: "title__921c5",
                Sv: "subText__921c5",
                Io: "pill__921c5",
                L1: "pillOnline__921c5",
                nW: "pillIcon__921c5",
                jk: "pillIconTotal__921c5 pillIcon__921c5",
                _o: "pillIconOnline__921c5 pillIcon__921c5",
                Z6: "pillFlat__921c5",
                l1: "joiningAs__921c5",
                yj: "joiningAsAvatar__921c5",
                pp: "joiningAsUsername__921c5",
                $$: "spinnerVideo__921c5",
                Sl: "image__921c5",
                om: "block__921c5",
                TP: "inviteIcon__921c5",
                yt: "inviteLargeIcon__921c5 inviteIcon__921c5",
                UM: "downloadButtonSubtext__921c5"
            }
        },
 * i need hardcoded keys here because the class names are obfuscated and change often
 */
export const authBoxModule = {
    authBox: "authBox__921c5",
    authBoxExpanded: "authBoxExpanded__921c5 authBox__921c5",
    block: "block__921c5",
    button: "button__921c5",
};
// findByPropsLazy("authBox", "authBoxExpanded", "block", "button");
// v490370: Tested OK
export const titleModule = findByPropsLazy(
    "h5",
    "errorMessage",
    "defaultMarginh5",
    "error",
    "errorMessage",
    "errorSeparator",
);
// v490370: Tested OK
export const inputModule = findByPropsLazy("inputWrapper", "inputDefault", "inputError");

/**
 * v479219:
        973013: function(e, t, n) {
            "use strict";
            e.exports = {
                button: "button__201d5",
                contents: "contents__201d5",
                lookFilled: "lookFilled__201d5",
                colorBrand: "colorBrand__201d5",
                spinnerItem: "spinnerItem__201d5",
                colorBrandInverted: "colorBrandInverted__201d5",
                lookOutlined: "lookOutlined__201d5",
                lookLink: "lookLink__201d5 " + n(546740).lowSaturationUnderline,
                colorPrimary: "colorPrimary__201d5",
                colorLink: "colorLink__201d5",
                colorWhite: "colorWhite__201d5",
                colorRed: "colorRed__201d5",
                colorGreen: "colorGreen__201d5",
                colorTransparent: "colorTransparent__201d5",
                lookBlank: "lookBlank__201d5",
                sizeTiny: "sizeTiny__201d5",
                sizeSmall: "sizeSmall__201d5",
                sizeMedium: "sizeMedium__201d5",
                sizeLarge: "sizeLarge__201d5",
                sizeMin: "sizeMin__201d5",
                sizeMax: "sizeMax__201d5",
                sizeIcon: "sizeIcon__201d5",
                grow: "grow__201d5",
                fullWidth: "fullWidth__201d5",
                submitting: "submitting__201d5",
                spinner: "spinner__201d5",
                disabledButtonWrapper: "disabledButtonWrapper__201d5",
                disabledButtonOverlay: "disabledButtonOverlay__201d5"
            }
        },
 * v490370:
        134112(e, t, n) {
            "use strict";
            e.exports = {
                x6: "button__201d5",
                PG: "contents__201d5",
                WL: "lookFilled__201d5",
                x8: "colorBrand__201d5",
                $N: "spinnerItem__201d5",
                Qn: "colorBrandInverted__201d5",
                uu: "lookOutlined__201d5",
                M_: "lookLink__201d5 " + n(423367).xf,
                cG: "colorPrimary__201d5",
                I5: "colorLink__201d5",
                bD: "colorWhite__201d5",
                D: "colorRed__201d5",
                RH: "colorGreen__201d5",
                Ey: "colorTransparent__201d5",
                Ev: "lookBlank__201d5",
                Ei: "sizeTiny__201d5",
                g4: "sizeSmall__201d5",
                $g: "sizeMedium__201d5",
                Pu: "sizeLarge__201d5",
                CM: "sizeMin__201d5",
                Gn: "sizeMax__201d5",
                Rk: "sizeIcon__201d5",
                wS: "grow__201d5",
                Ij: "fullWidth__201d5",
                B2: "submitting__201d5",
                u1: "spinner__201d5",
                Yr: "disabledButtonWrapper__201d5",
                p5: "disabledButtonOverlay__201d5"
            }
        },
 */
export const contentModule = {
    button: "button__201d5",
    contents: "contents__201d5",
    lookFilled: "lookFilled__201d5",
    colorBrand: "colorBrand__201d5",
    sizeLarge: "sizeLarge__201d5",
    fullWidth: "fullWidth__201d5",
    grow: "grow__201d5",
};
/*
findByPropsLazy(
    "button",
    "lookFilled",
    "colorBrand",
    "sizeLarge",
    "fullWidth",
    "grow",
    "contents",
);
*/
const LoginToken = findByPropsLazy("loginToken", "login");

export default function AuthBoxTokenLogin() {
    const [state, setState] = useState<string>();
    const [error, setError] = useState<string>();
    return (
        <>
            <div className={`${authBoxModule.block} ${Margins.top20}`}>
                <div className={Margins.bottom20}>
                    <h5
                        className={`${titleModule.h5} ${titleModule.defaultMarginh5}${error ? " " + titleModule.error : ""}`}
                    >
                        Bot Token
                        {error ? (
                            <span className={titleModule.errorMessage}>
                                <span className={titleModule.errorSeparator}>-</span>
                                {error}
                            </span>
                        ) : null}
                    </h5>
                    <div className={inputModule.inputWrapper}>
                        <input
                            className={`${inputModule.inputDefault}${error ? " " + inputModule.inputError : ""}`}
                            name="token"
                            type="password"
                            placeholder="Enter your bot token"
                            aria-label="Token"
                            autoComplete="off"
                            maxLength={100}
                            spellCheck="false"
                            value={state}
                            onChange={ev => {
                                setState(ev.target.value);
                            }}
                        />
                    </div>
                </div>
                <button
                    type="submit"
                    className={`${Margins.bottom8} ${authBoxModule.button} ${contentModule.button} ${contentModule.lookFilled} ${contentModule.colorBrand} ${contentModule.sizeLarge} ${contentModule.fullWidth} ${contentModule.grow}`}
                    onClick={ev => {
                        ev.preventDefault();
                        if (
                            !/(mfa\.[a-z0-9_-]{20,})|([a-z0-9_-]{23,28}\.[a-z0-9_-]{6,7}\.[a-z0-9_-]{27})/i.test(
                                (state || "").trim(),
                            )
                        ) {
                            setError("Invalid token");
                            return;
                        }
                        window.sessionStorage.setItem("currentShard", "0");
                        LoginToken.loginToken(state);
                    }}
                >
                    <div className={contentModule.contents}>Login</div>
                </button>
            </div>
        </>
    );
}
