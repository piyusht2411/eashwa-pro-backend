import { Router } from "express";
import { getMyNotifications, markAllRead } from "../controller/notification";
import { authenticateToken, requireRole } from "../middleware/authMiddleware";

const router = Router();

router.use(authenticateToken);

router.get("/", requireRole("admin", "team", "pdi"), getMyNotifications);
router.post("/read-all", requireRole("admin", "team", "pdi"), markAllRead);

export default router;
