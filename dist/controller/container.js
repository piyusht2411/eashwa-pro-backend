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
exports.deleteContainer = exports.updateContainer = exports.updateContainerStatus = exports.getContainerById = exports.getAllContainers = exports.createContainer = void 0;
const container_1 = __importDefault(require("../model/container"));
const user_1 = __importDefault(require("../model/user"));
const notify_1 = require("../utils/notify");
const penalty_1 = require("../utils/penalty");
const getPagination = (query) => {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;
    return { page, limit, skip };
};
// ─── Create Container (Admin only) ────────────────────────────────────────────
const createContainer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { model, quantity, date, ratePerUnit, penaltyPerUnit, assignedTeam } = req.body;
        if (!model || !quantity || !date || !ratePerUnit || !assignedTeam) {
            return res.status(400).json({
                message: "model, quantity, date, ratePerUnit and assignedTeam are required",
            });
        }
        if (penaltyPerUnit !== undefined && (Number(penaltyPerUnit) < 0 || Number.isNaN(Number(penaltyPerUnit)))) {
            return res.status(400).json({ message: "penaltyPerUnit must be a non-negative number" });
        }
        // Ensure assigned user is a team member
        const teamUser = yield user_1.default.findById(assignedTeam);
        if (!teamUser || teamUser.role !== "team") {
            return res.status(400).json({ message: "assignedTeam must be a valid team member" });
        }
        const container = yield container_1.default.create({
            model,
            quantity,
            date: new Date(date),
            ratePerUnit,
            penaltyPerUnit: penaltyPerUnit !== null && penaltyPerUnit !== void 0 ? penaltyPerUnit : 0,
            assignedTeam,
            createdBy: req.userId,
        });
        // Notify team about new assignment
        yield (0, notify_1.sendPushNotification)(assignedTeam, "New Work Assigned", `You have been assigned a new job: ${model} (Qty: ${quantity})`, { containerId: container._id.toString(), type: "new_container" });
        return res.status(201).json({ message: "Container created successfully", container });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.createContainer = createContainer;
// ─── Get All Containers ───────────────────────────────────────────────────────
const getAllContainers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userRole = req.userRole;
        const userId = req.userId;
        let filter = {};
        // Team sees only their own containers
        if (userRole === "team") {
            filter.assignedTeam = userId;
        }
        const { page, limit, skip } = getPagination(req.query);
        const [containers, total] = yield Promise.all([
            container_1.default.find(filter)
                .populate("assignedTeam", "name email phone")
                .populate("createdBy", "name email")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            container_1.default.countDocuments(filter),
        ]);
        // Attach live penalty figures (pending vehicles × penaltyPerUnit)
        const verifiedMap = yield (0, penalty_1.getVerifiedByContainer)(containers.map((c) => c._id));
        const containersWithPenalty = containers.map((c) => {
            var _a, _b;
            const penalty = (0, penalty_1.computePenalty)(c.quantity, (_a = verifiedMap.get(String(c._id))) !== null && _a !== void 0 ? _a : 0, (_b = c.penaltyPerUnit) !== null && _b !== void 0 ? _b : 0);
            return Object.assign(Object.assign({}, c.toObject()), penalty);
        });
        return res.status(200).json({
            containers: containersWithPenalty,
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
exports.getAllContainers = getAllContainers;
// ─── Get Single Container ─────────────────────────────────────────────────────
const getContainerById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const userRole = req.userRole;
        const userId = req.userId;
        const container = yield container_1.default.findById(id)
            .populate("assignedTeam", "name email phone")
            .populate("createdBy", "name email");
        if (!container)
            return res.status(404).json({ message: "Container not found" });
        // Team can only see their own containers
        if (userRole === "team" && container.assignedTeam._id.toString() !== userId) {
            return res.status(403).json({ message: "Access denied" });
        }
        const verifiedMap = yield (0, penalty_1.getVerifiedByContainer)([container._id]);
        const penalty = (0, penalty_1.computePenalty)(container.quantity, (_a = verifiedMap.get(String(container._id))) !== null && _a !== void 0 ? _a : 0, (_b = container.penaltyPerUnit) !== null && _b !== void 0 ? _b : 0);
        return res.status(200).json({ container: Object.assign(Object.assign({}, container.toObject()), penalty) });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getContainerById = getContainerById;
// ─── Update Container Status (Admin only) ────────────────────────────────────
const updateContainerStatus = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { status } = req.body;
        if (!["active", "completed", "cancelled"].includes(status)) {
            return res.status(400).json({ message: "Invalid status" });
        }
        const container = yield container_1.default.findByIdAndUpdate(id, { status }, { new: true });
        if (!container)
            return res.status(404).json({ message: "Container not found" });
        return res.status(200).json({ message: "Container status updated", container });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.updateContainerStatus = updateContainerStatus;
// ─── Update Container (Admin only) ───────────────────────────────────────────
// Allows editing the penalty per vehicle and other core fields.
const updateContainer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    try {
        const { id } = req.params;
        const { model, quantity, date, ratePerUnit, penaltyPerUnit, status } = req.body;
        const update = {};
        if (model !== undefined)
            update.model = model;
        if (quantity !== undefined) {
            if (Number(quantity) < 1)
                return res.status(400).json({ message: "quantity must be at least 1" });
            update.quantity = Number(quantity);
        }
        if (date !== undefined)
            update.date = new Date(date);
        if (ratePerUnit !== undefined) {
            if (Number(ratePerUnit) < 0)
                return res.status(400).json({ message: "ratePerUnit must be non-negative" });
            update.ratePerUnit = Number(ratePerUnit);
        }
        if (penaltyPerUnit !== undefined) {
            if (Number(penaltyPerUnit) < 0 || Number.isNaN(Number(penaltyPerUnit))) {
                return res.status(400).json({ message: "penaltyPerUnit must be a non-negative number" });
            }
            update.penaltyPerUnit = Number(penaltyPerUnit);
        }
        if (status !== undefined) {
            if (!["active", "completed", "cancelled"].includes(status)) {
                return res.status(400).json({ message: "Invalid status" });
            }
            update.status = status;
        }
        if (Object.keys(update).length === 0) {
            return res.status(400).json({ message: "No valid fields to update" });
        }
        const container = yield container_1.default.findByIdAndUpdate(id, update, { new: true })
            .populate("assignedTeam", "name email phone")
            .populate("createdBy", "name email");
        if (!container)
            return res.status(404).json({ message: "Container not found" });
        const verifiedMap = yield (0, penalty_1.getVerifiedByContainer)([container._id]);
        const penalty = (0, penalty_1.computePenalty)(container.quantity, (_a = verifiedMap.get(String(container._id))) !== null && _a !== void 0 ? _a : 0, (_b = container.penaltyPerUnit) !== null && _b !== void 0 ? _b : 0);
        return res.status(200).json({
            message: "Container updated",
            container: Object.assign(Object.assign({}, container.toObject()), penalty),
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.updateContainer = updateContainer;
// ─── Delete Container (Admin only) ───────────────────────────────────────────
const deleteContainer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const container = yield container_1.default.findByIdAndDelete(id);
        if (!container)
            return res.status(404).json({ message: "Container not found" });
        return res.status(200).json({ message: "Container deleted" });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.deleteContainer = deleteContainer;
