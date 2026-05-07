"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const mongoose_1 = require("mongoose");
const dealerSchema = new mongoose_1.Schema({
    name: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    location: { type: String, trim: true },
    showroomName: { type: String, trim: true },
    isActive: { type: Boolean, default: true },
}, { timestamps: true });
const Dealer = (0, mongoose_1.model)("Dealer", dealerSchema);
exports.default = Dealer;
