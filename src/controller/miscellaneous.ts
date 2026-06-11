import { Request, Response } from "express";
import Miscellaneous from "../model/miscellaneous";

const getPagination = (query: Request["query"]) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

// ─── Helper: total of all miscellaneous amounts ──────────────────────────────
const getMiscellaneousTotal = async () => {
  const agg = await Miscellaneous.aggregate([
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  return agg[0]?.total ?? 0;
};

// ─── Admin: Add a Miscellaneous Amount ────────────────────────────────────────
export const addMiscellaneous = async (req: Request, res: Response) => {
  try {
    const { amount, note } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ message: "amount must be a positive number" });
    }

    const entry = await Miscellaneous.create({
      amount,
      note: note ?? "",
      createdBy: req.userId,
    });

    const totalMiscellaneous = await getMiscellaneousTotal();

    return res.status(201).json({
      message: "Miscellaneous amount added",
      entry,
      totalMiscellaneous,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Admin: Get All Miscellaneous Entries + Total ─────────────────────────────
export const getAllMiscellaneous = async (req: Request, res: Response) => {
  try {
    const { page, limit, skip } = getPagination(req.query);

    const [entries, total, totalMiscellaneous] = await Promise.all([
      Miscellaneous.find()
        .populate("createdBy", "name email")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Miscellaneous.countDocuments(),
      getMiscellaneousTotal(),
    ]);

    return res.status(200).json({
      entries,
      totalMiscellaneous,
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

// ─── Admin: Delete a Miscellaneous Entry ──────────────────────────────────────
export const deleteMiscellaneous = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const deleted = await Miscellaneous.findByIdAndDelete(id);
    if (!deleted) {
      return res.status(404).json({ message: "Miscellaneous entry not found" });
    }

    const totalMiscellaneous = await getMiscellaneousTotal();

    return res.status(200).json({
      message: "Miscellaneous entry deleted",
      totalMiscellaneous,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
