import { Router } from "express";
import {
  register,
  login,
  getMe,
  updateFcmToken,
  changePassword,
  getAllUsers,
  getUserById,
  updateUser,
  deleteUser,
  logout,
  switchPortal,
} from "../controller/user";
import { authenticateToken, requireRole } from "../middleware/authMiddleware";

const router = Router();

// Admin only: create admin, production team, or the single PDI team
router.post("/register", authenticateToken, requireRole("admin"), register);
router.post("/login", login);
router.post("/logout", logout);

// Protected
router.get("/me", authenticateToken, getMe);
// Cross-portal admins only — re-issues the session against the other portal
router.post("/switch-portal", authenticateToken, requireRole("admin"), switchPortal);
router.patch("/fcm-token", authenticateToken, updateFcmToken);
router.patch("/change-password", changePassword);

// Admin only
router.get("/all", authenticateToken, requireRole("admin"), getAllUsers);
router.get("/:id", authenticateToken, requireRole("admin"), getUserById);
router.patch("/:id", authenticateToken, requireRole("admin"), updateUser);
router.delete("/:id", authenticateToken, requireRole("admin"), deleteUser);

export default router;
