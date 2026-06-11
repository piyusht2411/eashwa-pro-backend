import { Router } from "express";
import {
  addMiscellaneous,
  getAllMiscellaneous,
  deleteMiscellaneous,
} from "../controller/miscellaneous";
import { authenticateToken, requireRole } from "../middleware/authMiddleware";

const router = Router();

router.use(authenticateToken);

// Admin: list all miscellaneous entries + total
router.get("/", requireRole("admin"), getAllMiscellaneous);

// Admin: add a miscellaneous amount
router.post("/", requireRole("admin"), addMiscellaneous);

// Admin: delete a miscellaneous entry
router.delete("/:id", requireRole("admin"), deleteMiscellaneous);

export default router;
