import { Request, Response } from "express";
import mongoose from "mongoose";
import ProductionLog from "../model/productionLog";
import PdiVerification from "../model/pdiVerification";
import Payment from "../model/payment";
import Miscellaneous from "../model/miscellaneous";
import Container from "../model/container";
import User from "../model/user";
import { istify, toIST } from "../utils/date";
import { computePenalty, getVerifiedByContainer } from "../utils/penalty";

const getPagination = (query: Request["query"]) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

// ─── Admin Dashboard Summary ─────────────────────────────────────────────────
export const getAdminDashboardSummary = async (req: Request, res: Response) => {
  try {
    const [verifiedAgg, pendingVerify, paymentAgg, miscAgg] = await Promise.all([
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
      Miscellaneous.aggregate([
        { $group: { _id: null, total: { $sum: "$amount" } } },
      ]),
    ]);

    const totalProduction = verifiedAgg[0]?.total ?? 0;
    const totalAmount = paymentAgg[0]?.totalAmount ?? 0;
    const paidAmount = paymentAgg[0]?.paidAmount ?? 0;
    const miscellaneousAmount = miscAgg[0]?.total ?? 0;

    // Live penalty across all non-cancelled containers
    const penaltyContainers = await Container.find({ status: { $ne: "cancelled" } }).select(
      "quantity penaltyPerUnit"
    );
    const verifiedMap = await getVerifiedByContainer(penaltyContainers.map((c) => c._id));
    let totalPenalty = 0;
    let totalPendingVehicles = 0;
    for (const c of penaltyContainers) {
      const { pendingQuantity, totalPenalty: p } = computePenalty(
        c.quantity,
        verifiedMap.get(String(c._id)) ?? 0,
        c.penaltyPerUnit ?? 0
      );
      totalPenalty += p;
      totalPendingVehicles += pendingQuantity;
    }

    // Both the hold/penalty and miscellaneous deductions reduce what is still owed
    const remainingAmount =
      (paymentAgg[0]?.remainingAmount ?? 0) - miscellaneousAmount - totalPenalty;

    return res.status(200).json({
      totalProduction,
      pendingVerify,
      totalAmount,
      paidAmount,
      miscellaneousAmount,
      remainingAmount,
      totalPenalty,
      totalPendingVehicles,
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

    // Group per container so verified can be capped at each container's target
    // (a container's verified units can never exceed its quantity/target).
    const summaryPipeline = [
      ...basePipeline,
      {
        $group: {
          _id: "$container._id",
          target: { $first: "$container.quantity" },
          reported: { $sum: "$reportedQuantity" },
          verified: { $sum: { $ifNull: ["$pdi.verifiedQuantity", 0] } },
          incomplete: {
            $sum: { $cond: [{ $eq: ["$status", "incomplete"] }, 1, 0] },
          },
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

    // Roll up the per-container groups, capping verified at each target.
    const summaryRow = summaryRes.reduce(
      (acc: any, row: any) => {
        const target = row.target ?? 0;
        acc.totalReported += row.reported ?? 0;
        acc.totalVerified += Math.min(target, row.verified ?? 0);
        acc.totalIncomplete += row.incomplete ?? 0;
        if (row._id) acc.containerIds.push(row._id);
        return acc;
      },
      { totalReported: 0, totalVerified: 0, totalIncomplete: 0, containerIds: [] as any[] }
    );
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
      logs: istify(logs),
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
export const exportAdminReport = async (req: Request, res: Response) => {
  try {
    const { startDate, endDate, teamId } = req.query;

    const match: any = {};
    if (startDate || endDate) {
      match.date = {};
      if (startDate) match.date.$gte = new Date(String(startDate));
      if (endDate) match.date.$lte = new Date(String(endDate));
    }
    if (teamId) {
      match.team = new mongoose.Types.ObjectId(String(teamId));
    }

    const logs = await ProductionLog.aggregate([
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
      { $sort: { date: -1 } },
      {
        $project: {
          _id: 1,
          date: 1,
          reportedQuantity: 1,
          verifiedQuantity: { $ifNull: ["$pdi.verifiedQuantity", "$verifiedQuantity"] },
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
    ]);

    return res.status(200).json({
      logs: istify(logs),
      total: logs.length,
      filters: {
        startDate: startDate || null,
        endDate: endDate || null,
        teamId: teamId || null,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

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
      _ts: number;
    }> = [];

    for (const l of recentLogs) {
      const teamName = (l.team as any)?.name ?? "A team";
      const containerModel = (l.container as any)?.model ?? "container";
      const ts: Date = (l as any).createdAt;
      activity.push({
        type: "production_log",
        description: `${teamName} logged ${l.reportedQuantity} units for ${containerModel}`,
        timestamp: ts,
        _ts: new Date(ts).getTime(),
      });
    }
    for (const v of recentVerifications) {
      const containerModel = (v.container as any)?.model ?? "container";
      const verifierName = (v.verifiedBy as any)?.name ?? "PDI";
      const ts: Date = (v as any).createdAt;
      activity.push({
        type: "pdi_verification",
        description: `${verifierName} verified ${v.verifiedQuantity} units for ${containerModel}${v.isIncomplete ? ` (missing ${v.missingQuantity ?? 0})` : ""}`,
        timestamp: ts,
        _ts: new Date(ts).getTime(),
      });
    }
    for (const p of recentPayments) {
      const containerModel = (p.container as any)?.model ?? "container";
      const teamName = (p.team as any)?.name ?? "team";
      const ts: Date = (p as any).updatedAt;
      activity.push({
        type: "payment",
        description: `Payment ledger updated for ${containerModel} (${teamName}): paid ₹${p.paidAmount} of ₹${p.totalAmount}`,
        timestamp: ts,
        _ts: new Date(ts).getTime(),
      });
    }

    const recentActivity = activity
      .sort((a, b) => b._ts - a._ts)
      .slice(0, 10)
      .map((a) => ({
        type: a.type,
        description: a.description,
        timestamp: toIST(a.timestamp),
      }));

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
