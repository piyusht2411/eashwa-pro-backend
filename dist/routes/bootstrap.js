"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const user_1 = __importDefault(require("../model/user"));
const router = (0, express_1.Router)();
// Creates only the first admin for each portal. Remove BOOTSTRAP_SECRET after setup.
router.post("/admin", (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!process.env.BOOTSTRAP_SECRET || req.header("x-bootstrap-secret") !== process.env.BOOTSTRAP_SECRET) {
            return res.status(401).json({ message: "Invalid bootstrap secret" });
        }
        const { name, email, password, phone = "", portal } = req.body;
        if (!name || !email || !password || !portal) {
            return res.status(400).json({ message: "name, email, password and portal are required" });
        }
        if (portal !== "production" && portal !== "transport") {
            return res.status(400).json({ message: "portal must be production or transport" });
        }
        if (password.length < 6)
            return res.status(400).json({ message: "Password must be at least 6 characters" });
        if (yield user_1.default.exists({ portal, role: "admin" })) {
            return res.status(409).json({ message: `The ${portal} admin already exists` });
        }
        if (yield user_1.default.exists({ email: email.toLowerCase().trim() })) {
            return res.status(409).json({ message: "Email already registered" });
        }
        const user = yield user_1.default.create({ name, email, password, phone, portal, role: "admin" });
        return res.status(201).json({
            message: `${portal} admin created successfully`,
            user: { _id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role, portal: user.portal },
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
}));
exports.default = router;
