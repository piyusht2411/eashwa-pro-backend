"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.markAllRead = exports.getMyNotifications = void 0;
const notification_1 = __importDefault(require("../model/notification"));
const getPagination = (query) => {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 30, 1), 100);
    const skip = (page - 1) * limit;
    return { page, limit, skip };
};
// ─── List notifications for current user ─────────────────────────────────────
const getMyNotifications = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.userId;
        const { page, limit, skip } = getPagination(req.query);
        const [notifications, total, unreadCount] = yield Promise.all([
            notification_1.default.find({ recipient: userId })
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            notification_1.default.countDocuments({ recipient: userId }),
            notification_1.default.countDocuments({ recipient: userId, isRead: false }),
        ]);
        return res.status(200).json({
            notifications,
            unreadCount,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page * limit < total,
            },
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getMyNotifications = getMyNotifications;
// ─── Mark all as read ────────────────────────────────────────────────────────
const markAllRead = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const userId = req.userId;
        const result = yield notification_1.default.updateMany({ recipient: userId, isRead: false }, { $set: { isRead: true } });
        return res.status(200).json({
            message: "All notifications marked as read",
            modifiedCount: result.modifiedCount,
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.markAllRead = markAllRead;
