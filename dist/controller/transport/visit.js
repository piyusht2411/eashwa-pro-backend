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
exports.deleteVisit = exports.updateVisit = exports.getVisitById = exports.getAllVisits = exports.createVisit = void 0;
const visit_1 = __importDefault(require("../../model/visit"));
const expense_1 = __importStar(require("../../model/expense"));
const driver_1 = __importDefault(require("../../model/driver"));
const notify_1 = require("../../utils/notify");
const helpers_1 = require("../../utils/helpers");
/** Accepts "" / null to clear a time, a valid "HH:mm", or rejects with null. */
const parseTime = (value) => {
    if (value === undefined || value === null || value === "")
        return "";
    return (0, helpers_1.isValidTime)(value) ? value : null;
};
/** Notification-friendly "12 Oct 2026, 9:30 am" in IST, time only when one was picked. */
const describeWhen = (date, time) => time
    ? new Date(date).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true,
    })
    : new Date(date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
const driverScope_1 = require("../../utils/driverScope");
// ─── Create Visit ─────────────────────────────────────────────────────────────
const createVisit = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { driverId, destination, startDate, endDate, quantity, billNumber, distance, vehicleNumber } = req.body;
        if (!driverId || !destination || !startDate || !endDate) {
            return res.status(400).json({ message: "driverId, destination, startDate and endDate are required" });
        }
        const startTime = parseTime(req.body.startTime);
        const endTime = parseTime(req.body.endTime);
        if (startTime === null || endTime === null) {
            return res.status(400).json({ message: "startTime and endTime must be in HH:mm (24-hour) format" });
        }
        const driver = yield driver_1.default.findById(driverId);
        if (!driver)
            return res.status(404).json({ message: "Driver not found" });
        const start = (0, helpers_1.buildVisitInstant)(startDate, startTime);
        const end = (0, helpers_1.buildVisitInstant)(endDate, endTime);
        if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
            return res.status(400).json({ message: "startDate and endDate must be valid dates" });
        }
        if ((0, helpers_1.endsBeforeStart)(start, end, startTime, endTime)) {
            return res.status(400).json({ message: "End cannot be before start" });
        }
        // A driver may have no vehicle assigned, so the visit must carry one explicitly.
        const resolvedVehicle = (vehicleNumber || driver.vehicleNumber || "").trim();
        if (!resolvedVehicle) {
            return res.status(400).json({
                message: "vehicleNumber is required — this driver has no vehicle assigned",
            });
        }
        const visit = yield visit_1.default.create({
            driver: driverId,
            vehicleNumber: resolvedVehicle,
            destination,
            startDate: start,
            endDate: end,
            startTime,
            endTime,
            quantity: quantity || 0,
            billNumber: billNumber || "",
            distance: distance || 0,
            createdBy: req.userId,
        });
        // Notify transport admins about new visit
        const adminIds = yield (0, notify_1.getPortalAdminIds)("transport");
        if (adminIds.length > 0) {
            yield (0, notify_1.sendPushNotificationToMany)(adminIds, "New Visit Created", `${driver.name} → ${destination} (${visit.totalDays} day${visit.totalDays > 1 ? "s" : ""})`, { type: "new_visit", visitId: visit._id.toString() });
        }
        // Notify driver user if linked
        if (driver.userId) {
            yield (0, notify_1.sendPushNotification)(driver.userId, "New Visit Assigned", `You have a new visit to ${destination} from ${describeWhen(start, startTime)} to ${describeWhen(end, endTime)}`, { type: "visit_created", visitId: visit._id.toString() });
        }
        const populated = yield visit_1.default.findById(visit._id).populate("driver", "name vehicleNumber");
        return res.status(201).json({ message: "Visit created successfully", visit: populated });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.createVisit = createVisit;
// ─── Get All Visits ───────────────────────────────────────────────────────────
const getAllVisits = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { driverId, search } = req.query;
        const { page, limit, skip } = (0, helpers_1.getPagination)(req.query);
        const filter = Object.assign({}, (0, helpers_1.buildDateFilter)(req.query));
        // A driver only ever sees their own visits — their id overrides any query param.
        if ((0, driverScope_1.isDriverRole)(req)) {
            const scope = yield (0, driverScope_1.resolveDriverScope)(req, driverId);
            if (scope.forbidden) {
                return res.status(403).json({ message: scope.message });
            }
            filter.driver = scope.driverId;
        }
        else if (driverId) {
            filter.driver = driverId;
        }
        if (search) {
            filter.$or = [
                { destination: { $regex: search, $options: "i" } },
                { billNumber: { $regex: search, $options: "i" } },
                { vehicleNumber: { $regex: search, $options: "i" } },
            ];
        }
        const [visits, total] = yield Promise.all([
            visit_1.default.find(filter)
                .populate("driver", "name vehicleNumber")
                .populate("createdBy", "name role")
                .sort({ startDate: -1 })
                .skip(skip)
                .limit(limit),
            visit_1.default.countDocuments(filter),
        ]);
        return res.status(200).json({
            visits,
            pagination: (0, helpers_1.buildPaginationMeta)(page, limit, total),
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getAllVisits = getAllVisits;
// ─── Get Visit By ID ──────────────────────────────────────────────────────────
const getVisitById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const visit = yield visit_1.default.findById(req.params.id)
            .populate("driver", "name vehicleNumber userId")
            .populate("createdBy", "name role")
            .populate("updatedBy", "name role");
        if (!visit)
            return res.status(404).json({ message: "Visit not found" });
        // A driver may only open their own visits.
        if ((0, driverScope_1.isDriverRole)(req)) {
            const visitDriverId = String((_b = (_a = visit.driver) === null || _a === void 0 ? void 0 : _a._id) !== null && _b !== void 0 ? _b : visit.driver);
            const scope = yield (0, driverScope_1.resolveDriverScope)(req, visitDriverId);
            if (scope.forbidden) {
                return res.status(403).json({ message: scope.message });
            }
        }
        const expense = yield expense_1.default.findOne({ visit: visit._id }).populate(expense_1.EXPENSE_ACTOR_POPULATE);
        return res.status(200).json({ visit, expense: expense || null });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getVisitById = getVisitById;
// ─── Update Visit ─────────────────────────────────────────────────────────────
const updateVisit = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { driverId, destination, startDate, endDate, quantity, billNumber, distance, vehicleNumber } = req.body;
        const visit = yield visit_1.default.findById(id);
        if (!visit)
            return res.status(404).json({ message: "Visit not found" });
        if (destination !== undefined && !String(destination).trim()) {
            return res.status(400).json({ message: "destination cannot be empty" });
        }
        if (vehicleNumber !== undefined && !String(vehicleNumber).trim()) {
            return res.status(400).json({ message: "vehicleNumber cannot be empty" });
        }
        // Reassigning the visit to another driver.
        const previousDriverId = String(visit.driver);
        let driverChanged = false;
        if (driverId !== undefined && String(driverId) !== previousDriverId) {
            const nextDriver = yield driver_1.default.findById(driverId);
            if (!nextDriver)
                return res.status(404).json({ message: "Driver not found" });
            visit.driver = nextDriver._id;
            driverChanged = true;
        }
        if (destination !== undefined)
            visit.destination = String(destination).trim();
        if (vehicleNumber !== undefined)
            visit.vehicleNumber = String(vehicleNumber).trim().toUpperCase();
        if (quantity !== undefined)
            visit.quantity = quantity;
        if (billNumber !== undefined)
            visit.billNumber = billNumber;
        if (distance !== undefined)
            visit.distance = distance;
        const { startTime, endTime } = req.body;
        const nextStartTime = startTime !== undefined ? parseTime(startTime) : visit.startTime || "";
        const nextEndTime = endTime !== undefined ? parseTime(endTime) : visit.endTime || "";
        if (nextStartTime === null || nextEndTime === null) {
            return res.status(400).json({ message: "startTime and endTime must be in HH:mm (24-hour) format" });
        }
        // Re-derive each instant when either its date or its time changed.
        if (startDate !== undefined || startTime !== undefined) {
            visit.startDate = (0, helpers_1.buildVisitInstant)(startDate !== null && startDate !== void 0 ? startDate : visit.startDate, nextStartTime);
            visit.startTime = nextStartTime;
        }
        if (endDate !== undefined || endTime !== undefined) {
            visit.endDate = (0, helpers_1.buildVisitInstant)(endDate !== null && endDate !== void 0 ? endDate : visit.endDate, nextEndTime);
            visit.endTime = nextEndTime;
        }
        if (Number.isNaN(visit.startDate.getTime()) || Number.isNaN(visit.endDate.getTime())) {
            return res.status(400).json({ message: "startDate and endDate must be valid dates" });
        }
        if ((0, helpers_1.endsBeforeStart)(visit.startDate, visit.endDate, visit.startTime, visit.endTime)) {
            return res.status(400).json({ message: "End cannot be before start" });
        }
        visit.updatedBy = req.userId;
        yield visit.save();
        // The expense row carries the driver too, so it follows the visit.
        if (driverChanged) {
            yield expense_1.default.updateOne({ visit: visit._id }, { $set: { driver: visit.driver } });
        }
        const driver = yield driver_1.default.findById(visit.driver);
        if (driver === null || driver === void 0 ? void 0 : driver.userId) {
            yield (0, notify_1.sendPushNotification)(driver.userId, driverChanged ? "New Visit Assigned" : "Visit Updated", driverChanged
                ? `You have been assigned a visit to ${visit.destination}`
                : `Your visit to ${visit.destination} has been updated`, { type: driverChanged ? "visit_created" : "visit_updated", visitId: visit._id.toString() });
        }
        // Let the previous driver know the trip is no longer theirs.
        if (driverChanged) {
            const previousDriver = yield driver_1.default.findById(previousDriverId);
            if (previousDriver === null || previousDriver === void 0 ? void 0 : previousDriver.userId) {
                yield (0, notify_1.sendPushNotification)(previousDriver.userId, "Visit Reassigned", `Your visit to ${visit.destination} has been assigned to another driver`, 
                // No visitId — they can no longer open it, so the tap should not deep-link.
                { type: "visit_updated" });
            }
        }
        const populated = yield visit_1.default.findById(visit._id).populate("driver", "name vehicleNumber");
        return res.status(200).json({ message: "Visit updated successfully", visit: populated });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.updateVisit = updateVisit;
// ─── Delete Visit ─────────────────────────────────────────────────────────────
const deleteVisit = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const visit = yield visit_1.default.findById(id);
        if (!visit)
            return res.status(404).json({ message: "Visit not found" });
        yield expense_1.default.deleteOne({ visit: id });
        yield visit.deleteOne();
        return res.status(200).json({ message: "Visit and associated expenses deleted successfully" });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.deleteVisit = deleteVisit;
