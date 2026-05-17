"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.istify = exports.toIST = void 0;
// IST is UTC+5:30 with no DST.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const pad = (n, w = 2) => String(n).padStart(w, "0");
/**
 * Convert a Date / ISO string to an ISO-8601 string in IST (with +05:30 suffix).
 * Returns null for invalid / missing input.
 */
const toIST = (d) => {
    if (!d)
        return null;
    const date = typeof d === "string" ? new Date(d) : d;
    if (!(date instanceof Date) || isNaN(date.getTime()))
        return null;
    const ist = new Date(date.getTime() + IST_OFFSET_MS);
    const y = ist.getUTCFullYear();
    const m = pad(ist.getUTCMonth() + 1);
    const day = pad(ist.getUTCDate());
    const hh = pad(ist.getUTCHours());
    const mm = pad(ist.getUTCMinutes());
    const ss = pad(ist.getUTCSeconds());
    const ms = pad(ist.getUTCMilliseconds(), 3);
    return `${y}-${m}-${day}T${hh}:${mm}:${ss}.${ms}+05:30`;
};
exports.toIST = toIST;
/**
 * Recursively walk a plain object/array and convert known date-ish fields to IST strings.
 * Works on mongoose lean/toObject output. Non-date fields are returned untouched.
 */
const DATE_KEYS = new Set([
    "date",
    "createdAt",
    "updatedAt",
    "verifiedAt",
    "paidAt",
    "timestamp",
    "tokenExpire",
]);
const istify = (input) => {
    if (input === null || input === undefined)
        return input;
    if (input instanceof Date)
        return (0, exports.toIST)(input);
    if (Array.isArray(input)) {
        return input.map((item) => (0, exports.istify)(item));
    }
    if (typeof input === "object") {
        const src = input.toObject ? input.toObject() : input;
        const out = Array.isArray(src) ? [] : {};
        for (const key of Object.keys(src)) {
            const val = src[key];
            if (val instanceof Date && DATE_KEYS.has(key)) {
                out[key] = (0, exports.toIST)(val);
            }
            else if (DATE_KEYS.has(key) &&
                typeof val === "string" &&
                !isNaN(new Date(val).getTime())) {
                out[key] = (0, exports.toIST)(val);
            }
            else {
                out[key] = (0, exports.istify)(val);
            }
        }
        return out;
    }
    return input;
};
exports.istify = istify;
