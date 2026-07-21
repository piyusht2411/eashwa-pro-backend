import { Router } from "express";
import { exportExcel, getVisitReport } from "../../controller/transport/report";
import { authenticateToken, requireRole } from "../../middleware/authMiddleware";

const router = Router();

router.use(authenticateToken, requireRole("admin", "accounts"));

router.get("/export", exportExcel);
router.get("/visits", getVisitReport);

export default router;
