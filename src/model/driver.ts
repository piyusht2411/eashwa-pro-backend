import { Schema, model } from "mongoose";
import { IDriver } from "../types";

const driverSchema = new Schema<IDriver>(
  {
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
      type: Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

// Index for search by name and vehicle
driverSchema.index({ name: "text", vehicleNumber: "text" });

const Driver = model<IDriver>("Driver", driverSchema);

export default Driver;
