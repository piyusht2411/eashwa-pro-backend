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
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r, _s;
            const expense = expenseMap.get(visit._id.toString());
            const driver = visit.driver;
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
                food: (_b = (_a = expense === null || expense === void 0 ? void 0 : expense.food) === null || _a === void 0 ? void 0 : _a.amount) !== null && _b !== void 0 ? _b : 0,
                foodPaidBy: formatPaidBy((_c = expense === null || expense === void 0 ? void 0 : expense.food) === null || _c === void 0 ? void 0 : _c.paidBy),
                foodStatus: formatStatus((_d = expense === null || expense === void 0 ? void 0 : expense.food) === null || _d === void 0 ? void 0 : _d.status),
                cng: (_f = (_e = expense === null || expense === void 0 ? void 0 : expense.cng) === null || _e === void 0 ? void 0 : _e.amount) !== null && _f !== void 0 ? _f : 0,
                cngPaidBy: formatPaidBy((_g = expense === null || expense === void 0 ? void 0 : expense.cng) === null || _g === void 0 ? void 0 : _g.paidBy),
                cngStatus: formatStatus((_h = expense === null || expense === void 0 ? void 0 : expense.cng) === null || _h === void 0 ? void 0 : _h.status),
                other: (_k = (_j = expense === null || expense === void 0 ? void 0 : expense.other) === null || _j === void 0 ? void 0 : _j.amount) !== null && _k !== void 0 ? _k : 0,
                otherDesc: ((_l = expense === null || expense === void 0 ? void 0 : expense.other) === null || _l === void 0 ? void 0 : _l.description) || "",
                otherPaidBy: formatPaidBy((_m = expense === null || expense === void 0 ? void 0 : expense.other) === null || _m === void 0 ? void 0 : _m.paidBy),
                otherStatus: formatStatus((_o = expense === null || expense === void 0 ? void 0 : expense.other) === null || _o === void 0 ? void 0 : _o.status),
                totalExpense: (_p = expense === null || expense === void 0 ? void 0 : expense.totalExpense) !== null && _p !== void 0 ? _p : 0,
                pendingReimb: (_q = expense === null || expense === void 0 ? void 0 : expense.pendingReimbursement) !== null && _q !== void 0 ? _q : 0,
                approvedReimb: (_r = expense === null || expense === void 0 ? void 0 : expense.approvedReimbursement) !== null && _r !== void 0 ? _r : 0,
                rejectedAmt: (_s = expense === null || expense === void 0 ? void 0 : expense.rejectedAmount) !== null && _s !== void 0 ? _s : 0,
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
            food: allExpenses.reduce((s, e) => { var _a; return s + (((_a = e.food) === null || _a === void 0 ? void 0 : _a.amount) || 0); }, 0),
            cng: allExpenses.reduce((s, e) => { var _a; return s + (((_a = e.cng) === null || _a === void 0 ? void 0 : _a.amount) || 0); }, 0),
            other: allExpenses.reduce((s, e) => { var _a; return s + (((_a = e.other) === null || _a === void 0 ? void 0 : _a.amount) || 0); }, 0),
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
        const report = visits.map((visit) => (Object.assign(Object.assign({}, visit), { expense: expenseMap.get(visit._id.toString()) || null })));
        const totals = {
            totalVisits: visits.length,
            totalDistance: visits.reduce((s, v) => s + (v.distance || 0), 0),
            totalExpense: expenses.reduce((s, e) => s + (e.totalExpense || 0), 0),
            pendingReimbursement: expenses.reduce((s, e) => s + (e.pendingReimbursement || 0), 0),
            approvedReimbursement: expenses.reduce((s, e) => s + (e.approvedReimbursement || 0), 0),
        };
        return res.status(200).json({ report, totals });
    }
    catch (err) {
        return res.status(500).json({ message: err.message });
    }
});
exports.getVisitReport = getVisitReport;
function formatPaidBy(paidBy) {
    if (!paidBy)
        return "N/A";
    return paidBy === "company" ? "Company (Amit)" : "Driver";
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
