"use strict";
// ─── Expense total calculation ────────────────────────────────────────────────
// A single source of truth for how an expense document rolls up into totals.
//
// Rule: an expense only counts towards `totalExpense` once it has cleared
// approval. Items still sitting in "pending" (and rejected ones) are held out
// and reported separately as `pendingExpense` / `rejectedAmount`.
Object.defineProperty(exports, "__esModule", { value: true });
exports.emptyExpenseTotals = exports.expenseTotalsAccumulators = exports.expenseTotalsStage = exports.computeExpenseTotals = exports.COUNTED_STATUSES = void 0;
exports.COUNTED_STATUSES = ["approved", "auto_approved"];
const ZERO_TOTALS = {
    totalExpense: 0,
    pendingExpense: 0,
    pendingReimbursement: 0,
    approvedReimbursement: 0,
    rejectedAmount: 0,
};
const amountOf = (item) => Number(item === null || item === void 0 ? void 0 : item.amount) || 0;
const isCounted = (item) => exports.COUNTED_STATUSES.includes(item === null || item === void 0 ? void 0 : item.status);
// ─── Plain-object calculation (model hook + lean docs in reports) ────────────
const computeExpenseTotals = (expense) => {
    if (!expense)
        return Object.assign({}, ZERO_TOTALS);
    const items = [expense.food, expense.cng, expense.other].filter(Boolean);
    const sum = (predicate) => items.filter(predicate).reduce((total, i) => total + amountOf(i), 0);
    return {
        // Approved / auto-approved only — anything awaiting approval is excluded.
        totalExpense: sum(isCounted),
        pendingExpense: sum((i) => i.status === "pending"),
        pendingReimbursement: sum((i) => i.paidBy === "driver" && i.status === "pending"),
        approvedReimbursement: sum((i) => i.paidBy === "driver" && i.status === "approved"),
        rejectedAmount: sum((i) => i.paidBy === "driver" && i.status === "rejected"),
    };
};
exports.computeExpenseTotals = computeExpenseTotals;
// ─── Aggregation-pipeline equivalents ────────────────────────────────────────
// Totals are recalculated from the item statuses inside the pipeline rather
// than trusting the stored fields, so dashboards stay correct even for
// documents saved before this rule existed.
const FIELDS = ["food", "cng", "other"];
const amountExpr = (field) => ({ $ifNull: [`$${field}.amount`, 0] });
const amountIf = (field, condition) => ({
    $cond: [condition, amountExpr(field), 0],
});
const statusIs = (field, statuses) => ({
    $in: [{ $ifNull: [`$${field}.status`, ""] }, [...statuses]],
});
const paidByDriver = (field) => ({
    $eq: [{ $ifNull: [`$${field}.paidBy`, ""] }, "driver"],
});
const sumOverFields = (build) => ({
    $add: FIELDS.map(build),
});
/**
 * `$addFields` stage exposing freshly computed totals on every Expense doc.
 * Use the `computed*` fields in any `$group` that follows it.
 */
exports.expenseTotalsStage = {
    $addFields: {
        computedTotalExpense: sumOverFields((f) => amountIf(f, statusIs(f, exports.COUNTED_STATUSES))),
        computedPendingExpense: sumOverFields((f) => amountIf(f, statusIs(f, ["pending"]))),
        computedPendingReimbursement: sumOverFields((f) => amountIf(f, { $and: [paidByDriver(f), statusIs(f, ["pending"])] })),
        computedApprovedReimbursement: sumOverFields((f) => amountIf(f, { $and: [paidByDriver(f), statusIs(f, ["approved"])] })),
        computedRejectedAmount: sumOverFields((f) => amountIf(f, { $and: [paidByDriver(f), statusIs(f, ["rejected"])] })),
    },
};
/** `$group` accumulators that pair with {@link expenseTotalsStage}. */
exports.expenseTotalsAccumulators = {
    totalExpense: { $sum: "$computedTotalExpense" },
    pendingExpense: { $sum: "$computedPendingExpense" },
    pendingReimbursement: { $sum: "$computedPendingReimbursement" },
    approvedReimbursement: { $sum: "$computedApprovedReimbursement" },
    rejectedAmount: { $sum: "$computedRejectedAmount" },
};
const emptyExpenseTotals = () => (Object.assign({}, ZERO_TOTALS));
exports.emptyExpenseTotals = emptyExpenseTotals;
