import { Request, Response } from "express";
import Payment from "../model/payment";
import PdiVerification from "../model/pdiVerification";
import Container from "../model/container";
import { sendPushNotification } from "../utils/notify";

const getPagination = (query: Request["query"]) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

// ─── Helper: recalculate totals from PDI verified data ───────────────────────
const recalcPaymentTotals = async (containerId: string, ratePerUnit: number) => {
  const verifications = await PdiVerification.find({ container: containerId });
  const totalVerifiedQty = verifications.reduce((s, v) => s + v.verifiedQuantity, 0);
  const totalAmount = totalVerifiedQty * ratePerUnit;
  return { totalVerifiedQty, totalAmount };
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
      container.ratePerUnit
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
      container.ratePerUnit
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

// ─── Get All Payment Ledgers (Admin only) ─────────────────────────────────────
export const getAllPayments = async (req: Request, res: Response) => {
  try {
    const { page, limit, skip } = getPagination(req.query);

    const [payments, total] = await Promise.all([
      Payment.find()
        .populate("container", "model quantity ratePerUnit status date")
        .populate("team", "name email phone")
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Payment.countDocuments(),
    ]);

    return res.status(200).json({
      payments,
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
        .populate("container", "model quantity ratePerUnit status date")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Payment.countDocuments({ team: teamId }),
      Payment.find({ team: teamId }).select("totalAmount paidAmount remainingAmount"),
    ]);

    const summary = {
      totalEarned: summaryPayments.reduce((s, p) => s + p.totalAmount, 0),
      totalPaid: summaryPayments.reduce((s, p) => s + p.paidAmount, 0),
      totalRemaining: summaryPayments.reduce((s, p) => s + p.remainingAmount, 0),
    };

    return res.status(200).json({
      payments,
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
      .populate("container", "model quantity ratePerUnit status date")
      .populate("team", "name email phone");

    if (!payment) return res.status(404).json({ message: "No payment record found for this container" });
    return res.status(200).json({ payment });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
