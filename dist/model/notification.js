"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const notificationSchema = new mongoose_1.Schema({
    recipient: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
        index: true,
    },
    type: {
        type: String,
        required: true,
    },
    title: {
        type: String,
        required: true,
    },
    body: {
        type: String,
        required: true,
    },
    data: {
        type: mongoose_1.Schema.Types.Mixed,
        default: {},
    },
    isRead: {
        type: Boolean,
        default: false,
        index: true,
    },
}, { timestamps: true });
const Notification = (0, mongoose_1.model)("Notification", notificationSchema);
exports.default = Notification;
