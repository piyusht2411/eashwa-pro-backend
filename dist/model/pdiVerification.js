"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const pdiVerificationSchema = new mongoose_1.Schema({
    productionLog: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "ProductionLog",
        required: true,
        unique: true, // one PDI verification per production log
    },
    container: {
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "Container",
        required: true,
    },
    verifiedBy: {
        type: mongoose_1.Schema.Types.ObjectId,
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
}, { timestamps: true });
const PdiVerification = (0, mongoose_1.model)("PdiVerification", pdiVerificationSchema);
exports.default = PdiVerification;
