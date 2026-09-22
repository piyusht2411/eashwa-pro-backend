import { Request, Response } from "express";
import Expense, { getInitialStatus } from "../../model/expense";
import Visit from "../../model/visit";
import Driver from "../../model/driver";
import User from "../../model/user";
import { getPortalAdminIds, sendPushNotification, sendPushNotificationToMany } from "../../utils/notify";
import { maxFoodAllowance } from "../../utils/helpers";
import { isDriverRole, resolveDriverScope } from "../../utils/driverScope";
import {
  companyAmountOf,
  driverAmountOf,
  PENDING_EXPENSE_FILTER,
} from "../../utils/expenseTotals";

type ExpenseType = "food" | "cng" | "other";

// ─── Create / Upsert Expense for a Visit ─────────────────────────────────────
export const upsertExpense = async (req: Request, res: Response) => {
  try {
    const { visitId } = req.params;
    const { food, cng, other } = req.body;

    const visit = await Visit.findById(visitId);
    if (!visit) return res.status(404).json({ message: "Visit not found" });

    const driver = await Driver.findById(visit.driver);

    let expense = await Expense.findOne({ visit: visitId });

    // The food cap applies to the whole bill, whoever settled which part of it.
    if (food !== undefined) {
      const portions = resolvePortions(food, expense?.food);
      const foodTotal = portions.driverAmount + portions.companyAmount;
      const max = maxFoodAllowance(visit.totalDays);
      if (foodTotal > max) {
        return res.status(400).json({
          message: `Food expense ₹${foodTotal} exceeds maximum allowance of ₹${max} (₹400 × ${visit.totalDays} days)`,
          maxAllowed: max,
        });
      }
    }

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
      const adminIds = await getPortalAdminIds("transport");
      if (adminIds.length > 0) {
        await sendPushNotificationToMany(
          adminIds,
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
    if (driverAmountOf(item) === 0) {
      return res.status(400).json({
        message: "Nothing to approve — this expense was paid entirely by the company",
      });
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
    // Only the driver portion is at stake in an approval decision.
    const amount = driverAmountOf(item);

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
    if (driverAmountOf(item) === 0) {
      return res.status(400).json({
        message: "Nothing to reject — this expense was paid entirely by the company",
      });
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
    // Only the driver portion is at stake in an approval decision.
    const amount = driverAmountOf(item);

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
    const expenses = await Expense.find(PENDING_EXPENSE_FILTER)
      .populate({ path: "visit", populate: { path: "driver", select: "name vehicleNumber" } })
      .populate("driver", "name vehicleNumber")
      .sort({ updatedAt: -1 });

    return res.status(200).json({ expenses });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Helpers ────────────────────────────────────────────────────

type Portions = { driverAmount: number; companyAmount: number };

const toAmount = (value: unknown) => Math.max(0, Number(value) || 0);

/**
 * Read the two payer portions out of a request payload.
 *
 * The current app sends `driverAmount` / `companyAmount`. Builds released
 * before the split send a single `amount` with a `paidBy` flag, and those are
 * still out in the field, so that shape is mapped onto one side of the split.
 * Anything the payload leaves out falls back to what is already stored.
 */
export function resolvePortions(data: any, current?: any): Portions {
  const stored: Portions = {
    driverAmount: driverAmountOf(current),
    companyAmount: companyAmountOf(current),
  };

  if (!data) return stored;

  if (data.driverAmount !== undefined || data.companyAmount !== undefined) {
    return {
      driverAmount:
        data.driverAmount !== undefined ? toAmount(data.driverAmount) : stored.driverAmount,
      companyAmount:
        data.companyAmount !== undefined ? toAmount(data.companyAmount) : stored.companyAmount,
    };
  }

  // Legacy single-amount payload.
  if (data.amount !== undefined || data.paidBy !== undefined) {
    const amount =
      data.amount !== undefined
        ? toAmount(data.amount)
        : stored.driverAmount + stored.companyAmount;
    return data.paidBy === "company"
      ? { driverAmount: 0, companyAmount: amount }
      : { driverAmount: amount, companyAmount: 0 };
  }

  return stored;
}

function buildExpenseItem(data: any, type: string) {
  const { driverAmount, companyAmount } = resolvePortions(data);
  return {
    driverAmount,
    companyAmount,
    status: getInitialStatus(driverAmount),
    description: type === "other" ? (data?.description || "") : undefined,
  };
}

function updateExpenseItem(item: any, data: any) {
  const { driverAmount, companyAmount } = resolvePortions(data, item);

  const portionsChanged =
    driverAmount !== driverAmountOf(item) || companyAmount !== companyAmountOf(item);

  item.driverAmount = driverAmount;
  item.companyAmount = companyAmount;
  if (data?.description !== undefined) item.description = data.description;

  // Re-editing the figures invalidates any decision already taken on them —
  // otherwise a changed amount would slip into the total without review.
  if (portionsChanged) {
    item.status = getInitialStatus(driverAmount);
    item.approvedBy = null;
    item.approvedAt = null;
    item.rejectedBy = null;
    item.rejectionRemark = "";
  }
}
