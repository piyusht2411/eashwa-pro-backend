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
exports.getPdiDashboard = exports.getVerificationByLog = exports.getVerificationsByContainer = exports.verifyProductionLog = void 0;
const pdiVerification_1 = __importDefault(require("../model/pdiVerification"));
const productionLog_1 = __importDefault(require("../model/productionLog"));
const user_1 = __importDefault(require("../model/user"));
const notify_1 = require("../utils/notify");
const getPagination = (query) => {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;
    return { page, limit, skip };
};
// ─── PDI: Verify a Production Log ─────────────────────────────────────────────
const verifyProductionLog = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
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
        const containerModel = (_a = containerDoc === null || containerDoc === void 0 ? void 0 : containerDoc.model) !== null && _a !== void 0 ? _a : "container";
        const containerIdStr = (_c = (_b = containerDoc === null || containerDoc === void 0 ? void 0 : containerDoc._id) === null || _b === void 0 ? void 0 : _b.toString()) !== null && _c !== void 0 ? _c : "";
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
// ─── Get Verifications for a Container (Admin/PDI) ───────────────────────────
const getVerificationsByContainer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
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
        const totalVerified = summaryVerifications.reduce((s, v) => s + v.verifiedQuantity, 0);
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
    try {
        const pdiId = req.userId;
        const { page, limit, skip } = getPagination(req.query);
        const pendingCount = yield productionLog_1.default.countDocuments({ status: "pending" });
        const [verifiedByMe, total] = yield Promise.all([
            pdiVerification_1.default.find({ verifiedBy: pdiId })
                .populate("productionLog", "date reportedQuantity")
                .populate("container", "model")
                .sort({ verifiedAt: -1 })
                .skip(skip)
                .limit(limit),
            pdiVerification_1.default.countDocuments({ verifiedBy: pdiId }),
        ]);
        return res.status(200).json({
            pendingCount,
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
