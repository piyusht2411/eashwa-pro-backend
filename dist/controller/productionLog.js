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
exports.getLogById = exports.getTeamHistory = exports.getTeamDashboard = exports.getPendingLogs = exports.getLogsByContainer = exports.submitProductionLog = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const productionLog_1 = __importDefault(require("../model/productionLog"));
const container_1 = __importDefault(require("../model/container"));
const user_1 = __importDefault(require("../model/user"));
const pdiVerification_1 = __importDefault(require("../model/pdiVerification"));
const notify_1 = require("../utils/notify");
const getPagination = (query) => {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;
    return { page, limit, skip };
};
// ─── Team: Submit/Update Daily Production Log ─────────────────────────────────
const submitProductionLog = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { containerId, date, reportedQuantity } = req.body;
        const teamId = req.userId;
        if (!containerId || !date || reportedQuantity === undefined) {
            return res.status(400).json({
                message: "containerId, date and reportedQuantity are required",
            });
        }
        // Verify container exists and is assigned to this team
        const container = yield container_1.default.findById(containerId);
        if (!container)
            return res.status(404).json({ message: "Container not found" });
        if (container.assignedTeam.toString() !== teamId) {
            return res.status(403).json({ message: "This container is not assigned to you" });
        }
        if (container.status !== "active") {
            return res.status(400).json({ message: "Container is not active" });
        }
        const logDate = new Date(date);
        // Normalize to start-of-day UTC for uniqueness check
        logDate.setUTCHours(0, 0, 0, 0);
        // Upsert: team can update the same day's log
        const log = yield productionLog_1.default.findOneAndUpdate({ container: containerId, team: teamId, date: logDate }, {
            container: containerId,
            team: teamId,
            date: logDate,
            reportedQuantity,
            status: "pending", // reset to pending if re-submitted
            verifiedQuantity: null,
        }, { new: true, upsert: true, setDefaultsOnInsert: true });
        // Notify all PDI users about new/updated production log
        const pdiUsers = yield user_1.default.find({ role: "pdi" }).select("_id");
        yield (0, notify_1.sendPushNotificationToMany)(pdiUsers.map((u) => u._id), "Production Update", `Team has reported ${reportedQuantity} units for container: ${container.model} on ${date}`, { logId: log._id.toString(), containerId, type: "new_production_log" });
        return res.status(200).json({ message: "Production log submitted", log });
    }
    catch (err) {
        if (err.code === 11000) {
            return res.status(409).json({ message: "Log for this date already exists for this container" });
        }
        return res.status(500).json({ message: err.message });
    }
});
exports.submitProductionLog = submitProductionLog;
// ─── Get Logs for a Container ─────────────────────────────────────────────────
// Admin & PDI see all; Team sees only their own
const getLogsByContainer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { containerId } = req.params;
        const userRole = req.userRole;
        const userId = req.userId;
        const filter = { container: containerId };
        if (userRole === "team") {
            filter.team = userId;
        }
        const { page, limit, skip } = getPagination(req.query);
        const [logs, total, summaryLogs] = yield Promise.all([
            productionLog_1.default.find(filter)
                .populate("team", "name email")
                .sort({ date: -1 })
                .skip(skip)
                .limit(limit),
            productionLog_1.default.countDocuments(filter),
            productionLog_1.default.find(filter).select("reportedQuantity verifiedQuantity"),
        ]);
        // Aggregate summary
        const totalReported = summaryLogs.reduce((s, l) => s + l.reportedQuantity, 0);
        const totalVerified = summaryLogs.reduce((s, l) => { var _a; return s + ((_a = l.verifiedQuantity) !== null && _a !== void 0 ? _a : 0); }, 0);
        return res.status(200).json({
            logs,
            totalReported,
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
exports.getLogsByContainer = getLogsByContainer;
// ─── Get All Pending Logs (PDI only) ─────────────────────────────────────────
const getPendingLogs = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const filter = { status: "pending" };
        const { page, limit, skip } = getPagination(req.query);
        const [logs, total] = yield Promise.all([
            productionLog_1.default.find(filter)
                .populate("team", "name email")
                .populate("container", "model quantity ratePerUnit assignedTeam")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            productionLog_1.default.countDocuments(filter),
        ]);
        return res.status(200).json({
            logs,
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
exports.getPendingLogs = getPendingLogs;
// ─── Get Team Dashboard Stats ─────────────────────────────────────────────────
const getTeamDashboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const teamId = req.userId;
        // Active containers for this team
        const containers = yield container_1.default.find({ assignedTeam: teamId, status: "active" });
        const stats = yield Promise.all(containers.map((c) => __awaiter(void 0, void 0, void 0, function* () {
            const logs = yield productionLog_1.default.find({ container: c._id, team: teamId });
            const totalReported = logs.reduce((s, l) => s + l.reportedQuantity, 0);
            const totalVerified = logs.reduce((s, l) => { var _a; return s + ((_a = l.verifiedQuantity) !== null && _a !== void 0 ? _a : 0); }, 0);
            return {
                container: {
                    _id: c._id,
                    model: c.model,
                    quantity: c.quantity,
                    date: c.date,
                    ratePerUnit: c.ratePerUnit,
                    status: c.status,
                },
                totalReported,
                totalVerified,
                totalAmount: totalVerified * c.ratePerUnit,
            };
        })));
        return res.status(200).json({ stats });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getTeamDashboard = getTeamDashboard;
// ─── Team: History with month/date filter ────────────────────────────────────
const getTeamHistory = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const teamId = req.userId;
        const { month, date } = req.query;
        const { page, limit, skip } = getPagination(req.query);
        const filter = { team: teamId };
        if (date) {
            const start = new Date(date);
            start.setUTCHours(0, 0, 0, 0);
            const end = new Date(start);
            end.setUTCDate(end.getUTCDate() + 1);
            filter.date = { $gte: start, $lt: end };
        }
        else if (month) {
            // month: "YYYY-MM"
            const [yearStr, monthStr] = month.split("-");
            const year = Number(yearStr);
            const m = Number(monthStr);
            if (!year || !m) {
                return res.status(400).json({ message: "Invalid month format, expected YYYY-MM" });
            }
            const start = new Date(Date.UTC(year, m - 1, 1));
            const end = new Date(Date.UTC(year, m, 1));
            filter.date = { $gte: start, $lt: end };
        }
        const [logs, total] = yield Promise.all([
            productionLog_1.default.find(filter)
                .populate("container", "model ratePerUnit quantity")
                .sort({ date: -1 })
                .skip(skip)
                .limit(limit),
            productionLog_1.default.countDocuments(filter),
        ]);
        const containerIds = Array.from(new Set(logs
            .map((l) => { var _a, _b; return (_b = (_a = l.container) === null || _a === void 0 ? void 0 : _a._id) === null || _b === void 0 ? void 0 : _b.toString(); })
            .filter(Boolean))).map((id) => new mongoose_1.default.Types.ObjectId(id));
        const logIds = logs.map((l) => l._id);
        const [verifiedAggByContainer, verifications] = yield Promise.all([
            productionLog_1.default.aggregate([
                {
                    $match: {
                        team: new mongoose_1.default.Types.ObjectId(String(teamId)),
                        container: { $in: containerIds },
                    },
                },
                {
                    $group: {
                        _id: "$container",
                        totalVerified: { $sum: { $ifNull: ["$verifiedQuantity", 0] } },
                    },
                },
            ]),
            pdiVerification_1.default.find({ productionLog: { $in: logIds } }),
        ]);
        const verifiedByContainer = new Map();
        for (const row of verifiedAggByContainer) {
            verifiedByContainer.set(String(row._id), row.totalVerified);
        }
        const pdiByLog = new Map();
        for (const v of verifications) {
            pdiByLog.set(String(v.productionLog), v);
        }
        const out = logs.map((l) => {
            var _a, _b, _c, _d, _e;
            const container = l.container;
            const totalVerifiedForContainer = (_a = verifiedByContainer.get(String(container === null || container === void 0 ? void 0 : container._id))) !== null && _a !== void 0 ? _a : 0;
            const remainingTarget = ((_b = container === null || container === void 0 ? void 0 : container.quantity) !== null && _b !== void 0 ? _b : 0) - totalVerifiedForContainer;
            const pdi = pdiByLog.get(String(l._id));
            return {
                _id: l._id,
                date: l.date,
                container: container
                    ? {
                        _id: container._id,
                        model: container.model,
                        ratePerUnit: container.ratePerUnit,
                        quantity: container.quantity,
                    }
                    : null,
                reportedQuantity: l.reportedQuantity,
                verifiedQuantity: (_c = l.verifiedQuantity) !== null && _c !== void 0 ? _c : null,
                status: l.status,
                remainingTarget,
                pdiVerification: pdi
                    ? {
                        verifiedQuantity: pdi.verifiedQuantity,
                        isIncomplete: pdi.isIncomplete,
                        missingQuantity: (_d = pdi.missingQuantity) !== null && _d !== void 0 ? _d : 0,
                        remarks: (_e = pdi.remarks) !== null && _e !== void 0 ? _e : "",
                    }
                    : null,
            };
        });
        return res.status(200).json({
            logs: out,
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
exports.getTeamHistory = getTeamHistory;
// ─── Get Single Production Log by ID (Admin / PDI / Team) ────────────────────
const getLogById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const { logId } = req.params;
        const userRole = req.userRole;
        const userId = req.userId;
        const log = yield productionLog_1.default.findById(logId)
            .populate("container", "model quantity date ratePerUnit status assignedTeam")
            .populate("team", "name email phone");
        if (!log)
            return res.status(404).json({ message: "Production log not found" });
        // Team can only see their own logs
        if (userRole === "team") {
            const teamId = typeof log.team === "string" ? log.team : (_a = log.team._id) === null || _a === void 0 ? void 0 : _a.toString();
            if (teamId !== userId) {
                return res.status(403).json({ message: "Access denied" });
            }
        }
        return res.status(200).json({ log });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getLogById = getLogById;
