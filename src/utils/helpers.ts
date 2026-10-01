import { Request } from "express";

// ─── Pagination Helper ────────────────────────────────────────────────────────
export const getPagination = (query: Request["query"]) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

// ─── Build Pagination Response ────────────────────────────────────────────────
export const buildPaginationMeta = (page: number, limit: number, total: number) => ({
  page,
  limit,
  total,
  totalPages: Math.ceil(total / limit),
  hasNextPage: page * limit < total,
});

// ─── Visit dates & times (IST) ───────────────────────────────────────────────
// Visits are entered in India, so a picked time is IST no matter where the
// server runs. Date-only visits are stored at 00:00 UTC (05:30 IST) as they
// always have been; both shapes fall on the right IST calendar day.
export const IST_OFFSET_MS = 330 * 60 * 1000;
const DAY_MS = 1000 * 60 * 60 * 24;
const YMD_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):([0-5]\d)$/;

/** "HH:mm" in 24-hour form, or false. */
export const isValidTime = (value: unknown): value is string =>
  typeof value === "string" && TIME_RE.test(value);

/** Days since epoch on the IST calendar — the basis for every day count. */
const istDayNumber = (date: Date) => Math.floor((new Date(date).getTime() + IST_OFFSET_MS) / DAY_MS);

/** "YYYY-MM-DD" of a stored instant, on the IST calendar. */
export const istYmd = (date: Date) => new Date(new Date(date).getTime() + IST_OFFSET_MS).toISOString().slice(0, 10);

/** Instant at which an IST calendar day starts. */
export const istDayStart = (ymd: string) => new Date(new Date(`${ymd}T00:00:00Z`).getTime() - IST_OFFSET_MS);

/**
 * Turn a picked date (plus optional "HH:mm" IST time) into the stored instant.
 * Without a time it keeps the historic date-only value, 00:00 UTC.
 */
export const buildVisitInstant = (date: string | Date, time?: string): Date => {
  const ymd = typeof date === "string" && YMD_RE.test(date) ? date : istYmd(new Date(date));
  if (!time) return new Date(`${ymd}T00:00:00Z`);
  return new Date(new Date(`${ymd}T${time}:00Z`).getTime() - IST_OFFSET_MS);
};

// ─── Calculate Total Days (inclusive, IST calendar days) ─────────────────────
// A time of day never changes the count: 10 PM Monday → 8 AM Tuesday is 2 days.
export const calcTotalDays = (startDate: Date, endDate: Date): number =>
  istDayNumber(endDate) - istDayNumber(startDate) + 1;

/**
 * Whether a visit ends before it starts. Times only take part when both ends
 * carry one — a date-only end on the start day is never "before" the start.
 */
export const endsBeforeStart = (
  startDate: Date, endDate: Date, startTime?: string, endTime?: string,
): boolean => {
  const startDay = istDayNumber(startDate);
  const endDay = istDayNumber(endDate);
  if (endDay !== startDay) return endDay < startDay;
  return Boolean(startTime && endTime) && endTime! < startTime!;
};

// ─── Food Allowance Max ───────────────────────────────────────────────────────
export const FOOD_PER_DAY = 400;

export const maxFoodAllowance = (totalDays: number): number => {
  return FOOD_PER_DAY * totalDays;
};

// ─── Build Date Range Filter ──────────────────────────────────────────────────
export const buildDateFilter = (query: Request["query"]) => {
  const filter: any = {};

  // Bare "YYYY-MM-DD" bounds cover whole IST days, so a visit that starts at
  // 6 PM on the end date is still inside the range.
  if (query.startDate || query.endDate) {
    filter.startDate = {};
    if (query.startDate) {
      const start = String(query.startDate);
      filter.startDate.$gte = YMD_RE.test(start) ? istDayStart(start) : new Date(start);
    }
    if (query.endDate) {
      const end = String(query.endDate);
      filter.startDate.$lte = YMD_RE.test(end)
        ? new Date(istDayStart(end).getTime() + DAY_MS - 1)
        : new Date(end);
    }
  }

  if (query.month && query.year) {
    const month = Number(query.month) - 1; // 0-indexed
    const year = Number(query.year);
    const first = new Date(Date.UTC(year, month, 1)).toISOString().slice(0, 10);
    const next = new Date(Date.UTC(year, month + 1, 1)).toISOString().slice(0, 10);
    filter.startDate = {
      $gte: istDayStart(first),
      $lt: istDayStart(next),
    };
  }

  return filter;
};
