"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.buildDateFilter = exports.maxFoodAllowance = exports.FOOD_PER_DAY = exports.calcTotalDays = exports.buildPaginationMeta = exports.getPagination = void 0;
// ─── Pagination Helper ────────────────────────────────────────────────────────
const getPagination = (query) => {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;
    return { page, limit, skip };
};
exports.getPagination = getPagination;
// ─── Build Pagination Response ────────────────────────────────────────────────
const buildPaginationMeta = (page, limit, total) => ({
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit),
    hasNextPage: page * limit < total,
});
exports.buildPaginationMeta = buildPaginationMeta;
// ─── Calculate Total Days (inclusive) ────────────────────────────────────────
const calcTotalDays = (startDate, endDate) => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffMs = end.getTime() - start.getTime();
    return Math.floor(diffMs / (1000 * 60 * 60 * 24)) + 1;
};
exports.calcTotalDays = calcTotalDays;
// ─── Food Allowance Max ───────────────────────────────────────────────────────
exports.FOOD_PER_DAY = 400;
const maxFoodAllowance = (totalDays) => {
    return exports.FOOD_PER_DAY * totalDays;
};
exports.maxFoodAllowance = maxFoodAllowance;
// ─── Build Date Range Filter ──────────────────────────────────────────────────
const buildDateFilter = (query) => {
    const filter = {};
    if (query.startDate || query.endDate) {
        filter.startDate = {};
        if (query.startDate)
            filter.startDate.$gte = new Date(query.startDate);
        if (query.endDate)
            filter.startDate.$lte = new Date(query.endDate);
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
exports.buildDateFilter = buildDateFilter;
