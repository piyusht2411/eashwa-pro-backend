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
exports.deleteContainer = exports.updateContainerStatus = exports.getContainerById = exports.getAllContainers = exports.createContainer = void 0;
const container_1 = __importDefault(require("../model/container"));
const user_1 = __importDefault(require("../model/user"));
const notify_1 = require("../utils/notify");
const getPagination = (query) => {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;
    return { page, limit, skip };
};
// ─── Create Container (Admin only) ────────────────────────────────────────────
const createContainer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { model, quantity, date, ratePerUnit, assignedTeam } = req.body;
        if (!model || !quantity || !date || !ratePerUnit || !assignedTeam) {
            return res.status(400).json({
                message: "model, quantity, date, ratePerUnit and assignedTeam are required",
            });
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
        return res.status(200).json({
            containers,
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
        return res.status(200).json({ container });
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
