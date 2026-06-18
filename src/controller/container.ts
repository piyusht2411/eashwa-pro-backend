import { Request, Response } from "express";
import Container from "../model/container";
import User from "../model/user";
import ProductionLog from "../model/productionLog";
import PdiVerification from "../model/pdiVerification";
import Payment from "../model/payment";
import { sendPushNotification } from "../utils/notify";
import { computePenalty, getVerifiedByContainer } from "../utils/penalty";

const getPagination = (query: Request["query"]) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

// ─── Create Container (Admin only) ────────────────────────────────────────────
export const createContainer = async (req: Request, res: Response) => {
  try {
    const { model, quantity, date, ratePerUnit, penaltyPerUnit, assignedTeam } = req.body;

    if (!model || !quantity || !date || !ratePerUnit || !assignedTeam) {
      return res.status(400).json({
        message: "model, quantity, date, ratePerUnit and assignedTeam are required",
      });
    }

    if (penaltyPerUnit !== undefined && (Number(penaltyPerUnit) < 0 || Number.isNaN(Number(penaltyPerUnit)))) {
      return res.status(400).json({ message: "penaltyPerUnit must be a non-negative number" });
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
      penaltyPerUnit: penaltyPerUnit ?? 0,
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

    // Attach live penalty figures (pending vehicles × penaltyPerUnit)
    const verifiedMap = await getVerifiedByContainer(containers.map((c) => c._id));
    const containersWithPenalty = containers.map((c) => {
      const penalty = computePenalty(
        c.quantity,
        verifiedMap.get(String(c._id)) ?? 0,
        c.penaltyPerUnit ?? 0
      );
      return { ...c.toObject(), ...penalty };
    });

    return res.status(200).json({
      containers: containersWithPenalty,
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

    const verifiedMap = await getVerifiedByContainer([container._id]);
    const penalty = computePenalty(
      container.quantity,
      verifiedMap.get(String(container._id)) ?? 0,
      container.penaltyPerUnit ?? 0
    );

    return res.status(200).json({ container: { ...container.toObject(), ...penalty } });
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

// ─── Update Container (Admin only) ───────────────────────────────────────────
// Allows editing the penalty per vehicle and other core fields.
export const updateContainer = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { model, quantity, date, ratePerUnit, penaltyPerUnit, status } = req.body;

    const update: any = {};
    if (model !== undefined) update.model = model;
    if (quantity !== undefined) {
      if (Number(quantity) < 1) return res.status(400).json({ message: "quantity must be at least 1" });
      update.quantity = Number(quantity);
    }
    if (date !== undefined) update.date = new Date(date);
    if (ratePerUnit !== undefined) {
      if (Number(ratePerUnit) < 0) return res.status(400).json({ message: "ratePerUnit must be non-negative" });
      update.ratePerUnit = Number(ratePerUnit);
    }
    if (penaltyPerUnit !== undefined) {
      if (Number(penaltyPerUnit) < 0 || Number.isNaN(Number(penaltyPerUnit))) {
        return res.status(400).json({ message: "penaltyPerUnit must be a non-negative number" });
      }
      update.penaltyPerUnit = Number(penaltyPerUnit);
    }
    if (status !== undefined) {
      if (!["active", "completed", "cancelled"].includes(status)) {
        return res.status(400).json({ message: "Invalid status" });
      }
      update.status = status;
    }

    if (Object.keys(update).length === 0) {
      return res.status(400).json({ message: "No valid fields to update" });
    }

    const container = await Container.findByIdAndUpdate(id, update, { new: true })
      .populate("assignedTeam", "name email phone")
      .populate("createdBy", "name email");
    if (!container) return res.status(404).json({ message: "Container not found" });

    const verifiedMap = await getVerifiedByContainer([container._id]);
    const penalty = computePenalty(
      container.quantity,
      verifiedMap.get(String(container._id)) ?? 0,
      container.penaltyPerUnit ?? 0
    );

    return res.status(200).json({
      message: "Container updated",
      container: { ...container.toObject(), ...penalty },
    });
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

    // Cascade: remove dependent records so nothing is left orphaned.
    await Promise.all([
      ProductionLog.deleteMany({ container: id }),
      PdiVerification.deleteMany({ container: id }),
      Payment.deleteOne({ container: id }),
    ]);

    return res.status(200).json({ message: "Container deleted" });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
