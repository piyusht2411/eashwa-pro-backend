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
exports.requireRole = exports.authenticateToken = void 0;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const user_1 = __importDefault(require("../model/user"));
// ─── Authenticate JWT ─────────────────────────────────────────────────────────
const authenticateToken = (req, res, next) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const authHeader = req.header("authorization");
    if (!authHeader) {
        return res.status(401).json({ message: "No token provided" });
    }
    const token = authHeader.replace("Bearer ", "").trim();
    try {
        const decoded = jsonwebtoken_1.default.verify(token, process.env.JWT_SECRET_KEY || "");
        const user = yield user_1.default.findById(decoded.userId).select("_id role name");
        if (!user) {
            return res.status(401).json({ message: "User not found" });
        }
        req.userId = decoded.userId;
        req.userRole = user.role;
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
            const newAuthToken = jsonwebtoken_1.default.sign({ userId: refreshDecoded.userId }, process.env.JWT_SECRET_KEY || "", { expiresIn: "30d" });
            res.header("Authorization", `Bearer ${newAuthToken}`);
            req.userId = refreshDecoded.userId;
            req.userRole = refreshDecoded.role;
            next();
        }
        catch (_b) {
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
