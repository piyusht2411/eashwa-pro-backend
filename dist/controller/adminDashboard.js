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
exports.getMonitorData = exports.exportAdminReport = exports.getAdminReport = exports.getAdminDashboardSummary = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const productionLog_1 = __importDefault(require("../model/productionLog"));
const pdiVerification_1 = __importDefault(require("../model/pdiVerification"));
const payment_1 = __importDefault(require("../model/payment"));
const container_1 = __importDefault(require("../model/container"));
const user_1 = __importDefault(require("../model/user"));
const date_1 = require("../utils/date");
const getPagination = (query) => {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;
    return { page, limit, skip };
};
// ─── Admin Dashboard Summary ─────────────────────────────────────────────────
const getAdminDashboardSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h;
    try {
        const [verifiedAgg, pendingVerify, paymentAgg] = yield Promise.all([
            pdiVerification_1.default.aggregate([
                { $group: { _id: null, total: { $sum: "$verifiedQuantity" } } },
            ]),
            productionLog_1.default.countDocuments({ status: "pending" }),
            payment_1.default.aggregate([
                {
                    $group: {
                        _id: null,
                        totalAmount: { $sum: "$totalAmount" },
                        paidAmount: { $sum: "$paidAmount" },
                        remainingAmount: { $sum: "$remainingAmount" },
                    },
                },
            ]),
        ]);
        const totalProduction = (_b = (_a = verifiedAgg[0]) === null || _a === void 0 ? void 0 : _a.total) !== null && _b !== void 0 ? _b : 0;
        const totalAmount = (_d = (_c = paymentAgg[0]) === null || _c === void 0 ? void 0 : _c.totalAmount) !== null && _d !== void 0 ? _d : 0;
        const paidAmount = (_f = (_e = paymentAgg[0]) === null || _e === void 0 ? void 0 : _e.paidAmount) !== null && _f !== void 0 ? _f : 0;
        const remainingAmount = (_h = (_g = paymentAgg[0]) === null || _g === void 0 ? void 0 : _g.remainingAmount) !== null && _h !== void 0 ? _h : 0;
        return res.status(200).json({
            totalProduction,
            pendingVerify,
            totalAmount,
            paidAmount,
            remainingAmount,
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getAdminDashboardSummary = getAdminDashboardSummary;
// ─── Admin Report & History ──────────────────────────────────────────────────
const getAdminReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
    try {
        const { startDate, endDate, teamId } = req.query;
        const { page, limit, skip } = getPagination(req.query);
        const match = {};
        if (startDate || endDate) {
            match.date = {};
            if (startDate)
                match.date.$gte = new Date(String(startDate));
            if (endDate)
                match.date.$lte = new Date(String(endDate));
        }
        if (teamId) {
            match.team = new mongoose_1.default.Types.ObjectId(String(teamId));
        }
        const basePipeline = [
            { $match: match },
            {
                $lookup: {
                    from: "pdiverifications",
                    localField: "_id",
                    foreignField: "productionLog",
                    as: "pdi",
                },
            },
            { $unwind: { path: "$pdi", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "containers",
                    localField: "container",
                    foreignField: "_id",
                    as: "container",
                },
            },
            { $unwind: { path: "$container", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "users",
                    localField: "team",
                    foreignField: "_id",
                    as: "team",
                },
            },
            { $unwind: { path: "$team", preserveNullAndEmptyArrays: true } },
        ];
        const summaryPipeline = [
            ...basePipeline,
            {
                $group: {
                    _id: null,
                    totalReported: { $sum: "$reportedQuantity" },
                    totalVerified: { $sum: { $ifNull: ["$pdi.verifiedQuantity", 0] } },
                    totalIncomplete: {
                        $sum: { $cond: [{ $eq: ["$status", "incomplete"] }, 1, 0] },
                    },
                    containerIds: { $addToSet: "$container._id" },
                },
            },
        ];
        const logsPipeline = [
            ...basePipeline,
            { $sort: { date: -1 } },
            { $skip: skip },
            { $limit: limit },
            {
                $project: {
                    _id: 1,
                    date: 1,
                    reportedQuantity: 1,
                    verifiedQuantity: 1,
                    status: 1,
                    missingQuantity: { $ifNull: ["$pdi.missingQuantity", 0] },
                    remarks: { $ifNull: ["$pdi.remarks", ""] },
                    container: {
                        _id: "$container._id",
                        model: "$container.model",
                        ratePerUnit: "$container.ratePerUnit",
                    },
                    team: { _id: "$team._id", name: "$team.name" },
                },
            },
        ];
        const countPipeline = [...basePipeline, { $count: "total" }];
        const [summaryRes, logs, countRes] = yield Promise.all([
            productionLog_1.default.aggregate(summaryPipeline),
            productionLog_1.default.aggregate(logsPipeline),
            productionLog_1.default.aggregate(countPipeline),
        ]);
        const summaryRow = summaryRes[0];
        let totalAmount = 0;
        let totalPaid = 0;
        let totalRemaining = 0;
        if ((_a = summaryRow === null || summaryRow === void 0 ? void 0 : summaryRow.containerIds) === null || _a === void 0 ? void 0 : _a.length) {
            const paymentAgg = yield payment_1.default.aggregate([
                { $match: { container: { $in: summaryRow.containerIds } } },
                {
                    $group: {
                        _id: null,
                        totalAmount: { $sum: "$totalAmount" },
                        totalPaid: { $sum: "$paidAmount" },
                        totalRemaining: { $sum: "$remainingAmount" },
                    },
                },
            ]);
            totalAmount = (_c = (_b = paymentAgg[0]) === null || _b === void 0 ? void 0 : _b.totalAmount) !== null && _c !== void 0 ? _c : 0;
            totalPaid = (_g = (_e = (_d = paymentAgg[0]) === null || _d === void 0 ? void 0 : _d.paidAmount) !== null && _e !== void 0 ? _e : (_f = paymentAgg[0]) === null || _f === void 0 ? void 0 : _f.totalPaid) !== null && _g !== void 0 ? _g : 0;
            totalRemaining =
                (_l = (_j = (_h = paymentAgg[0]) === null || _h === void 0 ? void 0 : _h.totalRemaining) !== null && _j !== void 0 ? _j : (_k = paymentAgg[0]) === null || _k === void 0 ? void 0 : _k.remainingAmount) !== null && _l !== void 0 ? _l : 0;
        }
        const total = (_o = (_m = countRes[0]) === null || _m === void 0 ? void 0 : _m.total) !== null && _o !== void 0 ? _o : 0;
        return res.status(200).json({
            summary: {
                totalReported: (_p = summaryRow === null || summaryRow === void 0 ? void 0 : summaryRow.totalReported) !== null && _p !== void 0 ? _p : 0,
                totalVerified: (_q = summaryRow === null || summaryRow === void 0 ? void 0 : summaryRow.totalVerified) !== null && _q !== void 0 ? _q : 0,
                totalIncomplete: (_r = summaryRow === null || summaryRow === void 0 ? void 0 : summaryRow.totalIncomplete) !== null && _r !== void 0 ? _r : 0,
                totalAmount,
                totalPaid,
                totalRemaining,
            },
            logs: (0, date_1.istify)(logs),
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
exports.getAdminReport = getAdminReport;
// ─── Admin Monitor (live counts) ─────────────────────────────────────────────
const exportAdminReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { startDate, endDate, teamId } = req.query;
        const match = {};
        if (startDate || endDate) {
            match.date = {};
            if (startDate)
                match.date.$gte = new Date(String(startDate));
            if (endDate)
                match.date.$lte = new Date(String(endDate));
        }
        if (teamId) {
            match.team = new mongoose_1.default.Types.ObjectId(String(teamId));
        }
        const logs = yield productionLog_1.default.aggregate([
            { $match: match },
            {
                $lookup: {
                    from: "pdiverifications",
                    localField: "_id",
                    foreignField: "productionLog",
                    as: "pdi",
                },
            },
            { $unwind: { path: "$pdi", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "containers",
                    localField: "container",
                    foreignField: "_id",
                    as: "container",
                },
            },
            { $unwind: { path: "$container", preserveNullAndEmptyArrays: true } },
            {
                $lookup: {
                    from: "users",
                    localField: "team",
                    foreignField: "_id",
                    as: "team",
                },
            },
            { $unwind: { path: "$team", preserveNullAndEmptyArrays: true } },
            { $sort: { date: -1 } },
            {
                $project: {
                    _id: 1,
                    date: 1,
                    reportedQuantity: 1,
                    verifiedQuantity: { $ifNull: ["$pdi.verifiedQuantity", "$verifiedQuantity"] },
                    status: 1,
                    missingQuantity: { $ifNull: ["$pdi.missingQuantity", 0] },
                    remarks: { $ifNull: ["$pdi.remarks", ""] },
                    container: {
                        _id: "$container._id",
                        model: "$container.model",
                        ratePerUnit: "$container.ratePerUnit",
                    },
                    team: { _id: "$team._id", name: "$team.name" },
                },
            },
        ]);
        return res.status(200).json({
            logs: (0, date_1.istify)(logs),
            total: logs.length,
            filters: {
                startDate: startDate || null,
                endDate: endDate || null,
                teamId: teamId || null,
            },
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.exportAdminReport = exportAdminReport;
const getMonitorData = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o;
    try {
        const startOfDay = new Date();
        startOfDay.setUTCHours(0, 0, 0, 0);
        const endOfDay = new Date(startOfDay);
        endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);
        const [activeContainers, totalTeams, totalPdiUsers, todayLogs, todayVerified, todayPending, recentLogs, recentVerifications, recentPayments,] = yield Promise.all([
            container_1.default.countDocuments({ status: "active" }),
            user_1.default.countDocuments({ role: "team" }),
            user_1.default.countDocuments({ role: "pdi" }),
            productionLog_1.default.countDocuments({
                createdAt: { $gte: startOfDay, $lt: endOfDay },
            }),
            productionLog_1.default.countDocuments({
                createdAt: { $gte: startOfDay, $lt: endOfDay },
                status: "verified",
            }),
            productionLog_1.default.countDocuments({
                createdAt: { $gte: startOfDay, $lt: endOfDay },
                status: "pending",
            }),
            productionLog_1.default.find()
                .sort({ createdAt: -1 })
                .limit(3)
                .populate("team", "name")
                .populate("container", "model"),
            pdiVerification_1.default.find()
                .sort({ createdAt: -1 })
                .limit(3)
                .populate("container", "model")
                .populate("verifiedBy", "name"),
            payment_1.default.find()
                .sort({ updatedAt: -1 })
                .limit(3)
                .populate("container", "model")
                .populate("team", "name"),
        ]);
        const activity = [];
        for (const l of recentLogs) {
            const teamName = (_b = (_a = l.team) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : "A team";
            const containerModel = (_d = (_c = l.container) === null || _c === void 0 ? void 0 : _c.model) !== null && _d !== void 0 ? _d : "container";
            const ts = l.createdAt;
            activity.push({
                type: "production_log",
                description: `${teamName} logged ${l.reportedQuantity} units for ${containerModel}`,
                timestamp: ts,
                _ts: new Date(ts).getTime(),
            });
        }
        for (const v of recentVerifications) {
            const containerModel = (_f = (_e = v.container) === null || _e === void 0 ? void 0 : _e.model) !== null && _f !== void 0 ? _f : "container";
            const verifierName = (_h = (_g = v.verifiedBy) === null || _g === void 0 ? void 0 : _g.name) !== null && _h !== void 0 ? _h : "PDI";
            const ts = v.createdAt;
            activity.push({
                type: "pdi_verification",
                description: `${verifierName} verified ${v.verifiedQuantity} units for ${containerModel}${v.isIncomplete ? ` (missing ${(_j = v.missingQuantity) !== null && _j !== void 0 ? _j : 0})` : ""}`,
                timestamp: ts,
                _ts: new Date(ts).getTime(),
            });
        }
        for (const p of recentPayments) {
            const containerModel = (_l = (_k = p.container) === null || _k === void 0 ? void 0 : _k.model) !== null && _l !== void 0 ? _l : "container";
            const teamName = (_o = (_m = p.team) === null || _m === void 0 ? void 0 : _m.name) !== null && _o !== void 0 ? _o : "team";
            const ts = p.updatedAt;
            activity.push({
                type: "payment",
                description: `Payment ledger updated for ${containerModel} (${teamName}): paid ₹${p.paidAmount} of ₹${p.totalAmount}`,
                timestamp: ts,
                _ts: new Date(ts).getTime(),
            });
        }
        const recentActivity = activity
            .sort((a, b) => b._ts - a._ts)
            .slice(0, 10)
            .map((a) => ({
            type: a.type,
            description: a.description,
            timestamp: (0, date_1.toIST)(a.timestamp),
        }));
        return res.status(200).json({
            activeContainers,
            totalTeams,
            totalPdiUsers,
            todayLogs,
            todayVerified,
            todayPending,
            recentActivity,
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getMonitorData = getMonitorData;
