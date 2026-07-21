import { Request, Response } from "express";
import ExcelJS from "exceljs";
import Visit from "../../model/visit";
import Expense from "../../model/expense";
import { buildDateFilter } from "../../utils/helpers";

// ─── Export Excel Report ──────────────────────────────────────────────────────
export const exportExcel = async (req: Request, res: Response) => {
  try {
    const { driverId } = req.query;
    const dateFilter = buildDateFilter(req.query);

    const visitFilter: any = { ...dateFilter };
    if (driverId) visitFilter.driver = driverId;

    const visits = await Visit.find(visitFilter)
      .populate("driver", "name vehicleNumber")
      .sort({ startDate: -1 })
      .lean();

    if (visits.length === 0) {
      return res.status(404).json({ message: "No visits found for the given filters" });
    }

    const visitIds = visits.map((v) => v._id);
    const expenses = await Expense.find({ visit: { $in: visitIds } }).lean();
    const expenseMap = new Map(expenses.map((e) => [e.visit.toString(), e]));

    const workbook = new ExcelJS.Workbook();
    workbook.creator = "E-Ashwa Transport";
    workbook.created = new Date();

    const sheet = workbook.addWorksheet("Visit Report", {
      pageSetup: { paperSize: 9, orientation: "landscape" },
    });

    sheet.columns = [
      { header: "Driver Name", key: "driverName", width: 20 },
      { header: "Vehicle No.", key: "vehicleNumber", width: 16 },
      { header: "Destination", key: "destination", width: 22 },
      { header: "Start Date", key: "startDate", width: 14 },
      { header: "End Date", key: "endDate", width: 14 },
      { header: "Total Days", key: "totalDays", width: 12 },
      { header: "Bill Number", key: "billNumber", width: 16 },
      { header: "Distance (km)", key: "distance", width: 14 },
      { header: "Quantity", key: "quantity", width: 10 },
      { header: "Food Expense (₹)", key: "food", width: 18 },
      { header: "Food Paid By", key: "foodPaidBy", width: 14 },
      { header: "Food Status", key: "foodStatus", width: 14 },
      { header: "CNG Expense (₹)", key: "cng", width: 18 },
      { header: "CNG Paid By", key: "cngPaidBy", width: 14 },
      { header: "CNG Status", key: "cngStatus", width: 14 },
      { header: "Other Expense (₹)", key: "other", width: 18 },
      { header: "Other Description", key: "otherDesc", width: 22 },
      { header: "Other Paid By", key: "otherPaidBy", width: 14 },
      { header: "Other Status", key: "otherStatus", width: 14 },
      { header: "Total Expense (₹)", key: "totalExpense", width: 18 },
      { header: "Pending Reimb. (₹)", key: "pendingReimb", width: 18 },
      { header: "Approved Reimb. (₹)", key: "approvedReimb", width: 20 },
      { header: "Rejected Amt. (₹)", key: "rejectedAmt", width: 18 },
    ];

    const headerRow = sheet.getRow(1);
    headerRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A3C5E" } };
      cell.font = { color: { argb: "FFFFFFFF" }, bold: true, size: 11 };
      cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
      cell.border = {
        top: { style: "thin" }, left: { style: "thin" },
        bottom: { style: "thin" }, right: { style: "thin" },
      };
    });
    headerRow.height = 30;

    visits.forEach((visit, index) => {
      const expense = expenseMap.get(visit._id.toString());
      const driver = visit.driver as any;

      const row = sheet.addRow({
        driverName: driver?.name || "",
        vehicleNumber: visit.vehicleNumber,
        destination: visit.destination,
        startDate: new Date(visit.startDate).toLocaleDateString("en-IN"),
        endDate: new Date(visit.endDate).toLocaleDateString("en-IN"),
        totalDays: visit.totalDays,
        billNumber: visit.billNumber || "",
        distance: visit.distance || 0,
        quantity: visit.quantity || 0,
        food: expense?.food?.amount ?? 0,
        foodPaidBy: formatPaidBy(expense?.food?.paidBy),
        foodStatus: formatStatus(expense?.food?.status),
        cng: expense?.cng?.amount ?? 0,
        cngPaidBy: formatPaidBy(expense?.cng?.paidBy),
        cngStatus: formatStatus(expense?.cng?.status),
        other: expense?.other?.amount ?? 0,
        otherDesc: (expense?.other as any)?.description || "",
        otherPaidBy: formatPaidBy(expense?.other?.paidBy),
        otherStatus: formatStatus(expense?.other?.status),
        totalExpense: expense?.totalExpense ?? 0,
        pendingReimb: expense?.pendingReimbursement ?? 0,
        approvedReimb: expense?.approvedReimbursement ?? 0,
        rejectedAmt: expense?.rejectedAmount ?? 0,
      });

      const bgColor = index % 2 === 0 ? "FFFAFAFA" : "FFE8F4FD";
      row.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: bgColor } };
        cell.alignment = { vertical: "middle", horizontal: "center" };
        cell.border = {
          top: { style: "thin", color: { argb: "FFD9D9D9" } },
          left: { style: "thin", color: { argb: "FFD9D9D9" } },
          bottom: { style: "thin", color: { argb: "FFD9D9D9" } },
          right: { style: "thin", color: { argb: "FFD9D9D9" } },
        };
      });
    });

    const allExpenses = expenses;
    const sumRow = sheet.addRow({
      driverName: "TOTAL",
      totalDays: visits.reduce((s, v) => s + (v.totalDays || 0), 0),
      distance: visits.reduce((s, v) => s + (v.distance || 0), 0),
      food: allExpenses.reduce((s, e) => s + (e.food?.amount || 0), 0),
      cng: allExpenses.reduce((s, e) => s + (e.cng?.amount || 0), 0),
      other: allExpenses.reduce((s, e) => s + (e.other?.amount || 0), 0),
      totalExpense: allExpenses.reduce((s, e) => s + (e.totalExpense || 0), 0),
      pendingReimb: allExpenses.reduce((s, e) => s + (e.pendingReimbursement || 0), 0),
      approvedReimb: allExpenses.reduce((s, e) => s + (e.approvedReimbursement || 0), 0),
      rejectedAmt: allExpenses.reduce((s, e) => s + (e.rejectedAmount || 0), 0),
    });

    sumRow.eachCell((cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A3C5E" } };
      cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
      cell.alignment = { vertical: "middle", horizontal: "center" };
    });

    const filename = `eashwa-transport-report-${Date.now()}.xlsx`;
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);

    await workbook.xlsx.write(res);
    res.end();
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Paginated Visit Report ───────────────────────────────────────────────────
export const getVisitReport = async (req: Request, res: Response) => {
  try {
    const { driverId } = req.query;
    const dateFilter = buildDateFilter(req.query);

    const visitFilter: any = { ...dateFilter };
    if (driverId) visitFilter.driver = driverId;

    const visits = await Visit.find(visitFilter)
      .populate("driver", "name vehicleNumber")
      .sort({ startDate: -1 })
      .lean();

    const visitIds = visits.map((v) => v._id);
    const expenses = await Expense.find({ visit: { $in: visitIds } }).lean();
    const expenseMap = new Map(expenses.map((e) => [e.visit.toString(), e]));

    const report = visits.map((visit) => ({
      ...visit,
      expense: expenseMap.get(visit._id.toString()) || null,
    }));

    const totals = {
      totalVisits: visits.length,
      totalDistance: visits.reduce((s, v) => s + (v.distance || 0), 0),
      totalExpense: expenses.reduce((s, e) => s + (e.totalExpense || 0), 0),
      pendingReimbursement: expenses.reduce((s, e) => s + (e.pendingReimbursement || 0), 0),
      approvedReimbursement: expenses.reduce((s, e) => s + (e.approvedReimbursement || 0), 0),
    };

    return res.status(200).json({ report, totals });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

function formatPaidBy(paidBy?: string): string {
  if (!paidBy) return "N/A";
  return paidBy === "company" ? "Company (Amit)" : "Driver";
}

function formatStatus(status?: string): string {
  const map: Record<string, string> = {
    pending: "Pending",
    approved: "Approved",
    rejected: "Rejected",
    auto_approved: "Auto Approved",
  };
  return status ? (map[status] || status) : "N/A";
}
