/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const RegExToken = /(mfa\.[a-z0-9_-]{20,})|([a-z0-9_-]{23,28}\.[a-z0-9_-]{6,7}\.[a-z0-9_-]{27})/i;

export const originalSessionStorage = window.sessionStorage;

export function extractApiErrors(errorResponse) {
    const extractedErrors: {
        path: string;
        code: string;
        message: string;
    }[] = [];
    if (!errorResponse || !errorResponse.errors) {
        return extractedErrors;
    }
    function traverse(currentObj: Record<string, any>, currentPath: string) {
        for (const key in currentObj) {
            if (key === "_errors") {
                currentObj[key].forEach(err => {
                    extractedErrors.push({
                        path: currentPath.length ? currentPath: "root (Request Level)",
                        code: err.code,
                        message: err.message
                    });
                });
            } else if (typeof currentObj[key] === "object" && currentObj[key] !== null) {
                let nextPath = currentPath;
                if (!currentPath) {
                    nextPath = key;
                } else if (!isNaN(Number(key))) {
                    // Array
                    nextPath = `${currentPath}[${key}]`;
                } else {
                    // Object
                    nextPath = `${currentPath}.${key}`;
                }
                traverse(currentObj[key], nextPath);
            }
        }
    }
    traverse(errorResponse.errors, "");
    return extractedErrors;
}

export function buildDiscordAPIErrorMessage(response) {
    const errors: string[] = [];
    errors.push(`Discord API Error [${response.code}]: ${response.message}`);
    errors.push("```diff");
    errors.push("- Details:");
    const detailedErrors = extractApiErrors(response);
    if (detailedErrors.length > 0) {
        detailedErrors.forEach(err => {
            errors.push(`\t👉 ${err.path}`);
            errors.push(`\t\t❌ [${err.code}]: ${err.message}`);
        });
    }
    errors.push("```");
    return errors.join("\n");
}
