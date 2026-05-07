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
exports.sendReminderToDispatch = exports.sendDeepakConfirmation = exports.sendDispatchNotification = exports.sendNotificationToUser = exports.sendAccountsVerificationNotification = void 0;
const twilio_1 = __importDefault(require("twilio"));
const dotenv_1 = __importDefault(require("dotenv"));
const user_1 = __importDefault(require("../model/user"));
dotenv_1.default.config();
const client = (0, twilio_1.default)(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const TWILIO_WHATSAPP_FROM = "whatsapp:+919911130173";
const ACCOUNTS_WHATSAPP = "whatsapp:+919917108992";
const DISPATCH_WHATSAPP = "whatsapp:+919354028632";
const DEEPAK_WHATSAPP = "whatsapp:+917011496497";
const sendAccountsVerificationNotification = (order) => __awaiter(void 0, void 0, void 0, function* () {
    const message = yield client.messages.create({
        from: TWILIO_WHATSAPP_FROM,
        to: ACCOUNTS_WHATSAPP,
        contentSid: "HX0349c1e22b81a9a073732ad6992613b2",
        contentVariables: JSON.stringify({
            "1": order.piNumber,
            "2": order.partyName,
            "3": order.showroomName,
            "4": order.location,
            "5": order.quantity.toString(),
            "6": order.totalAmount.toString(),
            "7": order.agentName,
            "8": order.amountReceived.toString(),
            "9": order.orderModel,
            "10": order.colorVariants,
            "11": order.batteryType,
            "12": order.deadline.toLocaleDateString(),
            "13": order.agentPhone,
            "14": order.dealerPhone,
            "15": order.piPdf,
        }),
    });
    return message.sid;
});
exports.sendAccountsVerificationNotification = sendAccountsVerificationNotification;
const sendNotificationToUser = (userId, messageBody, id) => __awaiter(void 0, void 0, void 0, function* () {
    const user = yield user_1.default.findById(userId);
    if (!user || !user.phone)
        return;
    const userWa = `whatsapp:+91${user.phone}`;
    yield client.messages.create({
        from: TWILIO_WHATSAPP_FROM,
        to: userWa,
        contentSid: id,
    });
});
exports.sendNotificationToUser = sendNotificationToUser;
const sendDispatchNotification = (order) => __awaiter(void 0, void 0, void 0, function* () {
    const message = yield client.messages.create({
        from: TWILIO_WHATSAPP_FROM,
        to: DISPATCH_WHATSAPP,
        contentSid: "HX8b6fabf92c6edfbcc5d1dba2793bc80d",
        contentVariables: JSON.stringify({
            "1": order.orderId,
            "2": order.piNumber,
            "3": order.partyName,
            "4": order.showroomName,
            "5": order.location,
            "6": order.quantity.toString(),
            "7": order.totalAmount.toString(),
            "8": order.agentName,
            "9": order.amountReceived.toString(),
            "10": order.orderModel,
            "11": order.colorVariants,
            "12": order.batteryType,
            "13": order.deadline.toLocaleDateString(),
            "14": order.agentPhone,
            "15": order.dealerPhone,
            "16": order.piPdf,
        }),
    });
});
exports.sendDispatchNotification = sendDispatchNotification;
const sendDeepakConfirmation = (order) => __awaiter(void 0, void 0, void 0, function* () {
    const message = yield client.messages.create({
        from: TWILIO_WHATSAPP_FROM,
        to: DEEPAK_WHATSAPP,
        contentSid: "HXb2c251788f5594e5be0aa1a3cd01021f",
        contentVariables: JSON.stringify({
            "1": order.orderId,
            "2": order.driverNumber,
            "3": order.vehicleNumber,
            "4": order.partyName,
            "5": order.location,
            "6": order.transporterName
        }),
    });
});
exports.sendDeepakConfirmation = sendDeepakConfirmation;
const sendReminderToDispatch = (order) => __awaiter(void 0, void 0, void 0, function* () {
    yield client.messages.create({
        from: TWILIO_WHATSAPP_FROM,
        to: DISPATCH_WHATSAPP,
        body: `Reminder: Order ${order.orderId} is past deadline and still pending.`,
    });
});
exports.sendReminderToDispatch = sendReminderToDispatch;
