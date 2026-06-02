"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const containerSchema = new mongoose_1.Schema({
    model: {
        type: String,
        required: true,
        trim: true,
    },
    quantity: {
        type: Number,
        required: true,
        min: 1,
    },
    date: {
        type: Date,
        required: true,
    },
    ratePerUnit: {
        type: Number,
        required: true,
        min: 0,
    },
    penaltyPerUnit: {
        type: Number,
        default: 0,
        min: 0,
    },
    assignedTeam: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    status: {
        type: String,
        enum: ["active", "completed", "cancelled"],
        default: "active",
    },
    createdBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
}, { timestamps: true });
const Container = (0, mongoose_1.model)("Container", containerSchema);
exports.default = Container;
