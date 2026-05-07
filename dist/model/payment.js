"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const paymentEntrySchema = new mongoose_1.Schema({
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
}, { _id: false });
const paymentSchema = new mongoose_1.Schema({
    container: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Container",
        required: true,
        unique: true, // one payment ledger per container
    },
    team: {
        type: mongoose_1.Schema.Types.ObjectId,
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
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
}, { timestamps: true });
const Payment = (0, mongoose_1.model)("Payment", paymentSchema);
exports.default = Payment;
