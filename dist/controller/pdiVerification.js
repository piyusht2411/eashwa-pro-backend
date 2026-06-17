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
exports.getPdiDashboard = exports.getVerificationByLog = exports.getVerificationsByContainer = exports.unverifyProductionLog = exports.editIncompleteVerification = exports.verifyProductionLog = void 0;
const pdiVerification_1 = __importDefault(require("../model/pdiVerification"));
const productionLog_1 = __importDefault(require("../model/productionLog"));
const container_1 = __importDefault(require("../model/container"));
const user_1 = __importDefault(require("../model/user"));
const notify_1 = require("../utils/notify");
const date_1 = require("../utils/date");
const penalty_1 = require("../utils/penalty");
const getPagination = (query) => {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;
    return { page, limit, skip };
};
// ─── PDI: Verify a Production Log ─────────────────────────────────────────────
const verifyProductionLog = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    try {
        const { logId } = req.params;
        const { verifiedQuantity, isIncomplete, missingQuantity, remarks } = req.body;
        const pdiId = req.userId;
        if (verifiedQuantity === undefined) {
            return res.status(400).json({ message: "verifiedQuantity is required" });
        }
        const log = yield productionLog_1.default.findById(logId).populate("container");
        if (!log)
            return res.status(404).json({ message: "Production log not found" });
        if (log.status === "verified") {
            return res.status(409).json({ message: "This log has already been verified" });
        }
        // Verified qty cannot exceed reported qty
        if (verifiedQuantity > log.reportedQuantity) {
            return res.status(400).json({
                message: `verifiedQuantity (${verifiedQuantity}) cannot exceed reportedQuantity (${log.reportedQuantity})`,
            });
        }
        // Cumulative verified for this container cannot exceed the target (quantity).
        const containerForCap = log.container;
        const containerQty = Number((_a = containerForCap === null || containerForCap === void 0 ? void 0 : containerForCap.quantity) !== null && _a !== void 0 ? _a : 0);
        const priorAgg = yield pdiVerification_1.default.aggregate([
            { $match: { container: containerForCap._id, productionLog: { $ne: log._id } } },
            { $group: { _id: null, total: { $sum: "$verifiedQuantity" } } },
        ]);
        const priorVerified = (_c = (_b = priorAgg[0]) === null || _b === void 0 ? void 0 : _b.total) !== null && _c !== void 0 ? _c : 0;
        const remainingCapacity = Math.max(0, containerQty - priorVerified);
        if (verifiedQuantity > remainingCapacity) {
            return res.status(400).json({
                message: `Verified quantity exceeds the container target. Target is ${containerQty}, already verified ${priorVerified}, so at most ${remainingCapacity} more can be verified.`,
            });
        }
        const incomplete = isIncomplete !== null && isIncomplete !== void 0 ? isIncomplete : (verifiedQuantity < log.reportedQuantity);
        const missing = missingQuantity !== null && missingQuantity !== void 0 ? missingQuantity : (log.reportedQuantity - verifiedQuantity);
        // Create or update verification record
        const verification = yield pdiVerification_1.default.findOneAndUpdate({ productionLog: logId }, {
            productionLog: logId,
            container: log.container,
            verifiedBy: pdiId,
            verifiedQuantity,
            isIncomplete: incomplete,
            missingQuantity: missing,
            remarks: remarks !== null && remarks !== void 0 ? remarks : "",
            verifiedAt: new Date(),
        }, { new: true, upsert: true, setDefaultsOnInsert: true });
        // Update the production log
        log.verifiedQuantity = verifiedQuantity;
        log.status = incomplete ? "incomplete" : "verified";
        yield log.save();
        // ── Notifications ────────────────────────────────────────────────────────
        const containerDoc = log.container; // already populated
        const containerModel = (_d = containerDoc === null || containerDoc === void 0 ? void 0 : containerDoc.model) !== null && _d !== void 0 ? _d : "container";
        const containerIdStr = (_f = (_e = containerDoc === null || containerDoc === void 0 ? void 0 : containerDoc._id) === null || _e === void 0 ? void 0 : _e.toString()) !== null && _f !== void 0 ? _f : "";
        // 1. Notify the Team whose log was verified
        yield (0, notify_1.sendPushNotification)(log.team, incomplete ? "⚠️ Production Partially Verified" : "✅ Production Verified", incomplete
            ? `Your report for ${containerModel} was partially accepted. ${missing} units are unverified.`
            : `All ${verifiedQuantity} units for ${containerModel} have been verified by PDI.`, {
            type: incomplete ? "pdi_incomplete" : "pdi_verified",
            logId,
            containerId: containerIdStr,
            verifiedQuantity: String(verifiedQuantity),
        });
        // 2. Notify all Admins with the verification summary
        const admins = yield user_1.default.find({ role: "admin" }).select("_id");
        if (admins.length > 0) {
            yield (0, notify_1.sendPushNotificationToMany)(admins.map((a) => a._id), "📋 PDI Verification Complete", `PDI verified ${verifiedQuantity} units for ${containerModel}.${incomplete ? ` Missing: ${missing} units.` : " Fully verified."}`, {
                type: "pdi_verified_admin",
                logId,
                containerId: containerIdStr,
                verifiedQuantity: String(verifiedQuantity),
            });
        }
        // ────────────────────────────────────────────────────────────────────────
        return res.status(200).json({ message: "Verification saved", verification });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.verifyProductionLog = verifyProductionLog;
// ─── PDI: Edit an incomplete verification ─────────────────────────────────────
const editIncompleteVerification = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    try {
        const { verificationId } = req.params;
        const { verifiedQuantity, remarks } = req.body;
        const pdiId = req.userId;
        if (verifiedQuantity === undefined || verifiedQuantity === null) {
            return res.status(400).json({ message: "verifiedQuantity is required" });
        }
        const verification = yield pdiVerification_1.default.findById(verificationId);
        if (!verification) {
            return res.status(404).json({ message: "Verification not found" });
        }
        if (!verification.isIncomplete) {
            return res.status(409).json({
                message: "Only incomplete verifications can be edited",
            });
        }
        const log = yield productionLog_1.default.findById(verification.productionLog).populate("container");
        if (!log)
            return res.status(404).json({ message: "Linked production log not found" });
        if (verifiedQuantity > log.reportedQuantity) {
            return res.status(400).json({
                message: `verifiedQuantity (${verifiedQuantity}) cannot exceed reportedQuantity (${log.reportedQuantity})`,
            });
        }
        // Cumulative verified for this container cannot exceed the target (quantity).
        const containerForCap = log.container;
        const containerQty = Number((_a = containerForCap === null || containerForCap === void 0 ? void 0 : containerForCap.quantity) !== null && _a !== void 0 ? _a : 0);
        const priorAgg = yield pdiVerification_1.default.aggregate([
            { $match: { container: containerForCap._id, productionLog: { $ne: log._id } } },
            { $group: { _id: null, total: { $sum: "$verifiedQuantity" } } },
        ]);
        const priorVerified = (_c = (_b = priorAgg[0]) === null || _b === void 0 ? void 0 : _b.total) !== null && _c !== void 0 ? _c : 0;
        const remainingCapacity = Math.max(0, containerQty - priorVerified);
        if (verifiedQuantity > remainingCapacity) {
            return res.status(400).json({
                message: `Verified quantity exceeds the container target. Target is ${containerQty}, already verified ${priorVerified}, so at most ${remainingCapacity} more can be verified.`,
            });
        }
        const incomplete = verifiedQuantity < log.reportedQuantity;
        const missing = log.reportedQuantity - verifiedQuantity;
        verification.verifiedQuantity = verifiedQuantity;
        verification.isIncomplete = incomplete;
        verification.missingQuantity = missing;
        if (remarks !== undefined)
            verification.remarks = remarks;
        verification.verifiedAt = new Date();
        verification.verifiedBy = pdiId;
        yield verification.save();
        log.verifiedQuantity = verifiedQuantity;
        log.status = incomplete ? "incomplete" : "verified";
        yield log.save();
        // ── Notifications ────────────────────────────────────────────────────────
        const containerDoc = log.container;
        const containerModel = (_d = containerDoc === null || containerDoc === void 0 ? void 0 : containerDoc.model) !== null && _d !== void 0 ? _d : "container";
        const containerIdStr = (_f = (_e = containerDoc === null || containerDoc === void 0 ? void 0 : containerDoc._id) === null || _e === void 0 ? void 0 : _e.toString()) !== null && _f !== void 0 ? _f : "";
        const logIdStr = log._id.toString();
        yield (0, notify_1.sendPushNotification)(log.team, incomplete ? "⚠️ Verification Updated (Partial)" : "✅ Verification Updated", incomplete
            ? `Your report for ${containerModel} is still partial. ${missing} units unverified.`
            : `All ${verifiedQuantity} units for ${containerModel} are now verified.`, {
            type: incomplete ? "pdi_incomplete" : "pdi_verified",
            logId: logIdStr,
            containerId: containerIdStr,
            verifiedQuantity: String(verifiedQuantity),
        });
        const admins = yield user_1.default.find({ role: "admin" }).select("_id");
        if (admins.length > 0) {
            yield (0, notify_1.sendPushNotificationToMany)(admins.map((a) => a._id), "📋 PDI Verification Updated", `PDI updated verification to ${verifiedQuantity} units for ${containerModel}.${incomplete ? ` Missing: ${missing}.` : " Fully verified."}`, {
                type: "pdi_verified_admin",
                logId: logIdStr,
                containerId: containerIdStr,
                verifiedQuantity: String(verifiedQuantity),
            });
        }
        return res.status(200).json({ message: "Verification updated", verification: (0, date_1.istify)(verification) });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.editIncompleteVerification = editIncompleteVerification;
// ─── PDI: Unverify a Production Log (revert to pending) ──────────────────────
// Deletes the PDI verification record and sets the log back to "pending" so it
// re-enters the verification queue. Notifies the team and admins.
const unverifyProductionLog = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    try {
        const { logId } = req.params;
        const log = yield productionLog_1.default.findById(logId).populate("container");
        if (!log)
            return res.status(404).json({ message: "Production log not found" });
        const verification = yield pdiVerification_1.default.findOne({ productionLog: logId });
        if (!verification && log.status === "pending") {
            return res.status(409).json({ message: "This log is already pending" });
        }
        if (verification) {
            yield pdiVerification_1.default.deleteOne({ _id: verification._id });
        }
        // Revert the production log to pending
        log.verifiedQuantity = null;
        log.status = "pending";
        yield log.save();
        // ── Notifications ──────────────────────────────────────────────────────
        const containerDoc = log.container;
        const containerModel = (_a = containerDoc === null || containerDoc === void 0 ? void 0 : containerDoc.model) !== null && _a !== void 0 ? _a : "container";
        const containerIdStr = (_c = (_b = containerDoc === null || containerDoc === void 0 ? void 0 : containerDoc._id) === null || _b === void 0 ? void 0 : _b.toString()) !== null && _c !== void 0 ? _c : "";
        yield (0, notify_1.sendPushNotification)(log.team, "↩️ Verification Reverted", `Your report for ${containerModel} was sent back for re-verification by PDI.`, {
            type: "pdi_unverified",
            logId,
            containerId: containerIdStr,
        });
        const admins = yield user_1.default.find({ role: "admin" }).select("_id");
        if (admins.length > 0) {
            yield (0, notify_1.sendPushNotificationToMany)(admins.map((a) => a._id), "↩️ PDI Verification Reverted", `A verification for ${containerModel} was reverted to pending.`, {
                type: "pdi_unverified_admin",
                logId,
                containerId: containerIdStr,
            });
        }
        return res.status(200).json({ message: "Verification reverted to pending", logId });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.unverifyProductionLog = unverifyProductionLog;
// ─── Get Verifications for a Container (Admin/PDI) ───────────────────────────
const getVerificationsByContainer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { containerId } = req.params;
        const { page, limit, skip } = getPagination(req.query);
        const [verifications, total, summaryVerifications] = yield Promise.all([
            pdiVerification_1.default.find({ container: containerId })
                .populate("productionLog", "date reportedQuantity status")
                .populate("verifiedBy", "name email")
                .sort({ verifiedAt: -1 })
                .skip(skip)
                .limit(limit),
            pdiVerification_1.default.countDocuments({ container: containerId }),
            pdiVerification_1.default.find({ container: containerId }).select("verifiedQuantity"),
        ]);
        const rawTotalVerified = summaryVerifications.reduce((s, v) => s + v.verifiedQuantity, 0);
        // Cap at the container target — verified can never exceed it.
        const containerForCap = yield container_1.default.findById(containerId).select("quantity");
        const totalVerified = containerForCap
            ? Math.min((_a = containerForCap.quantity) !== null && _a !== void 0 ? _a : 0, rawTotalVerified)
            : rawTotalVerified;
        return res.status(200).json({
            verifications,
            totalVerified,
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
exports.getVerificationsByContainer = getVerificationsByContainer;
// ─── Get Single Verification ──────────────────────────────────────────────────
const getVerificationByLog = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { logId } = req.params;
        const verification = yield pdiVerification_1.default.findOne({ productionLog: logId })
            .populate("verifiedBy", "name email");
        if (!verification) {
            return res.status(404).json({ message: "No verification found for this log" });
        }
        return res.status(200).json({ verification });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getVerificationByLog = getVerificationByLog;
// ─── PDI Dashboard: Summary of pending/verified logs ────────────────────────
const getPdiDashboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const pdiId = req.userId;
        const { page, limit, skip } = getPagination(req.query);
        const pendingCount = yield productionLog_1.default.countDocuments({ status: "pending" });
        const [verifiedByMe, total, penaltyContainers] = yield Promise.all([
            pdiVerification_1.default.find({ verifiedBy: pdiId })
                .populate("productionLog", "date reportedQuantity")
                .populate("container", "model penaltyPerUnit quantity")
                .sort({ verifiedAt: -1 })
                .skip(skip)
                .limit(limit),
            pdiVerification_1.default.countDocuments({ verifiedBy: pdiId }),
            // Live penalty across all non-cancelled containers
            container_1.default.find({ status: { $ne: "cancelled" } }).select("quantity penaltyPerUnit"),
        ]);
        const verifiedMap = yield (0, penalty_1.getVerifiedByContainer)(penaltyContainers.map((c) => c._id));
        let totalPenalty = 0;
        let totalPendingVehicles = 0;
        for (const c of penaltyContainers) {
            const { pendingQuantity, totalPenalty: p } = (0, penalty_1.computePenalty)(c.quantity, (_a = verifiedMap.get(String(c._id))) !== null && _a !== void 0 ? _a : 0, (_b = c.penaltyPerUnit) !== null && _b !== void 0 ? _b : 0);
            totalPenalty += p;
            totalPendingVehicles += pendingQuantity;
        }
        return res.status(200).json({
            pendingCount,
            totalPenalty,
            totalPendingVehicles,
            recentVerifications: verifiedByMe,
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
exports.getPdiDashboard = getPdiDashboard;
