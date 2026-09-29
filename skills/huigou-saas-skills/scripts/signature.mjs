import { createHash } from "node:crypto";

// Input must be the JSON variables actually sent, before GraphQL coercion.
function stableValue(value) {
    if (value === null || value === undefined) return undefined;
    if (Array.isArray(value)) return value.map(stableValue).filter((item) => item !== undefined);
    if (typeof value === "object") {
        const out = {};
        for (const key of Object.keys(value).sort()) {
            const item = stableValue(value[key]);
            if (item !== undefined) out[key] = item;
        }
        return out;
    }
    return value;
}

export function applicationSignContent(variables) {
    return Object.keys(variables).sort().flatMap((key) => {
        const value = variables[key];
        if (value == null || (typeof value === "string" && value.trim() === "") ||
            (Array.isArray(value) && value.length === 0)) return [];
        const text = typeof value === "object" ? JSON.stringify(stableValue(value)) : String(value);
        return [`${key}=${text}`];
    }).join("&");
}

export function signApplicationInput(variables, secret) {
    return createHash("md5").update(applicationSignContent(variables) + secret, "utf8").digest("hex");
}
