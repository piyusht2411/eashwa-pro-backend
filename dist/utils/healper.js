"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.convertRowToLead = exports.validateLeadData = exports.headerMapping = void 0;
const mongoose_1 = require("mongoose");
exports.headerMapping = {
    "Lead Date": "leadDate",
    "Calling Date": "callingDate",
    "Agent Name": "agentName",
    "Customer Name": "customerName",
    "Mobile No": "mobileNumber",
    Occupation: "occupation",
    Location: "location",
    Town: "town",
    State: "state",
    Status: "status",
    Remark: "remark",
    "Interested & Not Interested": "interestedAndNotInterested",
    "Office Visit Required": "officeVisitRequired",
};
const validateLeadData = (data) => {
    // Add specific validation for mobile number
    if (!data["Mobile No"] ||
        String(data["Mobile No"]).toLowerCase() === "undefined" ||
        String(data["Mobile No"]).trim() === "") {
        return false;
    }
    return Object.keys(exports.headerMapping).every((header) => {
        const value = data[header];
        return value !== undefined && value !== null && value !== "";
    });
};
exports.validateLeadData = validateLeadData;
const convertRowToLead = (row, userId) => {
    var _a;
    const mobileNo = row["Mobile No"];
    if (!mobileNo ||
        String(mobileNo).toLowerCase() === "undefined" ||
        String(mobileNo).trim() === "") {
        throw new Error("Invalid mobile number");
    }
    const cleanMobileNumber = String(mobileNo).replace(/[^0-9]/g, "");
    if (cleanMobileNumber.length < 10 || cleanMobileNumber.length > 15) {
        throw new Error("Invalid mobile number length");
    }
    return {
        leadDate: new Date(row["Lead Date"]),
        callingDate: new Date(row["Calling Date"]),
        agentName: String(row["Agent Name"]).trim(),
        customerName: String(row["Customer Name"]).trim(),
        mobileNumber: cleanMobileNumber,
        occupation: String(row["Occupation"]).trim(),
        location: String(row["Location"]).trim(),
        town: String(row["Town"]).trim(),
        state: String(row["State"]).trim(),
        status: String(row["Status"]).trim(),
        remark: String(row["Remark"]).trim(),
        interestedAndNotInterested: String(row["Interested & Not Interested"]).trim(),
        officeVisitRequired: ((_a = row["Office Visit Required"]) === null || _a === void 0 ? void 0 : _a.toString().toLowerCase()) === "yes" ||
            row["Office Visit Required"] === true ||
            row["Office Visit Required"] === 1,
        leadBy: new mongoose_1.Types.ObjectId(userId),
        isTargetLead: false,
    };
};
exports.convertRowToLead = convertRowToLead;
