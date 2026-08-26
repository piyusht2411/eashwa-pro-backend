"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInitialStatus = void 0;
const mongoose_1 = require("mongoose");
const expenseTotals_1 = require("../utils/expenseTotals");
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
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    rejectedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
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
const expenseSchema = new mongoose_1.Schema({
    visit: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Visit",
        required: true,
        unique: true, // one expense document per visit
        index: true,
    },
    driver: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Driver",
        required: true,
        index: true,
    },
    food: Object.assign(Object.assign({}, expenseItemSchema), { amount: { type: Number, default: 0, min: 0 }, paidBy: { type: String, enum: ["driver", "company"], default: "driver" } }),
    cng: Object.assign(Object.assign({}, expenseItemSchema), { amount: { type: Number, default: 0, min: 0 }, paidBy: { type: String, enum: ["driver", "company"], default: "driver" } }),
    other: Object.assign(Object.assign({}, expenseItemSchema), { amount: { type: Number, default: 0, min: 0 }, paidBy: { type: String, enum: ["driver", "company"], default: "driver" }, description: { type: String, default: "" } }),
    // ─── Computed totals (stored for fast queries) ──────────────────────────
    // totalExpense counts approved / auto-approved items only.
    totalExpense: { type: Number, default: 0 },
    // Amount still awaiting approval — deliberately kept out of totalExpense.
    pendingExpense: { type: Number, default: 0 },
    pendingReimbursement: { type: Number, default: 0 },
    approvedReimbursement: { type: Number, default: 0 },
    rejectedAmount: { type: Number, default: 0 },
}, { timestamps: true });
// ─── Helper: determine initial status based on paidBy ────────────────────────
const getInitialStatus = (paidBy) => {
    return paidBy === "company" ? "auto_approved" : "pending";
};
exports.getInitialStatus = getInitialStatus;
// ─── Helper: recalculate stored totals ───────────────────────────────────────
expenseSchema.methods.recalculateTotals = function () {
    const totals = (0, expenseTotals_1.computeExpenseTotals)(this);
    this.totalExpense = totals.totalExpense;
    this.pendingExpense = totals.pendingExpense;
    this.pendingReimbursement = totals.pendingReimbursement;
    this.approvedReimbursement = totals.approvedReimbursement;
    this.rejectedAmount = totals.rejectedAmount;
};
// ─── Auto-recalculate before every save ──────────────────────────────────────
expenseSchema.pre("save", function (next) {
    this.recalculateTotals();
    next();
});
// ─── Recalculate on serialization too ────────────────────────────────────────
// Documents written before the "approved only" rule still carry stale totals,
// so every response recomputes them from the item statuses on the way out.
expenseSchema.set("toJSON", {
    transform: (_doc, ret) => {
        Object.assign(ret, (0, expenseTotals_1.computeExpenseTotals)(ret));
        return ret;
    },
});
const Expense = (0, mongoose_1.model)("Expense", expenseSchema);
exports.default = Expense;
