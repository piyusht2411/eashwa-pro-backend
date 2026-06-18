import { Router } from "express";
import {
  verifyProductionLog,
  getVerificationsByContainer,
  getVerificationByLog,
  getPdiDashboard,
  editVerification,
  unverifyProductionLog,
} from "../controller/pdiVerification";
import { authenticateToken, requireRole } from "../middleware/authMiddleware";

const router = Router();

router.use(authenticateToken);

// PDI: dashboard
router.get("/dashboard", requireRole("pdi"), getPdiDashboard);

// PDI: verify a production log
router.post("/log/:logId", requireRole("pdi"), verifyProductionLog);

// PDI: unverify a production log (revert to pending)
router.delete("/log/:logId", requireRole("pdi"), unverifyProductionLog);

// PDI: edit a verification (creator-only, enforced in controller)
router.patch("/verification/:verificationId", requireRole("pdi"), editVerification);

// PDI & Admin: get verification for a specific log
router.get("/log/:logId", requireRole("pdi", "admin"), getVerificationByLog);

// Admin & PDI: get all verifications for a container
router.get("/container/:containerId", requireRole("admin", "pdi"), getVerificationsByContainer);

export default router;
