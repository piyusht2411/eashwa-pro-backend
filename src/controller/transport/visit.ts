import { Request, Response } from "express";
import Visit from "../../model/visit";
import Expense, { EXPENSE_ACTOR_POPULATE } from "../../model/expense";
import Driver from "../../model/driver";
import { getPortalAdminIds, sendPushNotification, sendPushNotificationToMany } from "../../utils/notify";
import {
  getPagination,
  buildPaginationMeta,
  buildDateFilter,
  buildVisitInstant,
  endsBeforeStart,
  isValidTime,
} from "../../utils/helpers";

/** Accepts "" / null to clear a time, a valid "HH:mm", or rejects with null. */
const parseTime = (value: unknown): string | null => {
  if (value === undefined || value === null || value === "") return "";
  return isValidTime(value) ? value : null;
};

/** Notification-friendly "12 Oct 2026, 9:30 am" in IST, time only when one was picked. */
const describeWhen = (date: Date, time?: string) =>
  time
    ? new Date(date).toLocaleString("en-IN", {
        timeZone: "Asia/Kolkata", day: "numeric", month: "short", year: "numeric",
        hour: "numeric", minute: "2-digit", hour12: true,
      })
    : new Date(date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
import { isDriverRole, resolveDriverScope } from "../../utils/driverScope";

// ─── Create Visit ─────────────────────────────────────────────────────────────
export const createVisit = async (req: Request, res: Response) => {
  try {
    const { driverId, destination, startDate, endDate, quantity, billNumber, distance, vehicleNumber } = req.body;

    if (!driverId || !destination || !startDate || !endDate) {
      return res.status(400).json({ message: "driverId, destination, startDate and endDate are required" });
    }

    const startTime = parseTime(req.body.startTime);
    const endTime = parseTime(req.body.endTime);
    if (startTime === null || endTime === null) {
      return res.status(400).json({ message: "startTime and endTime must be in HH:mm (24-hour) format" });
    }

    const driver = await Driver.findById(driverId);
    if (!driver) return res.status(404).json({ message: "Driver not found" });

    const start = buildVisitInstant(startDate, startTime);
    const end = buildVisitInstant(endDate, endTime);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return res.status(400).json({ message: "startDate and endDate must be valid dates" });
    }
    if (endsBeforeStart(start, end, startTime, endTime)) {
      return res.status(400).json({ message: "End cannot be before start" });
    }

    // A driver may have no vehicle assigned, so the visit must carry one explicitly.
    const resolvedVehicle = (vehicleNumber || driver.vehicleNumber || "").trim();
    if (!resolvedVehicle) {
      return res.status(400).json({
        message: "vehicleNumber is required — this driver has no vehicle assigned",
      });
    }

    const visit = await Visit.create({
      driver: driverId,
      vehicleNumber: resolvedVehicle,
      destination,
      startDate: start,
      endDate: end,
      startTime,
      endTime,
      quantity: quantity || 0,
      billNumber: billNumber || "",
      distance: distance || 0,
      createdBy: req.userId,
    });

    // Notify transport admins about new visit
    const adminIds = await getPortalAdminIds("transport");
    if (adminIds.length > 0) {
      await sendPushNotificationToMany(
        adminIds,
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
        `You have a new visit to ${destination} from ${describeWhen(start, startTime)} to ${describeWhen(end, endTime)}`,
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

    // A driver only ever sees their own visits — their id overrides any query param.
    if (isDriverRole(req)) {
      const scope = await resolveDriverScope(req, driverId as string | undefined);
      if (scope.forbidden) {
        return res.status(403).json({ message: scope.message });
      }
      filter.driver = scope.driverId;
    } else if (driverId) {
      filter.driver = driverId;
    }
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

    // A driver may only open their own visits.
    if (isDriverRole(req)) {
      const visitDriverId = String((visit.driver as any)?._id ?? visit.driver);
      const scope = await resolveDriverScope(req, visitDriverId);
      if (scope.forbidden) {
        return res.status(403).json({ message: scope.message });
      }
    }

    const expense = await Expense.findOne({ visit: visit._id }).populate(EXPENSE_ACTOR_POPULATE);

    return res.status(200).json({ visit, expense: expense || null });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Update Visit ─────────────────────────────────────────────────────────────
export const updateVisit = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { driverId, destination, startDate, endDate, quantity, billNumber, distance, vehicleNumber } = req.body;

    const visit = await Visit.findById(id);
    if (!visit) return res.status(404).json({ message: "Visit not found" });

    if (destination !== undefined && !String(destination).trim()) {
      return res.status(400).json({ message: "destination cannot be empty" });
    }
    if (vehicleNumber !== undefined && !String(vehicleNumber).trim()) {
      return res.status(400).json({ message: "vehicleNumber cannot be empty" });
    }

    // Reassigning the visit to another driver.
    const previousDriverId = String(visit.driver);
    let driverChanged = false;
    if (driverId !== undefined && String(driverId) !== previousDriverId) {
      const nextDriver = await Driver.findById(driverId);
      if (!nextDriver) return res.status(404).json({ message: "Driver not found" });
      visit.driver = nextDriver._id;
      driverChanged = true;
    }

    if (destination !== undefined) visit.destination = String(destination).trim();
    if (vehicleNumber !== undefined) visit.vehicleNumber = String(vehicleNumber).trim().toUpperCase();
    if (quantity !== undefined) visit.quantity = quantity;
    if (billNumber !== undefined) visit.billNumber = billNumber;
    if (distance !== undefined) visit.distance = distance;

    const { startTime, endTime } = req.body;
    const nextStartTime = startTime !== undefined ? parseTime(startTime) : visit.startTime || "";
    const nextEndTime = endTime !== undefined ? parseTime(endTime) : visit.endTime || "";
    if (nextStartTime === null || nextEndTime === null) {
      return res.status(400).json({ message: "startTime and endTime must be in HH:mm (24-hour) format" });
    }

    // Re-derive each instant when either its date or its time changed.
    if (startDate !== undefined || startTime !== undefined) {
      visit.startDate = buildVisitInstant(startDate ?? visit.startDate, nextStartTime);
      visit.startTime = nextStartTime;
    }
    if (endDate !== undefined || endTime !== undefined) {
      visit.endDate = buildVisitInstant(endDate ?? visit.endDate, nextEndTime);
      visit.endTime = nextEndTime;
    }
    if (Number.isNaN(visit.startDate.getTime()) || Number.isNaN(visit.endDate.getTime())) {
      return res.status(400).json({ message: "startDate and endDate must be valid dates" });
    }

    if (endsBeforeStart(visit.startDate, visit.endDate, visit.startTime, visit.endTime)) {
      return res.status(400).json({ message: "End cannot be before start" });
    }

    (visit as any).updatedBy = req.userId;
    await visit.save();

    // The expense row carries the driver too, so it follows the visit.
    if (driverChanged) {
      await Expense.updateOne({ visit: visit._id }, { $set: { driver: visit.driver } });
    }

    const driver = await Driver.findById(visit.driver);
    if (driver?.userId) {
      await sendPushNotification(
        driver.userId,
        driverChanged ? "New Visit Assigned" : "Visit Updated",
        driverChanged
          ? `You have been assigned a visit to ${visit.destination}`
          : `Your visit to ${visit.destination} has been updated`,
        { type: driverChanged ? "visit_created" : "visit_updated", visitId: visit._id.toString() }
      );
    }

    // Let the previous driver know the trip is no longer theirs.
    if (driverChanged) {
      const previousDriver = await Driver.findById(previousDriverId);
      if (previousDriver?.userId) {
        await sendPushNotification(
          previousDriver.userId,
          "Visit Reassigned",
          `Your visit to ${visit.destination} has been assigned to another driver`,
          // No visitId — they can no longer open it, so the tap should not deep-link.
          { type: "visit_updated" }
        );
      }
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
