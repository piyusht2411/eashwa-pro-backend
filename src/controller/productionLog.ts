import { Request, Response } from "express";
import mongoose from "mongoose";
import ProductionLog from "../model/productionLog";
import Container from "../model/container";
import User from "../model/user";
import PdiVerification from "../model/pdiVerification";
import { sendPushNotification, sendPushNotificationToMany } from "../utils/notify";

const getPagination = (query: Request["query"]) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

// ─── Team: Submit/Update Daily Production Log ─────────────────────────────────
export const submitProductionLog = async (req: Request, res: Response) => {
  try {
    const { containerId, date, reportedQuantity } = req.body;
    const teamId = req.userId;

    if (!containerId || !date || reportedQuantity === undefined) {
      return res.status(400).json({
        message: "containerId, date and reportedQuantity are required",
      });
    }

    // Verify container exists and is assigned to this team
    const container = await Container.findById(containerId);
    if (!container) return res.status(404).json({ message: "Container not found" });

    if (container.assignedTeam.toString() !== teamId) {
      return res.status(403).json({ message: "This container is not assigned to you" });
    }

    if (container.status !== "active") {
      return res.status(400).json({ message: "Container is not active" });
    }

    const logDate = new Date(date);
    // Normalize to start-of-day UTC for uniqueness check
    logDate.setUTCHours(0, 0, 0, 0);

    // Upsert: team can update the same day's log
    const log = await ProductionLog.findOneAndUpdate(
      { container: containerId, team: teamId, date: logDate },
      {
        container: containerId,
        team: teamId,
        date: logDate,
        reportedQuantity,
        status: "pending",       // reset to pending if re-submitted
        verifiedQuantity: null,
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // Notify all PDI users about new/updated production log
    const pdiUsers = await User.find({ role: "pdi" }).select("_id");
    await sendPushNotificationToMany(
      pdiUsers.map((u) => u._id),
      "Production Update",
      `Team has reported ${reportedQuantity} units for container: ${container.model} on ${date}`,
      { logId: log._id.toString(), containerId, type: "new_production_log" }
    );

    return res.status(200).json({ message: "Production log submitted", log });
  } catch (err: any) {
    if (err.code === 11000) {
      return res.status(409).json({ message: "Log for this date already exists for this container" });
    }
    return res.status(500).json({ message: err.message });
  }
};

// ─── Get Logs for a Container ─────────────────────────────────────────────────
// Admin & PDI see all; Team sees only their own
export const getLogsByContainer = async (req: Request, res: Response) => {
  try {
    const { containerId } = req.params;
    const userRole = (req as any).userRole;
    const userId = req.userId;

    const filter: any = { container: containerId };

    if (userRole === "team") {
      filter.team = userId;
    }

    const { page, limit, skip } = getPagination(req.query);

    const [logs, total, summaryLogs] = await Promise.all([
      ProductionLog.find(filter)
        .populate("team", "name email")
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit),
      ProductionLog.countDocuments(filter),
      ProductionLog.find(filter).select("reportedQuantity verifiedQuantity"),
    ]);

    // Aggregate summary
    const totalReported = summaryLogs.reduce((s, l) => s + l.reportedQuantity, 0);
    const totalVerified = summaryLogs.reduce((s, l) => s + (l.verifiedQuantity ?? 0), 0);

    return res.status(200).json({
      logs,
      totalReported,
      totalVerified,
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

// ─── Get All Pending Logs (PDI only) ─────────────────────────────────────────
export const getPendingLogs = async (req: Request, res: Response) => {
  try {
    const filter = { status: "pending" };
    const { page, limit, skip } = getPagination(req.query);

    const [logs, total] = await Promise.all([
      ProductionLog.find(filter)
        .populate("team", "name email")
        .populate("container", "model quantity ratePerUnit assignedTeam")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      ProductionLog.countDocuments(filter),
    ]);

    return res.status(200).json({
      logs,
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

// ─── Get Team Dashboard Stats ─────────────────────────────────────────────────
export const getTeamDashboard = async (req: Request, res: Response) => {
  try {
    const teamId = req.userId;

    // Active containers for this team
    const containers = await Container.find({ assignedTeam: teamId, status: "active" });

    const stats = await Promise.all(
      containers.map(async (c) => {
        const logs = await ProductionLog.find({ container: c._id, team: teamId });
        const totalReported = logs.reduce((s, l) => s + l.reportedQuantity, 0);
        const totalVerified = logs.reduce((s, l) => s + (l.verifiedQuantity ?? 0), 0);
        return {
          container: {
            _id: c._id,
            model: c.model,
            quantity: c.quantity,
            date: c.date,
            ratePerUnit: c.ratePerUnit,
            status: c.status,
          },
          totalReported,
          totalVerified,
          totalAmount: totalVerified * c.ratePerUnit,
        };
      })
    );

    return res.status(200).json({ stats });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Team: History with month/date filter ────────────────────────────────────
export const getTeamHistory = async (req: Request, res: Response) => {
  try {
    const teamId = req.userId;
    const { month, date } = req.query as { month?: string; date?: string };
    const { page, limit, skip } = getPagination(req.query);

    const filter: any = { team: teamId };

    if (date) {
      const start = new Date(date);
      start.setUTCHours(0, 0, 0, 0);
      const end = new Date(start);
      end.setUTCDate(end.getUTCDate() + 1);
      filter.date = { $gte: start, $lt: end };
    } else if (month) {
      // month: "YYYY-MM"
      const [yearStr, monthStr] = month.split("-");
      const year = Number(yearStr);
      const m = Number(monthStr);
      if (!year || !m) {
        return res.status(400).json({ message: "Invalid month format, expected YYYY-MM" });
      }
      const start = new Date(Date.UTC(year, m - 1, 1));
      const end = new Date(Date.UTC(year, m, 1));
      filter.date = { $gte: start, $lt: end };
    }

    const [logs, total] = await Promise.all([
      ProductionLog.find(filter)
        .populate("container", "model ratePerUnit quantity")
        .sort({ date: -1 })
        .skip(skip)
        .limit(limit),
      ProductionLog.countDocuments(filter),
    ]);

    const containerIds = Array.from(
      new Set(
        logs
          .map((l) => (l.container as any)?._id?.toString())
          .filter(Boolean)
      )
    ).map((id) => new mongoose.Types.ObjectId(id));

    const logIds = logs.map((l) => l._id);

    const [verifiedAggByContainer, verifications] = await Promise.all([
      ProductionLog.aggregate([
        {
          $match: {
            team: new mongoose.Types.ObjectId(String(teamId)),
            container: { $in: containerIds },
          },
        },
        {
          $group: {
            _id: "$container",
            totalVerified: { $sum: { $ifNull: ["$verifiedQuantity", 0] } },
          },
        },
      ]),
      PdiVerification.find({ productionLog: { $in: logIds } }),
    ]);

    const verifiedByContainer = new Map<string, number>();
    for (const row of verifiedAggByContainer) {
      verifiedByContainer.set(String(row._id), row.totalVerified);
    }
    const pdiByLog = new Map<string, any>();
    for (const v of verifications) {
      pdiByLog.set(String(v.productionLog), v);
    }

    const out = logs.map((l) => {
      const container = l.container as any;
      const totalVerifiedForContainer =
        verifiedByContainer.get(String(container?._id)) ?? 0;
      const remainingTarget = (container?.quantity ?? 0) - totalVerifiedForContainer;
      const pdi = pdiByLog.get(String(l._id));
      return {
        _id: l._id,
        date: l.date,
        container: container
          ? {
              _id: container._id,
              model: container.model,
              ratePerUnit: container.ratePerUnit,
              quantity: container.quantity,
            }
          : null,
        reportedQuantity: l.reportedQuantity,
        verifiedQuantity: l.verifiedQuantity ?? null,
        status: l.status,
        remainingTarget,
        pdiVerification: pdi
          ? {
              verifiedQuantity: pdi.verifiedQuantity,
              isIncomplete: pdi.isIncomplete,
              missingQuantity: pdi.missingQuantity ?? 0,
              remarks: pdi.remarks ?? "",
            }
          : null,
      };
    });

    return res.status(200).json({
      logs: out,
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

// ─── Get Single Production Log by ID (Admin / PDI / Team) ────────────────────
export const getLogById = async (req: Request, res: Response) => {
  try {
    const { logId } = req.params;
    const userRole = (req as any).userRole;
    const userId = req.userId;

    const log = await ProductionLog.findById(logId)
      .populate("container", "model quantity date ratePerUnit status assignedTeam")
      .populate("team", "name email phone");

    if (!log) return res.status(404).json({ message: "Production log not found" });

    // Team can only see their own logs
    if (userRole === "team") {
      const teamId = typeof log.team === "string" ? log.team : (log.team as any)._id?.toString();
      if (teamId !== userId) {
        return res.status(403).json({ message: "Access denied" });
      }
    }

    return res.status(200).json({ log });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
