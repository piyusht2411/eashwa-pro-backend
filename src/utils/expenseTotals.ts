// ─── Expense total calculation ────────────────────────────────────────────────
// A single source of truth for how an expense document rolls up into totals.
//
// Rule: an expense only counts towards `totalExpense` once it has cleared
// approval. Items still sitting in "pending" (and rejected ones) are held out
// and reported separately as `pendingExpense` / `rejectedAmount`.

export const COUNTED_STATUSES = ["approved", "auto_approved"] as const;

type ExpenseItemLike = {
  amount?: number | null;
  paidBy?: string | null;
  status?: string | null;
};

type ExpenseLike = {
  food?: ExpenseItemLike | null;
  cng?: ExpenseItemLike | null;
  other?: ExpenseItemLike | null;
};

export interface ExpenseTotals {
  totalExpense: number;
  pendingExpense: number;
  pendingReimbursement: number;
  approvedReimbursement: number;
  rejectedAmount: number;
}

const ZERO_TOTALS: ExpenseTotals = {
  totalExpense: 0,
  pendingExpense: 0,
  pendingReimbursement: 0,
  approvedReimbursement: 0,
  rejectedAmount: 0,
};

const amountOf = (item?: ExpenseItemLike | null) => Number(item?.amount) || 0;

const isCounted = (item?: ExpenseItemLike | null) =>
  COUNTED_STATUSES.includes(item?.status as any);

// ─── Plain-object calculation (model hook + lean docs in reports) ────────────
export const computeExpenseTotals = (expense?: ExpenseLike | null): ExpenseTotals => {
  if (!expense) return { ...ZERO_TOTALS };

  const items = [expense.food, expense.cng, expense.other].filter(Boolean) as ExpenseItemLike[];

  const sum = (predicate: (i: ExpenseItemLike) => boolean) =>
    items.filter(predicate).reduce((total, i) => total + amountOf(i), 0);

  return {
    // Approved / auto-approved only — anything awaiting approval is excluded.
    totalExpense: sum(isCounted),
    pendingExpense: sum((i) => i.status === "pending"),
    pendingReimbursement: sum((i) => i.paidBy === "driver" && i.status === "pending"),
    approvedReimbursement: sum((i) => i.paidBy === "driver" && i.status === "approved"),
    rejectedAmount: sum((i) => i.paidBy === "driver" && i.status === "rejected"),
  };
};

// ─── Aggregation-pipeline equivalents ────────────────────────────────────────
// Totals are recalculated from the item statuses inside the pipeline rather
// than trusting the stored fields, so dashboards stay correct even for
// documents saved before this rule existed.
const FIELDS = ["food", "cng", "other"] as const;

const amountExpr = (field: string) => ({ $ifNull: [`$${field}.amount`, 0] });

const amountIf = (field: string, condition: any) => ({
  $cond: [condition, amountExpr(field), 0],
});

const statusIs = (field: string, statuses: readonly string[]) => ({
  $in: [{ $ifNull: [`$${field}.status`, ""] }, [...statuses]],
});

const paidByDriver = (field: string) => ({
  $eq: [{ $ifNull: [`$${field}.paidBy`, ""] }, "driver"],
});

const sumOverFields = (build: (field: string) => any) => ({
  $add: FIELDS.map(build),
});

/**
 * `$addFields` stage exposing freshly computed totals on every Expense doc.
 * Use the `computed*` fields in any `$group` that follows it.
 */
export const expenseTotalsStage = {
  $addFields: {
    computedTotalExpense: sumOverFields((f) => amountIf(f, statusIs(f, COUNTED_STATUSES))),
    computedPendingExpense: sumOverFields((f) => amountIf(f, statusIs(f, ["pending"]))),
    computedPendingReimbursement: sumOverFields((f) =>
      amountIf(f, { $and: [paidByDriver(f), statusIs(f, ["pending"])] })
    ),
    computedApprovedReimbursement: sumOverFields((f) =>
      amountIf(f, { $and: [paidByDriver(f), statusIs(f, ["approved"])] })
    ),
    computedRejectedAmount: sumOverFields((f) =>
      amountIf(f, { $and: [paidByDriver(f), statusIs(f, ["rejected"])] })
    ),
  },
};

/** `$group` accumulators that pair with {@link expenseTotalsStage}. */
export const expenseTotalsAccumulators = {
  totalExpense: { $sum: "$computedTotalExpense" },
  pendingExpense: { $sum: "$computedPendingExpense" },
  pendingReimbursement: { $sum: "$computedPendingReimbursement" },
  approvedReimbursement: { $sum: "$computedApprovedReimbursement" },
  rejectedAmount: { $sum: "$computedRejectedAmount" },
};

export const emptyExpenseTotals = (): ExpenseTotals => ({ ...ZERO_TOTALS });
