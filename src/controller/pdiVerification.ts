import { Request, Response } from "express";
import PdiVerification from "../model/pdiVerification";
import ProductionLog from "../model/productionLog";
import Container from "../model/container";
import User from "../model/user";
import { sendPushNotification, sendPushNotificationToMany } from "../utils/notify";
import { istify } from "../utils/date";
import { computePenalty, getVerifiedByContainer } from "../utils/penalty";

const getPagination = (query: Request["query"]) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

// ─── PDI: Verify a Production Log ─────────────────────────────────────────────
export const verifyProductionLog = async (req: Request, res: Response) => {
  try {
    const { logId } = req.params;
    const { verifiedQuantity, isIncomplete, missingQuantity, remarks } = req.body;
    const pdiId = req.userId;

    if (verifiedQuantity === undefined) {
      return res.status(400).json({ message: "verifiedQuantity is required" });
    }

    const log = await ProductionLog.findById(logId).populate("container");
    if (!log) return res.status(404).json({ message: "Production log not found" });

    if (log.status === "verified") {
      return res.status(409).json({ message: "This log has already been verified" });
    }

    // Verified qty cannot exceed reported qty
    if (verifiedQuantity > log.reportedQuantity) {
      return res.status(400).json({
        message: `verifiedQuantity (${verifiedQuantity}) cannot exceed reportedQuantity (${log.reportedQuantity})`,
      });
    }

    // Cumulative verified for this container cannot exceed the target (quantity).
    const containerForCap = log.container as any;
    const containerQty = Number(containerForCap?.quantity ?? 0);
    const priorAgg = await PdiVerification.aggregate([
      { $match: { container: containerForCap._id, productionLog: { $ne: log._id } } },
      { $group: { _id: null, total: { $sum: "$verifiedQuantity" } } },
    ]);
    const priorVerified = priorAgg[0]?.total ?? 0;
    const remainingCapacity = Math.max(0, containerQty - priorVerified);
    if (verifiedQuantity > remainingCapacity) {
      return res.status(400).json({
        message: `Verified quantity exceeds the container target. Target is ${containerQty}, already verified ${priorVerified}, so at most ${remainingCapacity} more can be verified.`,
      });
    }

    const incomplete = isIncomplete ?? (verifiedQuantity < log.reportedQuantity);
    const missing = missingQuantity ?? (log.reportedQuantity - verifiedQuantity);

    // Create or update verification record
    const verification = await PdiVerification.findOneAndUpdate(
      { productionLog: logId },
      {
        productionLog: logId,
        container: log.container,
        verifiedBy: pdiId,
        verifiedQuantity,
        isIncomplete: incomplete,
        missingQuantity: missing,
        remarks: remarks ?? "",
        verifiedAt: new Date(),
      },
      { new: true, upsert: true, setDefaultsOnInsert: true }
    );

    // Update the production log
    log.verifiedQuantity = verifiedQuantity;
    log.status = incomplete ? "incomplete" : "verified";
    await log.save();

    // ── Notifications ────────────────────────────────────────────────────────
    const containerDoc = log.container as any; // already populated
    const containerModel: string = containerDoc?.model ?? "container";
    const containerIdStr: string = containerDoc?._id?.toString() ?? "";

    // 1. Notify the Team whose log was verified
    await sendPushNotification(
      log.team,
      incomplete ? "⚠️ Production Partially Verified" : "✅ Production Verified",
      incomplete
        ? `Your report for ${containerModel} was partially accepted. ${missing} units are unverified.`
        : `All ${verifiedQuantity} units for ${containerModel} have been verified by PDI.`,
      {
        type: incomplete ? "pdi_incomplete" : "pdi_verified",
        logId,
        containerId: containerIdStr,
        verifiedQuantity: String(verifiedQuantity),
      }
    );

    // 2. Notify all Admins with the verification summary
    const admins = await User.find({ role: "admin" }).select("_id");
    if (admins.length > 0) {
      await sendPushNotificationToMany(
        admins.map((a) => a._id),
        "📋 PDI Verification Complete",
        `PDI verified ${verifiedQuantity} units for ${containerModel}.${incomplete ? ` Missing: ${missing} units.` : " Fully verified."}`,
        {
          type: "pdi_verified_admin",
          logId,
          containerId: containerIdStr,
          verifiedQuantity: String(verifiedQuantity),
        }
      );
    }
    // ────────────────────────────────────────────────────────────────────────

    return res.status(200).json({ message: "Verification saved", verification });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── PDI: Edit an incomplete verification ─────────────────────────────────────
export const editIncompleteVerification = async (req: Request, res: Response) => {
  try {
    const { verificationId } = req.params;
    const { verifiedQuantity, remarks } = req.body;
    const pdiId = req.userId;

    if (verifiedQuantity === undefined || verifiedQuantity === null) {
      return res.status(400).json({ message: "verifiedQuantity is required" });
    }

    const verification = await PdiVerification.findById(verificationId);
    if (!verification) {
      return res.status(404).json({ message: "Verification not found" });
    }
    if (!verification.isIncomplete) {
      return res.status(409).json({
        message: "Only incomplete verifications can be edited",
      });
    }

    const log = await ProductionLog.findById(verification.productionLog).populate("container");
    if (!log) return res.status(404).json({ message: "Linked production log not found" });

    if (verifiedQuantity > log.reportedQuantity) {
      return res.status(400).json({
        message: `verifiedQuantity (${verifiedQuantity}) cannot exceed reportedQuantity (${log.reportedQuantity})`,
      });
    }

    // Cumulative verified for this container cannot exceed the target (quantity).
    const containerForCap = log.container as any;
    const containerQty = Number(containerForCap?.quantity ?? 0);
    const priorAgg = await PdiVerification.aggregate([
      { $match: { container: containerForCap._id, productionLog: { $ne: log._id } } },
      { $group: { _id: null, total: { $sum: "$verifiedQuantity" } } },
    ]);
    const priorVerified = priorAgg[0]?.total ?? 0;
    const remainingCapacity = Math.max(0, containerQty - priorVerified);
    if (verifiedQuantity > remainingCapacity) {
      return res.status(400).json({
        message: `Verified quantity exceeds the container target. Target is ${containerQty}, already verified ${priorVerified}, so at most ${remainingCapacity} more can be verified.`,
      });
    }

    const incomplete = verifiedQuantity < log.reportedQuantity;
    const missing = log.reportedQuantity - verifiedQuantity;

    verification.verifiedQuantity = verifiedQuantity;
    verification.isIncomplete = incomplete;
    verification.missingQuantity = missing;
    if (remarks !== undefined) verification.remarks = remarks;
    verification.verifiedAt = new Date();
    verification.verifiedBy = pdiId as any;
    await verification.save();

    log.verifiedQuantity = verifiedQuantity;
    log.status = incomplete ? "incomplete" : "verified";
    await log.save();

    // ── Notifications ────────────────────────────────────────────────────────
    const containerDoc = log.container as any;
    const containerModel: string = containerDoc?.model ?? "container";
    const containerIdStr: string = containerDoc?._id?.toString() ?? "";
    const logIdStr: string = log._id.toString();

    await sendPushNotification(
      log.team,
      incomplete ? "⚠️ Verification Updated (Partial)" : "✅ Verification Updated",
      incomplete
        ? `Your report for ${containerModel} is still partial. ${missing} units unverified.`
        : `All ${verifiedQuantity} units for ${containerModel} are now verified.`,
      {
        type: incomplete ? "pdi_incomplete" : "pdi_verified",
        logId: logIdStr,
        containerId: containerIdStr,
        verifiedQuantity: String(verifiedQuantity),
      }
    );

    const admins = await User.find({ role: "admin" }).select("_id");
    if (admins.length > 0) {
      await sendPushNotificationToMany(
        admins.map((a) => a._id),
        "📋 PDI Verification Updated",
        `PDI updated verification to ${verifiedQuantity} units for ${containerModel}.${incomplete ? ` Missing: ${missing}.` : " Fully verified."}`,
        {
          type: "pdi_verified_admin",
          logId: logIdStr,
          containerId: containerIdStr,
          verifiedQuantity: String(verifiedQuantity),
        }
      );
    }

    return res.status(200).json({ message: "Verification updated", verification: istify(verification) });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── PDI: Unverify a Production Log (revert to pending) ──────────────────────
// Deletes the PDI verification record and sets the log back to "pending" so it
// re-enters the verification queue. Notifies the team and admins.
export const unverifyProductionLog = async (req: Request, res: Response) => {
  try {
    const { logId } = req.params;

    const log = await ProductionLog.findById(logId).populate("container");
    if (!log) return res.status(404).json({ message: "Production log not found" });

    const verification = await PdiVerification.findOne({ productionLog: logId });
    if (!verification && log.status === "pending") {
      return res.status(409).json({ message: "This log is already pending" });
    }

    if (verification) {
      await PdiVerification.deleteOne({ _id: verification._id });
    }

    // Revert the production log to pending
    log.verifiedQuantity = null as any;
    log.status = "pending";
    await log.save();

    // ── Notifications ──────────────────────────────────────────────────────
    const containerDoc = log.container as any;
    const containerModel: string = containerDoc?.model ?? "container";
    const containerIdStr: string = containerDoc?._id?.toString() ?? "";

    await sendPushNotification(
      log.team,
      "↩️ Verification Reverted",
      `Your report for ${containerModel} was sent back for re-verification by PDI.`,
      {
        type: "pdi_unverified",
        logId,
        containerId: containerIdStr,
      }
    );

    const admins = await User.find({ role: "admin" }).select("_id");
    if (admins.length > 0) {
      await sendPushNotificationToMany(
        admins.map((a) => a._id),
        "↩️ PDI Verification Reverted",
        `A verification for ${containerModel} was reverted to pending.`,
        {
          type: "pdi_unverified_admin",
          logId,
          containerId: containerIdStr,
        }
      );
    }

    return res.status(200).json({ message: "Verification reverted to pending", logId });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Get Verifications for a Container (Admin/PDI) ───────────────────────────
export const getVerificationsByContainer = async (req: Request, res: Response) => {
  try {
    const { containerId } = req.params;
    const { page, limit, skip } = getPagination(req.query);

    const [verifications, total, summaryVerifications] = await Promise.all([
      PdiVerification.find({ container: containerId })
        .populate("productionLog", "date reportedQuantity status")
        .populate("verifiedBy", "name email")
        .sort({ verifiedAt: -1 })
        .skip(skip)
        .limit(limit),
      PdiVerification.countDocuments({ container: containerId }),
      PdiVerification.find({ container: containerId }).select("verifiedQuantity"),
    ]);

    const rawTotalVerified = summaryVerifications.reduce((s, v) => s + v.verifiedQuantity, 0);
    // Cap at the container target — verified can never exceed it.
    const containerForCap = await Container.findById(containerId).select("quantity");
    const totalVerified = containerForCap
      ? Math.min(containerForCap.quantity ?? 0, rawTotalVerified)
      : rawTotalVerified;

    return res.status(200).json({
      verifications,
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

// ─── Get Single Verification ──────────────────────────────────────────────────
export const getVerificationByLog = async (req: Request, res: Response) => {
  try {
    const { logId } = req.params;
    const verification = await PdiVerification.findOne({ productionLog: logId })
      .populate("verifiedBy", "name email");
    if (!verification) {
      return res.status(404).json({ message: "No verification found for this log" });
    }
    return res.status(200).json({ verification });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── PDI Dashboard: Summary of pending/verified logs ────────────────────────
export const getPdiDashboard = async (req: Request, res: Response) => {
  try {
    const pdiId = req.userId;
    const { page, limit, skip } = getPagination(req.query);

    const pendingCount = await ProductionLog.countDocuments({ status: "pending" });
    const [verifiedByMe, total, penaltyContainers] = await Promise.all([
      PdiVerification.find({ verifiedBy: pdiId })
        .populate("productionLog", "date reportedQuantity")
        .populate("container", "model penaltyPerUnit quantity")
        .sort({ verifiedAt: -1 })
        .skip(skip)
        .limit(limit),
      PdiVerification.countDocuments({ verifiedBy: pdiId }),
      // Live penalty across all non-cancelled containers
      Container.find({ status: { $ne: "cancelled" } }).select("quantity penaltyPerUnit"),
    ]);

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

    return res.status(200).json({
      pendingCount,
      totalPenalty,
      totalPendingVehicles,
      recentVerifications: verifiedByMe,
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
