import { Router } from "express";
import {
  register,
  login,
  getMe,
  updateFcmToken,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  logout,
} from "../controller/user";
import { authenticateToken, requireRole } from "../middleware/authMiddleware";

const router = Router();

// Admin only: create admin, production team, or the single PDI team
router.post("/register", authenticateToken, requireRole("admin"), register);
router.post("/login", login);
router.post("/logout", logout);

// Protected
router.get("/me", authenticateToken, getMe);
router.patch("/fcm-token", authenticateToken, updateFcmToken);

// Admin only
router.get("/all", authenticateToken, requireRole("admin"), getAllUsers);
router.get("/:id", authenticateToken, requireRole("admin"), getUserById);
router.patch("/:id", authenticateToken, requireRole("admin"), updateUser);
router.delete("/:id", authenticateToken, requireRole("admin"), deleteUser);

export default router;
