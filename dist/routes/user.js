"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const user_1 = require("../controller/user");
const authMiddleware_1 = require("../middleware/authMiddleware");
const router = (0, express_1.Router)();
// Admin only: create admin, production team, or the single PDI team
router.post("/register", authMiddleware_1.authenticateToken, (0, authMiddleware_1.requireRole)("admin"), user_1.register);
router.post("/login", user_1.login);
router.post("/logout", user_1.logout);
// Protected
router.get("/me", authMiddleware_1.authenticateToken, user_1.getMe);
router.patch("/fcm-token", authMiddleware_1.authenticateToken, user_1.updateFcmToken);
router.patch("/change-password", user_1.changePassword);
// Admin only
router.get("/all", authMiddleware_1.authenticateToken, (0, authMiddleware_1.requireRole)("admin"), user_1.getAllUsers);
router.get("/:id", authMiddleware_1.authenticateToken, (0, authMiddleware_1.requireRole)("admin"), user_1.getUserById);
router.patch("/:id", authMiddleware_1.authenticateToken, (0, authMiddleware_1.requireRole)("admin"), user_1.updateUser);
router.delete("/:id", authMiddleware_1.authenticateToken, (0, authMiddleware_1.requireRole)("admin"), user_1.deleteUser);
exports.default = router;
