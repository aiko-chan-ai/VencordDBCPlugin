import { findByPropsLazy } from "@webpack";
import { useState } from "@webpack/common";

const marginModule = findByPropsLazy("marginBottom8", "marginTop20");
const authBoxModule = findByPropsLazy("authBox", "authBoxExpanded");
const titleModule = findByPropsLazy("h5", "errorMessage");
const inputModule = findByPropsLazy("inputWrapper", "inputDefault", "inputMini");

export default function AuthBoxMultiTokenLogin() {
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