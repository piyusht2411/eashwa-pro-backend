"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const expense_1 = require("../../controller/transport/expense");
const authMiddleware_1 = require("../../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
// Per-visit expense operations
router.post("/visit/:visitId", (0, authMiddleware_1.requireRole)("accounts"), expense_1.upsertExpense);
router.patch("/visit/:visitId", (0, authMiddleware_1.requireRole)("accounts"), expense_1.upsertExpense);
router.get("/visit/:visitId", (0, authMiddleware_1.requireRole)("admin", "accounts", "driver"), expense_1.getExpenseByVisit);
// Admin approval queue
router.get("/pending", (0, authMiddleware_1.requireRole)("admin"), expense_1.getPendingExpenses);
// Admin approve / reject specific expense item
router.post("/:id/approve", (0, authMiddleware_1.requireRole)("admin"), expense_1.approveExpenseItem);
router.post("/:id/reject", (0, authMiddleware_1.requireRole)("admin"), expense_1.rejectExpenseItem);
exports.default = router;
