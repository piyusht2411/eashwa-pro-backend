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
exports.deleteDriver = exports.updateDriver = exports.getDriverSummary = exports.getDriverById = exports.getAllDrivers = exports.createDriver = void 0;
const driver_1 = __importDefault(require("../../model/driver"));
const visit_1 = __importDefault(require("../../model/visit"));
const expense_1 = __importDefault(require("../../model/expense"));
const helpers_1 = require("../../utils/helpers");
// ─── Create Driver ────────────────────────────────────────────────────────────
const createDriver = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, vehicleNumber, userId } = req.body;
        if (!name || !vehicleNumber) {
            return res.status(400).json({ message: "name and vehicleNumber are required" });
        }
        const driver = yield driver_1.default.create({
            name: name.trim(),
            vehicleNumber: vehicleNumber.trim().toUpperCase(),
            userId: userId || null,
        });
        return res.status(201).json({
            message: "Driver created successfully",
            driver,
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.createDriver = createDriver;
// ─── Get All Drivers ──────────────────────────────────────────────────────────
const getAllDrivers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { search, isActive } = req.query;
        const { page, limit, skip } = (0, helpers_1.getPagination)(req.query);
        const filter = {};
        if (isActive !== undefined)
            filter.isActive = isActive === "true";
        if (search) {
            filter.$or = [
                { name: { $regex: search, $options: "i" } },
                { vehicleNumber: { $regex: search, $options: "i" } },
            ];
        }
        const [drivers, total] = yield Promise.all([
            driver_1.default.find(filter)
                .populate("userId", "email role")
                .sort({ name: 1 })
                .skip(skip)
                .limit(limit),
            driver_1.default.countDocuments(filter),
        ]);
        return res.status(200).json({
            drivers,
            pagination: (0, helpers_1.buildPaginationMeta)(page, limit, total),
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getAllDrivers = getAllDrivers;
// ─── Get Driver By ID ─────────────────────────────────────────────────────────
const getDriverById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const driver = yield driver_1.default.findById(req.params.id).populate("userId", "email role");
        if (!driver)
            return res.status(404).json({ message: "Driver not found" });
        return res.status(200).json({ driver });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getDriverById = getDriverById;
// ─── Get Driver Summary ───────────────────────────────────────────────────────
const getDriverSummary = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c, _d, _e, _f;
    try {
        const { id } = req.params;
        const { page, limit, skip } = (0, helpers_1.getPagination)(req.query);
        const driver = yield driver_1.default.findById(id);
        if (!driver)
            return res.status(404).json({ message: "Driver not found" });
        const [stats] = yield visit_1.default.aggregate([
            { $match: { driver: driver._id } },
            {
                $group: {
                    _id: "$driver",
                    totalVisits: { $sum: 1 },
                    totalDistance: { $sum: "$distance" },
                },
            },
        ]);
        const [expenseStats] = yield expense_1.default.aggregate([
            { $match: { driver: driver._id } },
            {
                $group: {
                    _id: "$driver",
                    totalExpense: { $sum: "$totalExpense" },
                    approvedReimbursement: { $sum: "$approvedReimbursement" },
                    pendingReimbursement: { $sum: "$pendingReimbursement" },
                    rejectedAmount: { $sum: "$rejectedAmount" },
                },
            },
        ]);
        const [visits, totalVisits] = yield Promise.all([
            visit_1.default.find({ driver: driver._id })
                .sort({ startDate: -1 })
                .skip(skip)
                .limit(limit)
                .lean(),
            visit_1.default.countDocuments({ driver: driver._id }),
        ]);
        return res.status(200).json({
            driver,
            summary: {
                totalVisits: (_a = stats === null || stats === void 0 ? void 0 : stats.totalVisits) !== null && _a !== void 0 ? _a : 0,
                totalDistance: (_b = stats === null || stats === void 0 ? void 0 : stats.totalDistance) !== null && _b !== void 0 ? _b : 0,
                totalExpense: (_c = expenseStats === null || expenseStats === void 0 ? void 0 : expenseStats.totalExpense) !== null && _c !== void 0 ? _c : 0,
                approvedReimbursement: (_d = expenseStats === null || expenseStats === void 0 ? void 0 : expenseStats.approvedReimbursement) !== null && _d !== void 0 ? _d : 0,
                pendingReimbursement: (_e = expenseStats === null || expenseStats === void 0 ? void 0 : expenseStats.pendingReimbursement) !== null && _e !== void 0 ? _e : 0,
                rejectedAmount: (_f = expenseStats === null || expenseStats === void 0 ? void 0 : expenseStats.rejectedAmount) !== null && _f !== void 0 ? _f : 0,
            },
            recentVisits: visits,
            pagination: (0, helpers_1.buildPaginationMeta)(page, limit, totalVisits),
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getDriverSummary = getDriverSummary;
// ─── Update Driver ────────────────────────────────────────────────────────────
const updateDriver = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { name, vehicleNumber, userId, isActive } = req.body;
        const driver = yield driver_1.default.findById(id);
        if (!driver)
            return res.status(404).json({ message: "Driver not found" });
        if (name !== undefined)
            driver.name = name.trim();
        if (vehicleNumber !== undefined)
            driver.vehicleNumber = vehicleNumber.trim().toUpperCase();
        if (userId !== undefined)
            driver.userId = userId;
        if (isActive !== undefined)
            driver.isActive = isActive;
        yield driver.save();
        return res.status(200).json({ message: "Driver updated successfully", driver });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.updateDriver = updateDriver;
// ─── Delete Driver ────────────────────────────────────────────────────────────
const deleteDriver = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const driver = yield driver_1.default.findById(id);
        if (!driver)
            return res.status(404).json({ message: "Driver not found" });
        const linkedVisit = yield visit_1.default.findOne({ driver: id }).select("_id");
        if (linkedVisit) {
            return res.status(400).json({
                message: "Cannot delete driver with existing visits. Deactivate instead.",
            });
        }
        yield driver.deleteOne();
        return res.status(200).json({ message: "Driver deleted successfully" });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.deleteDriver = deleteDriver;
