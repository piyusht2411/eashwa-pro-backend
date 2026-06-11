import { Schema, model } from "mongoose";
import { IMiscellaneous } from "../types";

const miscellaneousSchema = new Schema<IMiscellaneous>(
  {
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    note: {
      type: String,
      default: "",
    },
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

const Miscellaneous = model<IMiscellaneous>("Miscellaneous", miscellaneousSchema);

export default Miscellaneous;
