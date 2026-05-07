import { Router } from "express";
import {
  submitProductionLog,
  getLogsByContainer,
  getLogById,
  getPendingLogs,
  getTeamDashboard,
} from "../controller/productionLog";
import { authenticateToken, requireRole } from "../middleware/authMiddleware";

const router = Router();

router.use(authenticateToken);

// Team: submit or update daily production log
router.post("/", requireRole("team"), submitProductionLog);

// Team: dashboard with all stats
router.get("/dashboard", requireRole("team"), getTeamDashboard);

// PDI: get all pending logs to verify
router.get("/pending", requireRole("pdi"), getPendingLogs);

// Admin & PDI & Team: get logs for a container
router.get("/container/:containerId", requireRole("admin", "pdi", "team"), getLogsByContainer);

// Admin & PDI & Team: get a single production log by ID (used by notification detail screen)
router.get("/:logId", requireRole("admin", "pdi", "team"), getLogById);

export default router;

