import { Router } from "express";
import {
  addMiscellaneous,
  getAllMiscellaneous,
  updateMiscellaneous,
  deleteMiscellaneous,
} from "../controller/miscellaneous";
import { authenticateToken, requireRole } from "../middleware/authMiddleware";

const router = Router();

router.use(authenticateToken);

// Admin: list all miscellaneous entries + total
router.get("/", requireRole("admin"), getAllMiscellaneous);

// Admin: add a miscellaneous amount
router.post("/", requireRole("admin"), addMiscellaneous);

// Admin: update a miscellaneous entry
router.patch("/:id", requireRole("admin"), updateMiscellaneous);

// Admin: delete a miscellaneous entry
router.delete("/:id", requireRole("admin"), deleteMiscellaneous);

export default router;
