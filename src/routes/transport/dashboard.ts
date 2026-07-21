import { Router } from "express";
import {
  getAdminDashboard,
  getAccountsDashboard,
  getDriverDashboard,
} from "../../controller/transport/dashboard";
import { authenticateToken, requireRole } from "../../middleware/authMiddleware";

const router = Router();

router.use(authenticateToken);

router.get("/admin", requireRole("admin"), getAdminDashboard);
router.get("/accounts", requireRole("admin", "accounts"), getAccountsDashboard);
router.get("/driver/:driverId", requireRole("admin", "accounts", "driver"), getDriverDashboard);

export default router;
