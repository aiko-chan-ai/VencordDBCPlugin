/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { Margins } from "@utils/margins";
import { useEffect, useState } from "@webpack/common";

import { authBoxModule, inputModule, titleModule } from "./AuthBoxTokenLogin";

// Shared with the patched "Continue" button (validateTokenAndLogin), which is Discord's own button and lives outside this component
export const multiTokenState = { value: "" };

export default function AuthBoxMultiTokenLogin() {
    const [state, setState] = useState("");

    useEffect(() => {
        multiTokenState.value = "";
        return () => {
            multiTokenState.value = "";
        };
    }, []);

    return (
        <>
            <div className={`${authBoxModule.block} ${Margins.top20}`}>
                <div className={Margins.bottom20}>
                    <h5 className={`${titleModule.h5} ${titleModule.defaultMarginh5}`}>
                        Bot Token
                    </h5>
                    <div className={inputModule.inputWrapper}>
                        <input
                            className={inputModule.inputDefault}
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
                                multiTokenState.value = ev.target.value;
                            }}
                        />
                    </div>
                </div>
            </div>
        </>
    );
}
