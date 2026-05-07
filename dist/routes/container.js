"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const container_1 = require("../controller/container");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// All routes require authentication
router.use(authMiddleware_1.authenticateToken);
// Admin: create container
router.post("/", (0, authMiddleware_1.requireRole)("admin"), container_1.createContainer);
// Admin & PDI & Team: get all (filtered by role inside controller)
router.get("/", (0, authMiddleware_1.requireRole)("admin", "team", "pdi"), container_1.getAllContainers);
// Admin & PDI & Team: get single (access-controlled inside controller)
router.get("/:id", (0, authMiddleware_1.requireRole)("admin", "team", "pdi"), container_1.getContainerById);
// Admin only: update status
router.patch("/:id/status", (0, authMiddleware_1.requireRole)("admin"), container_1.updateContainerStatus);
// Admin only: delete
router.delete("/:id", (0, authMiddleware_1.requireRole)("admin"), container_1.deleteContainer);
exports.default = router;
