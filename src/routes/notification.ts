import { Router } from "express";
import { deleteNotification, getMyNotifications, markAllRead, markAsRead } from "../controller/notification";
import { authenticateToken, requireRole } from "../middleware/authMiddleware";

const router = Router();

router.use(authenticateToken);

router.get("/", requireRole("admin", "team", "pdi", "accounts", "driver"), getMyNotifications);
router.post("/read-all", requireRole("admin", "team", "pdi", "accounts", "driver"), markAllRead);
router.patch("/read-all", requireRole("admin", "team", "pdi", "accounts", "driver"), markAllRead);
router.patch("/:id/read", requireRole("admin", "team", "pdi", "accounts", "driver"), markAsRead);
router.delete("/:id", requireRole("admin", "team", "pdi", "accounts", "driver"), deleteNotification);

export default router;
