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
import dotenv from "dotenv";
import mongoose from "mongoose";
import Expense from "../model/expense";
import {
  companyAmountOf,
  computeExpenseTotals,
  driverAmountOf,
  paidByOf,
} from "../utils/expenseTotals";

dotenv.config();

const FIELDS = ["food", "cng", "other"] as const;

const run = async () => {
  const url = process.env.MONGO_URL;
  if (!url) throw new Error("MONGO_URL is not set");

  await mongoose.connect(url);
  console.log("Connected. Splitting expense amounts by payer...");

  const cursor = Expense.find({}).lean().cursor();
  let scanned = 0;
  let updated = 0;

  for await (const doc of cursor as any) {
    scanned += 1;
    const set: Record<string, unknown> = {};

    for (const field of FIELDS) {
      const item = doc[field];
      if (!item) continue;
      const driverAmount = driverAmountOf(item);
      const companyAmount = companyAmountOf(item);

      if (
        item.driverAmount === driverAmount &&
        item.companyAmount === companyAmount &&
        item.amount === driverAmount + companyAmount
      ) {
        continue;
      }

      set[`${field}.driverAmount`] = driverAmount;
      set[`${field}.companyAmount`] = companyAmount;
      set[`${field}.amount`] = driverAmount + companyAmount;
      set[`${field}.paidBy`] = paidByOf(driverAmount, companyAmount);
    }

    const totals = computeExpenseTotals(doc);
    const totalsChanged = (Object.keys(totals) as (keyof typeof totals)[]).some(
      (key) => doc[key] !== totals[key]
    );

    if (Object.keys(set).length === 0 && !totalsChanged) continue;

    await Expense.updateOne({ _id: doc._id }, { $set: { ...set, ...totals } });
    updated += 1;
    console.log(`  ${doc._id}: split ${Object.keys(set).length / 4} item(s), total ${totals.totalExpense}`);
  }

  console.log(`Done. Scanned ${scanned}, updated ${updated}.`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
