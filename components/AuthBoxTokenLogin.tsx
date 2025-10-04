/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { findByPropsLazy } from "@webpack";
import { useState } from "@webpack/common";

export const marginModule = findByPropsLazy("marginBottom8", "marginTop20", "marginBottom20");
export const authBoxModule = findByPropsLazy("authBox", "authBoxExpanded", "block", "button");
export const titleModule = findByPropsLazy(
    "h5",
    "errorMessage",
    "defaultMarginh5",
    "error",
    "errorMessage",
    "errorSeparator",
);
export const inputModule = findByPropsLazy("inputWrapper", "inputDefault", "inputError");
// const inputError = findByPropsLazy("inputError", "hiddenMessage");

export const contentModule = findByPropsLazy(
    "button",
    "lookFilled",
    "colorBrand",
    "sizeLarge",
    "fullWidth",
    "grow",
    "contents",
);

const LoginToken = findByPropsLazy("loginToken", "login");

export default function AuthBoxTokenLogin () {
    const [state, setState] = useState<string>();
    const [error, setError] = useState<string>();
    return (
        <>
            <div className={`${authBoxModule.block} ${marginModule.marginTop20}`}>
                <div className={marginModule.marginBottom20}>
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
                    className={`${marginModule.marginBottom8} ${authBoxModule.button} ${contentModule.button} ${contentModule.lookFilled} ${contentModule.colorBrand} ${contentModule.sizeLarge} ${contentModule.fullWidth} ${contentModule.grow}`}
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
