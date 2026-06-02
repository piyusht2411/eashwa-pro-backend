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
exports.getVerifiedByContainer = exports.computePenalty = void 0;
const pdiVerification_1 = __importDefault(require("../model/pdiVerification"));
const computePenalty = (quantity, verifiedQuantity, penaltyPerUnit) => {
    const safeRate = penaltyPerUnit !== null && penaltyPerUnit !== void 0 ? penaltyPerUnit : 0;
    const pendingQuantity = Math.max(0, (quantity !== null && quantity !== void 0 ? quantity : 0) - (verifiedQuantity !== null && verifiedQuantity !== void 0 ? verifiedQuantity : 0));
    return {
        verifiedQuantity: verifiedQuantity !== null && verifiedQuantity !== void 0 ? verifiedQuantity : 0,
        pendingQuantity,
        penaltyPerUnit: safeRate,
        totalPenalty: pendingQuantity * safeRate,
    };
};
exports.computePenalty = computePenalty;
// Returns a Map<containerId, totalVerifiedQuantity> for the given container ids.
const getVerifiedByContainer = (containerIds) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    if (containerIds.length === 0)
        return new Map();
    const agg = yield pdiVerification_1.default.aggregate([
        { $match: { container: { $in: containerIds } } },
        { $group: { _id: "$container", totalVerified: { $sum: "$verifiedQuantity" } } },
    ]);
    const map = new Map();
    for (const row of agg) {
        map.set(String(row._id), (_a = row.totalVerified) !== null && _a !== void 0 ? _a : 0);
    }
    return map;
});
exports.getVerifiedByContainer = getVerifiedByContainer;
