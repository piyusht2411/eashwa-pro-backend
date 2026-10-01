"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.connectDB = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const connectDB = (url) => {
    console.log("Conneted to database successfully!");
    return mongoose_1.default.connect(url, {
        // The default is 30 s — a request would sit that long before failing
        // while the app shows a spinner. Fail quickly and let the user retry.
        serverSelectionTimeoutMS: 10000,
        // Small pool per serverless instance; Vercel runs many instances.
        maxPoolSize: 10,
    });
};
exports.connectDB = connectDB;
