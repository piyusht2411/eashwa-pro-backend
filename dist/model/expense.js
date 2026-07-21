"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInitialStatus = void 0;
const mongoose_1 = require("mongoose");
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
    totalExpense: { type: Number, default: 0 },
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
    const items = [this.food, this.cng, this.other];
    this.totalExpense = items.reduce((sum, i) => sum + (i.amount || 0), 0);
    this.pendingReimbursement = items
        .filter((i) => i.paidBy === "driver" && i.status === "pending")
        .reduce((sum, i) => sum + (i.amount || 0), 0);
    this.approvedReimbursement = items
        .filter((i) => i.paidBy === "driver" && i.status === "approved")
        .reduce((sum, i) => sum + (i.amount || 0), 0);
    this.rejectedAmount = items
        .filter((i) => i.paidBy === "driver" && i.status === "rejected")
        .reduce((sum, i) => sum + (i.amount || 0), 0);
};
// ─── Auto-recalculate before every save ──────────────────────────────────────
expenseSchema.pre("save", function (next) {
    this.recalculateTotals();
    next();
});
const Expense = (0, mongoose_1.model)("Expense", expenseSchema);
exports.default = Expense;
