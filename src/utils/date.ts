// IST is UTC+5:30 with no DST.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
const pad = (n: number, w = 2) => String(n).padStart(w, "0");

/**
 * Convert a Date / ISO string to an ISO-8601 string in IST (with +05:30 suffix).
 * Returns null for invalid / missing input.
 */
export const toIST = (
  d: Date | string | null | undefined
): string | null => {
  if (!d) return null;
  const date = typeof d === "string" ? new Date(d) : d;
  if (!(date instanceof Date) || isNaN(date.getTime())) return null;

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

export const istify = <T>(input: T): T => {
  if (input === null || input === undefined) return input;
  if (input instanceof Date) return (toIST(input) as unknown) as T;
  if (Array.isArray(input)) {
    return input.map((item) => istify(item)) as unknown as T;
  }
  if (typeof input === "object") {
    const src = (input as any).toObject ? (input as any).toObject() : input;
    const out: any = Array.isArray(src) ? [] : {};
    for (const key of Object.keys(src)) {
      const val = src[key];
      if (val instanceof Date && DATE_KEYS.has(key)) {
        out[key] = toIST(val);
      } else if (
        DATE_KEYS.has(key) &&
        typeof val === "string" &&
        !isNaN(new Date(val).getTime())
      ) {
        out[key] = toIST(val);
      } else {
        out[key] = istify(val);
      }
    }
    return out;
  }
  return input;
};
