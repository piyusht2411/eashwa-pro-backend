"use strict";
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
exports.getPaymentByContainer = exports.getMyPayments = exports.getAllPayments = exports.deletePaymentEntry = exports.updatePaymentEntry = exports.makePayment = exports.getOrInitPayment = void 0;
const payment_1 = __importDefault(require("../model/payment"));
const pdiVerification_1 = __importDefault(require("../model/pdiVerification"));
const container_1 = __importDefault(require("../model/container"));
const notify_1 = require("../utils/notify");
const penalty_1 = require("../utils/penalty");
const getPagination = (query) => {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;
    return { page, limit, skip };
};
// ─── Helper: recalculate totals from PDI verified data ───────────────────────
const recalcPaymentTotals = (containerId, ratePerUnit, targetQuantity) => __awaiter(void 0, void 0, void 0, function* () {
    const verifications = yield pdiVerification_1.default.find({ container: containerId });
    const rawVerifiedQty = verifications.reduce((s, v) => s + v.verifiedQuantity, 0);
    // Verified (and therefore payable) units can never exceed the container target.
    const totalVerifiedQty = Math.min(targetQuantity !== null && targetQuantity !== void 0 ? targetQuantity : 0, rawVerifiedQty);
    const totalAmount = totalVerifiedQty * ratePerUnit;
    return { totalVerifiedQty, totalAmount };
});
// ─── Helper: recompute a payment's display totals from LIVE PDI data ─────────
// Read endpoints persist stale stored totals (e.g. created when verified was
// over-target). This recomputes verified/amount/remaining from current PDI
// verifications, capped at the container target, without mutating the DB.
// `paidAmount` is preserved; remainingAmount may be negative if overpaid earlier.
const enrichPaymentsWithLiveTotals = (paymentObjs) => __awaiter(void 0, void 0, void 0, function* () {
    const containerIds = paymentObjs
        .map((p) => { var _a; return (_a = p.container) === null || _a === void 0 ? void 0 : _a._id; })
        .filter(Boolean);
    const verifiedMap = yield (0, penalty_1.getVerifiedByContainer)(containerIds);
    return paymentObjs.map((obj) => {
        var _a, _b, _c, _d, _e, _f;
        const container = (_a = obj.container) !== null && _a !== void 0 ? _a : {};
        const target = (_b = container.quantity) !== null && _b !== void 0 ? _b : 0;
        const rawVerified = (_c = verifiedMap.get(String(container._id))) !== null && _c !== void 0 ? _c : 0;
        const cappedVerified = Math.min(target, rawVerified);
        const rate = (_d = container.ratePerUnit) !== null && _d !== void 0 ? _d : 0;
        const totalAmount = cappedVerified * rate;
        const paidAmount = (_e = obj.paidAmount) !== null && _e !== void 0 ? _e : 0;
        obj.totalVerifiedQuantity = cappedVerified;
        obj.totalAmount = totalAmount;
        obj.remainingAmount = totalAmount - paidAmount;
        const { pendingQuantity, penaltyPerUnit, totalPenalty } = (0, penalty_1.computePenalty)(target, cappedVerified, (_f = container.penaltyPerUnit) !== null && _f !== void 0 ? _f : 0);
        obj.pendingQuantity = pendingQuantity;
        obj.penaltyPerUnit = penaltyPerUnit;
        obj.totalPenalty = totalPenalty;
        return obj;
    });
});
// ─── Admin: Initialize or Get Payment Ledger for a Container ─────────────────
// This auto-creates the payment ledger based on verified data
const getOrInitPayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { containerId } = req.params;
        const container = yield container_1.default.findById(containerId).populate("assignedTeam", "name email");
        if (!container)
            return res.status(404).json({ message: "Container not found" });
        const { totalVerifiedQty, totalAmount } = yield recalcPaymentTotals(containerId, container.ratePerUnit, container.quantity);
        let payment = yield payment_1.default.findOne({ container: containerId });
        if (!payment) {
            payment = yield payment_1.default.create({
                container: containerId,
                team: container.assignedTeam,
                totalVerifiedQuantity: totalVerifiedQty,
                totalAmount,
                paidAmount: 0,
                remainingAmount: totalAmount,
                payments: [],
                createdBy: req.userId,
            });
        }
        else {
            // Refresh totals based on latest PDI data
            payment.totalVerifiedQuantity = totalVerifiedQty;
            payment.totalAmount = totalAmount;
            payment.remainingAmount = totalAmount - payment.paidAmount;
            yield payment.save();
        }
        yield payment.populate("container", "model quantity ratePerUnit");
        yield payment.populate("team", "name email phone");
        return res.status(200).json({ payment });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getOrInitPayment = getOrInitPayment;
// ─── Admin: Make a Payment ────────────────────────────────────────────────────
const makePayment = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { containerId } = req.params;
        const { amount, note } = req.body;
        if (!amount || amount <= 0) {
            return res.status(400).json({ message: "amount must be a positive number" });
        }
        const container = yield container_1.default.findById(containerId);
        if (!container)
            return res.status(404).json({ message: "Container not found" });
        const { totalVerifiedQty, totalAmount } = yield recalcPaymentTotals(containerId, container.ratePerUnit, container.quantity);
        let payment = yield payment_1.default.findOne({ container: containerId });
        if (!payment) {
            payment = yield payment_1.default.create({
                container: containerId,
                team: container.assignedTeam,
                totalVerifiedQuantity: totalVerifiedQty,
                totalAmount,
                paidAmount: 0,
                remainingAmount: totalAmount,
                payments: [],
                createdBy: req.userId,
            });
        }
        // Refresh totals
        payment.totalVerifiedQuantity = totalVerifiedQty;
        payment.totalAmount = totalAmount;
        const newPaidAmount = payment.paidAmount + amount;
        if (newPaidAmount > totalAmount) {
            return res.status(400).json({
                message: `Payment exceeds total amount. Max payable: ₹${totalAmount - payment.paidAmount}`,
            });
        }
        payment.payments.push({ amount, paidAt: new Date(), note: note !== null && note !== void 0 ? note : "" });
        payment.paidAmount = newPaidAmount;
        payment.remainingAmount = totalAmount - newPaidAmount;
        yield payment.save();
        // Notify team about payment
        yield (0, notify_1.sendPushNotification)(container.assignedTeam, "Payment Received 💰", `₹${amount} has been paid for container: ${container.model}. Remaining: ₹${payment.remainingAmount}`, { containerId, type: "payment_made", amount: amount.toString() });
        return res.status(200).json({ message: "Payment recorded successfully", payment });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.makePayment = makePayment;
// ─── Admin: Edit a recorded payment transaction ──────────────────────────────
const updatePaymentEntry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { containerId, index } = req.params;
        const { amount, note } = req.body;
        const payment = yield payment_1.default.findOne({ container: containerId });
        if (!payment)
            return res.status(404).json({ message: "No payment record found for this container" });
        const idx = Number(index);
        if (Number.isNaN(idx) || idx < 0 || idx >= payment.payments.length) {
            return res.status(404).json({ message: "Payment entry not found" });
        }
        if (amount !== undefined) {
            if (Number(amount) <= 0 || Number.isNaN(Number(amount))) {
                return res.status(400).json({ message: "amount must be a positive number" });
            }
            payment.payments[idx].amount = Number(amount);
        }
        if (note !== undefined)
            payment.payments[idx].note = note;
        // Recalc totals from live (capped) verified data + the edited entries
        const container = yield container_1.default.findById(containerId);
        const { totalVerifiedQty, totalAmount } = yield recalcPaymentTotals(containerId, (_a = container === null || container === void 0 ? void 0 : container.ratePerUnit) !== null && _a !== void 0 ? _a : 0, (_b = container === null || container === void 0 ? void 0 : container.quantity) !== null && _b !== void 0 ? _b : 0);
        const paidAmount = payment.payments.reduce((s, p) => s + p.amount, 0);
        if (paidAmount > totalAmount) {
            return res.status(400).json({
                message: `Total paid (₹${paidAmount}) cannot exceed the amount due (₹${totalAmount})`,
            });
        }
        payment.totalVerifiedQuantity = totalVerifiedQty;
        payment.totalAmount = totalAmount;
        payment.paidAmount = paidAmount;
        payment.remainingAmount = totalAmount - paidAmount;
        yield payment.save();
        return res.status(200).json({ message: "Payment entry updated", payment });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.updatePaymentEntry = updatePaymentEntry;
// ─── Admin: Delete a recorded payment transaction ────────────────────────────
const deletePaymentEntry = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { containerId, index } = req.params;
        const payment = yield payment_1.default.findOne({ container: containerId });
        if (!payment)
            return res.status(404).json({ message: "No payment record found for this container" });
        const idx = Number(index);
        if (Number.isNaN(idx) || idx < 0 || idx >= payment.payments.length) {
            return res.status(404).json({ message: "Payment entry not found" });
        }
        payment.payments.splice(idx, 1);
        const container = yield container_1.default.findById(containerId);
        const { totalVerifiedQty, totalAmount } = yield recalcPaymentTotals(containerId, (_a = container === null || container === void 0 ? void 0 : container.ratePerUnit) !== null && _a !== void 0 ? _a : 0, (_b = container === null || container === void 0 ? void 0 : container.quantity) !== null && _b !== void 0 ? _b : 0);
        const paidAmount = payment.payments.reduce((s, p) => s + p.amount, 0);
        payment.totalVerifiedQuantity = totalVerifiedQty;
        payment.totalAmount = totalAmount;
        payment.paidAmount = paidAmount;
        payment.remainingAmount = totalAmount - paidAmount;
        yield payment.save();
        return res.status(200).json({ message: "Payment entry deleted", payment });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.deletePaymentEntry = deletePaymentEntry;
// ─── Get All Payment Ledgers (Admin only) ─────────────────────────────────────
const getAllPayments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { page, limit, skip } = getPagination(req.query);
        const [payments, total] = yield Promise.all([
            payment_1.default.find()
                .populate("container", "model quantity ratePerUnit penaltyPerUnit status date")
                .populate("team", "name email phone")
                .populate("createdBy", "name email")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            payment_1.default.countDocuments(),
        ]);
        // Recompute verified/amount/remaining + hold from live PDI data, capped at
        // each container target, so totals never reflect over-verified counts.
        const enrichedPayments = yield enrichPaymentsWithLiveTotals(payments.map((p) => p.toObject()));
        return res.status(200).json({
            payments: enrichedPayments,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page * limit < total,
            },
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getAllPayments = getAllPayments;
// ─── Team: View Own Payment Info ──────────────────────────────────────────────
const getMyPayments = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const teamId = req.userId;
        const { page, limit, skip } = getPagination(req.query);
        const [payments, total, summaryPayments] = yield Promise.all([
            payment_1.default.find({ team: teamId })
                .populate("container", "model quantity ratePerUnit penaltyPerUnit status date")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            payment_1.default.countDocuments({ team: teamId }),
            // All team payments (with container) so the summary can be capped too
            payment_1.default.find({ team: teamId }).populate("container", "quantity ratePerUnit"),
        ]);
        // Recompute paginated list + full summary from live PDI data, capped at target
        const [enrichedPayments, enrichedSummary] = yield Promise.all([
            enrichPaymentsWithLiveTotals(payments.map((p) => p.toObject())),
            enrichPaymentsWithLiveTotals(summaryPayments.map((p) => p.toObject())),
        ]);
        const summary = {
            totalEarned: enrichedSummary.reduce((s, p) => s + p.totalAmount, 0),
            totalPaid: enrichedSummary.reduce((s, p) => { var _a; return s + ((_a = p.paidAmount) !== null && _a !== void 0 ? _a : 0); }, 0),
            totalRemaining: enrichedSummary.reduce((s, p) => s + p.remainingAmount, 0),
        };
        return res.status(200).json({
            payments: enrichedPayments,
            summary,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page * limit < total,
            },
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getMyPayments = getMyPayments;
// ─── Admin: Get Payment for a specific Container ──────────────────────────────
const getPaymentByContainer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { containerId } = req.params;
        const payment = yield payment_1.default.findOne({ container: containerId })
            .populate("container", "model quantity ratePerUnit penaltyPerUnit status date")
            .populate("team", "name email phone");
        if (!payment)
            return res.status(404).json({ message: "No payment record found for this container" });
        // Recompute totals from live PDI data, capped at target.
        const [enriched] = yield enrichPaymentsWithLiveTotals([payment.toObject()]);
        return res.status(200).json({ payment: enriched });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getPaymentByContainer = getPaymentByContainer;
