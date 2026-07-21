import express, { Request, Response, Application, NextFunction } from "express";
import dotenv from "dotenv";
import cors from "cors";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import morgan from "morgan";
import * as admin from "firebase-admin";
import db = require("./config/db");

// ─── Routes ───────────────────────────────────────────────────────────────────
import userRoutes from "./routes/user";
import containerRoutes from "./routes/container";
import productionLogRoutes from "./routes/productionLog";
import pdiVerificationRoutes from "./routes/pdiVerification";
import paymentRoutes from "./routes/payment";
import miscellaneousRoutes from "./routes/miscellaneous";
import adminDashboardRouter from "./routes/adminDashboard";
import notificationRouter from "./routes/notification";
import bootstrapRouter from "./routes/bootstrap";

// ─── Transport Routes ─────────────────────────────────────────────────────────
import transportUserRoutes from "./routes/transport/users";
import transportDriverRoutes from "./routes/transport/drivers";
import transportVisitRoutes from "./routes/transport/visits";
import transportExpenseRoutes from "./routes/transport/expenses";
import transportDashboardRoutes from "./routes/transport/dashboard";
import transportReportRoutes from "./routes/transport/reports";

import { authenticateToken, requirePortal } from "./middleware/authMiddleware";

dotenv.config();

// ─── Global Type Extension ────────────────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: string;
      userPortal?: "production" | "transport";
    }
  }
}

const app: Application = express();
const port = process.env.PORT || 5000;

// ─── Firebase Admin Init ──────────────────────────────────────────────────────
if (!admin.apps.length) {
  try {
    admin.initializeApp({
      credential: admin.credential.cert({
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
      }),
    });
    console.log("✅ Firebase Admin SDK initialized");
  } catch (err) {
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
app.use(cors(corsOptions));
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());
app.use(morgan("dev"));
app.use(cookieParser());

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use("/api/setup", bootstrapRouter);
app.use("/api/user", userRoutes);
app.use("/api/auth", userRoutes); // alias for transport auth endpoints (/api/auth/login, /api/auth/me, etc.)
// Production resources must not be accessible to a Transport account that
// happens to share the same role name (for example, "admin").
const productionAccess = [authenticateToken, requirePortal("production")];
app.use("/api/containers", ...productionAccess, containerRoutes);
app.use("/api/production-logs", ...productionAccess, productionLogRoutes);
app.use("/api/pdi", ...productionAccess, pdiVerificationRoutes);
app.use("/api/payments", ...productionAccess, paymentRoutes);
app.use("/api/miscellaneous", ...productionAccess, miscellaneousRoutes);
app.use("/api/admin", ...productionAccess, adminDashboardRouter);
// Notifications are isolated by recipient ID in the controller and are shared
// by both portals.
app.use("/api/notifications", notificationRouter);

// ─── Transport API Routes ─────────────────────────────────────────────────────
const transportAccess = [authenticateToken, requirePortal("transport")];
app.use("/api/transport/users", ...transportAccess, transportUserRoutes);
app.use("/api/transport/drivers", ...transportAccess, transportDriverRoutes);
app.use("/api/transport/visits", ...transportAccess, transportVisitRoutes);
app.use("/api/transport/expenses", ...transportAccess, transportExpenseRoutes);
app.use("/api/transport/dashboard", ...transportAccess, transportDashboardRoutes);
app.use("/api/transport/reports", ...transportAccess, transportReportRoutes);

// Compatibility direct mounts for Transport frontend
app.use("/api/users", ...transportAccess, transportUserRoutes);
app.use("/api/drivers", ...transportAccess, transportDriverRoutes);
app.use("/api/visits", ...transportAccess, transportVisitRoutes);
app.use("/api/expenses", ...transportAccess, transportExpenseRoutes);
app.use("/api/dashboard", ...transportAccess, transportDashboardRoutes);
app.use("/api/reports", ...transportAccess, transportReportRoutes);


// ─── Health Check ─────────────────────────────────────────────────────────────
app.get("/", (req: Request, res: Response) => {
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
app.use((err: Error, req: Request, res: Response, next: NextFunction) => {
  console.error("[Error]", err.message);
  res.status(500).json({ message: err.message });
});

// ─── Start Server ─────────────────────────────────────────────────────────────
const start = async () => {
  try {
    await db.connectDB(process.env.MONGO_URL!);
    app.listen(port, () =>
      console.log(`🚀 Server running on port ${port}`)
    );
  } catch (error) {
    console.error("Failed to start server:", error);
    process.exit(1);
  }
};

start();
