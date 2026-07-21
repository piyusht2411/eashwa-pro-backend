import { Schema, model } from "mongoose";
import { IVisit } from "../types";

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

// Auto-calculate totalDays before save
visitSchema.pre("save", function (next) {
  if (this.isModified("startDate") || this.isModified("endDate")) {
    const start = new Date(this.startDate);
    const end = new Date(this.endDate);
    const diffMs = end.getTime() - start.getTime();
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    this.totalDays = diffDays + 1;
  }
  next();
});

// Index for filters
visitSchema.index({ startDate: -1 });
visitSchema.index({ driver: 1, startDate: -1 });

const Visit = model<IVisit>("Visit", visitSchema);

export default Visit;
