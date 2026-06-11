"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const miscellaneousSchema = new mongoose_1.Schema({
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
        type: mongoose_1.Schema.Types.ObjectId,
        ref: "User",
        required: true,
    },
}, { timestamps: true });
const Miscellaneous = (0, mongoose_1.model)("Miscellaneous", miscellaneousSchema);
exports.default = Miscellaneous;
