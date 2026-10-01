import { Schema, model } from "mongoose";
import { IVisit } from "../types";
import { calcTotalDays } from "../utils/helpers";

const visitSchema = new Schema<IVisit>(
  {
    driver: {
      type: Schema.Types.ObjectId,
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
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
  },
  { timestamps: true }
);

// Auto-calculate totalDays (IST calendar days, times ignored) before save
visitSchema.pre("save", function (next) {
  if (this.isModified("startDate") || this.isModified("endDate")) {
    this.totalDays = calcTotalDays(this.startDate, this.endDate);
  }
  next();
});

// Index for filters
visitSchema.index({ startDate: -1 });
visitSchema.index({ driver: 1, startDate: -1 });

const Visit = model<IVisit>("Visit", visitSchema);

export default Visit;
