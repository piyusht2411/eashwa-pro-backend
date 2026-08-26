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
var __asyncValues = (this && this.__asyncValues) || function (o) {
    if (!Symbol.asyncIterator) throw new TypeError("Symbol.asyncIterator is not defined.");
    var m = o[Symbol.asyncIterator], i;
    return m ? m.call(o) : (o = typeof __values === "function" ? __values(o) : o[Symbol.iterator](), i = {}, verb("next"), verb("throw"), verb("return"), i[Symbol.asyncIterator] = function () { return this; }, i);
    function verb(n) { i[n] = o[n] && function (v) { return new Promise(function (resolve, reject) { v = o[n](v), settle(resolve, reject, v.done, v.value); }); }; }
    function settle(resolve, reject, d, v) { Promise.resolve(v).then(function(v) { resolve({ value: v, done: d }); }, reject); }
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/**
 * One-time backfill: recompute stored expense totals under the rule that only
 * approved / auto-approved items count towards `totalExpense`.
 *
 * Run with:  npx ts-node ./src/scripts/recalcExpenseTotals.ts
 */
const dotenv_1 = __importDefault(require("dotenv"));
const mongoose_1 = __importDefault(require("mongoose"));
const expense_1 = __importDefault(require("../model/expense"));
const expenseTotals_1 = require("../utils/expenseTotals");
dotenv_1.default.config();
const run = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a, e_1, _b, _c;
    const url = process.env.MONGO_URL;
    if (!url)
        throw new Error("MONGO_URL is not set");
    yield mongoose_1.default.connect(url);
    console.log("Connected. Recalculating expense totals...");
    const cursor = expense_1.default.find({}).cursor();
    let scanned = 0;
    let updated = 0;
    try {
        for (var _d = true, cursor_1 = __asyncValues(cursor), cursor_1_1; cursor_1_1 = yield cursor_1.next(), _a = cursor_1_1.done, !_a; _d = true) {
            _c = cursor_1_1.value;
            _d = false;
            const doc = _c;
            scanned += 1;
            const totals = (0, expenseTotals_1.computeExpenseTotals)(doc);
            const changed = doc.totalExpense !== totals.totalExpense ||
                doc.pendingExpense !== totals.pendingExpense ||
                doc.pendingReimbursement !== totals.pendingReimbursement ||
                doc.approvedReimbursement !== totals.approvedReimbursement ||
                doc.rejectedAmount !== totals.rejectedAmount;
            if (!changed)
                continue;
            yield expense_1.default.updateOne({ _id: doc._id }, { $set: totals });
            updated += 1;
            console.log(`  ${doc._id}: total ${doc.totalExpense} -> ${totals.totalExpense}`);
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (!_d && !_a && (_b = cursor_1.return)) yield _b.call(cursor_1);
        }
        finally { if (e_1) throw e_1.error; }
    }
    console.log(`Done. Scanned ${scanned}, updated ${updated}.`);
    yield mongoose_1.default.disconnect();
});
run().catch((err) => {
    console.error(err);
    process.exit(1);
});
