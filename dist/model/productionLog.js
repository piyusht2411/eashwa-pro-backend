"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const productionLogSchema = new mongoose_1.Schema({
    container: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Container",
        required: true,
    },
    team: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    date: {
        type: Date,
        required: true,
    },
    reportedQuantity: {
        type: Number,
        required: true,
        min: 0,
    },
    verifiedQuantity: {
        type: Number,
        default: null,
    },
    status: {
        type: String,
        enum: ["pending", "verified", "incomplete"],
        default: "pending",
    },
}, { timestamps: true });
// Each team can only submit one log per container per day
productionLogSchema.index({ container: 1, team: 1, date: 1 }, { unique: true });
const ProductionLog = (0, mongoose_1.model)("ProductionLog", productionLogSchema);
exports.default = ProductionLog;
