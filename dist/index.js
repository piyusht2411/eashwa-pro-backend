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
var _a;
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const body_parser_1 = __importDefault(require("body-parser"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const morgan_1 = __importDefault(require("morgan"));
const admin = __importStar(require("firebase-admin"));
const db = require("./config/db");
// ─── Routes ───────────────────────────────────────────────────────────────────
const user_1 = __importDefault(require("./routes/user"));
const container_1 = __importDefault(require("./routes/container"));
const productionLog_1 = __importDefault(require("./routes/productionLog"));
const pdiVerification_1 = __importDefault(require("./routes/pdiVerification"));
const payment_1 = __importDefault(require("./routes/payment"));
const miscellaneous_1 = __importDefault(require("./routes/miscellaneous"));
const adminDashboard_1 = __importDefault(require("./routes/adminDashboard"));
const notification_1 = __importDefault(require("./routes/notification"));
const bootstrap_1 = __importDefault(require("./routes/bootstrap"));
// ─── Transport Routes ─────────────────────────────────────────────────────────
const users_1 = __importDefault(require("./routes/transport/users"));
const drivers_1 = __importDefault(require("./routes/transport/drivers"));
const visits_1 = __importDefault(require("./routes/transport/visits"));
const expenses_1 = __importDefault(require("./routes/transport/expenses"));
const dashboard_1 = __importDefault(require("./routes/transport/dashboard"));
const reports_1 = __importDefault(require("./routes/transport/reports"));
const authMiddleware_1 = require("./middleware/authMiddleware");
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 5000;
// ─── Firebase Admin Init ──────────────────────────────────────────────────────
if (!admin.apps.length) {
    try {
        admin.initializeApp({
            credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: (_a = process.env.FIREBASE_PRIVATE_KEY) === null || _a === void 0 ? void 0 : _a.replace(/\\n/g, "\n"),
            }),
        });
        console.log("✅ Firebase Admin SDK initialized");
    }
    catch (err) {
        console.error("❌ Firebase Admin SDK init failed:", err);
    }
}
// ─── CORS ─────────────────────────────────────────────────────────────────────
const corsOptions = {
    origin: [
        "http://localhost:3000",
        "http://localhost:5173",
        "https://eashwa-frontend-iptp.vercel.app",
        "https://eashwastock.in",
        "https://www.eashwastock.in",
        "https://dummy-phi-eight.vercel.app",
        "https://eashwa-transport.vercel.app",
        "https://www.eashwa-transport.vercel.app",
        "http://localhost:8081"
    ],
    credentials: true,
};
// ─── Middleware ───────────────────────────────────────────────────────────────
app.use((0, cors_1.default)(corsOptions));
app.use(body_parser_1.default.urlencoded({ extended: false }));
app.use(body_parser_1.default.json());
app.use((0, morgan_1.default)("dev"));
app.use((0, cookie_parser_1.default)());
// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/setup", bootstrap_1.default);
app.use("/api/user", user_1.default);
app.use("/api/auth", user_1.default); // alias for transport auth endpoints (/api/auth/login, /api/auth/me, etc.)
// Production resources must not be accessible to a Transport account that
// happens to share the same role name (for example, "admin").
const productionAccess = [authMiddleware_1.authenticateToken, (0, authMiddleware_1.requirePortal)("production")];
app.use("/api/containers", ...productionAccess, container_1.default);
app.use("/api/production-logs", ...productionAccess, productionLog_1.default);
app.use("/api/pdi", ...productionAccess, pdiVerification_1.default);
app.use("/api/payments", ...productionAccess, payment_1.default);
app.use("/api/miscellaneous", ...productionAccess, miscellaneous_1.default);
app.use("/api/admin", ...productionAccess, adminDashboard_1.default);
// Notifications are isolated by recipient ID in the controller and are shared
// by both portals.
app.use("/api/notifications", notification_1.default);
// ─── Transport API Routes ─────────────────────────────────────────────────────
const transportAccess = [authMiddleware_1.authenticateToken, (0, authMiddleware_1.requirePortal)("transport")];
app.use("/api/transport/users", ...transportAccess, users_1.default);
app.use("/api/transport/drivers", ...transportAccess, drivers_1.default);
app.use("/api/transport/visits", ...transportAccess, visits_1.default);
app.use("/api/transport/expenses", ...transportAccess, expenses_1.default);
app.use("/api/transport/dashboard", ...transportAccess, dashboard_1.default);
app.use("/api/transport/reports", ...transportAccess, reports_1.default);
// Compatibility direct mounts for Transport frontend
app.use("/api/users", ...transportAccess, users_1.default);
app.use("/api/drivers", ...transportAccess, drivers_1.default);
app.use("/api/visits", ...transportAccess, visits_1.default);
app.use("/api/expenses", ...transportAccess, expenses_1.default);
app.use("/api/dashboard", ...transportAccess, dashboard_1.default);
app.use("/api/reports", ...transportAccess, reports_1.default);
// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/", (req, res) => {
    res.json({
        message: "🏭 Eashwa Production Management API",
        version: "2.0.0",
        status: "running",
        routes: {
            user: "/api/user",
            containers: "/api/containers",
            productionLogs: "/api/production-logs",
            pdiVerification: "/api/pdi",
            payments: "/api/payments",
            miscellaneous: "/api/miscellaneous",
        },
    });
});
// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use((err, req, res, next) => {
    console.error("[Error]", err.message);
    res.status(500).json({ message: err.message });
});
// ─── Start Server ─────────────────────────────────────────────────────────────
const start = () => __awaiter(void 0, void 0, void 0, function* () {
    try {
        yield db.connectDB(process.env.MONGO_URL);
        app.listen(port, () => console.log(`🚀 Server running on port ${port}`));
    }
    catch (error) {
        console.error("Failed to start server:", error);
        process.exit(1);
    }
});
start();
