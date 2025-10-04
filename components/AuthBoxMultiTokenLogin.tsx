/*
 * Vencord, a Discord client mod
 * Copyright (c) 2025 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { useState } from "@webpack/common";

import { authBoxModule, inputModule,marginModule, titleModule } from "./AuthBoxTokenLogin";

export default function AuthBoxMultiTokenLogin () {
    const [state, setState] = useState<string>();
    return (
        <>
            <div className={`${authBoxModule.block} ${marginModule.marginTop20}`}>
                <div className={marginModule.marginBottom20}>
                    <h5 className={`${titleModule.h5} ${titleModule.defaultMarginh5} token_multi`}>
                        Bot Token
                    </h5>
                    <div className={inputModule.inputWrapper}>
                        <input
                            className={`${inputModule.inputDefault} token_multi`}
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
            </div>
        </>
    );
}
