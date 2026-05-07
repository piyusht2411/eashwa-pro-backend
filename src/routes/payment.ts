import { Router } from "express";
import {
  getOrInitPayment,
  makePayment,
  getAllPayments,
  getMyPayments,
  getPaymentByContainer,
} from "../controller/payment";
import { authenticateToken, requireRole } from "../middleware/authMiddleware";

const router = Router();

router.use(authenticateToken);

// Admin: get all payment ledgers
router.get("/", requireRole("admin"), getAllPayments);

// Team: view own payment info (no money for PDI)
router.get("/my", requireRole("team"), getMyPayments);

// Admin: get or initialize payment ledger for a container
router.get("/container/:containerId", requireRole("admin"), getOrInitPayment);

// Admin + Team: get payment summary for a container (team needs this for notification detail)
router.get("/container/:containerId/summary", requireRole("admin", "team"), getPaymentByContainer);

// Admin: make a payment for a container
router.post("/container/:containerId/pay", requireRole("admin"), makePayment);

export default router;
