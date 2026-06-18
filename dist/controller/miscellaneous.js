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
exports.deleteMiscellaneous = exports.updateMiscellaneous = exports.getAllMiscellaneous = exports.addMiscellaneous = void 0;
const miscellaneous_1 = __importDefault(require("../model/miscellaneous"));
const getPagination = (query) => {
    const page = Math.max(Number(query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;
    return { page, limit, skip };
};
// ─── Helper: total of all miscellaneous amounts ──────────────────────────────
const getMiscellaneousTotal = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a, _b;
    const agg = yield miscellaneous_1.default.aggregate([
        { $group: { _id: null, total: { $sum: "$amount" } } },
    ]);
    return (_b = (_a = agg[0]) === null || _a === void 0 ? void 0 : _a.total) !== null && _b !== void 0 ? _b : 0;
});
// ─── Admin: Add a Miscellaneous Amount ────────────────────────────────────────
const addMiscellaneous = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { amount, note } = req.body;
        if (!amount || amount <= 0) {
            return res.status(400).json({ message: "amount must be a positive number" });
        }
        const entry = yield miscellaneous_1.default.create({
            amount,
            note: note !== null && note !== void 0 ? note : "",
            createdBy: req.userId,
        });
        const totalMiscellaneous = yield getMiscellaneousTotal();
        return res.status(201).json({
            message: "Miscellaneous amount added",
            entry,
            totalMiscellaneous,
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.addMiscellaneous = addMiscellaneous;
// ─── Admin: Get All Miscellaneous Entries + Total ─────────────────────────────
const getAllMiscellaneous = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { page, limit, skip } = getPagination(req.query);
        const [entries, total, totalMiscellaneous] = yield Promise.all([
            miscellaneous_1.default.find()
                .populate("createdBy", "name email")
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit),
            miscellaneous_1.default.countDocuments(),
            getMiscellaneousTotal(),
        ]);
        return res.status(200).json({
            entries,
            totalMiscellaneous,
            pagination: {
                page,
                limit,
                total,
                totalPages: Math.ceil(total / limit),
                hasNextPage: page * limit < total,
            },
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getAllMiscellaneous = getAllMiscellaneous;
// ─── Admin: Update a Miscellaneous Entry ──────────────────────────────────────
const updateMiscellaneous = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const { amount, note } = req.body;
        const update = {};
        if (amount !== undefined) {
            if (Number(amount) <= 0 || Number.isNaN(Number(amount))) {
                return res.status(400).json({ message: "amount must be a positive number" });
            }
            update.amount = Number(amount);
        }
        if (note !== undefined)
            update.note = note;
        if (Object.keys(update).length === 0) {
            return res.status(400).json({ message: "No valid fields to update" });
        }
        const entry = yield miscellaneous_1.default.findByIdAndUpdate(id, update, { new: true }).populate("createdBy", "name email");
        if (!entry) {
            return res.status(404).json({ message: "Miscellaneous entry not found" });
        }
        const totalMiscellaneous = yield getMiscellaneousTotal();
        return res.status(200).json({
            message: "Miscellaneous entry updated",
            entry,
            totalMiscellaneous,
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.updateMiscellaneous = updateMiscellaneous;
// ─── Admin: Delete a Miscellaneous Entry ──────────────────────────────────────
const deleteMiscellaneous = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { id } = req.params;
        const deleted = yield miscellaneous_1.default.findByIdAndDelete(id);
        if (!deleted) {
            return res.status(404).json({ message: "Miscellaneous entry not found" });
        }
        const totalMiscellaneous = yield getMiscellaneousTotal();
        return res.status(200).json({
            message: "Miscellaneous entry deleted",
            totalMiscellaneous,
        });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.deleteMiscellaneous = deleteMiscellaneous;
