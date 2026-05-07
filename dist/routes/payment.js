"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const payment_1 = require("../controller/payment");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
// Admin: get all payment ledgers
router.get("/", (0, authMiddleware_1.requireRole)("admin"), payment_1.getAllPayments);
// Team: view own payment info (no money for PDI)
router.get("/my", (0, authMiddleware_1.requireRole)("team"), payment_1.getMyPayments);
// Admin: get or initialize payment ledger for a container
router.get("/container/:containerId", (0, authMiddleware_1.requireRole)("admin"), payment_1.getOrInitPayment);
// Admin + Team: get payment summary for a container (team needs this for notification detail)
router.get("/container/:containerId/summary", (0, authMiddleware_1.requireRole)("admin", "team"), payment_1.getPaymentByContainer);
// Admin: make a payment for a container
router.post("/container/:containerId/pay", (0, authMiddleware_1.requireRole)("admin"), payment_1.makePayment);
exports.default = router;
