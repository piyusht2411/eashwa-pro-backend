"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const driverSchema = new mongoose_1.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
    },
    vehicleNumber: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
    },
    userId: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
    isActive: {
        type: Boolean,
        default: true,
    },
}, { timestamps: true });
// Index for search by name and vehicle
driverSchema.index({ name: "text", vehicleNumber: "text" });
const Driver = (0, mongoose_1.model)("Driver", driverSchema);
exports.default = Driver;
