import { Router } from "express";
import {
  createVisit,
  getAllVisits,
  getVisitById,
  updateVisit,
  deleteVisit,
} from "../../controller/transport/visit";
import { authenticateToken, requireRole } from "../../middleware/authMiddleware";

const router = Router();

router.use(authenticateToken);

router.get("/", requireRole("admin", "accounts", "driver"), getAllVisits);
router.get("/:id", requireRole("admin", "accounts", "driver"), getVisitById);

router.post("/", requireRole("accounts"), createVisit);
router.patch("/:id", requireRole("accounts"), updateVisit);
router.delete("/:id", requireRole("accounts"), deleteVisit);

export default router;
