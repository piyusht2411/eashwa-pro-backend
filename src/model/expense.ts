import { Schema, model } from "mongoose";
import { IExpense, PaidBy, ExpenseStatus } from "../types";
import {
  companyAmountOf,
  computeExpenseTotals,
  driverAmountOf,
  normalizeExpense,
  paidByOf,
} from "../utils/expenseTotals";

// ─── Shared sub-schema for each expense type ─────────────────────────────────
// An expense is split across two payers. Either side may be zero; both may be
// filled when a single bill was settled partly by the driver and partly by the
// company (₹4000 of CNG = ₹2000 driver + ₹2000 company).
const expenseItemSchema = {
  driverAmount: { type: Number, default: 0, min: 0 },
  companyAmount: { type: Number, default: 0, min: 0 },
  // Derived on every save: driverAmount + companyAmount. Stored so reports and
  // app builds that predate the split keep reading a sensible figure.
  amount: { type: Number, default: 0, min: 0 },
  // Derived on every save from which portions are non-zero.
  paidBy: {
    type: String,
    enum: ["driver", "company", "both"],
    default: "driver",
  },
  // Describes the DRIVER portion only — the company portion needs no approval.
  status: {
    type: String,
    enum: ["pending", "approved", "rejected", "auto_approved"],
    default: "pending",
  },
  approvedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  rejectedBy: {
    type: Schema.Types.ObjectId,
    ref: "User",
    default: null,
  },
  rejectionRemark: {
    type: String,
    default: "",
  },
  approvedAt: {
    type: Date,
    default: null,
  },
};

const expenseSchema = new Schema<IExpense>(
  {
    visit: {
      type: Schema.Types.ObjectId,
      ref: "Visit",
      required: true,
      unique: true, // one expense document per visit
      index: true,
    },
    driver: {
      type: Schema.Types.ObjectId,
      ref: "Driver",
      required: true,
      index: true,
    },
    food: { ...expenseItemSchema },
    cng: { ...expenseItemSchema },
    other: {
      ...expenseItemSchema,
      description: { type: String, default: "" },
    },
    // ─── Computed totals (stored for fast queries) ──────────────────────────
    // totalExpense counts company portions plus approved / auto-approved
    // driver portions.
    totalExpense: { type: Number, default: 0 },
    // Driver money still awaiting approval — deliberately kept out of totalExpense.
    pendingExpense: { type: Number, default: 0 },
    pendingReimbursement: { type: Number, default: 0 },
    approvedReimbursement: { type: Number, default: 0 },
    rejectedAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// ─── Helper: initial status for an item ──────────────────────────────────────
// Only the driver's own money needs approving. Nothing out of pocket means
// there is nothing to reimburse, so the item clears straight away.
export const getInitialStatus = (driverAmount: number): ExpenseStatus =>
  Number(driverAmount) > 0 ? "pending" : "auto_approved";

// ─── Helper: refresh the derived amount / paidBy on each item ────────────────
const syncDerivedFields = (doc: any) => {
  for (const field of ["food", "cng", "other"] as const) {
    const item = doc?.[field];
    if (!item) continue;
    const driverAmount = driverAmountOf(item);
    const companyAmount = companyAmountOf(item);
    item.driverAmount = driverAmount;
    item.companyAmount = companyAmount;
    item.amount = driverAmount + companyAmount;
    item.paidBy = paidByOf(driverAmount, companyAmount) as PaidBy;
  }
};

// ─── Helper: recalculate stored totals ───────────────────────────────────────
expenseSchema.methods.recalculateTotals = function () {
  const totals = computeExpenseTotals(this);

  this.totalExpense = totals.totalExpense;
  this.pendingExpense = totals.pendingExpense;
  this.pendingReimbursement = totals.pendingReimbursement;
  this.approvedReimbursement = totals.approvedReimbursement;
  this.rejectedAmount = totals.rejectedAmount;
};

// ─── Keep derived fields and totals in step before every save ────────────────
expenseSchema.pre("save", function (next) {
  syncDerivedFields(this);
  (this as any).recalculateTotals();
  next();
});

// ─── Recalculate on serialization too ────────────────────────────────────────
// Documents written before the split (single amount + paidBy) and before the
// "approved only" rule still carry the old shape, so every response fills in
// the per-payer amounts and recomputes totals on the way out.
expenseSchema.set("toJSON", {
  transform: (_doc, ret: any) => {
    normalizeExpense(ret);
    Object.assign(ret, computeExpenseTotals(ret));
    return ret;
  },
});

const Expense = model<IExpense>("Expense", expenseSchema);

export default Expense;
