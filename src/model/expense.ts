import { Schema, model } from "mongoose";
import { IExpense, PaidBy, ExpenseStatus } from "../types";

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
    totalExpense: { type: Number, default: 0 },
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
  const items = [this.food, this.cng, this.other];

  this.totalExpense = items.reduce((sum: number, i: any) => sum + (i.amount || 0), 0);

  this.pendingReimbursement = items
    .filter((i: any) => i.paidBy === "driver" && i.status === "pending")
    .reduce((sum: number, i: any) => sum + (i.amount || 0), 0);

  this.approvedReimbursement = items
    .filter((i: any) => i.paidBy === "driver" && i.status === "approved")
    .reduce((sum: number, i: any) => sum + (i.amount || 0), 0);

  this.rejectedAmount = items
    .filter((i: any) => i.paidBy === "driver" && i.status === "rejected")
    .reduce((sum: number, i: any) => sum + (i.amount || 0), 0);
};

// ─── Auto-recalculate before every save ──────────────────────────────────────
expenseSchema.pre("save", function (next) {
  (this as any).recalculateTotals();
  next();
});

const Expense = model<IExpense>("Expense", expenseSchema);

export default Expense;
