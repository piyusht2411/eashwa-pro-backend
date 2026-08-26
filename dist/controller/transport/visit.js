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
exports.deleteVisit = exports.updateVisit = exports.getVisitById = exports.getAllVisits = exports.createVisit = void 0;
const visit_1 = __importDefault(require("../../model/visit"));
const expense_1 = __importDefault(require("../../model/expense"));
const driver_1 = __importDefault(require("../../model/driver"));
const user_1 = __importDefault(require("../../model/user"));
const notify_1 = require("../../utils/notify");
const helpers_1 = require("../../utils/helpers");
const driverScope_1 = require("../../utils/driverScope");
// ─── Create Visit ─────────────────────────────────────────────────────────────
const createVisit = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { driverId, destination, startDate, endDate, quantity, billNumber, distance, vehicleNumber } = req.body;
        if (!driverId || !destination || !startDate || !endDate) {
            return res.status(400).json({ message: "driverId, destination, startDate and endDate are required" });
        }
        const driver = yield driver_1.default.findById(driverId);
        if (!driver)
            return res.status(404).json({ message: "Driver not found" });
        if (new Date(endDate) < new Date(startDate)) {
            return res.status(400).json({ message: "endDate cannot be before startDate" });
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
            startDate: new Date(startDate),
            endDate: new Date(endDate),
            quantity: quantity || 0,
            billNumber: billNumber || "",
            distance: distance || 0,
            createdBy: req.userId,
        });
        // Notify transport admins about new visit
        const admins = yield user_1.default.find({ role: "admin", portal: "transport", isActive: true }).select("_id");
        if (admins.length > 0) {
            yield (0, notify_1.sendPushNotificationToMany)(admins.map((a) => a._id), "New Visit Created", `${driver.name} → ${destination} (${visit.totalDays} day${visit.totalDays > 1 ? "s" : ""})`, { type: "new_visit", visitId: visit._id.toString() });
        }
        // Notify driver user if linked
        if (driver.userId) {
            yield (0, notify_1.sendPushNotification)(driver.userId, "New Visit Assigned", `You have a new visit to ${destination} from ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`, { type: "visit_created", visitId: visit._id.toString() });
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
        const expense = yield expense_1.default.findOne({ visit: visit._id })
            .populate("food.approvedBy", "name")
            .populate("food.rejectedBy", "name")
            .populate("cng.approvedBy", "name")
            .populate("cng.rejectedBy", "name")
            .populate("other.approvedBy", "name")
            .populate("other.rejectedBy", "name");
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
        const { destination, startDate, endDate, quantity, billNumber, distance, vehicleNumber } = req.body;
        const visit = yield visit_1.default.findById(id).populate("driver");
        if (!visit)
            return res.status(404).json({ message: "Visit not found" });
        if (destination !== undefined)
            visit.destination = destination;
        if (vehicleNumber !== undefined)
            visit.vehicleNumber = vehicleNumber.toUpperCase();
        if (quantity !== undefined)
            visit.quantity = quantity;
        if (billNumber !== undefined)
            visit.billNumber = billNumber;
        if (distance !== undefined)
            visit.distance = distance;
        if (startDate !== undefined)
            visit.startDate = new Date(startDate);
        if (endDate !== undefined)
            visit.endDate = new Date(endDate);
        if (visit.endDate < visit.startDate) {
            return res.status(400).json({ message: "endDate cannot be before startDate" });
        }
        visit.updatedBy = req.userId;
        yield visit.save();
        const driver = yield driver_1.default.findById(visit.driver);
        if (driver === null || driver === void 0 ? void 0 : driver.userId) {
            yield (0, notify_1.sendPushNotification)(driver.userId, "Visit Updated", `Your visit to ${visit.destination} has been updated`, { type: "visit_updated", visitId: visit._id.toString() });
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
