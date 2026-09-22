"use strict";
// ─── Expense total calculation ────────────────────────────────────────────────
// A single source of truth for how an expense document rolls up into totals.
//
// Every expense item is split across two payers: `driverAmount` (paid out of
// the driver's pocket, so it has to be reimbursed) and `companyAmount` (paid
// directly by the company, nothing to reimburse). A single trip can carry
// both — e.g. ₹4000 of CNG where the driver put in ₹2000 and the company
// ₹2000.
//
// `status` therefore describes the DRIVER portion only: the company portion is
// never approved or rejected, it simply counts. An item whose driver portion is
// zero carries "auto_approved", which is what the old company-paid rows meant.
//
// Rule: an expense only counts towards `totalExpense` once it has cleared
// approval. Driver amounts still sitting in "pending" (and rejected ones) are
// held out and reported separately as `pendingExpense` / `rejectedAmount`.
Object.defineProperty(exports, "__esModule", { value: true });
exports.emptyExpenseTotals = exports.expenseTotalsAccumulators = exports.PENDING_EXPENSE_FILTER = exports.expenseTotalsStage = exports.computeExpenseTotals = exports.normalizeExpense = exports.normalizeExpenseItem = exports.paidByOf = exports.companyAmountOf = exports.driverAmountOf = exports.COUNTED_STATUSES = void 0;
exports.COUNTED_STATUSES = ["approved", "auto_approved"];
const ZERO_TOTALS = {
    totalExpense: 0,
    pendingExpense: 0,
    pendingReimbursement: 0,
    approvedReimbursement: 0,
    rejectedAmount: 0,
};
const num = (value) => Number(value) || 0;
// ─── Legacy shape bridge ──────────────────────────────────────────────────────
// Documents written before the split carry a single `amount` plus a `paidBy`
// flag. Read them as a split where one side happens to be zero, so nothing
// below has to know which era a document came from.
/** Driver-paid portion of an item, whichever shape it is stored in. */
const driverAmountOf = (item) => {
    if (!item)
        return 0;
    if (item.driverAmount !== undefined && item.driverAmount !== null)
        return num(item.driverAmount);
    return item.paidBy === "company" ? 0 : num(item.amount);
};
exports.driverAmountOf = driverAmountOf;
/** Company-paid portion of an item, whichever shape it is stored in. */
const companyAmountOf = (item) => {
    if (!item)
        return 0;
    if (item.companyAmount !== undefined && item.companyAmount !== null)
        return num(item.companyAmount);
    return item.paidBy === "company" ? num(item.amount) : 0;
};
exports.companyAmountOf = companyAmountOf;
/** The label describing who paid, derived from the two portions. */
const paidByOf = (driverAmount, companyAmount) => {
    if (driverAmount > 0 && companyAmount > 0)
        return "both";
    return companyAmount > 0 ? "company" : "driver";
};
exports.paidByOf = paidByOf;
/**
 * Fill in `driverAmount` / `companyAmount` / `amount` / `paidBy` on an item read
 * from the database, so every consumer sees the split shape regardless of when
 * the row was written. Mutates and returns the item.
 */
const normalizeExpenseItem = (item) => {
    if (!item)
        return null;
    const driverAmount = (0, exports.driverAmountOf)(item);
    const companyAmount = (0, exports.companyAmountOf)(item);
    item.driverAmount = driverAmount;
    item.companyAmount = companyAmount;
    item.amount = driverAmount + companyAmount;
    item.paidBy = (0, exports.paidByOf)(driverAmount, companyAmount);
    return item;
};
exports.normalizeExpenseItem = normalizeExpenseItem;
/** Normalize all three items on an expense document / plain object. */
const normalizeExpense = (expense) => {
    if (!expense)
        return null;
    (0, exports.normalizeExpenseItem)(expense.food);
    (0, exports.normalizeExpenseItem)(expense.cng);
    (0, exports.normalizeExpenseItem)(expense.other);
    return expense;
};
exports.normalizeExpense = normalizeExpense;
const isCounted = (item) => exports.COUNTED_STATUSES.includes(item === null || item === void 0 ? void 0 : item.status);
// ─── Plain-object calculation (model hook + lean docs in reports) ────────────
const computeExpenseTotals = (expense) => {
    if (!expense)
        return Object.assign({}, ZERO_TOTALS);
    const items = [expense.food, expense.cng, expense.other].filter(Boolean);
    const sumDriver = (predicate) => items.filter(predicate).reduce((total, i) => total + (0, exports.driverAmountOf)(i), 0);
    // Company money is spent the moment it is recorded — there is nothing to approve.
    const companyTotal = items.reduce((total, i) => total + (0, exports.companyAmountOf)(i), 0);
    return {
        // Company portions always, driver portions only once approved / auto-approved.
        totalExpense: companyTotal + sumDriver(isCounted),
        pendingExpense: sumDriver((i) => i.status === "pending"),
        pendingReimbursement: sumDriver((i) => i.status === "pending"),
        approvedReimbursement: sumDriver((i) => i.status === "approved"),
        rejectedAmount: sumDriver((i) => i.status === "rejected"),
    };
};
exports.computeExpenseTotals = computeExpenseTotals;
// ─── Aggregation-pipeline equivalents ────────────────────────────────────────
// Totals are recalculated from the item statuses inside the pipeline rather
// than trusting the stored fields, so dashboards stay correct even for
// documents saved before this rule existed.
const FIELDS = ["food", "cng", "other"];
/** `$expr` for the driver portion, falling back to the legacy amount/paidBy pair. */
const driverExpr = (field) => ({
    $ifNull: [
        `$${field}.driverAmount`,
        {
            $cond: [
                { $eq: [{ $ifNull: [`$${field}.paidBy`, ""] }, "company"] },
                0,
                { $ifNull: [`$${field}.amount`, 0] },
            ],
        },
    ],
});
/** `$expr` for the company portion, falling back to the legacy amount/paidBy pair. */
const companyExpr = (field) => ({
    $ifNull: [
        `$${field}.companyAmount`,
        {
            $cond: [
                { $eq: [{ $ifNull: [`$${field}.paidBy`, ""] }, "company"] },
                { $ifNull: [`$${field}.amount`, 0] },
                0,
            ],
        },
    ],
});
const driverIf = (field, condition) => ({
    $cond: [condition, driverExpr(field), 0],
});
const statusIs = (field, statuses) => ({
    $in: [{ $ifNull: [`$${field}.status`, ""] }, [...statuses]],
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
        computedTotalExpense: {
            $add: [
                sumOverFields(companyExpr),
                sumOverFields((f) => driverIf(f, statusIs(f, exports.COUNTED_STATUSES))),
            ],
        },
        computedPendingExpense: sumOverFields((f) => driverIf(f, statusIs(f, ["pending"]))),
        computedPendingReimbursement: sumOverFields((f) => driverIf(f, statusIs(f, ["pending"]))),
        computedApprovedReimbursement: sumOverFields((f) => driverIf(f, statusIs(f, ["approved"]))),
        computedRejectedAmount: sumOverFields((f) => driverIf(f, statusIs(f, ["rejected"]))),
    },
};
/**
 * Matches expense documents that have driver money awaiting a decision.
 *
 * "Pending" alone is not enough: items that were never filled in, and rows
 * written before the split, can sit at "pending" with nothing owed. Approval
 * screens and counts would then show work that does not exist.
 */
exports.PENDING_EXPENSE_FILTER = {
    $or: FIELDS.map((field) => ({
        $and: [{ [`${field}.status`]: "pending" }, { $expr: { $gt: [driverExpr(field), 0] } }],
    })),
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
