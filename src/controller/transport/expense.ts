import { Request, Response } from "express";
import Expense, { getInitialStatus } from "../../model/expense";
import Visit from "../../model/visit";
import Driver from "../../model/driver";
import User from "../../model/user";
import { sendPushNotification, sendPushNotificationToMany } from "../../utils/notify";
import { maxFoodAllowance } from "../../utils/helpers";
import { isDriverRole, resolveDriverScope } from "../../utils/driverScope";
import { PaidBy } from "../../types";

type ExpenseType = "food" | "cng" | "other";

// ─── Create / Upsert Expense for a Visit ─────────────────────────────────────
export const upsertExpense = async (req: Request, res: Response) => {
  try {
    const { visitId } = req.params;
    const { food, cng, other } = req.body;

    const visit = await Visit.findById(visitId);
    if (!visit) return res.status(404).json({ message: "Visit not found" });

    const driver = await Driver.findById(visit.driver);

    if (food?.amount !== undefined) {
      const max = maxFoodAllowance(visit.totalDays);
      if (food.amount > max) {
        return res.status(400).json({
          message: `Food expense ₹${food.amount} exceeds maximum allowance of ₹${max} (₹400 × ${visit.totalDays} days)`,
          maxAllowed: max,
        });
      }
    }

    let expense = await Expense.findOne({ visit: visitId });

    if (!expense) {
      expense = new Expense({
        visit: visitId,
        driver: visit.driver,
        food: buildExpenseItem(food, "food"),
        cng: buildExpenseItem(cng, "cng"),
        other: buildExpenseItem(other, "other"),
      });
    } else {
      if (food !== undefined) updateExpenseItem(expense.food, food);
      if (cng !== undefined) updateExpenseItem(expense.cng, cng);
      if (other !== undefined) updateExpenseItem(expense.other, other);
    }

    await expense.save();

    const hasPending = [expense.food, expense.cng, expense.other].some(
      (item: any) => item.status === "pending"
    );

    if (hasPending) {
      const admins = await User.find({ role: "admin", portal: "transport", isActive: true }).select("_id");
      if (admins.length > 0) {
        await sendPushNotificationToMany(
          admins.map((a) => a._id),
          "Expense Approval Required",
          `Expense for ${driver?.name || "driver"} → ${visit.destination} needs your approval`,
          { type: "approval_required", expenseId: expense._id.toString(), visitId }
        );
      }
    }

    return res.status(200).json({ message: "Expense saved successfully", expense });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Get Expense for a Visit ──────────────────────────────────────────────────
export const getExpenseByVisit = async (req: Request, res: Response) => {
  try {
    const { visitId } = req.params;

    // A driver may only read expenses on their own visits.
    if (isDriverRole(req)) {
      const visit = await Visit.findById(visitId).select("driver");
      if (!visit) return res.status(404).json({ message: "Visit not found" });
      const scope = await resolveDriverScope(req, String(visit.driver));
      if (scope.forbidden) {
        return res.status(403).json({ message: scope.message });
      }
    }

    const expense = await Expense.findOne({ visit: visitId })
      .populate("food.approvedBy", "name")
      .populate("food.rejectedBy", "name")
      .populate("cng.approvedBy", "name")
      .populate("cng.rejectedBy", "name")
      .populate("other.approvedBy", "name")
      .populate("other.rejectedBy", "name");

    if (!expense) return res.status(404).json({ message: "No expense found for this visit" });

    return res.status(200).json({ expense });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Approve Expense Item (Admin only) ────────────────────────────────────────
export const approveExpenseItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { type }: { type: ExpenseType } = req.body;

    if (!type || !["food", "cng", "other"].includes(type)) {
      return res.status(400).json({ message: "type must be food | cng | other" });
    }

    const expense = await Expense.findById(id);
    if (!expense) return res.status(404).json({ message: "Expense not found" });

    const item = (expense as any)[type];
    if (item.paidBy === "company") {
      return res.status(400).json({ message: "Company-paid expenses are auto-approved" });
    }
    if (item.status === "approved") {
      return res.status(400).json({ message: `${type} is already approved` });
    }

    item.status = "approved";
    item.approvedBy = req.userId;
    item.rejectedBy = null;
    item.rejectionRemark = "";
    item.approvedAt = new Date();

    await expense.save();

    const visit = await Visit.findById(expense.visit).populate("driver");
    const driver = visit?.driver as any;
    const amount = item.amount;

    const accountsUsers = await User.find({ role: "accounts", portal: "transport", isActive: true }).select("_id");
    const notifyIds = [...accountsUsers.map((u) => u._id)];

    if (driver?.userId) notifyIds.push(driver.userId);

    if (notifyIds.length > 0) {
      await sendPushNotificationToMany(
        notifyIds,
        "Expense Approved ✅",
        `${type.charAt(0).toUpperCase() + type.slice(1)} expense of ₹${amount} for ${driver?.name || "driver"} has been approved`,
        { type: "expense_approved", expenseId: id, expenseType: type }
      );
    }

    return res.status(200).json({ message: `${type} expense approved successfully`, expense });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Reject Expense Item (Admin only) ────────────────────────────────────────
export const rejectExpenseItem = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { type, remark }: { type: ExpenseType; remark?: string } = req.body;

    if (!type || !["food", "cng", "other"].includes(type)) {
      return res.status(400).json({ message: "type must be food | cng | other" });
    }
    if (!remark || remark.trim().length === 0) {
      return res.status(400).json({ message: "remark is required when rejecting an expense" });
    }

    const expense = await Expense.findById(id);
    if (!expense) return res.status(404).json({ message: "Expense not found" });

    const item = (expense as any)[type];
    if (item.paidBy === "company") {
      return res.status(400).json({ message: "Company-paid expenses cannot be rejected" });
    }
    if (item.status === "rejected") {
      return res.status(400).json({ message: `${type} is already rejected` });
    }

    item.status = "rejected";
    item.rejectedBy = req.userId;
    item.rejectionRemark = remark;
    item.approvedBy = null;
    item.approvedAt = null;

    await expense.save();

    const visit = await Visit.findById(expense.visit).populate("driver");
    const driver = visit?.driver as any;
    const amount = item.amount;

    const accountsUsers = await User.find({ role: "accounts", portal: "transport", isActive: true }).select("_id");
    const notifyIds = [...accountsUsers.map((u) => u._id)];
    if (driver?.userId) notifyIds.push(driver.userId);

    if (notifyIds.length > 0) {
      await sendPushNotificationToMany(
        notifyIds,
        "Expense Rejected ❌",
        `${type.charAt(0).toUpperCase() + type.slice(1)} expense of ₹${amount} for ${driver?.name || "driver"} was rejected. Reason: ${remark}`,
        { type: "expense_rejected", expenseId: id, expenseType: type, remark }
      );
    }

    return res.status(200).json({ message: `${type} expense rejected`, expense });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Get All Pending Expenses (Admin) ─────────────────────────────────────────
export const getPendingExpenses = async (req: Request, res: Response) => {
  try {
    const expenses = await Expense.find({
      $or: [
        { "food.status": "pending" },
        { "cng.status": "pending" },
        { "other.status": "pending" },
      ],
    })
      .populate({ path: "visit", populate: { path: "driver", select: "name vehicleNumber" } })
      .populate("driver", "name vehicleNumber")
      .sort({ updatedAt: -1 });

    return res.status(200).json({ expenses });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
function buildExpenseItem(data: any, type: string) {
  if (!data) {
    return { amount: 0, paidBy: "driver", status: "pending", description: "" };
  }
  const paidBy: PaidBy = data.paidBy || "driver";
  return {
    amount: data.amount || 0,
    paidBy,
    status: getInitialStatus(paidBy),
    description: type === "other" ? (data.description || "") : undefined,
  };
}

function updateExpenseItem(item: any, data: any) {
  const amountChanged =
    data.amount !== undefined && Number(data.amount) !== Number(item.amount || 0);
  const paidByChanged = data.paidBy !== undefined && data.paidBy !== item.paidBy;

  if (data.amount !== undefined) item.amount = data.amount;
  if (data.paidBy !== undefined) item.paidBy = data.paidBy;
  if (data.description !== undefined) item.description = data.description;

  // Re-editing the figure invalidates any decision already taken on it —
  // otherwise a changed amount would slip into the total without review.
  if (amountChanged || paidByChanged) {
    item.status = getInitialStatus(item.paidBy as PaidBy);
    item.approvedBy = null;
    item.approvedAt = null;
    item.rejectedBy = null;
    item.rejectionRemark = "";
  }
}
