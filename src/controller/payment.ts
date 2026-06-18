import { Request, Response } from "express";
import Payment from "../model/payment";
import PdiVerification from "../model/pdiVerification";
import Container from "../model/container";
import { sendPushNotification } from "../utils/notify";
import { computePenalty, getVerifiedByContainer } from "../utils/penalty";

const getPagination = (query: Request["query"]) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

// ─── Helper: recalculate totals from PDI verified data ───────────────────────
const recalcPaymentTotals = async (
  containerId: string,
  ratePerUnit: number,
  targetQuantity: number
) => {
  const verifications = await PdiVerification.find({ container: containerId });
  const rawVerifiedQty = verifications.reduce((s, v) => s + v.verifiedQuantity, 0);
  // Verified (and therefore payable) units can never exceed the container target.
  const totalVerifiedQty = Math.min(targetQuantity ?? 0, rawVerifiedQty);
  const totalAmount = totalVerifiedQty * ratePerUnit;
  return { totalVerifiedQty, totalAmount };
};

// ─── Helper: recompute a payment's display totals from LIVE PDI data ─────────
// Read endpoints persist stale stored totals (e.g. created when verified was
// over-target). This recomputes verified/amount/remaining from current PDI
// verifications, capped at the container target, without mutating the DB.
// `paidAmount` is preserved; remainingAmount may be negative if overpaid earlier.
const enrichPaymentsWithLiveTotals = async (paymentObjs: any[]) => {
  const containerIds = paymentObjs
    .map((p) => p.container?._id)
    .filter(Boolean);
  const verifiedMap = await getVerifiedByContainer(containerIds);

  return paymentObjs.map((obj) => {
    const container: any = obj.container ?? {};
    const target = container.quantity ?? 0;
    const rawVerified = verifiedMap.get(String(container._id)) ?? 0;
    const cappedVerified = Math.min(target, rawVerified);
    const rate = container.ratePerUnit ?? 0;
    const totalAmount = cappedVerified * rate;
    const paidAmount = obj.paidAmount ?? 0;

    obj.totalVerifiedQuantity = cappedVerified;
    obj.totalAmount = totalAmount;
    obj.remainingAmount = totalAmount - paidAmount;

    const { pendingQuantity, penaltyPerUnit, totalPenalty } = computePenalty(
      target,
      cappedVerified,
      container.penaltyPerUnit ?? 0
    );
    obj.pendingQuantity = pendingQuantity;
    obj.penaltyPerUnit = penaltyPerUnit;
    obj.totalPenalty = totalPenalty;
    return obj;
  });
};

// ─── Admin: Initialize or Get Payment Ledger for a Container ─────────────────
// This auto-creates the payment ledger based on verified data
export const getOrInitPayment = async (req: Request, res: Response) => {
  try {
    const { containerId } = req.params;

    const container = await Container.findById(containerId).populate("assignedTeam", "name email");
    if (!container) return res.status(404).json({ message: "Container not found" });

    const { totalVerifiedQty, totalAmount } = await recalcPaymentTotals(
      containerId,
      container.ratePerUnit,
      container.quantity
    );

    let payment = await Payment.findOne({ container: containerId });

    if (!payment) {
      payment = await Payment.create({
        container: containerId,
        team: container.assignedTeam,
        totalVerifiedQuantity: totalVerifiedQty,
        totalAmount,
        paidAmount: 0,
        remainingAmount: totalAmount,
        payments: [],
        createdBy: req.userId,
      });
    } else {
      // Refresh totals based on latest PDI data
      payment.totalVerifiedQuantity = totalVerifiedQty;
      payment.totalAmount = totalAmount;
      payment.remainingAmount = totalAmount - payment.paidAmount;
      await payment.save();
    }

    await payment.populate("container", "model quantity ratePerUnit");
    await payment.populate("team", "name email phone");

    return res.status(200).json({ payment });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Admin: Make a Payment ────────────────────────────────────────────────────
export const makePayment = async (req: Request, res: Response) => {
  try {
    const { containerId } = req.params;
    const { amount, note } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "amount must be a positive number" });
    }

    const container = await Container.findById(containerId);
    if (!container) return res.status(404).json({ message: "Container not found" });

    const { totalVerifiedQty, totalAmount } = await recalcPaymentTotals(
      containerId,
      container.ratePerUnit,
      container.quantity
    );

    let payment = await Payment.findOne({ container: containerId });
    if (!payment) {
      payment = await Payment.create({
        container: containerId,
        team: container.assignedTeam,
        totalVerifiedQuantity: totalVerifiedQty,
        totalAmount,
        paidAmount: 0,
        remainingAmount: totalAmount,
        payments: [],
        createdBy: req.userId,
      });
    }

    // Refresh totals
    payment.totalVerifiedQuantity = totalVerifiedQty;
    payment.totalAmount = totalAmount;

    const newPaidAmount = payment.paidAmount + amount;
    if (newPaidAmount > totalAmount) {
      return res.status(400).json({
        message: `Payment exceeds total amount. Max payable: ₹${totalAmount - payment.paidAmount}`,
      });
    }

    payment.payments.push({ amount, paidAt: new Date(), note: note ?? "" });
    payment.paidAmount = newPaidAmount;
    payment.remainingAmount = totalAmount - newPaidAmount;
    await payment.save();

    // Notify team about payment
    await sendPushNotification(
      container.assignedTeam,
      "Payment Received 💰",
      `₹${amount} has been paid for container: ${container.model}. Remaining: ₹${payment.remainingAmount}`,
      { containerId, type: "payment_made", amount: amount.toString() }
    );

    return res.status(200).json({ message: "Payment recorded successfully", payment });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Admin: Edit a recorded payment transaction ──────────────────────────────
export const updatePaymentEntry = async (req: Request, res: Response) => {
  try {
    const { containerId, index } = req.params;
    const { amount, note } = req.body;

    const payment = await Payment.findOne({ container: containerId });
    if (!payment) return res.status(404).json({ message: "No payment record found for this container" });

    const idx = Number(index);
    if (Number.isNaN(idx) || idx < 0 || idx >= payment.payments.length) {
      return res.status(404).json({ message: "Payment entry not found" });
    }

    if (amount !== undefined) {
      if (Number(amount) <= 0 || Number.isNaN(Number(amount))) {
        return res.status(400).json({ message: "amount must be a positive number" });
      }
      payment.payments[idx].amount = Number(amount);
    }
    if (note !== undefined) payment.payments[idx].note = note;

    // Recalc totals from live (capped) verified data + the edited entries
    const container = await Container.findById(containerId);
    const { totalVerifiedQty, totalAmount } = await recalcPaymentTotals(
      containerId,
      container?.ratePerUnit ?? 0,
      container?.quantity ?? 0
    );
    const paidAmount = payment.payments.reduce((s, p) => s + p.amount, 0);
    if (paidAmount > totalAmount) {
      return res.status(400).json({
        message: `Total paid (₹${paidAmount}) cannot exceed the amount due (₹${totalAmount})`,
      });
    }
    payment.totalVerifiedQuantity = totalVerifiedQty;
    payment.totalAmount = totalAmount;
    payment.paidAmount = paidAmount;
    payment.remainingAmount = totalAmount - paidAmount;
    await payment.save();

    return res.status(200).json({ message: "Payment entry updated", payment });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Admin: Delete a recorded payment transaction ────────────────────────────
export const deletePaymentEntry = async (req: Request, res: Response) => {
  try {
    const { containerId, index } = req.params;

    const payment = await Payment.findOne({ container: containerId });
    if (!payment) return res.status(404).json({ message: "No payment record found for this container" });

    const idx = Number(index);
    if (Number.isNaN(idx) || idx < 0 || idx >= payment.payments.length) {
      return res.status(404).json({ message: "Payment entry not found" });
    }

    payment.payments.splice(idx, 1);

    const container = await Container.findById(containerId);
    const { totalVerifiedQty, totalAmount } = await recalcPaymentTotals(
      containerId,
      container?.ratePerUnit ?? 0,
      container?.quantity ?? 0
    );
    const paidAmount = payment.payments.reduce((s, p) => s + p.amount, 0);
    payment.totalVerifiedQuantity = totalVerifiedQty;
    payment.totalAmount = totalAmount;
    payment.paidAmount = paidAmount;
    payment.remainingAmount = totalAmount - paidAmount;
    await payment.save();

    return res.status(200).json({ message: "Payment entry deleted", payment });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Get All Payment Ledgers (Admin only) ─────────────────────────────────────
export const getAllPayments = async (req: Request, res: Response) => {
  try {
    const { page, limit, skip } = getPagination(req.query);

    const [payments, total] = await Promise.all([
      Payment.find()
        .populate("container", "model quantity ratePerUnit penaltyPerUnit status date")
        .populate("team", "name email phone")
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Payment.countDocuments(),
    ]);

    // Recompute verified/amount/remaining + hold from live PDI data, capped at
    // each container target, so totals never reflect over-verified counts.
    const enrichedPayments = await enrichPaymentsWithLiveTotals(
      payments.map((p) => p.toObject())
    );

    return res.status(200).json({
      payments: enrichedPayments,
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

// ─── Team: View Own Payment Info ──────────────────────────────────────────────
export const getMyPayments = async (req: Request, res: Response) => {
  try {
    const teamId = req.userId;
    const { page, limit, skip } = getPagination(req.query);

    const [payments, total, summaryPayments] = await Promise.all([
      Payment.find({ team: teamId })
        .populate("container", "model quantity ratePerUnit penaltyPerUnit status date")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Payment.countDocuments({ team: teamId }),
      // All team payments (with container) so the summary can be capped too
      Payment.find({ team: teamId }).populate("container", "quantity ratePerUnit"),
    ]);

    // Recompute paginated list + full summary from live PDI data, capped at target
    const [enrichedPayments, enrichedSummary] = await Promise.all([
      enrichPaymentsWithLiveTotals(payments.map((p) => p.toObject())),
      enrichPaymentsWithLiveTotals(summaryPayments.map((p) => p.toObject())),
    ]);

    const summary = {
      totalEarned: enrichedSummary.reduce((s, p) => s + p.totalAmount, 0),
      totalPaid: enrichedSummary.reduce((s, p) => s + (p.paidAmount ?? 0), 0),
      totalRemaining: enrichedSummary.reduce((s, p) => s + p.remainingAmount, 0),
    };

    return res.status(200).json({
      payments: enrichedPayments,
      summary,
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

// ─── Admin: Get Payment for a specific Container ──────────────────────────────
export const getPaymentByContainer = async (req: Request, res: Response) => {
  try {
    const { containerId } = req.params;
    const payment = await Payment.findOne({ container: containerId })
      .populate("container", "model quantity ratePerUnit penaltyPerUnit status date")
      .populate("team", "name email phone");

    if (!payment) return res.status(404).json({ message: "No payment record found for this container" });

    // Recompute totals from live PDI data, capped at target.
    const [enriched] = await enrichPaymentsWithLiveTotals([payment.toObject()]);
    return res.status(200).json({ payment: enriched });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
