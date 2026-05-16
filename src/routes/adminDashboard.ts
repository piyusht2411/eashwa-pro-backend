import { Router } from "express";
import {
  getAdminDashboardSummary,
  getAdminReport,
  getMonitorData,
} from "../controller/adminDashboard";
import { authenticateToken, requireRole } from "../middleware/authMiddleware";

const router = Router();

router.use(authenticateToken);

router.get("/dashboard-summary", requireRole("admin"), getAdminDashboardSummary);
router.get("/report", requireRole("admin"), getAdminReport);
router.get("/monitor", requireRole("admin"), getMonitorData);

export default router;
