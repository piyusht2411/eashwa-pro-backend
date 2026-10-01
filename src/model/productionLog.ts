import { Schema, model } from "mongoose";
import { IProductionLog } from "../types";

const productionLogSchema = new Schema<IProductionLog>(
  {
    container: {
      type: Schema.Types.ObjectId,
      ref: "Container",
      required: true,
    },
    team: {
      type: Schema.Types.ObjectId,
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
  },
  { timestamps: true }
);

// Each team can only submit one log per container per day
productionLogSchema.index({ container: 1, team: 1, date: 1 }, { unique: true });
// Report filters by date (optionally per team) and sorts newest first;
// the monitor counts today's logs by createdAt and status.
productionLogSchema.index({ date: -1 });
productionLogSchema.index({ team: 1, date: -1 });
productionLogSchema.index({ status: 1, createdAt: -1 });

const ProductionLog = model<IProductionLog>("ProductionLog", productionLogSchema);

export default ProductionLog;
