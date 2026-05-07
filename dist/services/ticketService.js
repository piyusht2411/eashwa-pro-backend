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
exports.updateTicketStatusService = exports.getAllTicketsService = exports.createTicketService = void 0;
const ticket_1 = __importDefault(require("../model/ticket"));
const createTicketService = (data) => __awaiter(void 0, void 0, void 0, function* () {
    const ticket = new ticket_1.default(data);
    yield ticket.save();
    return ticket;
});
exports.createTicketService = createTicketService;
const getAllTicketsService = (filters) => __awaiter(void 0, void 0, void 0, function* () {
    const page = parseInt(filters.page) || 1;
    const limit = parseInt(filters.limit) || 10;
    const skip = (page - 1) * limit;
    let query = {};
    if (filters.status) {
        query.status = filters.status;
    }
    if (filters.month) {
        const [year, month] = filters.month.split("-");
        const start = new Date(parseInt(year), parseInt(month) - 1, 1);
        const end = new Date(parseInt(year), parseInt(month), 1);
        query.complainDate = { $gte: start, $lt: end };
    }
    if (filters.dealerId) {
        query.dealer = filters.dealerId;
    }
    if (filters.type) {
        query.type = filters.type;
    }
    const [tickets, total] = yield Promise.all([
        ticket_1.default.find(query)
            .sort({ complainDate: -1 })
            .skip(skip)
            .limit(limit)
            .populate("submittedBy", "name email")
            .populate("dealer", "name phone location"),
        ticket_1.default.countDocuments(query),
    ]);
    const totalPages = Math.ceil(total / limit);
    return {
        tickets,
        count: tickets.length,
        pagination: {
            total,
            page,
            limit,
            totalPages,
            hasNextPage: page < totalPages,
            hasPrevPage: page > 1,
        },
    };
});
exports.getAllTicketsService = getAllTicketsService;
const updateTicketStatusService = (id, status, warrantyStatus, statusRemark) => __awaiter(void 0, void 0, void 0, function* () {
    const update = { status };
    if (warrantyStatus) {
        update.warrantyStatus = warrantyStatus;
    }
    if (statusRemark) {
        update.statusRemark = statusRemark;
    }
    else {
        update.statusRemark = undefined;
    }
    return ticket_1.default.findByIdAndUpdate(id, update, { new: true }).populate("dealer", "name phone location");
});
exports.updateTicketStatusService = updateTicketStatusService;
