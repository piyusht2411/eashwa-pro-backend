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

// ─── Calculate Total Days (inclusive) ────────────────────────────────────────
export const calcTotalDays = (startDate: Date, endDate: Date): number => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffMs = end.getTime() - start.getTime();
  return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
};

// ─── Food Allowance Max ───────────────────────────────────────────────────────
export const FOOD_PER_DAY = 400;

export const maxFoodAllowance = (totalDays: number): number => {
  return FOOD_PER_DAY * totalDays;
};

// ─── Build Date Range Filter ──────────────────────────────────────────────────
export const buildDateFilter = (query: Request["query"]) => {
  const filter: any = {};

  if (query.startDate || query.endDate) {
    filter.startDate = {};
    if (query.startDate) filter.startDate.$gte = new Date(query.startDate as string);
    if (query.endDate) filter.startDate.$lte = new Date(query.endDate as string);
  }

  if (query.month && query.year) {
    const month = Number(query.month) - 1; // 0-indexed
    const year = Number(query.year);
    filter.startDate = {
      $gte: new Date(year, month, 1),
      $lte: new Date(year, month + 1, 0, 23, 59, 59),
    };
  }

  return filter;
};
