import { Schema, model } from "mongoose";
import { IPdiVerification } from "../types";

const pdiVerificationSchema = new Schema<IPdiVerification>(
  {
    productionLog: {
      type: Schema.Types.ObjectId,
      ref: "ProductionLog",
      required: true,
      unique: true, // one PDI verification per production log
    },
    container: {
      type: Schema.Types.ObjectId,
      ref: "Container",
      required: true,
    },
    verifiedBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    verifiedQuantity: {
      type: Number,
      required: true,
      min: 0,
    },
    isIncomplete: {
      type: Boolean,
      default: false,
    },
    missingQuantity: {
      type: Number,
      default: 0,
    },
    remarks: {
      type: String,
      default: "",
    },
    verifiedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { timestamps: true }
);

const PdiVerification = model<IPdiVerification>("PdiVerification", pdiVerificationSchema);

export default PdiVerification;
