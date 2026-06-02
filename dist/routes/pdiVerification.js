"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const pdiVerification_1 = require("../controller/pdiVerification");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
// PDI: dashboard
router.get("/dashboard", (0, authMiddleware_1.requireRole)("pdi"), pdiVerification_1.getPdiDashboard);
// PDI: verify a production log
router.post("/log/:logId", (0, authMiddleware_1.requireRole)("pdi"), pdiVerification_1.verifyProductionLog);
// PDI: unverify a production log (revert to pending)
router.delete("/log/:logId", (0, authMiddleware_1.requireRole)("pdi"), pdiVerification_1.unverifyProductionLog);
// PDI: edit an incomplete verification
router.patch("/verification/:verificationId", (0, authMiddleware_1.requireRole)("pdi"), pdiVerification_1.editIncompleteVerification);
// PDI & Admin: get verification for a specific log
router.get("/log/:logId", (0, authMiddleware_1.requireRole)("pdi", "admin"), pdiVerification_1.getVerificationByLog);
// Admin & PDI: get all verifications for a container
router.get("/container/:containerId", (0, authMiddleware_1.requireRole)("admin", "pdi"), pdiVerification_1.getVerificationsByContainer);
exports.default = router;
