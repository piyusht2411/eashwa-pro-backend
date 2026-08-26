import { Request, Response } from "express";
import Driver from "../../model/driver";
import Visit from "../../model/visit";
import Expense from "../../model/expense";
import { buildDateFilter } from "../../utils/helpers";
import { isDriverRole, resolveDriverScope } from "../../utils/driverScope";
import {
  expenseTotalsStage,
  expenseTotalsAccumulators,
  emptyExpenseTotals,
} from "../../utils/expenseTotals";

// ─── Admin Dashboard ──────────────────────────────────────────────────────────
export const getAdminDashboard = async (req: Request, res: Response) => {
  try {
    const dateFilter = buildDateFilter(req.query);
    const visitFilter = Object.keys(dateFilter).length > 0 ? dateFilter : {};

    const [
      totalDrivers,
      totalVisits,
      expenseStats,
      pendingApprovals,
      recentVisits,
      recentPendingExpenses,
    ] = await Promise.all([
      Driver.countDocuments({ isActive: true }),
      Visit.countDocuments(visitFilter),

      Expense.aggregate([
        expenseTotalsStage,
        { $group: { _id: null, ...expenseTotalsAccumulators } },
      ]),

      Expense.countDocuments({
        $or: [
          { "food.status": "pending" },
          { "cng.status": "pending" },
          { "other.status": "pending" },
        ],
      }),

      Visit.find(visitFilter)
        .populate("driver", "name vehicleNumber")
        .populate("createdBy", "name")
        .sort({ startDate: -1 })
        .limit(5),

      Expense.find({
        $or: [
          { "food.status": "pending" },
          { "cng.status": "pending" },
          { "other.status": "pending" },
        ],
      })
        .populate({ path: "visit", select: "destination startDate endDate totalDays" })
        .populate("driver", "name vehicleNumber")
        .sort({ updatedAt: -1 })
        .limit(5),
    ]);

    const [distanceStats] = await Visit.aggregate([
      { $match: visitFilter },
      { $group: { _id: null, totalDistance: { $sum: "$distance" } } },
    ]);

    const stats = expenseStats[0] || emptyExpenseTotals();

    return res.status(200).json({
      stats: {
        totalDrivers,
        totalVisits,
        totalDistance: distanceStats?.totalDistance ?? 0,
        totalExpense: stats.totalExpense,
        pendingExpense: stats.pendingExpense,
        pendingReimbursements: stats.pendingReimbursement,
        approvedReimbursements: stats.approvedReimbursement,
        pendingApprovals,
      },
      recentVisits,
      recentPendingExpenses,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Accounts Dashboard ───────────────────────────────────────────────────────
export const getAccountsDashboard = async (req: Request, res: Response) => {
  try {
    const dateFilter = buildDateFilter(req.query);
    const visitFilter = Object.keys(dateFilter).length > 0 ? dateFilter : {};

    const [totalDrivers, totalVisits, pendingApprovals, recentVisits] = await Promise.all([
      Driver.countDocuments({ isActive: true }),
      Visit.countDocuments(visitFilter),
      Expense.countDocuments({
        $or: [
          { "food.status": "pending" },
          { "cng.status": "pending" },
          { "other.status": "pending" },
        ],
      }),
      Visit.find(visitFilter)
        .populate("driver", "name vehicleNumber")
        .populate("createdBy", "name")
        .sort({ startDate: -1 })
        .limit(10),
    ]);

    const [expenseStats] = await Expense.aggregate([
      expenseTotalsStage,
      { $group: { _id: null, ...expenseTotalsAccumulators } },
    ]);

    return res.status(200).json({
      stats: {
        totalDrivers,
        totalVisits,
        totalExpense: expenseStats?.totalExpense ?? 0,
        pendingExpense: expenseStats?.pendingExpense ?? 0,
        pendingReimbursements: expenseStats?.pendingReimbursement ?? 0,
        approvedReimbursements: expenseStats?.approvedReimbursement ?? 0,
        pendingApprovals,
      },
      recentVisits,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Driver Dashboard ─────────────────────────────────────────────────────────
export const getDriverDashboard = async (req: Request, res: Response) => {
  try {
    const { driverId } = req.params;
    const dateFilter = buildDateFilter(req.query);

    // A driver may only read their own dashboard, whichever id they ask for.
    if (isDriverRole(req)) {
      const scope = await resolveDriverScope(req, driverId);
      if (scope.forbidden) {
        return res.status(403).json({ message: scope.message });
      }
    }

    const driver = await Driver.findById(driverId);
    if (!driver) return res.status(404).json({ message: "Driver not found" });

    const visitFilter: any = { driver: driver._id, ...dateFilter };

    const [visits, expenseStats] = await Promise.all([
      Visit.aggregate([
        { $match: visitFilter },
        {
          $group: {
            _id: "$driver",
            totalVisits: { $sum: 1 },
            totalDistance: { $sum: "$distance" },
          },
        },
      ]),

      Expense.aggregate([
        { $match: { driver: driver._id } },
        expenseTotalsStage,
        { $group: { _id: "$driver", ...expenseTotalsAccumulators } },
      ]),
    ]);

    const recentVisits = await Visit.find(visitFilter)
      .sort({ startDate: -1 })
      .limit(10)
      .lean();

    const vStats = visits[0] || { totalVisits: 0, totalDistance: 0 };
    const eStats = expenseStats[0] || emptyExpenseTotals();

    return res.status(200).json({
      driver,
      stats: {
        totalVisits: vStats.totalVisits,
        totalDistance: vStats.totalDistance,
        totalExpense: eStats.totalExpense,
        pendingExpense: eStats.pendingExpense,
        approvedReimbursements: eStats.approvedReimbursement,
        pendingBalance: eStats.pendingReimbursement,
      },
      recentVisits,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// Driver-safe dashboard: resolve the Driver record from the authenticated user.
// A driver must never supply another driver's ID.
export const getMyDriverDashboard = async (req: Request, res: Response) => {
  const driver = await Driver.findOne({ userId: req.userId, isActive: true }).select("_id");
  if (!driver) return res.status(404).json({ message: "No active driver profile is linked to this account" });
  req.params.driverId = String(driver._id);
  return getDriverDashboard(req, res);
};
