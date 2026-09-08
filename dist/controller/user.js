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
exports.logout = exports.changePassword = exports.deleteUser = exports.updateUser = exports.getUserById = exports.getAllUsers = exports.updateFcmToken = exports.getMe = exports.switchPortal = exports.login = exports.register = void 0;
const mongoose_1 = require("mongoose");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const user_1 = __importDefault(require("../model/user"));
const authMiddleware_1 = require("../middleware/authMiddleware");
const container_1 = __importDefault(require("../model/container"));
const productionLog_1 = __importDefault(require("../model/productionLog"));
const pdiVerification_1 = __importDefault(require("../model/pdiVerification"));
const payment_1 = __importDefault(require("../model/payment"));
const getPagination = (query) => {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;
    return { page, limit, skip };
};
// ─── Register / Create User ───────────────────────────────────────────────────
const register = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, email, password, role, phone, portal } = req.body;
        if (!name || !email || !password || !role) {
            return res.status(400).json({ message: "name, email, password and role are required" });
        }
        const resolvedPortal = portal || "production";
        const productionRoles = ["admin", "team", "pdi"];
        const transportRoles = ["admin", "accounts", "driver"];
        const allowed = resolvedPortal === "transport" ? transportRoles : productionRoles;
        if (!allowed.includes(role)) {
            return res.status(400).json({
                message: resolvedPortal === "transport"
                    ? "Role must be admin | accounts | driver"
                    : "Role must be admin | team | pdi",
            });
        }
        if (resolvedPortal === "production" && role === "pdi") {
            const existingPdi = yield user_1.default.findOne({ role: "pdi", portal: "production" });
            if (existingPdi) {
                return res.status(409).json({ message: "PDI team already exists" });
            }
        }
        const exists = yield user_1.default.findOne({ email });
        if (exists) {
            return res.status(409).json({ message: "Email already registered" });
        }
        const user = yield user_1.default.create({ name, email, password, role, phone, portal: resolvedPortal });
        return res.status(201).json({
            message: "User created successfully",
            user: { _id: user._id, name: user.name, email: user.email, role: user.role, portal: user.portal },
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.register = register;
// ─── Auth Token Helpers ──────────────────────────────────────────────────────
// `portal` is the portal the account belongs to; `activePortal` is the portal
// the session is currently working in. They only differ for a cross-portal
// admin who has switched.
const signTokens = (user, activePortal) => ({
    authToken: jsonwebtoken_1.default.sign({ userId: user._id, role: user.role, portal: user.portal, activePortal }, process.env.JWT_SECRET_KEY || "", { expiresIn: "30d" }),
    refreshToken: jsonwebtoken_1.default.sign({ userId: user._id, role: user.role, portal: user.portal, activePortal }, process.env.JWT_REFRESH_SECRET_KEY || "", { expiresIn: "60d" }),
});
const setRefreshCookie = (res, refreshToken) => {
    res.cookie("refreshToken", refreshToken, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "strict",
    });
};
const authUserPayload = (user, activePortal) => ({
    _id: user._id,
    name: user.name,
    email: user.email,
    role: user.role,
    // The portal the app should route into right now.
    portal: activePortal,
    // The portal the account itself lives in — unchanged by switching.
    homePortal: user.portal,
    crossPortalAccess: (0, authMiddleware_1.canUseBothPortals)(user),
    availablePortals: (0, authMiddleware_1.canUseBothPortals)(user)
        ? ["production", "transport"]
        : [user.portal],
    phone: user.phone,
});
// ─── Login ───────────────────────────────────────────────────────────────────
const login = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, password } = req.body;
        if (!email || !password) {
            return res.status(400).json({ message: "email and password are required" });
        }
        const user = yield user_1.default.findOne({ email: email.toLowerCase().trim() });
        if (!user) {
            return res.status(401).json({ message: "Invalid credentials" });
        }
        if (!user.isActive) {
            return res.status(403).json({ message: "Account is deactivated. Contact admin." });
        }
        const match = yield bcrypt_1.default.compare(password, user.password);
        if (!match) {
            return res.status(401).json({ message: "Invalid credentials" });
        }
        // A cross-portal admin starts in their own portal and can switch after.
        const { authToken, refreshToken } = signTokens(user, user.portal);
        setRefreshCookie(res, refreshToken);
        return res.status(200).json({
            message: "Login successful",
            token: authToken,
            user: authUserPayload(user, user.portal),
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.login = login;
// ─── Switch Portal (cross-portal admin) ──────────────────────────────────────
// Re-issues the session tokens against the requested portal so the admin can
// work in Production and Transport from a single account.
const switchPortal = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { portal } = req.body;
        if (portal !== "production" && portal !== "transport") {
            return res.status(400).json({ message: "portal must be production or transport" });
        }
        const user = yield user_1.default.findById(req.userId);
        if (!user)
            return res.status(404).json({ message: "User not found" });
        if (!user.isActive) {
            return res.status(403).json({ message: "Account is deactivated. Contact admin." });
        }
        if (!(0, authMiddleware_1.canUseBothPortals)(user)) {
            return res.status(403).json({
                message: "This account is not enabled to switch portals",
            });
        }
        const { authToken, refreshToken } = signTokens(user, portal);
        setRefreshCookie(res, refreshToken);
        return res.status(200).json({
            message: `Switched to ${portal} portal`,
            token: authToken,
            user: authUserPayload(user, portal),
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.switchPortal = switchPortal;
// ─── Get Me ───────────────────────────────────────────────────────────────────
const getMe = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    try {
        const user = yield user_1.default.findById(req.userId).select("-password -passwordResetToken -fcmToken");
        if (!user)
            return res.status(404).json({ message: "User not found" });
        // Report the portal this session is working in, not just the account's own,
        // so a cross-portal admin who switched stays where they were.
        const activePortal = (_a = req.userPortal) !== null && _a !== void 0 ? _a : user.portal;
        return res.status(200).json({
            user: Object.assign(Object.assign({}, user.toObject()), authUserPayload(user, activePortal)),
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getMe = getMe;
// ─── Update FCM Token ─────────────────────────────────────────────────────────
const updateFcmToken = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { fcmToken } = req.body;
        if (!fcmToken)
            return res.status(400).json({ message: "fcmToken is required" });
        yield user_1.default.findByIdAndUpdate(req.userId, { fcmToken });
        return res.status(200).json({ message: "FCM token updated" });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.updateFcmToken = updateFcmToken;
// ─── Get All Users (Admin) ────────────────────────────────────────────────────
const getAllUsers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { role } = req.query;
        const filter = {};
        if (role)
            filter.role = role;
        const { page, limit, skip } = getPagination(req.query);
        const [users, total] = yield Promise.all([
            user_1.default.find(filter)
                .select("-password -passwordResetToken -fcmToken")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            user_1.default.countDocuments(filter),
        ]);
        return res.status(200).json({
            users,
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
exports.getAllUsers = getAllUsers;
// ─── Get User By ID (Admin) ─────────────────────────────────────────────────
const getUserById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const user = yield user_1.default.findById(id).select("-password -passwordResetToken -fcmToken");
        if (!user)
            return res.status(404).json({ message: "User not found" });
        return res.status(200).json({ user });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getUserById = getUserById;
// ─── Update User / Team (Admin) ──────────────────────────────────────────────
const updateUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { name, email, password, role, phone, isActive, crossPortalAccess } = req.body;
        const user = yield user_1.default.findById(id);
        if (!user)
            return res.status(404).json({ message: "User not found" });
        if (role !== undefined) {
            const productionRoles = ["admin", "team", "pdi"];
            const transportRoles = ["admin", "accounts", "driver"];
            const allowed = user.portal === "transport" ? transportRoles : productionRoles;
            if (!allowed.includes(role)) {
                return res.status(400).json({
                    message: user.portal === "transport"
                        ? "Role must be admin | accounts | driver"
                        : "Role must be admin | team | pdi",
                });
            }
            if (user.portal === "production" && role === "pdi") {
                const existingPdi = yield user_1.default.findOne({ role: "pdi", portal: "production", _id: { $ne: id } });
                if (existingPdi) {
                    return res.status(409).json({ message: "PDI team already exists" });
                }
            }
            user.role = role;
        }
        if (email !== undefined) {
            const exists = yield user_1.default.findOne({ email, _id: { $ne: id } });
            if (exists) {
                return res.status(409).json({ message: "Email already registered" });
            }
            user.email = email;
        }
        if (name !== undefined)
            user.name = name;
        if (phone !== undefined)
            user.phone = phone;
        if (password !== undefined)
            user.password = password;
        if (isActive !== undefined)
            user.isActive = isActive;
        if (crossPortalAccess !== undefined) {
            if (user.role !== "admin" && crossPortalAccess) {
                return res.status(400).json({
                    message: "Only an admin account can be given cross-portal access",
                });
            }
            user.crossPortalAccess = Boolean(crossPortalAccess);
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
                crossPortalAccess: user.crossPortalAccess,
                phone: user.phone,
                isActive: user.isActive,
            },
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.updateUser = updateUser;
// ─── Delete User / Team (Admin) ──────────────────────────────────────────────
const deleteUser = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        if (id === req.userId) {
            return res.status(400).json({ message: "You cannot delete your own account" });
        }
        const user = yield user_1.default.findById(id);
        if (!user)
            return res.status(404).json({ message: "User not found" });
        const linkedContainer = yield container_1.default.findOne({
            $or: [{ assignedTeam: id }, { createdBy: id }],
        }).select("_id");
        if (linkedContainer) {
            return res.status(400).json({
                message: "Cannot delete user because they are linked to containers",
            });
        }
        const linkedProductionLog = yield productionLog_1.default.findOne({ team: id }).select("_id");
        if (linkedProductionLog) {
            return res.status(400).json({
                message: "Cannot delete user because they are linked to production logs",
            });
        }
        const linkedVerification = yield pdiVerification_1.default.findOne({ verifiedBy: id }).select("_id");
        if (linkedVerification) {
            return res.status(400).json({
                message: "Cannot delete user because they are linked to PDI verifications",
            });
        }
        const linkedPayment = yield payment_1.default.findOne({
            $or: [{ team: id }, { createdBy: id }],
        }).select("_id");
        if (linkedPayment) {
            return res.status(400).json({
                message: "Cannot delete user because they are linked to payments",
            });
        }
        yield user.deleteOne();
        return res.status(200).json({ message: "User deleted successfully" });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.deleteUser = deleteUser;
// ─── Change Password (by Email) ───────────────────────────────────────────────
// Identifies the account by either email or user id, so a caller that only
// holds one of them does not have to look up the other first — the app knows
// its user id, a web form knows the email. Knowing the current password is
// still what authorises the change; this route is deliberately unauthenticated.
const changePassword = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { email, userId, id, currentPassword, newPassword } = req.body;
        const requestedId = userId !== null && userId !== void 0 ? userId : id;
        if (!currentPassword || !newPassword) {
            return res
                .status(400)
                .json({ message: "currentPassword and newPassword are required" });
        }
        if (!email && !requestedId) {
            return res
                .status(400)
                .json({ message: "email or userId is required" });
        }
        if (newPassword.length < 6) {
            return res
                .status(400)
                .json({ message: "newPassword must be at least 6 characters" });
        }
        if (currentPassword === newPassword) {
            return res
                .status(400)
                .json({ message: "New password must be different from current password" });
        }
        // An id lookup is preferred when both arrive — it is the unambiguous key.
        let user = null;
        if (requestedId) {
            if (!(0, mongoose_1.isValidObjectId)(requestedId)) {
                return res.status(400).json({ message: "userId is not a valid id" });
            }
            user = yield user_1.default.findById(requestedId);
        }
        else {
            user = yield user_1.default.findOne({ email: String(email).toLowerCase().trim() });
        }
        if (!user)
            return res.status(404).json({ message: "User not found" });
        const isMatch = yield bcrypt_1.default.compare(currentPassword, user.password);
        if (!isMatch) {
            return res.status(401).json({ message: "Current password is incorrect" });
        }
        user.password = newPassword; // hashed automatically by pre-save hook
        yield user.save();
        return res.status(200).json({ message: "Password changed successfully" });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.changePassword = changePassword;
// ─── Logout ───────────────────────────────────────────────────────────────────
const logout = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    res.clearCookie("refreshToken");
    return res.status(200).json({ message: "Logged out successfully" });
});
exports.logout = logout;
