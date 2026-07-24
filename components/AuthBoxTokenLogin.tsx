/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./AuthBoxTokenLogin.css";

import { classNameFactory } from "@utils/css";
import { Margins } from "@utils/margins";
import { classes } from "@utils/misc";
import { findByPropsLazy, findCssClassesLazy } from "@webpack";
import { useState } from "@webpack/common";

import { originalSessionStorage, RegExToken } from "../utils/common";

export const cl = classNameFactory("vc-bot-client-auth-box-token-login-");

export const authBoxModule = findCssClassesLazy("authBox", "authBoxExpanded", "block");

export const inputModule = findByPropsLazy("inputWrapper", "inputDefault", "inputError");

export const contentModule = findCssClassesLazy(
    "button",
    "lookFilled",
    "colorBrand",
    "sizeLarge",
    "fullWidth",
    "grow",
    "contents",
);

const LoginToken = findByPropsLazy("loginToken", "login");

export default function AuthBoxTokenLogin() {
    const [state, setState] = useState("");
    const [error, setError] = useState<string>();
    return (
        <>
            <div className={classes(authBoxModule.block, Margins.top20)}>
                <div className={Margins.bottom20}>
                    <h5
                        className={classes(cl("h5"), cl("defaultMarginh5"), error && cl("error"))}
                    >
                        Bot Token
                        {error ? (
                            <span className={cl("errorMessage")}>
                                <span className={cl("errorSeparator")}>-</span>
                                {error}
                            </span>
                        ) : null}
                    </h5>
                    <div className={inputModule.inputWrapper}>
                        <input
                            className={classes(inputModule.inputDefault, error && inputModule.inputError)}
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
                    className={classes(Margins.bottom8, contentModule.button, contentModule.lookFilled, contentModule.colorBrand, contentModule.sizeLarge, contentModule.fullWidth, contentModule.grow)}
                    onClick={ev => {
                        ev.preventDefault();
                        if (!RegExToken.test(state.trim())) {
                            setError("Invalid token");
                            return;
                        }
                        originalSessionStorage.setItem("currentShard", "0");
                        LoginToken.loginToken(state);
                    }}
                >
                    <div className={contentModule.contents}>Login</div>
                </button>
            </div>
        </>
    );
}
