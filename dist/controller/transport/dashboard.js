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
exports.getMyDriverDashboard = exports.getDriverDashboard = exports.getAccountsDashboard = exports.getAdminDashboard = void 0;
const driver_1 = __importDefault(require("../../model/driver"));
const visit_1 = __importDefault(require("../../model/visit"));
const expense_1 = __importDefault(require("../../model/expense"));
const helpers_1 = require("../../utils/helpers");
const driverScope_1 = require("../../utils/driverScope");
const expenseTotals_1 = require("../../utils/expenseTotals");
// ─── Admin Dashboard ──────────────────────────────────────────────────────────
const getAdminDashboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const dateFilter = (0, helpers_1.buildDateFilter)(req.query);
        const visitFilter = Object.keys(dateFilter).length > 0 ? dateFilter : {};
        const [totalDrivers, totalVisits, expenseStats, pendingApprovals, recentVisits, recentPendingExpenses,] = yield Promise.all([
            driver_1.default.countDocuments({ isActive: true }),
            visit_1.default.countDocuments(visitFilter),
            expense_1.default.aggregate([
                expenseTotals_1.expenseTotalsStage,
                { $group: Object.assign({ _id: null }, expenseTotals_1.expenseTotalsAccumulators) },
            ]),
            expense_1.default.countDocuments({
                $or: [
                    { "food.status": "pending" },
                    { "cng.status": "pending" },
                    { "other.status": "pending" },
                ],
            }),
            visit_1.default.find(visitFilter)
                .populate("driver", "name vehicleNumber")
                .populate("createdBy", "name")
                .sort({ startDate: -1 })
                .limit(5),
            expense_1.default.find({
                $or: [
                    { "food.status": "pending" },
                    { "cng.status": "pending" },
                    { "other.status": "pending" },
                ],
            })
                .populate({ path: "visit", select: "destination startDate endDate totalDays" })
                .populate("driver", "name vehicleNumber")
                .sort({ updatedAt: -1 })
                .limit(5),
        ]);
        const [distanceStats] = yield visit_1.default.aggregate([
            { $match: visitFilter },
            { $group: { _id: null, totalDistance: { $sum: "$distance" } } },
        ]);
        const stats = expenseStats[0] || (0, expenseTotals_1.emptyExpenseTotals)();
        return res.status(200).json({
            stats: {
                totalDrivers,
                totalVisits,
                totalDistance: (_a = distanceStats === null || distanceStats === void 0 ? void 0 : distanceStats.totalDistance) !== null && _a !== void 0 ? _a : 0,
                totalExpense: stats.totalExpense,
                pendingExpense: stats.pendingExpense,
                pendingReimbursements: stats.pendingReimbursement,
                approvedReimbursements: stats.approvedReimbursement,
                pendingApprovals,
            },
            recentVisits,
            recentPendingExpenses,
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getAdminDashboard = getAdminDashboard;
// ─── Accounts Dashboard ───────────────────────────────────────────────────────
const getAccountsDashboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d;
    try {
        const dateFilter = (0, helpers_1.buildDateFilter)(req.query);
        const visitFilter = Object.keys(dateFilter).length > 0 ? dateFilter : {};
        const [totalDrivers, totalVisits, pendingApprovals, recentVisits] = yield Promise.all([
            driver_1.default.countDocuments({ isActive: true }),
            visit_1.default.countDocuments(visitFilter),
            expense_1.default.countDocuments({
                $or: [
                    { "food.status": "pending" },
                    { "cng.status": "pending" },
                    { "other.status": "pending" },
                ],
            }),
            visit_1.default.find(visitFilter)
                .populate("driver", "name vehicleNumber")
                .populate("createdBy", "name")
                .sort({ startDate: -1 })
                .limit(10),
        ]);
        const [expenseStats] = yield expense_1.default.aggregate([
            expenseTotals_1.expenseTotalsStage,
            { $group: Object.assign({ _id: null }, expenseTotals_1.expenseTotalsAccumulators) },
        ]);
        return res.status(200).json({
            stats: {
                totalDrivers,
                totalVisits,
                totalExpense: (_a = expenseStats === null || expenseStats === void 0 ? void 0 : expenseStats.totalExpense) !== null && _a !== void 0 ? _a : 0,
                pendingExpense: (_b = expenseStats === null || expenseStats === void 0 ? void 0 : expenseStats.pendingExpense) !== null && _b !== void 0 ? _b : 0,
                pendingReimbursements: (_c = expenseStats === null || expenseStats === void 0 ? void 0 : expenseStats.pendingReimbursement) !== null && _c !== void 0 ? _c : 0,
                approvedReimbursements: (_d = expenseStats === null || expenseStats === void 0 ? void 0 : expenseStats.approvedReimbursement) !== null && _d !== void 0 ? _d : 0,
                pendingApprovals,
            },
            recentVisits,
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getAccountsDashboard = getAccountsDashboard;
// ─── Driver Dashboard ─────────────────────────────────────────────────────────
const getDriverDashboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { driverId } = req.params;
        const dateFilter = (0, helpers_1.buildDateFilter)(req.query);
        // A driver may only read their own dashboard, whichever id they ask for.
        if ((0, driverScope_1.isDriverRole)(req)) {
            const scope = yield (0, driverScope_1.resolveDriverScope)(req, driverId);
            if (scope.forbidden) {
                return res.status(403).json({ message: scope.message });
            }
        }
        const driver = yield driver_1.default.findById(driverId);
        if (!driver)
            return res.status(404).json({ message: "Driver not found" });
        const visitFilter = Object.assign({ driver: driver._id }, dateFilter);
        const [visits, expenseStats] = yield Promise.all([
            visit_1.default.aggregate([
                { $match: visitFilter },
                {
                    $group: {
                        _id: "$driver",
                        totalVisits: { $sum: 1 },
                        totalDistance: { $sum: "$distance" },
                    },
                },
            ]),
            expense_1.default.aggregate([
                { $match: { driver: driver._id } },
                expenseTotals_1.expenseTotalsStage,
                { $group: Object.assign({ _id: "$driver" }, expenseTotals_1.expenseTotalsAccumulators) },
            ]),
        ]);
        const recentVisits = yield visit_1.default.find(visitFilter)
            .sort({ startDate: -1 })
            .limit(10)
            .lean();
        const vStats = visits[0] || { totalVisits: 0, totalDistance: 0 };
        const eStats = expenseStats[0] || (0, expenseTotals_1.emptyExpenseTotals)();
        return res.status(200).json({
            driver,
            stats: {
                totalVisits: vStats.totalVisits,
                totalDistance: vStats.totalDistance,
                totalExpense: eStats.totalExpense,
                pendingExpense: eStats.pendingExpense,
                approvedReimbursements: eStats.approvedReimbursement,
                pendingBalance: eStats.pendingReimbursement,
            },
            recentVisits,
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getDriverDashboard = getDriverDashboard;
// Driver-safe dashboard: resolve the Driver record from the authenticated user.
// A driver must never supply another driver's ID.
const getMyDriverDashboard = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    const driver = yield driver_1.default.findOne({ userId: req.userId, isActive: true }).select("_id");
    if (!driver)
        return res.status(404).json({ message: "No active driver profile is linked to this account" });
    req.params.driverId = String(driver._id);
    return (0, exports.getDriverDashboard)(req, res);
});
exports.getMyDriverDashboard = getMyDriverDashboard;
