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
exports.requirePortal = exports.requireRole = exports.authenticateToken = exports.canUseBothPortals = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const user_1 = __importDefault(require("../model/user"));
/**
 * An admin flagged with `crossPortalAccess` administers both portals from one
 * account, so the portal they are currently working in comes from the token
 * rather than from their user record.
 */
const canUseBothPortals = (user) => user.role === "admin" && user.crossPortalAccess === true;
exports.canUseBothPortals = canUseBothPortals;
const resolveActivePortal = (user, activePortalClaim) => {
    if (!(0, exports.canUseBothPortals)(user))
        return user.portal;
    return activePortalClaim === "production" || activePortalClaim === "transport"
        ? activePortalClaim
        : user.portal;
};
// ─── Authenticate JWT ─────────────────────────────────────────────────────────
const authenticateToken = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b, _c;
    const authHeader = req.header("authorization");
    if (!authHeader) {
        return res.status(401).json({ message: "No token provided" });
    }
    const token = authHeader.replace("Bearer ", "").trim();
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET_KEY || "");
        const user = yield user_1.default.findById(decoded.userId).select("_id role portal crossPortalAccess name isActive");
        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }
        if (!user.isActive) {
            return res.status(403).json({ message: "Account is deactivated. Contact admin." });
        }
        req.userId = decoded.userId;
        req.userRole = user.role;
        // A cross-portal admin carries the portal they switched into on the token;
        // everyone else is pinned to the portal on their account.
        req.userPortal = resolveActivePortal(user, decoded.activePortal);
        next();
    }
    catch (err) {
        // Try refresh token from cookies
        const refreshToken = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a.refreshToken;
        if (!refreshToken) {
            return res.status(401).json({ message: "Token expired, please login again" });
        }
        try {
            const refreshDecoded = jsonwebtoken_1.default.verify(refreshToken, process.env.JWT_REFRESH_SECRET_KEY || "");
            const newAuthToken = jsonwebtoken_1.default.sign({
                userId: refreshDecoded.userId,
                role: refreshDecoded.role,
                portal: refreshDecoded.portal,
                activePortal: (_b = refreshDecoded.activePortal) !== null && _b !== void 0 ? _b : refreshDecoded.portal,
            }, process.env.JWT_SECRET_KEY || "", { expiresIn: "30d" });
            res.header("Authorization", `Bearer ${newAuthToken}`);
            req.userId = refreshDecoded.userId;
            req.userRole = refreshDecoded.role;
            req.userPortal = (_c = refreshDecoded.activePortal) !== null && _c !== void 0 ? _c : refreshDecoded.portal;
            next();
        }
        catch (_d) {
            return res.status(401).json({ message: "Session expired, please login again" });
        }
    }
});
exports.authenticateToken = authenticateToken;
// ─── Role Guard ───────────────────────────────────────────────────────────────
const requireRole = (...roles) => {
    return (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
        const user = yield user_1.default.findById(req.userId).select("role");
        if (!user || !roles.includes(user.role)) {
            return res.status(403).json({
                message: `Access denied. Required role(s): ${roles.join(", ")}`,
            });
        }
        req.userRole = user.role;
        next();
    });
};
exports.requireRole = requireRole;
// ─── Portal Guard ────────────────────────────────────────────────────────────
const requirePortal = (...portals) => {
    return (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
        const user = yield user_1.default.findById(req.userId).select("portal role crossPortalAccess");
        if (!user) {
            return res.status(403).json({
                message: `Access denied. Required portal(s): ${portals.join(", ")}`,
            });
        }
        if (portals.includes(user.portal)) {
            req.userPortal = user.portal;
            return next();
        }
        // A cross-portal admin may work outside their own portal.
        if ((0, exports.canUseBothPortals)(user)) {
            req.userPortal = portals[0];
            return next();
        }
        return res.status(403).json({
            message: `Access denied. Required portal(s): ${portals.join(", ")}`,
        });
    });
};
exports.requirePortal = requirePortal;
