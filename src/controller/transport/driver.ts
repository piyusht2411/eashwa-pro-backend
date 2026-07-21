import { Request, Response } from "express";
import Driver from "../../model/driver";
import Visit from "../../model/visit";
import Expense from "../../model/expense";
import { getPagination, buildPaginationMeta } from "../../utils/helpers";

// ─── Create Driver ────────────────────────────────────────────────────────────
export const createDriver = async (req: Request, res: Response) => {
  try {
    const { name, vehicleNumber, userId } = req.body;

    if (!name || !vehicleNumber) {
      return res
        .status(400)
        .json({ message: "name and vehicleNumber are required" });
    }

    const driver = await Driver.create({
      name: name.trim(),
      vehicleNumber: vehicleNumber.trim().toUpperCase(),
      userId: userId || null,
    });

    return res.status(201).json({
      message: "Driver created successfully",
      driver,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Get All Drivers ──────────────────────────────────────────────────────────
export const getAllDrivers = async (req: Request, res: Response) => {
  try {
    const { search, isActive } = req.query;
    const { page, limit, skip } = getPagination(req.query);

    const filters: any[] = [];
    if (isActive !== undefined) {
      if (isActive === "true") {
        filters.push({
          $or: [{ isActive: true }, { isActive: { $exists: false } }],
        });
      } else {
        filters.push({ isActive: false });
      }
    }

    if (search) {
      filters.push({
        $or: [
          { name: { $regex: search, $options: "i" } },
          { vehicleNumber: { $regex: search, $options: "i" } },
        ],
      });
    }

    const filter = filters.length > 0 ? { $and: filters } : {};
    console.log("getAllDrivers filter", filter, "page", page, "limit", limit);

    const [drivers, total] = await Promise.all([
      Driver.find(filter)
        .populate("userId", "email role")
        .sort({ name: 1 })
        .skip(skip)
        .limit(limit),
      Driver.countDocuments(filter),
    ]);

    console.log("getAllDrivers result", drivers.length, "total", total);

    return res.status(200).json({
      drivers,
      pagination: buildPaginationMeta(page, limit, total),
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Get Driver By ID ─────────────────────────────────────────────────────────
export const getDriverById = async (req: Request, res: Response) => {
  try {
    const driver = await Driver.findById(req.params.id).populate(
      "userId",
      "email role",
    );
    if (!driver) return res.status(404).json({ message: "Driver not found" });
    return res.status(200).json({ driver });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Get Driver Summary ───────────────────────────────────────────────────────
export const getDriverSummary = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { page, limit, skip } = getPagination(req.query);

    const driver = await Driver.findById(id);
    if (!driver) return res.status(404).json({ message: "Driver not found" });

    const [stats] = await Visit.aggregate([
      { $match: { driver: driver._id } },
      {
        $group: {
          _id: "$driver",
          totalVisits: { $sum: 1 },
          totalDistance: { $sum: "$distance" },
        },
      },
    ]);

    const [expenseStats] = await Expense.aggregate([
      { $match: { driver: driver._id } },
      {
        $group: {
          _id: "$driver",
          totalExpense: { $sum: "$totalExpense" },
          approvedReimbursement: { $sum: "$approvedReimbursement" },
          pendingReimbursement: { $sum: "$pendingReimbursement" },
          rejectedAmount: { $sum: "$rejectedAmount" },
        },
      },
    ]);

    const [visits, totalVisits] = await Promise.all([
      Visit.find({ driver: driver._id })
        .sort({ startDate: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Visit.countDocuments({ driver: driver._id }),
    ]);

    return res.status(200).json({
      driver,
      summary: {
        totalVisits: stats?.totalVisits ?? 0,
        totalDistance: stats?.totalDistance ?? 0,
        totalExpense: expenseStats?.totalExpense ?? 0,
        approvedReimbursement: expenseStats?.approvedReimbursement ?? 0,
        pendingReimbursement: expenseStats?.pendingReimbursement ?? 0,
        rejectedAmount: expenseStats?.rejectedAmount ?? 0,
      },
      recentVisits: visits,
      pagination: buildPaginationMeta(page, limit, totalVisits),
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Update Driver ────────────────────────────────────────────────────────────
export const updateDriver = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, vehicleNumber, userId, isActive } = req.body;

    const driver = await Driver.findById(id);
    if (!driver) return res.status(404).json({ message: "Driver not found" });

    if (name !== undefined) driver.name = name.trim();
    if (vehicleNumber !== undefined)
      driver.vehicleNumber = vehicleNumber.trim().toUpperCase();
    if (userId !== undefined) driver.userId = userId;
    if (isActive !== undefined) driver.isActive = isActive;

    await driver.save();

    return res
      .status(200)
      .json({ message: "Driver updated successfully", driver });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Delete Driver ────────────────────────────────────────────────────────────
export const deleteDriver = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const driver = await Driver.findById(id);
    if (!driver) return res.status(404).json({ message: "Driver not found" });

    const linkedVisit = await Visit.findOne({ driver: id }).select("_id");
    if (linkedVisit) {
      return res.status(400).json({
        message:
          "Cannot delete driver with existing visits. Deactivate instead.",
      });
    }

    await driver.deleteOne();
    return res.status(200).json({ message: "Driver deleted successfully" });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
