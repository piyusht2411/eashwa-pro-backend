import { Schema, model } from "mongoose";
import { IExpense, PaidBy, ExpenseStatus } from "../types";
import { computeExpenseTotals } from "../utils/expenseTotals";

// ─── Shared sub-schema for each expense type ─────────────────────────────────
const expenseItemSchema = {
  amount: { type: Number, default: 0, min: 0 },
  paidBy: {
    type: String,
    enum: ["driver", "company"],
    required: true,
  },
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
    food: {
      ...expenseItemSchema,
      amount: { type: Number, default: 0, min: 0 },
      paidBy: { type: String, enum: ["driver", "company"], default: "driver" },
    },
    cng: {
      ...expenseItemSchema,
      amount: { type: Number, default: 0, min: 0 },
      paidBy: { type: String, enum: ["driver", "company"], default: "driver" },
    },
    other: {
      ...expenseItemSchema,
      amount: { type: Number, default: 0, min: 0 },
      paidBy: { type: String, enum: ["driver", "company"], default: "driver" },
      description: { type: String, default: "" },
    },
    // ─── Computed totals (stored for fast queries) ──────────────────────────
    // totalExpense counts approved / auto-approved items only.
    totalExpense: { type: Number, default: 0 },
    // Amount still awaiting approval — deliberately kept out of totalExpense.
    pendingExpense: { type: Number, default: 0 },
    pendingReimbursement: { type: Number, default: 0 },
    approvedReimbursement: { type: Number, default: 0 },
    rejectedAmount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// ─── Helper: determine initial status based on paidBy ────────────────────────
export const getInitialStatus = (paidBy: PaidBy): ExpenseStatus => {
  return paidBy === "company" ? "auto_approved" : "pending";
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

// ─── Auto-recalculate before every save ──────────────────────────────────────
expenseSchema.pre("save", function (next) {
  (this as any).recalculateTotals();
  next();
});

// ─── Recalculate on serialization too ────────────────────────────────────────
// Documents written before the "approved only" rule still carry stale totals,
// so every response recomputes them from the item statuses on the way out.
expenseSchema.set("toJSON", {
  transform: (_doc, ret: any) => {
    Object.assign(ret, computeExpenseTotals(ret));
    return ret;
  },
});

const Expense = model<IExpense>("Expense", expenseSchema);

export default Expense;
