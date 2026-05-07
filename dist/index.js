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
app.use("/api/user", user_1.default);
app.use("/api/containers", container_1.default);
app.use("/api/production-logs", productionLog_1.default);
app.use("/api/pdi", pdiVerification_1.default);
app.use("/api/payments", payment_1.default);
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
