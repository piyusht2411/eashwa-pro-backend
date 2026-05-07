import { Schema, model } from "mongoose";
import { IPayment } from "../types";

const paymentEntrySchema = new Schema(
  {
    amount: {
      type: Number,
      required: true,
      min: 0,
    },
    paidAt: {
      type: Date,
      default: Date.now,
    },
    note: {
      type: String,
      default: "",
    },
  },
  { _id: false }
);

const paymentSchema = new Schema<IPayment>(
  {
    container: {
      type: Schema.Types.ObjectId,
      ref: "Container",
      required: true,
      unique: true, // one payment ledger per container
    },
    team: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    totalVerifiedQuantity: {
      type: Number,
      required: true,
      default: 0,
    },
    totalAmount: {
      type: Number,
      required: true,
      default: 0,
    },
    paidAmount: {
      type: Number,
      default: 0,
    },
    remainingAmount: {
      type: Number,
      default: 0,
    },
    payments: [paymentEntrySchema],
    createdBy: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

const Payment = model<IPayment>("Payment", paymentSchema);

export default Payment;
