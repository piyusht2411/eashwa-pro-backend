"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getPendingExpenses = exports.rejectExpenseItem = exports.approveExpenseItem = exports.getExpenseByVisit = exports.upsertExpense = void 0;
const expense_1 = __importStar(require("../../model/expense"));
const visit_1 = __importDefault(require("../../model/visit"));
const driver_1 = __importDefault(require("../../model/driver"));
const user_1 = __importDefault(require("../../model/user"));
const notify_1 = require("../../utils/notify");
const helpers_1 = require("../../utils/helpers");
const driverScope_1 = require("../../utils/driverScope");
// ─── Create / Upsert Expense for a Visit ─────────────────────────────────────
const upsertExpense = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { visitId } = req.params;
        const { food, cng, other } = req.body;
        const visit = yield visit_1.default.findById(visitId);
        if (!visit)
            return res.status(404).json({ message: "Visit not found" });
        const driver = yield driver_1.default.findById(visit.driver);
        if ((food === null || food === void 0 ? void 0 : food.amount) !== undefined) {
            const max = (0, helpers_1.maxFoodAllowance)(visit.totalDays);
            if (food.amount > max) {
                return res.status(400).json({
                    message: `Food expense ₹${food.amount} exceeds maximum allowance of ₹${max} (₹400 × ${visit.totalDays} days)`,
                    maxAllowed: max,
                });
            }
        }
        let expense = yield expense_1.default.findOne({ visit: visitId });
        if (!expense) {
            expense = new expense_1.default({
                visit: visitId,
                driver: visit.driver,
                food: buildExpenseItem(food, "food"),
                cng: buildExpenseItem(cng, "cng"),
                other: buildExpenseItem(other, "other"),
            });
        }
        else {
            if (food !== undefined)
                updateExpenseItem(expense.food, food);
            if (cng !== undefined)
                updateExpenseItem(expense.cng, cng);
            if (other !== undefined)
                updateExpenseItem(expense.other, other);
        }
        yield expense.save();
        const hasPending = [expense.food, expense.cng, expense.other].some((item) => item.status === "pending");
        if (hasPending) {
            const admins = yield user_1.default.find({ role: "admin", portal: "transport", isActive: true }).select("_id");
            if (admins.length > 0) {
                yield (0, notify_1.sendPushNotificationToMany)(admins.map((a) => a._id), "Expense Approval Required", `Expense for ${(driver === null || driver === void 0 ? void 0 : driver.name) || "driver"} → ${visit.destination} needs your approval`, { type: "approval_required", expenseId: expense._id.toString(), visitId });
            }
        }
        return res.status(200).json({ message: "Expense saved successfully", expense });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.upsertExpense = upsertExpense;
// ─── Get Expense for a Visit ──────────────────────────────────────────────────
const getExpenseByVisit = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { visitId } = req.params;
        // A driver may only read expenses on their own visits.
        if ((0, driverScope_1.isDriverRole)(req)) {
            const visit = yield visit_1.default.findById(visitId).select("driver");
            if (!visit)
                return res.status(404).json({ message: "Visit not found" });
            const scope = yield (0, driverScope_1.resolveDriverScope)(req, String(visit.driver));
            if (scope.forbidden) {
                return res.status(403).json({ message: scope.message });
            }
        }
        const expense = yield expense_1.default.findOne({ visit: visitId })
            .populate("food.approvedBy", "name")
            .populate("food.rejectedBy", "name")
            .populate("cng.approvedBy", "name")
            .populate("cng.rejectedBy", "name")
            .populate("other.approvedBy", "name")
            .populate("other.rejectedBy", "name");
        if (!expense)
            return res.status(404).json({ message: "No expense found for this visit" });
        return res.status(200).json({ expense });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getExpenseByVisit = getExpenseByVisit;
// ─── Approve Expense Item (Admin only) ────────────────────────────────────────
const approveExpenseItem = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { type } = req.body;
        if (!type || !["food", "cng", "other"].includes(type)) {
            return res.status(400).json({ message: "type must be food | cng | other" });
        }
        const expense = yield expense_1.default.findById(id);
        if (!expense)
            return res.status(404).json({ message: "Expense not found" });
        const item = expense[type];
        if (item.paidBy === "company") {
            return res.status(400).json({ message: "Company-paid expenses are auto-approved" });
        }
        if (item.status === "approved") {
            return res.status(400).json({ message: `${type} is already approved` });
        }
        item.status = "approved";
        item.approvedBy = req.userId;
        item.rejectedBy = null;
        item.rejectionRemark = "";
        item.approvedAt = new Date();
        yield expense.save();
        const visit = yield visit_1.default.findById(expense.visit).populate("driver");
        const driver = visit === null || visit === void 0 ? void 0 : visit.driver;
        const amount = item.amount;
        const accountsUsers = yield user_1.default.find({ role: "accounts", portal: "transport", isActive: true }).select("_id");
        const notifyIds = [...accountsUsers.map((u) => u._id)];
        if (driver === null || driver === void 0 ? void 0 : driver.userId)
            notifyIds.push(driver.userId);
        if (notifyIds.length > 0) {
            yield (0, notify_1.sendPushNotificationToMany)(notifyIds, "Expense Approved ✅", `${type.charAt(0).toUpperCase() + type.slice(1)} expense of ₹${amount} for ${(driver === null || driver === void 0 ? void 0 : driver.name) || "driver"} has been approved`, { type: "expense_approved", expenseId: id, expenseType: type });
        }
        return res.status(200).json({ message: `${type} expense approved successfully`, expense });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.approveExpenseItem = approveExpenseItem;
// ─── Reject Expense Item (Admin only) ────────────────────────────────────────
const rejectExpenseItem = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { type, remark } = req.body;
        if (!type || !["food", "cng", "other"].includes(type)) {
            return res.status(400).json({ message: "type must be food | cng | other" });
        }
        if (!remark || remark.trim().length === 0) {
            return res.status(400).json({ message: "remark is required when rejecting an expense" });
        }
        const expense = yield expense_1.default.findById(id);
        if (!expense)
            return res.status(404).json({ message: "Expense not found" });
        const item = expense[type];
        if (item.paidBy === "company") {
            return res.status(400).json({ message: "Company-paid expenses cannot be rejected" });
        }
        if (item.status === "rejected") {
            return res.status(400).json({ message: `${type} is already rejected` });
        }
        item.status = "rejected";
        item.rejectedBy = req.userId;
        item.rejectionRemark = remark;
        item.approvedBy = null;
        item.approvedAt = null;
        yield expense.save();
        const visit = yield visit_1.default.findById(expense.visit).populate("driver");
        const driver = visit === null || visit === void 0 ? void 0 : visit.driver;
        const amount = item.amount;
        const accountsUsers = yield user_1.default.find({ role: "accounts", portal: "transport", isActive: true }).select("_id");
        const notifyIds = [...accountsUsers.map((u) => u._id)];
        if (driver === null || driver === void 0 ? void 0 : driver.userId)
            notifyIds.push(driver.userId);
        if (notifyIds.length > 0) {
            yield (0, notify_1.sendPushNotificationToMany)(notifyIds, "Expense Rejected ❌", `${type.charAt(0).toUpperCase() + type.slice(1)} expense of ₹${amount} for ${(driver === null || driver === void 0 ? void 0 : driver.name) || "driver"} was rejected. Reason: ${remark}`, { type: "expense_rejected", expenseId: id, expenseType: type, remark });
        }
        return res.status(200).json({ message: `${type} expense rejected`, expense });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.rejectExpenseItem = rejectExpenseItem;
// ─── Get All Pending Expenses (Admin) ─────────────────────────────────────────
const getPendingExpenses = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const expenses = yield expense_1.default.find({
            $or: [
                { "food.status": "pending" },
                { "cng.status": "pending" },
                { "other.status": "pending" },
            ],
        })
            .populate({ path: "visit", populate: { path: "driver", select: "name vehicleNumber" } })
            .populate("driver", "name vehicleNumber")
            .sort({ updatedAt: -1 });
        return res.status(200).json({ expenses });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getPendingExpenses = getPendingExpenses;
// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildExpenseItem(data, type) {
    if (!data) {
        return { amount: 0, paidBy: "driver", status: "pending", description: "" };
    }
    const paidBy = data.paidBy || "driver";
    return {
        amount: data.amount || 0,
        paidBy,
        status: (0, expense_1.getInitialStatus)(paidBy),
        description: type === "other" ? (data.description || "") : undefined,
    };
}
function updateExpenseItem(item, data) {
    const amountChanged = data.amount !== undefined && Number(data.amount) !== Number(item.amount || 0);
    const paidByChanged = data.paidBy !== undefined && data.paidBy !== item.paidBy;
    if (data.amount !== undefined)
        item.amount = data.amount;
    if (data.paidBy !== undefined)
        item.paidBy = data.paidBy;
    if (data.description !== undefined)
        item.description = data.description;
    // Re-editing the figure invalidates any decision already taken on it —
    // otherwise a changed amount would slip into the total without review.
    if (amountChanged || paidByChanged) {
        item.status = (0, expense_1.getInitialStatus)(item.paidBy);
        item.approvedBy = null;
        item.approvedAt = null;
        item.rejectedBy = null;
        item.rejectionRemark = "";
    }
}
