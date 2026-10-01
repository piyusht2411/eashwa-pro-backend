"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
exports.getVisitReport = exports.exportExcel = void 0;
const visit_1 = __importDefault(require("../../model/visit"));
const expense_1 = __importDefault(require("../../model/expense"));
const helpers_1 = require("../../utils/helpers");
const expenseTotals_1 = require("../../utils/expenseTotals");
// ─── Export Excel Report ──────────────────────────────────────────────────────
const exportExcel = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { driverId } = req.query;
        const dateFilter = (0, helpers_1.buildDateFilter)(req.query);
        const visitFilter = Object.assign({}, dateFilter);
        if (driverId)
            visitFilter.driver = driverId;
        const visits = yield visit_1.default.find(visitFilter)
            .populate("driver", "name vehicleNumber")
            .sort({ startDate: -1 })
            .lean();
        if (visits.length === 0) {
            return res.status(404).json({ message: "No visits found for the given filters" });
        }
        const visitIds = visits.map((v) => v._id);
        const expenses = yield expense_1.default.find({ visit: { $in: visitIds } }).lean();
        const expenseMap = new Map(expenses.map((e) => [e.visit.toString(), e]));
        // Loaded on demand: it is as heavy as mongoose and only this export uses it.
        const { default: ExcelJS } = yield Promise.resolve().then(() => __importStar(require("exceljs")));
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
            { header: "Start Time", key: "startTime", width: 12 },
            { header: "End Date", key: "endDate", width: 14 },
            { header: "End Time", key: "endTime", width: 12 },
            { header: "Total Days", key: "totalDays", width: 12 },
            { header: "Bill Number", key: "billNumber", width: 16 },
            { header: "Distance (km)", key: "distance", width: 14 },
            { header: "Quantity", key: "quantity", width: 10 },
            ...expenseTotals_1.EXPENSE_FIELDS.flatMap(expenseColumns),
            { header: "Total Expense (₹)", key: "totalExpense", width: 18 },
            { header: "Awaiting Approval (₹)", key: "pendingExpense", width: 20 },
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
            const driver = visit.driver;
            // Recompute rather than trust stored fields, so rows written before the
            // "approved only" rule still report correctly.
            const totals = (0, expenseTotals_1.computeExpenseTotals)(expense);
            const row = sheet.addRow(Object.assign(Object.assign({ driverName: (driver === null || driver === void 0 ? void 0 : driver.name) || "", vehicleNumber: visit.vehicleNumber, destination: visit.destination, startDate: formatIstDate(visit.startDate), startTime: formatTime12h(visit.startTime), endDate: formatIstDate(visit.endDate), endTime: formatTime12h(visit.endTime), totalDays: visit.totalDays, billNumber: visit.billNumber || "", distance: visit.distance || 0, quantity: visit.quantity || 0 }, Object.assign({}, ...expenseTotals_1.EXPENSE_FIELDS.map((field) => expenseCells(field, expense)))), { totalExpense: totals.totalExpense, pendingExpense: totals.pendingExpense, pendingReimb: totals.pendingReimbursement, approvedReimb: totals.approvedReimbursement, rejectedAmt: totals.rejectedAmount }));
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
        const grandTotals = allExpenses
            .map((e) => (0, expenseTotals_1.computeExpenseTotals)(e))
            .reduce((acc, t) => ({
            totalExpense: acc.totalExpense + t.totalExpense,
            pendingExpense: acc.pendingExpense + t.pendingExpense,
            pendingReimbursement: acc.pendingReimbursement + t.pendingReimbursement,
            approvedReimbursement: acc.approvedReimbursement + t.approvedReimbursement,
            rejectedAmount: acc.rejectedAmount + t.rejectedAmount,
        }), (0, expenseTotals_1.emptyExpenseTotals)());
        const sumRow = sheet.addRow(Object.assign(Object.assign({ driverName: "TOTAL", totalDays: visits.reduce((s, v) => s + (v.totalDays || 0), 0), distance: visits.reduce((s, v) => s + (v.distance || 0), 0) }, Object.assign({}, ...expenseTotals_1.EXPENSE_FIELDS.map((field) => ({
            [field]: sumOver(allExpenses, field, itemTotal),
            [`${field}Driver`]: sumOver(allExpenses, field, expenseTotals_1.driverAmountOf),
            [`${field}Company`]: sumOver(allExpenses, field, expenseTotals_1.companyAmountOf),
        })))), { totalExpense: grandTotals.totalExpense, pendingExpense: grandTotals.pendingExpense, pendingReimb: grandTotals.pendingReimbursement, approvedReimb: grandTotals.approvedReimbursement, rejectedAmt: grandTotals.rejectedAmount }));
        sumRow.eachCell((cell) => {
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1A3C5E" } };
            cell.font = { color: { argb: "FFFFFFFF" }, bold: true };
            cell.alignment = { vertical: "middle", horizontal: "center" };
        });
        const filename = `eashwa-transport-report-${Date.now()}.xlsx`;
        res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
        res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
        yield workbook.xlsx.write(res);
        res.end();
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.exportExcel = exportExcel;
// ─── Paginated Visit Report ───────────────────────────────────────────────────
const getVisitReport = (req, res) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        const { driverId } = req.query;
        const dateFilter = (0, helpers_1.buildDateFilter)(req.query);
        const visitFilter = Object.assign({}, dateFilter);
        if (driverId)
            visitFilter.driver = driverId;
        const visits = yield visit_1.default.find(visitFilter)
            .populate("driver", "name vehicleNumber")
            .sort({ startDate: -1 })
            .lean();
        const visitIds = visits.map((v) => v._id);
        const expenses = yield expense_1.default.find({ visit: { $in: visitIds } }).lean();
        const expenseMap = new Map(expenses.map((e) => [e.visit.toString(), e]));
        const report = visits.map((visit) => {
            const expense = expenseMap.get(visit._id.toString());
            return Object.assign(Object.assign({}, visit), { 
                // Overlay freshly computed totals so a row never shows an unapproved
                // amount that was stored before the "approved only" rule.
                expense: expense ? Object.assign(Object.assign({}, expense), (0, expenseTotals_1.computeExpenseTotals)(expense)) : null });
        });
        const rollup = expenses
            .map((e) => (0, expenseTotals_1.computeExpenseTotals)(e))
            .reduce((acc, t) => ({
            totalExpense: acc.totalExpense + t.totalExpense,
            pendingExpense: acc.pendingExpense + t.pendingExpense,
            pendingReimbursement: acc.pendingReimbursement + t.pendingReimbursement,
            approvedReimbursement: acc.approvedReimbursement + t.approvedReimbursement,
            rejectedAmount: acc.rejectedAmount + t.rejectedAmount,
        }), (0, expenseTotals_1.emptyExpenseTotals)());
        const totals = Object.assign({ totalVisits: visits.length, totalDistance: visits.reduce((s, v) => s + (v.distance || 0), 0) }, rollup);
        return res.status(200).json({ report, totals });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getVisitReport = getVisitReport;
/** Column total for one expense type across every row in the sheet. */
function sumOver(expenses, type, pick) {
    return expenses.reduce((total, e) => total + pick(e === null || e === void 0 ? void 0 : e[type]), 0);
}
/** The five columns every expense type gets, plus a description for "other". */
function expenseColumns(field) {
    const label = expenseTotals_1.EXPENSE_LABELS[field];
    return [
        { header: `${label} Expense (₹)`, key: field, width: 18 },
        ...(field === "other" ? [{ header: "Other Description", key: "otherDesc", width: 22 }] : []),
        { header: `${label} — Driver Paid (₹)`, key: `${field}Driver`, width: 20 },
        { header: `${label} — Company Paid (₹)`, key: `${field}Company`, width: 22 },
        { header: `${label} Paid By`, key: `${field}PaidBy`, width: 18 },
        { header: `${label} Status`, key: `${field}Status`, width: 14 },
    ];
}
/** Row values for one expense type, keyed to match {@link expenseColumns}. */
function expenseCells(field, expense) {
    const item = expense === null || expense === void 0 ? void 0 : expense[field];
    return Object.assign(Object.assign({ [field]: itemTotal(item) }, (field === "other" ? { otherDesc: (item === null || item === void 0 ? void 0 : item.description) || "" } : {})), { [`${field}Driver`]: (0, expenseTotals_1.driverAmountOf)(item), [`${field}Company`]: (0, expenseTotals_1.companyAmountOf)(item), [`${field}PaidBy`]: formatPaidBy(item), [`${field}Status`]: formatStatus(item === null || item === void 0 ? void 0 : item.status) });
}
/** Calendar date in IST — the server runs in UTC, the visits happen in India. */
function formatIstDate(date) {
    return new Date(date).toLocaleDateString("en-IN", { timeZone: "Asia/Kolkata" });
}
/** "14:05" → "2:05 PM"; blank for date-only visits. */
function formatTime12h(time) {
    if (!time)
        return "";
    const [h, m] = time.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m))
        return "";
    return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h < 12 ? "AM" : "PM"}`;
}
/** Whole bill for an item, whichever side(s) settled it. */
function itemTotal(item) {
    return (0, expenseTotals_1.driverAmountOf)(item) + (0, expenseTotals_1.companyAmountOf)(item);
}
function formatPaidBy(item) {
    if (!item)
        return "N/A";
    const driver = (0, expenseTotals_1.driverAmountOf)(item);
    const company = (0, expenseTotals_1.companyAmountOf)(item);
    if (driver > 0 && company > 0)
        return "Driver + Company (Amit)";
    if (company > 0)
        return "Company (Amit)";
    if (driver > 0)
        return "Driver";
    return "N/A";
}
function formatStatus(status) {
    const map = {
        pending: "Pending",
        approved: "Approved",
        rejected: "Rejected",
        auto_approved: "Auto Approved",
    };
    return status ? (map[status] || status) : "N/A";
}
