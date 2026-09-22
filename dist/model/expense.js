"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getInitialStatus = void 0;
const mongoose_1 = require("mongoose");
const expenseTotals_1 = require("../utils/expenseTotals");
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
    food: Object.assign({}, expenseItemSchema),
    cng: Object.assign({}, expenseItemSchema),
    other: Object.assign(Object.assign({}, expenseItemSchema), { description: { type: String, default: "" } }),
    // ─── Computed totals (stored for fast queries) ──────────────────────────
    // totalExpense counts company portions plus approved / auto-approved
    // driver portions.
    totalExpense: { type: Number, default: 0 },
    // Driver money still awaiting approval — deliberately kept out of totalExpense.
    pendingExpense: { type: Number, default: 0 },
    pendingReimbursement: { type: Number, default: 0 },
    approvedReimbursement: { type: Number, default: 0 },
    rejectedAmount: { type: Number, default: 0 },
}, { timestamps: true });
// ─── Helper: initial status for an item ──────────────────────────────────────
// Only the driver's own money needs approving. Nothing out of pocket means
// there is nothing to reimburse, so the item clears straight away.
const getInitialStatus = (driverAmount) => Number(driverAmount) > 0 ? "pending" : "auto_approved";
exports.getInitialStatus = getInitialStatus;
// ─── Helper: refresh the derived amount / paidBy on each item ────────────────
const syncDerivedFields = (doc) => {
    for (const field of ["food", "cng", "other"]) {
        const item = doc === null || doc === void 0 ? void 0 : doc[field];
        if (!item)
            continue;
        const driverAmount = (0, expenseTotals_1.driverAmountOf)(item);
        const companyAmount = (0, expenseTotals_1.companyAmountOf)(item);
        item.driverAmount = driverAmount;
        item.companyAmount = companyAmount;
        item.amount = driverAmount + companyAmount;
        item.paidBy = (0, expenseTotals_1.paidByOf)(driverAmount, companyAmount);
    }
};
// ─── Helper: recalculate stored totals ───────────────────────────────────────
expenseSchema.methods.recalculateTotals = function () {
    const totals = (0, expenseTotals_1.computeExpenseTotals)(this);
    this.totalExpense = totals.totalExpense;
    this.pendingExpense = totals.pendingExpense;
    this.pendingReimbursement = totals.pendingReimbursement;
    this.approvedReimbursement = totals.approvedReimbursement;
    this.rejectedAmount = totals.rejectedAmount;
};
// ─── Keep derived fields and totals in step before every save ────────────────
expenseSchema.pre("save", function (next) {
    syncDerivedFields(this);
    this.recalculateTotals();
    next();
});
// ─── Recalculate on serialization too ────────────────────────────────────────
// Documents written before the split (single amount + paidBy) and before the
// "approved only" rule still carry the old shape, so every response fills in
// the per-payer amounts and recomputes totals on the way out.
expenseSchema.set("toJSON", {
    transform: (_doc, ret) => {
        (0, expenseTotals_1.normalizeExpense)(ret);
        Object.assign(ret, (0, expenseTotals_1.computeExpenseTotals)(ret));
        return ret;
    },
});
const Expense = (0, mongoose_1.model)("Expense", expenseSchema);
exports.default = Expense;
