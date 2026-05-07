import { Router } from "express";
import {
  createContainer,
  getAllContainers,
  getContainerById,
  updateContainerStatus,
  deleteContainer,
} from "../controller/container";
import { authenticateToken, requireRole } from "../middleware/authMiddleware";

const router = Router();

// All routes require authentication
router.use(authenticateToken);

// Admin: create container
router.post("/", requireRole("admin"), createContainer);

// Admin & PDI & Team: get all (filtered by role inside controller)
router.get("/", requireRole("admin", "team", "pdi"), getAllContainers);

// Admin & PDI & Team: get single (access-controlled inside controller)
router.get("/:id", requireRole("admin", "team", "pdi"), getContainerById);

// Admin only: update status
router.patch("/:id/status", requireRole("admin"), updateContainerStatus);

// Admin only: delete
router.delete("/:id", requireRole("admin"), deleteContainer);

export default router;
