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

dotenv.config();

// ─── Global Type Extension ────────────────────────────────────────────────────
declare global {
  namespace Express {
    interface Request {
      userId?: string;
      userRole?: string;
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
app.use("/api/user", userRoutes);
app.use("/api/containers", containerRoutes);
app.use("/api/production-logs", productionLogRoutes);
app.use("/api/pdi", pdiVerificationRoutes);
app.use("/api/payments", paymentRoutes);

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
