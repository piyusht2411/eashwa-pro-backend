import { Request, Response } from "express";
import Notification from "../model/notification";
import { istify } from "../utils/date";

const getPagination = (query: Request["query"]) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 30, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

// ─── List notifications for current user ─────────────────────────────────────
export const getMyNotifications = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const { page, limit, skip } = getPagination(req.query);

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find({ recipient: userId })
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Notification.countDocuments({ recipient: userId }),
      Notification.countDocuments({ recipient: userId, isRead: false }),
    ]);

    return res.status(200).json({
      notifications: istify(notifications),
      unreadCount,
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

// ─── Mark all as read ────────────────────────────────────────────────────────
export const markAllRead = async (req: Request, res: Response) => {
  try {
    const userId = req.userId;
    const result = await Notification.updateMany(
      { recipient: userId, isRead: false },
      { $set: { isRead: true } }
    );
    return res.status(200).json({
      message: "All notifications marked as read",
      modifiedCount: result.modifiedCount,
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
