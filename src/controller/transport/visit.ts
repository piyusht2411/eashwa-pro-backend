import { Request, Response } from "express";
import Visit from "../../model/visit";
import Expense from "../../model/expense";
import Driver from "../../model/driver";
import User from "../../model/user";
import { sendPushNotification, sendPushNotificationToMany } from "../../utils/notify";
import { getPagination, buildPaginationMeta, buildDateFilter } from "../../utils/helpers";

// ─── Create Visit ─────────────────────────────────────────────────────────────
export const createVisit = async (req: Request, res: Response) => {
  try {
    const { driverId, destination, startDate, endDate, quantity, billNumber, distance, vehicleNumber } = req.body;

    if (!driverId || !destination || !startDate || !endDate) {
      return res.status(400).json({ message: "driverId, destination, startDate and endDate are required" });
    }

    const driver = await Driver.findById(driverId);
    if (!driver) return res.status(404).json({ message: "Driver not found" });

    if (new Date(endDate) < new Date(startDate)) {
      return res.status(400).json({ message: "endDate cannot be before startDate" });
    }

    const visit = await Visit.create({
      driver: driverId,
      vehicleNumber: vehicleNumber || driver.vehicleNumber,
      destination,
      startDate: new Date(startDate),
      endDate: new Date(endDate),
      quantity: quantity || 0,
      billNumber: billNumber || "",
      distance: distance || 0,
      createdBy: req.userId,
    });

    // Notify transport admins about new visit
    const admins = await User.find({ role: "admin", portal: "transport", isActive: true }).select("_id");
    if (admins.length > 0) {
      await sendPushNotificationToMany(
        admins.map((a) => a._id),
        "New Visit Created",
        `${driver.name} → ${destination} (${visit.totalDays} day${visit.totalDays > 1 ? "s" : ""})`,
        { type: "new_visit", visitId: visit._id.toString() }
      );
    }

    // Notify driver user if linked
    if (driver.userId) {
      await sendPushNotification(
        driver.userId,
        "New Visit Assigned",
        `You have a new visit to ${destination} from ${new Date(startDate).toLocaleDateString()} to ${new Date(endDate).toLocaleDateString()}`,
        { type: "visit_created", visitId: visit._id.toString() }
      );
    }

    const populated = await Visit.findById(visit._id).populate("driver", "name vehicleNumber");

    return res.status(201).json({ message: "Visit created successfully", visit: populated });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Get All Visits ───────────────────────────────────────────────────────────
export const getAllVisits = async (req: Request, res: Response) => {
  try {
    const { driverId, search } = req.query;
    const { page, limit, skip } = getPagination(req.query);

    const filter: any = { ...buildDateFilter(req.query) };
    if (driverId) filter.driver = driverId;
    if (search) {
      filter.$or = [
        { destination: { $regex: search, $options: "i" } },
        { billNumber: { $regex: search, $options: "i" } },
        { vehicleNumber: { $regex: search, $options: "i" } },
      ];
    }

    const [visits, total] = await Promise.all([
      Visit.find(filter)
        .populate("driver", "name vehicleNumber")
        .populate("createdBy", "name role")
        .sort({ startDate: -1 })
        .skip(skip)
        .limit(limit),
      Visit.countDocuments(filter),
    ]);

    return res.status(200).json({
      visits,
      pagination: buildPaginationMeta(page, limit, total),
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Get Visit By ID ──────────────────────────────────────────────────────────
export const getVisitById = async (req: Request, res: Response) => {
  try {
    const visit = await Visit.findById(req.params.id)
      .populate("driver", "name vehicleNumber userId")
      .populate("createdBy", "name role")
      .populate("updatedBy", "name role");

    if (!visit) return res.status(404).json({ message: "Visit not found" });

    const expense = await Expense.findOne({ visit: visit._id })
      .populate("food.approvedBy", "name")
      .populate("food.rejectedBy", "name")
      .populate("cng.approvedBy", "name")
      .populate("cng.rejectedBy", "name")
      .populate("other.approvedBy", "name")
      .populate("other.rejectedBy", "name");

    return res.status(200).json({ visit, expense: expense || null });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Update Visit ─────────────────────────────────────────────────────────────
export const updateVisit = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { destination, startDate, endDate, quantity, billNumber, distance, vehicleNumber } = req.body;

    const visit = await Visit.findById(id).populate("driver");
    if (!visit) return res.status(404).json({ message: "Visit not found" });

    if (destination !== undefined) visit.destination = destination;
    if (vehicleNumber !== undefined) visit.vehicleNumber = vehicleNumber.toUpperCase();
    if (quantity !== undefined) visit.quantity = quantity;
    if (billNumber !== undefined) visit.billNumber = billNumber;
    if (distance !== undefined) visit.distance = distance;

    if (startDate !== undefined) visit.startDate = new Date(startDate);
    if (endDate !== undefined) visit.endDate = new Date(endDate);

    if (visit.endDate < visit.startDate) {
      return res.status(400).json({ message: "endDate cannot be before startDate" });
    }

    (visit as any).updatedBy = req.userId;
    await visit.save();

    const driver = await Driver.findById(visit.driver);
    if (driver?.userId) {
      await sendPushNotification(
        driver.userId,
        "Visit Updated",
        `Your visit to ${visit.destination} has been updated`,
        { type: "visit_updated", visitId: visit._id.toString() }
      );
    }

    const populated = await Visit.findById(visit._id).populate("driver", "name vehicleNumber");
    return res.status(200).json({ message: "Visit updated successfully", visit: populated });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Delete Visit ─────────────────────────────────────────────────────────────
export const deleteVisit = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const visit = await Visit.findById(id);
    if (!visit) return res.status(404).json({ message: "Visit not found" });

    await Expense.deleteOne({ visit: id });
    await visit.deleteOne();

    return res.status(200).json({ message: "Visit and associated expenses deleted successfully" });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
