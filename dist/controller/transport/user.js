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
exports.deleteTransportUser = exports.updateTransportUser = exports.getTransportUserById = exports.getAllTransportUsers = exports.createTransportUser = void 0;
const user_1 = __importDefault(require("../../model/user"));
const driver_1 = __importDefault(require("../../model/driver"));
const helpers_1 = require("../../utils/helpers");
// ─── Create Transport User (Admin only) ───────────────────────────────────────
const createTransportUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, email, password, role, phone, vehicleNumber } = req.body;
        if (!name || !email || !password || !role) {
            return res
                .status(400)
                .json({ message: "name, email, password and role are required" });
        }
        // vehicleNumber is optional for driver accounts — it can be assigned later.
        const allowed = ["admin", "accounts", "driver"];
        if (!allowed.includes(role)) {
            return res
                .status(400)
                .json({ message: "Role must be admin | accounts | driver" });
        }
        const exists = yield user_1.default.findOne({ email: email.toLowerCase().trim() });
        if (exists) {
            return res.status(409).json({ message: "Email already registered" });
        }
        if (password.length < 6) {
            return res
                .status(400)
                .json({ message: "Password must be at least 6 characters" });
        }
        const user = yield user_1.default.create({
            name,
            email,
            password,
            role,
            phone: phone || "",
            portal: "transport",
        });
        if (role === "driver") {
            yield driver_1.default.create({
                name: user.name,
                vehicleNumber: vehicleNumber ? String(vehicleNumber).trim().toUpperCase() : "",
                userId: user._id,
            });
        }
        return res.status(201).json({
            message: "User created successfully",
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                portal: user.portal,
                phone: user.phone,
            },
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.createTransportUser = createTransportUser;
// ─── Get All Transport Users (Admin only) ─────────────────────────────────────
const getAllTransportUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { role, search } = req.query;
        const filter = { portal: "transport" };
        if (role)
            filter.role = role;
        if (search)
            filter.name = { $regex: search, $options: "i" };
        const { page, limit, skip } = (0, helpers_1.getPagination)(req.query);
        const [users, total] = yield Promise.all([
            user_1.default.find(filter)
                .select("-password -fcmToken")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            user_1.default.countDocuments(filter),
        ]);
        return res.status(200).json({
            users,
            pagination: (0, helpers_1.buildPaginationMeta)(page, limit, total),
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getAllTransportUsers = getAllTransportUsers;
// ─── Get Transport User By ID (Admin only) ────────────────────────────────────
const getTransportUserById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const user = yield user_1.default.findOne({
            _id: req.params.id,
            portal: "transport",
        }).select("-password -fcmToken");
        if (!user)
            return res.status(404).json({ message: "User not found" });
        return res.status(200).json({ user });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getTransportUserById = getTransportUserById;
// ─── Update Transport User (Admin only) ───────────────────────────────────────
const updateTransportUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { name, email, password, role, phone, isActive } = req.body;
        const user = yield user_1.default.findOne({ _id: id, portal: "transport" });
        if (!user)
            return res.status(404).json({ message: "User not found" });
        if (role !== undefined) {
            const allowed = ["admin", "accounts", "driver"];
            if (!allowed.includes(role)) {
                return res
                    .status(400)
                    .json({ message: "Role must be admin | accounts | driver" });
            }
            user.role = role;
        }
        if (email !== undefined) {
            const exists = yield user_1.default.findOne({
                email: email.toLowerCase().trim(),
                _id: { $ne: id },
            });
            if (exists)
                return res.status(409).json({ message: "Email already in use" });
            user.email = email;
        }
        if (name !== undefined)
            user.name = name;
        if (phone !== undefined)
            user.phone = phone;
        if (isActive !== undefined)
            user.isActive = isActive;
        if (password !== undefined) {
            if (password.length < 6)
                return res
                    .status(400)
                    .json({ message: "Password must be at least 6 characters" });
            user.password = password;
        }
        yield user.save();
        return res.status(200).json({
            message: "User updated successfully",
            user: {
                _id: user._id,
                name: user.name,
                email: user.email,
                role: user.role,
                portal: user.portal,
                phone: user.phone,
                isActive: user.isActive,
            },
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.updateTransportUser = updateTransportUser;
// ─── Delete Transport User (Admin only) ───────────────────────────────────────
const deleteTransportUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        if (id === req.userId) {
            return res
                .status(400)
                .json({ message: "You cannot delete your own account" });
        }
        const user = yield user_1.default.findOne({ _id: id, portal: "transport" });
        if (!user)
            return res.status(404).json({ message: "User not found" });
        yield user.deleteOne();
        return res.status(200).json({ message: "User deleted successfully" });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.deleteTransportUser = deleteTransportUser;
