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
exports.getVisitReport = exports.exportExcel = void 0;
const exceljs_1 = __importDefault(require("exceljs"));
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
        const workbook = new exceljs_1.default.Workbook();
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
            { header: "Food — Driver Paid (₹)", key: "foodDriver", width: 20 },
            { header: "Food — Company Paid (₹)", key: "foodCompany", width: 22 },
            { header: "Food Paid By", key: "foodPaidBy", width: 18 },
            { header: "Food Status", key: "foodStatus", width: 14 },
            { header: "CNG Expense (₹)", key: "cng", width: 18 },
            { header: "CNG — Driver Paid (₹)", key: "cngDriver", width: 20 },
            { header: "CNG — Company Paid (₹)", key: "cngCompany", width: 22 },
            { header: "CNG Paid By", key: "cngPaidBy", width: 18 },
            { header: "CNG Status", key: "cngStatus", width: 14 },
            { header: "Other Expense (₹)", key: "other", width: 18 },
            { header: "Other Description", key: "otherDesc", width: 22 },
            { header: "Other — Driver Paid (₹)", key: "otherDriver", width: 20 },
            { header: "Other — Company Paid (₹)", key: "otherCompany", width: 22 },
            { header: "Other Paid By", key: "otherPaidBy", width: 18 },
            { header: "Other Status", key: "otherStatus", width: 14 },
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
            var _a, _b, _c, _d;
            const expense = expenseMap.get(visit._id.toString());
            const driver = visit.driver;
            // Recompute rather than trust stored fields, so rows written before the
            // "approved only" rule still report correctly.
            const totals = (0, expenseTotals_1.computeExpenseTotals)(expense);
            const row = sheet.addRow({
                driverName: (driver === null || driver === void 0 ? void 0 : driver.name) || "",
                vehicleNumber: visit.vehicleNumber,
                destination: visit.destination,
                startDate: new Date(visit.startDate).toLocaleDateString("en-IN"),
                endDate: new Date(visit.endDate).toLocaleDateString("en-IN"),
                totalDays: visit.totalDays,
                billNumber: visit.billNumber || "",
                distance: visit.distance || 0,
                quantity: visit.quantity || 0,
                food: itemTotal(expense === null || expense === void 0 ? void 0 : expense.food),
                foodDriver: (0, expenseTotals_1.driverAmountOf)(expense === null || expense === void 0 ? void 0 : expense.food),
                foodCompany: (0, expenseTotals_1.companyAmountOf)(expense === null || expense === void 0 ? void 0 : expense.food),
                foodPaidBy: formatPaidBy(expense === null || expense === void 0 ? void 0 : expense.food),
                foodStatus: formatStatus((_a = expense === null || expense === void 0 ? void 0 : expense.food) === null || _a === void 0 ? void 0 : _a.status),
                cng: itemTotal(expense === null || expense === void 0 ? void 0 : expense.cng),
                cngDriver: (0, expenseTotals_1.driverAmountOf)(expense === null || expense === void 0 ? void 0 : expense.cng),
                cngCompany: (0, expenseTotals_1.companyAmountOf)(expense === null || expense === void 0 ? void 0 : expense.cng),
                cngPaidBy: formatPaidBy(expense === null || expense === void 0 ? void 0 : expense.cng),
                cngStatus: formatStatus((_b = expense === null || expense === void 0 ? void 0 : expense.cng) === null || _b === void 0 ? void 0 : _b.status),
                other: itemTotal(expense === null || expense === void 0 ? void 0 : expense.other),
                otherDesc: ((_c = expense === null || expense === void 0 ? void 0 : expense.other) === null || _c === void 0 ? void 0 : _c.description) || "",
                otherDriver: (0, expenseTotals_1.driverAmountOf)(expense === null || expense === void 0 ? void 0 : expense.other),
                otherCompany: (0, expenseTotals_1.companyAmountOf)(expense === null || expense === void 0 ? void 0 : expense.other),
                otherPaidBy: formatPaidBy(expense === null || expense === void 0 ? void 0 : expense.other),
                otherStatus: formatStatus((_d = expense === null || expense === void 0 ? void 0 : expense.other) === null || _d === void 0 ? void 0 : _d.status),
                totalExpense: totals.totalExpense,
                pendingExpense: totals.pendingExpense,
                pendingReimb: totals.pendingReimbursement,
                approvedReimb: totals.approvedReimbursement,
                rejectedAmt: totals.rejectedAmount,
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
        const grandTotals = allExpenses
            .map((e) => (0, expenseTotals_1.computeExpenseTotals)(e))
            .reduce((acc, t) => ({
            totalExpense: acc.totalExpense + t.totalExpense,
            pendingExpense: acc.pendingExpense + t.pendingExpense,
            pendingReimbursement: acc.pendingReimbursement + t.pendingReimbursement,
            approvedReimbursement: acc.approvedReimbursement + t.approvedReimbursement,
            rejectedAmount: acc.rejectedAmount + t.rejectedAmount,
        }), (0, expenseTotals_1.emptyExpenseTotals)());
        const sumRow = sheet.addRow({
            driverName: "TOTAL",
            totalDays: visits.reduce((s, v) => s + (v.totalDays || 0), 0),
            distance: visits.reduce((s, v) => s + (v.distance || 0), 0),
            food: sumOver(allExpenses, "food", itemTotal),
            foodDriver: sumOver(allExpenses, "food", expenseTotals_1.driverAmountOf),
            foodCompany: sumOver(allExpenses, "food", expenseTotals_1.companyAmountOf),
            cng: sumOver(allExpenses, "cng", itemTotal),
            cngDriver: sumOver(allExpenses, "cng", expenseTotals_1.driverAmountOf),
            cngCompany: sumOver(allExpenses, "cng", expenseTotals_1.companyAmountOf),
            other: sumOver(allExpenses, "other", itemTotal),
            otherDriver: sumOver(allExpenses, "other", expenseTotals_1.driverAmountOf),
            otherCompany: sumOver(allExpenses, "other", expenseTotals_1.companyAmountOf),
            totalExpense: grandTotals.totalExpense,
            pendingExpense: grandTotals.pendingExpense,
            pendingReimb: grandTotals.pendingReimbursement,
            approvedReimb: grandTotals.approvedReimbursement,
            rejectedAmt: grandTotals.rejectedAmount,
        });
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
