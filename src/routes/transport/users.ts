import { Router } from "express";
import {
  createTransportUser,
  getAllTransportUsers,
  getTransportUserById,
  updateTransportUser,
  deleteTransportUser,
} from "../../controller/transport/user";
import { authenticateToken, requireRole } from "../../middleware/authMiddleware";

const router = Router();

router.use(authenticateToken, requireRole("admin"));

router.post("/", createTransportUser);
router.get("/", getAllTransportUsers);
router.get("/:id", getTransportUserById);
router.patch("/:id", updateTransportUser);
router.delete("/:id", deleteTransportUser);

export default router;
