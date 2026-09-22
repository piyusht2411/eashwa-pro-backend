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

export const COUNTED_STATUSES = ["approved", "auto_approved"] as const;

type ExpenseItemLike = {
  driverAmount?: number | null;
  companyAmount?: number | null;
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

const num = (value: unknown) => Number(value) || 0;

// ─── Legacy shape bridge ──────────────────────────────────────────────────────
// Documents written before the split carry a single `amount` plus a `paidBy`
// flag. Read them as a split where one side happens to be zero, so nothing
// below has to know which era a document came from.

/** Driver-paid portion of an item, whichever shape it is stored in. */
export const driverAmountOf = (item?: ExpenseItemLike | null): number => {
  if (!item) return 0;
  if (item.driverAmount !== undefined && item.driverAmount !== null) return num(item.driverAmount);
  return item.paidBy === "company" ? 0 : num(item.amount);
};

/** Company-paid portion of an item, whichever shape it is stored in. */
export const companyAmountOf = (item?: ExpenseItemLike | null): number => {
  if (!item) return 0;
  if (item.companyAmount !== undefined && item.companyAmount !== null) return num(item.companyAmount);
  return item.paidBy === "company" ? num(item.amount) : 0;
};

/** The label describing who paid, derived from the two portions. */
export const paidByOf = (driverAmount: number, companyAmount: number): "driver" | "company" | "both" => {
  if (driverAmount > 0 && companyAmount > 0) return "both";
  return companyAmount > 0 ? "company" : "driver";
};

/**
 * Fill in `driverAmount` / `companyAmount` / `amount` / `paidBy` on an item read
 * from the database, so every consumer sees the split shape regardless of when
 * the row was written. Mutates and returns the item.
 */
export const normalizeExpenseItem = <T extends ExpenseItemLike>(item?: T | null): T | null => {
  if (!item) return null;
  const driverAmount = driverAmountOf(item);
  const companyAmount = companyAmountOf(item);

  item.driverAmount = driverAmount;
  item.companyAmount = companyAmount;
  item.amount = driverAmount + companyAmount;
  item.paidBy = paidByOf(driverAmount, companyAmount);
  return item;
};

/** Normalize all three items on an expense document / plain object. */
export const normalizeExpense = <T extends ExpenseLike>(expense?: T | null): T | null => {
  if (!expense) return null;
  normalizeExpenseItem(expense.food);
  normalizeExpenseItem(expense.cng);
  normalizeExpenseItem(expense.other);
  return expense;
};

const isCounted = (item?: ExpenseItemLike | null) =>
  COUNTED_STATUSES.includes(item?.status as any);

// ─── Plain-object calculation (model hook + lean docs in reports) ────────────
export const computeExpenseTotals = (expense?: ExpenseLike | null): ExpenseTotals => {
  if (!expense) return { ...ZERO_TOTALS };

  const items = [expense.food, expense.cng, expense.other].filter(Boolean) as ExpenseItemLike[];

  const sumDriver = (predicate: (i: ExpenseItemLike) => boolean) =>
    items.filter(predicate).reduce((total, i) => total + driverAmountOf(i), 0);

  // Company money is spent the moment it is recorded — there is nothing to approve.
  const companyTotal = items.reduce((total, i) => total + companyAmountOf(i), 0);

  return {
    // Company portions always, driver portions only once approved / auto-approved.
    totalExpense: companyTotal + sumDriver(isCounted),
    pendingExpense: sumDriver((i) => i.status === "pending"),
    pendingReimbursement: sumDriver((i) => i.status === "pending"),
    approvedReimbursement: sumDriver((i) => i.status === "approved"),
    rejectedAmount: sumDriver((i) => i.status === "rejected"),
  };
};

// ─── Aggregation-pipeline equivalents ────────────────────────────────────────
// Totals are recalculated from the item statuses inside the pipeline rather
// than trusting the stored fields, so dashboards stay correct even for
// documents saved before this rule existed.
const FIELDS = ["food", "cng", "other"] as const;

/** `$expr` for the driver portion, falling back to the legacy amount/paidBy pair. */
const driverExpr = (field: string) => ({
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
const companyExpr = (field: string) => ({
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

const driverIf = (field: string, condition: any) => ({
  $cond: [condition, driverExpr(field), 0],
});

const statusIs = (field: string, statuses: readonly string[]) => ({
  $in: [{ $ifNull: [`$${field}.status`, ""] }, [...statuses]],
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
    computedTotalExpense: {
      $add: [
        sumOverFields(companyExpr),
        sumOverFields((f) => driverIf(f, statusIs(f, COUNTED_STATUSES))),
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
export const PENDING_EXPENSE_FILTER = {
  $or: FIELDS.map((field) => ({
    $and: [{ [`${field}.status`]: "pending" }, { $expr: { $gt: [driverExpr(field), 0] } }],
  })),
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
