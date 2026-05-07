import { Schema, model, Types } from "mongoose";
import { IContainer } from "../types";

const containerSchema = new Schema<IContainer>(
  {
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
    assignedTeam: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "completed", "cancelled"],
      default: "active",
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

const Container = model<IContainer>("Container", containerSchema);

export default Container;
