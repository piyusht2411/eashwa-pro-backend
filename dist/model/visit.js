"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const helpers_1 = require("../utils/helpers");
const visitSchema = new mongoose_1.Schema({
    driver: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Driver",
        required: true,
        index: true,
    },
    vehicleNumber: {
        type: String,
        required: true,
        trim: true,
        uppercase: true,
    },
    destination: {
        type: String,
        required: true,
        trim: true,
    },
    startDate: {
        type: Date,
        required: true,
    },
    endDate: {
        type: Date,
        required: true,
    },
    // Optional time of day picked with each date, "HH:mm" 24h IST. Already
    // folded into startDate / endDate; kept so the app can tell a picked
    // 12:00 AM apart from a date-only visit.
    startTime: {
        type: String,
        default: "",
    },
    endTime: {
        type: String,
        default: "",
    },
    totalDays: {
        type: Number,
        min: 1,
    },
    quantity: {
        type: Number,
        default: 0,
    },
    billNumber: {
        type: String,
        default: "",
        trim: true,
    },
    distance: {
        type: Number,
        default: 0,
        min: 0,
    },
    createdBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
    updatedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        default: null,
    },
}, { timestamps: true });
// Auto-calculate totalDays (IST calendar days, times ignored) before save
visitSchema.pre("save", function (next) {
    if (this.isModified("startDate") || this.isModified("endDate")) {
        this.totalDays = (0, helpers_1.calcTotalDays)(this.startDate, this.endDate);
    }
    next();
});
// Index for filters
visitSchema.index({ startDate: -1 });
visitSchema.index({ driver: 1, startDate: -1 });
const Visit = (0, mongoose_1.model)("Visit", visitSchema);
exports.default = Visit;
