import { Request, Response } from "express";
import mongoose from "mongoose";
import ProductionLog from "../model/productionLog";
import PdiVerification from "../model/pdiVerification";
import Payment from "../model/payment";
import Container from "../model/container";
import User from "../model/user";

const getPagination = (query: Request["query"]) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

// ─── Admin Dashboard Summary ─────────────────────────────────────────────────
export const getAdminDashboardSummary = async (req: Request, res: Response) => {
  try {
    const [verifiedAgg, pendingVerify, paymentAgg] = await Promise.all([
      PdiVerification.aggregate([
        { $group: { _id: null, total: { $sum: "$verifiedQuantity" } } },
      ]),
      ProductionLog.countDocuments({ status: "pending" }),
      Payment.aggregate([
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$totalAmount" },
            paidAmount: { $sum: "$paidAmount" },
            remainingAmount: { $sum: "$remainingAmount" },
          },
        },
      ]),
    ]);

    const totalProduction = verifiedAgg[0]?.total ?? 0;
    const totalAmount = paymentAgg[0]?.totalAmount ?? 0;
    const paidAmount = paymentAgg[0]?.paidAmount ?? 0;
    const remainingAmount = paymentAgg[0]?.remainingAmount ?? 0;

    return res.status(200).json({
      totalProduction,
      pendingVerify,
      totalAmount,
      paidAmount,
      remainingAmount,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Admin Report & History ──────────────────────────────────────────────────
export const getAdminReport = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, teamId } = req.query;
    const { page, limit, skip } = getPagination(req.query);

    const match: any = {};
    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(String(startDate));
      if (endDate) match.date.$lte = new Date(String(endDate));
    }
    if (teamId) {
      match.team = new mongoose.Types.ObjectId(String(teamId));
    }

    const basePipeline: any[] = [
      { $match: match },
      {
        $lookup: {
          from: "pdiverifications",
          localField: "_id",
          foreignField: "productionLog",
          as: "pdi",
        },
      },
      { $unwind: { path: "$pdi", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "containers",
          localField: "container",
          foreignField: "_id",
          as: "container",
        },
      },
      { $unwind: { path: "$container", preserveNullAndEmptyArrays: true } },
      {
        $lookup: {
          from: "users",
          localField: "team",
          foreignField: "_id",
          as: "team",
        },
      },
      { $unwind: { path: "$team", preserveNullAndEmptyArrays: true } },
    ];

    const summaryPipeline = [
      ...basePipeline,
      {
        $group: {
          _id: null,
          totalReported: { $sum: "$reportedQuantity" },
          totalVerified: { $sum: { $ifNull: ["$pdi.verifiedQuantity", 0] } },
          totalIncomplete: {
            $sum: { $cond: [{ $eq: ["$status", "incomplete"] }, 1, 0] },
          },
          containerIds: { $addToSet: "$container._id" },
        },
      },
    ];

    const logsPipeline = [
      ...basePipeline,
      { $sort: { date: -1 } },
      { $skip: skip },
      { $limit: limit },
      {
        $project: {
          _id: 1,
          date: 1,
          reportedQuantity: 1,
          verifiedQuantity: 1,
          status: 1,
          missingQuantity: { $ifNull: ["$pdi.missingQuantity", 0] },
          remarks: { $ifNull: ["$pdi.remarks", ""] },
          container: {
            _id: "$container._id",
            model: "$container.model",
            ratePerUnit: "$container.ratePerUnit",
          },
          team: { _id: "$team._id", name: "$team.name" },
        },
      },
    ];

    const countPipeline = [...basePipeline, { $count: "total" }];

    const [summaryRes, logs, countRes] = await Promise.all([
      ProductionLog.aggregate(summaryPipeline),
      ProductionLog.aggregate(logsPipeline),
      ProductionLog.aggregate(countPipeline),
    ]);

    const summaryRow = summaryRes[0];
    let totalAmount = 0;
    let totalPaid = 0;
    let totalRemaining = 0;

    if (summaryRow?.containerIds?.length) {
      const paymentAgg = await Payment.aggregate([
        { $match: { container: { $in: summaryRow.containerIds } } },
        {
          $group: {
            _id: null,
            totalAmount: { $sum: "$totalAmount" },
            totalPaid: { $sum: "$paidAmount" },
            totalRemaining: { $sum: "$remainingAmount" },
          },
        },
      ]);
      totalAmount = paymentAgg[0]?.totalAmount ?? 0;
      totalPaid = paymentAgg[0]?.paidAmount ?? paymentAgg[0]?.totalPaid ?? 0;
      totalRemaining =
        paymentAgg[0]?.totalRemaining ?? paymentAgg[0]?.remainingAmount ?? 0;
    }

    const total = countRes[0]?.total ?? 0;

    return res.status(200).json({
      summary: {
        totalReported: summaryRow?.totalReported ?? 0,
        totalVerified: summaryRow?.totalVerified ?? 0,
        totalIncomplete: summaryRow?.totalIncomplete ?? 0,
        totalAmount,
        totalPaid,
        totalRemaining,
      },
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

// ─── Admin Monitor (live counts) ─────────────────────────────────────────────
export const getMonitorData = async (req: Request, res: Response) => {
  try {
    const startOfDay = new Date();
    startOfDay.setUTCHours(0, 0, 0, 0);
    const endOfDay = new Date(startOfDay);
    endOfDay.setUTCDate(endOfDay.getUTCDate() + 1);

    const [
      activeContainers,
      totalTeams,
      totalPdiUsers,
      todayLogs,
      todayVerified,
      todayPending,
      recentLogs,
      recentVerifications,
      recentPayments,
    ] = await Promise.all([
      Container.countDocuments({ status: "active" }),
      User.countDocuments({ role: "team" }),
      User.countDocuments({ role: "pdi" }),
      ProductionLog.countDocuments({
        createdAt: { $gte: startOfDay, $lt: endOfDay },
      }),
      ProductionLog.countDocuments({
        createdAt: { $gte: startOfDay, $lt: endOfDay },
        status: "verified",
      }),
      ProductionLog.countDocuments({
        createdAt: { $gte: startOfDay, $lt: endOfDay },
        status: "pending",
      }),
      ProductionLog.find()
        .sort({ createdAt: -1 })
        .limit(3)
        .populate("team", "name")
        .populate("container", "model"),
      PdiVerification.find()
        .sort({ createdAt: -1 })
        .limit(3)
        .populate("container", "model")
        .populate("verifiedBy", "name"),
      Payment.find()
        .sort({ updatedAt: -1 })
        .limit(3)
        .populate("container", "model")
        .populate("team", "name"),
    ]);

    const activity: Array<{
      type: "production_log" | "pdi_verification" | "payment";
      description: string;
      timestamp: Date;
    }> = [];

    for (const l of recentLogs) {
      const teamName = (l.team as any)?.name ?? "A team";
      const containerModel = (l.container as any)?.model ?? "container";
      activity.push({
        type: "production_log",
        description: `${teamName} logged ${l.reportedQuantity} units for ${containerModel}`,
        timestamp: (l as any).createdAt,
      });
    }
    for (const v of recentVerifications) {
      const containerModel = (v.container as any)?.model ?? "container";
      const verifierName = (v.verifiedBy as any)?.name ?? "PDI";
      activity.push({
        type: "pdi_verification",
        description: `${verifierName} verified ${v.verifiedQuantity} units for ${containerModel}${v.isIncomplete ? ` (missing ${v.missingQuantity ?? 0})` : ""}`,
        timestamp: (v as any).createdAt,
      });
    }
    for (const p of recentPayments) {
      const containerModel = (p.container as any)?.model ?? "container";
      const teamName = (p.team as any)?.name ?? "team";
      activity.push({
        type: "payment",
        description: `Payment ledger updated for ${containerModel} (${teamName}): paid ₹${p.paidAmount} of ₹${p.totalAmount}`,
        timestamp: (p as any).updatedAt,
      });
    }

    const recentActivity = activity
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
      .slice(0, 10);

    return res.status(200).json({
      activeContainers,
      totalTeams,
      totalPdiUsers,
      todayLogs,
      todayVerified,
      todayPending,
      recentActivity,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
