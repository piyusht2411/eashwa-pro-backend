import { Router } from "express";
import {
  upsertExpense,
  getExpenseByVisit,
  approveExpenseItem,
  rejectExpenseItem,
  getPendingExpenses,
} from "../../controller/transport/expense";
import { authenticateToken, requireRole } from "../../middleware/authMiddleware";

const router = Router();

router.use(authenticateToken);

// Per-visit expense operations
router.post("/visit/:visitId", requireRole("accounts"), upsertExpense);
router.patch("/visit/:visitId", requireRole("accounts"), upsertExpense);
router.get("/visit/:visitId", requireRole("admin", "accounts", "driver"), getExpenseByVisit);

// Admin approval queue
router.get("/pending", requireRole("admin"), getPendingExpenses);

// Admin approve / reject specific expense item
router.post("/:id/approve", requireRole("admin"), approveExpenseItem);
router.post("/:id/reject", requireRole("admin"), rejectExpenseItem);

export default router;
