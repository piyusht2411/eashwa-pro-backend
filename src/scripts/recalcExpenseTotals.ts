/**
 * One-time backfill: recompute stored expense totals under the rule that only
 * approved / auto-approved items count towards `totalExpense`.
 *
 * Run with:  npx ts-node ./src/scripts/recalcExpenseTotals.ts
 */
import dotenv from "dotenv";
import mongoose from "mongoose";
import Expense from "../model/expense";
import { computeExpenseTotals } from "../utils/expenseTotals";

dotenv.config();

const run = async () => {
  const url = process.env.MONGO_URL;
  if (!url) throw new Error("MONGO_URL is not set");

  await mongoose.connect(url);
  console.log("Connected. Recalculating expense totals...");

  const cursor = Expense.find({}).cursor();
  let scanned = 0;
  let updated = 0;

  for await (const doc of cursor) {
    scanned += 1;
    const totals = computeExpenseTotals(doc as any);

    const changed =
      doc.totalExpense !== totals.totalExpense ||
      doc.pendingExpense !== totals.pendingExpense ||
      doc.pendingReimbursement !== totals.pendingReimbursement ||
      doc.approvedReimbursement !== totals.approvedReimbursement ||
      doc.rejectedAmount !== totals.rejectedAmount;

    if (!changed) continue;

    await Expense.updateOne({ _id: doc._id }, { $set: totals });
    updated += 1;
    console.log(`  ${doc._id}: total ${doc.totalExpense} -> ${totals.totalExpense}`);
  }

  console.log(`Done. Scanned ${scanned}, updated ${updated}.`);
  await mongoose.disconnect();
};

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
