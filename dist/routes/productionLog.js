"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const productionLog_1 = require("../controller/productionLog");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
router.use(authMiddleware_1.authenticateToken);
// Team: submit or update daily production log
router.post("/", (0, authMiddleware_1.requireRole)("team"), productionLog_1.submitProductionLog);
// Team: dashboard with all stats
router.get("/dashboard", (0, authMiddleware_1.requireRole)("team"), productionLog_1.getTeamDashboard);
// PDI: get all pending logs to verify
router.get("/pending", (0, authMiddleware_1.requireRole)("pdi"), productionLog_1.getPendingLogs);
// Admin & PDI & Team: get logs for a container
router.get("/container/:containerId", (0, authMiddleware_1.requireRole)("admin", "pdi", "team"), productionLog_1.getLogsByContainer);
// Team: history with month/date filter (must be before /:logId)
router.get("/history", (0, authMiddleware_1.requireRole)("team"), productionLog_1.getTeamHistory);
// Admin & PDI & Team: get a single production log by ID (used by notification detail screen)
router.get("/:logId", (0, authMiddleware_1.requireRole)("admin", "pdi", "team"), productionLog_1.getLogById);
exports.default = router;
