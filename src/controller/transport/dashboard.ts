import { Request, Response } from "express";
import Driver from "../../model/driver";
import Visit from "../../model/visit";
import Expense from "../../model/expense";
import { buildDateFilter } from "../../utils/helpers";

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
        {
          $group: {
            _id: null,
            totalExpense: { $sum: "$totalExpense" },
            pendingReimbursement: { $sum: "$pendingReimbursement" },
            approvedReimbursement: { $sum: "$approvedReimbursement" },
          },
        },
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

    const stats = expenseStats[0] || {
      totalExpense: 0,
      pendingReimbursement: 0,
      approvedReimbursement: 0,
    };

    return res.status(200).json({
      stats: {
        totalDrivers,
        totalVisits,
        totalDistance: distanceStats?.totalDistance ?? 0,
        totalExpense: stats.totalExpense,
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
      { $group: { _id: null, totalExpense: { $sum: "$totalExpense" } } },
    ]);

    return res.status(200).json({
      stats: {
        totalDrivers,
        totalVisits,
        totalExpense: expenseStats?.totalExpense ?? 0,
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
        {
          $group: {
            _id: "$driver",
            totalExpense: { $sum: "$totalExpense" },
            approvedReimbursement: { $sum: "$approvedReimbursement" },
            pendingReimbursement: { $sum: "$pendingReimbursement" },
          },
        },
      ]),
    ]);

    const recentVisits = await Visit.find(visitFilter)
      .sort({ startDate: -1 })
      .limit(10)
      .lean();

    const vStats = visits[0] || { totalVisits: 0, totalDistance: 0 };
    const eStats = expenseStats[0] || {
      totalExpense: 0,
      approvedReimbursement: 0,
      pendingReimbursement: 0,
    };

    return res.status(200).json({
      driver,
      stats: {
        totalVisits: vStats.totalVisits,
        totalDistance: vStats.totalDistance,
        totalExpense: eStats.totalExpense,
        approvedReimbursements: eStats.approvedReimbursement,
        pendingBalance: eStats.pendingReimbursement,
      },
      recentVisits,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
