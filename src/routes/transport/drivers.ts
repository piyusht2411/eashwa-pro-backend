import { Router } from "express";
import {
  createDriver,
  getAllDrivers,
  getDriverById,
  getDriverSummary,
  updateDriver,
  deleteDriver,
} from "../../controller/transport/driver";
import { authenticateToken, requireRole } from "../../middleware/authMiddleware";

const router = Router();

router.use(authenticateToken);

router.get("/", requireRole("admin", "accounts"), getAllDrivers);
router.get("/:id", requireRole("admin", "accounts", "driver"), getDriverById);
router.get("/:id/summary", requireRole("admin", "accounts", "driver"), getDriverSummary);

router.post("/", requireRole("admin", "accounts"), createDriver);
router.patch("/:id", requireRole("admin", "accounts"), updateDriver);

router.delete("/:id", requireRole("admin"), deleteDriver);

export default router;
