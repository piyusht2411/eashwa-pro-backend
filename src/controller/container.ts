import { Request, Response } from "express";
import Container from "../model/container";
import User from "../model/user";
import { sendPushNotification } from "../utils/notify";

const getPagination = (query: Request["query"]) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

// ─── Create Container (Admin only) ────────────────────────────────────────────
export const createContainer = async (req: Request, res: Response) => {
  try {
    const { model, quantity, date, ratePerUnit, assignedTeam } = req.body;

    if (!model || !quantity || !date || !ratePerUnit || !assignedTeam) {
      return res.status(400).json({
        message: "model, quantity, date, ratePerUnit and assignedTeam are required",
      });
    }

    // Ensure assigned user is a team member
    const teamUser = await User.findById(assignedTeam);
    if (!teamUser || teamUser.role !== "team") {
      return res.status(400).json({ message: "assignedTeam must be a valid team member" });
    }

    const container = await Container.create({
      model,
      quantity,
      date: new Date(date),
      ratePerUnit,
      assignedTeam,
      createdBy: req.userId,
    });

    // Notify team about new assignment
    await sendPushNotification(
      assignedTeam,
      "New Work Assigned",
      `You have been assigned a new job: ${model} (Qty: ${quantity})`,
      { containerId: container._id.toString(), type: "new_container" }
    );

    return res.status(201).json({ message: "Container created successfully", container });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Get All Containers ───────────────────────────────────────────────────────
export const getAllContainers = async (req: Request, res: Response) => {
  try {
    const userRole = (req as any).userRole;
    const userId = req.userId;

    let filter: any = {};

    // Team sees only their own containers
    if (userRole === "team") {
      filter.assignedTeam = userId;
    }

    const { page, limit, skip } = getPagination(req.query);

    const [containers, total] = await Promise.all([
      Container.find(filter)
        .populate("assignedTeam", "name email phone")
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Container.countDocuments(filter),
    ]);

    return res.status(200).json({
      containers,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Get Single Container ─────────────────────────────────────────────────────
export const getContainerById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const userRole = (req as any).userRole;
    const userId = req.userId;

    const container = await Container.findById(id)
      .populate("assignedTeam", "name email phone")
      .populate("createdBy", "name email");

    if (!container) return res.status(404).json({ message: "Container not found" });

    // Team can only see their own containers
    if (userRole === "team" && container.assignedTeam._id.toString() !== userId) {
      return res.status(403).json({ message: "Access denied" });
    }

    return res.status(200).json({ container });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Update Container Status (Admin only) ────────────────────────────────────
export const updateContainerStatus = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["active", "completed", "cancelled"].includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const container = await Container.findByIdAndUpdate(
      id,
      { status },
      { new: true }
    );
    if (!container) return res.status(404).json({ message: "Container not found" });

    return res.status(200).json({ message: "Container status updated", container });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Delete Container (Admin only) ───────────────────────────────────────────
export const deleteContainer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const container = await Container.findByIdAndDelete(id);
    if (!container) return res.status(404).json({ message: "Container not found" });
    return res.status(200).json({ message: "Container deleted" });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
