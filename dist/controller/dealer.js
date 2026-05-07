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
exports.deleteDealer = exports.updateDealer = exports.getDealerById = exports.getDealers = exports.createDealer = void 0;
const dealer_1 = __importDefault(require("../model/dealer"));
// CREATE dealer
const createDealer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, phone, location, showroomName } = req.body;
        if (!name) {
            res.status(400).json({ message: "Dealer name is required" });
            return;
        }
        const dealer = new dealer_1.default({ name, phone, location, showroomName });
        yield dealer.save();
        res.status(201).json({ message: "Dealer created successfully", dealer });
    }
    catch (error) {
        res.status(500).json({ message: "Error creating dealer", error: error.message });
    }
});
exports.createDealer = createDealer;
// GET all dealers
const getDealers = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { search, isActive } = req.query;
        const query = {};
        if (isActive !== undefined)
            query.isActive = isActive === "true";
        if (search)
            query.name = { $regex: search, $options: "i" };
        const dealers = yield dealer_1.default.find(query).sort({ name: 1 });
        res.status(200).json({ message: "Dealers fetched successfully", dealers });
    }
    catch (error) {
        res.status(500).json({ message: "Error fetching dealers", error: error.message });
    }
});
exports.getDealers = getDealers;
// GET single dealer
const getDealerById = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const dealer = yield dealer_1.default.findById(req.params.id);
        if (!dealer) {
            res.status(404).json({ message: "Dealer not found" });
            return;
        }
        res.status(200).json({ dealer });
    }
    catch (error) {
        res.status(500).json({ message: "Error fetching dealer", error: error.message });
    }
});
exports.getDealerById = getDealerById;
// UPDATE dealer
const updateDealer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { name, phone, location, showroomName, isActive } = req.body;
        const dealer = yield dealer_1.default.findByIdAndUpdate(req.params.id, { name, phone, location, showroomName, isActive }, { new: true, runValidators: true });
        if (!dealer) {
            res.status(404).json({ message: "Dealer not found" });
            return;
        }
        res.status(200).json({ message: "Dealer updated successfully", dealer });
    }
    catch (error) {
        res.status(500).json({ message: "Error updating dealer", error: error.message });
    }
});
exports.updateDealer = updateDealer;
// DELETE dealer
const deleteDealer = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const dealer = yield dealer_1.default.findByIdAndDelete(req.params.id);
        if (!dealer) {
            res.status(404).json({ message: "Dealer not found" });
            return;
        }
        res.status(200).json({ message: "Dealer deleted successfully" });
    }
    catch (error) {
        res.status(500).json({ message: "Error deleting dealer", error: error.message });
    }
});
exports.deleteDealer = deleteDealer;
