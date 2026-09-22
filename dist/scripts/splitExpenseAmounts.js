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
 * One-time backfill: move each expense item from the old single-amount shape
 * (`amount` + `paidBy`) onto the per-payer split (`driverAmount` +
 * `companyAmount`), then recompute the stored totals.
 *
 * Reads are already tolerant of the old shape, so this is not required for the
 * app to work — it just stops every read from having to derive the split.
 *
 * Run with:  npx ts-node ./src/scripts/splitExpenseAmounts.ts
 */
const dotenv_1 = __importDefault(require("dotenv"));
const mongoose_1 = __importDefault(require("mongoose"));
const expense_1 = __importDefault(require("../model/expense"));
const expenseTotals_1 = require("../utils/expenseTotals");
dotenv_1.default.config();
const FIELDS = ["food", "cng", "other"];
const run = () => __awaiter(void 0, void 0, void 0, function* () {
    var _a, e_1, _b, _c;
    const url = process.env.MONGO_URL;
    if (!url)
        throw new Error("MONGO_URL is not set");
    yield mongoose_1.default.connect(url);
    console.log("Connected. Splitting expense amounts by payer...");
    const cursor = expense_1.default.find({}).lean().cursor();
    let scanned = 0;
    let updated = 0;
    try {
        for (var _d = true, _e = __asyncValues(cursor), _f; _f = yield _e.next(), _a = _f.done, !_a; _d = true) {
            _c = _f.value;
            _d = false;
            const doc = _c;
            scanned += 1;
            const set = {};
            for (const field of FIELDS) {
                const item = doc[field];
                if (!item)
                    continue;
                const driverAmount = (0, expenseTotals_1.driverAmountOf)(item);
                const companyAmount = (0, expenseTotals_1.companyAmountOf)(item);
                if (item.driverAmount === driverAmount &&
                    item.companyAmount === companyAmount &&
                    item.amount === driverAmount + companyAmount) {
                    continue;
                }
                set[`${field}.driverAmount`] = driverAmount;
                set[`${field}.companyAmount`] = companyAmount;
                set[`${field}.amount`] = driverAmount + companyAmount;
                set[`${field}.paidBy`] = (0, expenseTotals_1.paidByOf)(driverAmount, companyAmount);
            }
            const totals = (0, expenseTotals_1.computeExpenseTotals)(doc);
            const totalsChanged = Object.keys(totals).some((key) => doc[key] !== totals[key]);
            if (Object.keys(set).length === 0 && !totalsChanged)
                continue;
            yield expense_1.default.updateOne({ _id: doc._id }, { $set: Object.assign(Object.assign({}, set), totals) });
            updated += 1;
            console.log(`  ${doc._id}: split ${Object.keys(set).length / 4} item(s), total ${totals.totalExpense}`);
        }
    }
    catch (e_1_1) { e_1 = { error: e_1_1 }; }
    finally {
        try {
            if (!_d && !_a && (_b = _e.return)) yield _b.call(_e);
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
