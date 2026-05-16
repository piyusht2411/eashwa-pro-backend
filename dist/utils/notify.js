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
exports.sendPushNotificationToMany = exports.sendPushNotification = exports.createNotificationRecord = void 0;
const admin = __importStar(require("firebase-admin"));
const user_1 = __importDefault(require("../model/user"));
const notification_1 = __importDefault(require("../model/notification"));
/**
 * Persist a notification record in the DB so the in-app notification feed has it.
 * Silently swallows errors so it never breaks the main flow.
 */
const createNotificationRecord = (recipientId, type, title, body, data) => __awaiter(void 0, void 0, void 0, function* () {
    try {
        if (!recipientId)
            return;
        yield notification_1.default.create({
            recipient: recipientId,
            type,
            title,
            body,
            data: data !== null && data !== void 0 ? data : {},
        });
    }
    catch (err) {
        console.error("[notify] DB notification write failed:", err);
    }
});
exports.createNotificationRecord = createNotificationRecord;
/**
 * Send a Firebase push notification to a single user by userId.
 * Also writes a Notification DB record for the in-app feed.
 * Silently swallows errors so it never breaks the main flow.
 */
const sendPushNotification = (userId, title, body, data) => __awaiter(void 0, void 0, void 0, function* () {
    var _a;
    const type = (_a = data === null || data === void 0 ? void 0 : data.type) !== null && _a !== void 0 ? _a : "general";
    // DB write runs in parallel with FCM send
    const dbWrite = (0, exports.createNotificationRecord)(userId, type, title, body, data);
    try {
        const user = yield user_1.default.findById(userId).select("fcmToken name");
        if (!user || !user.fcmToken) {
            yield dbWrite;
            return;
        }
        yield admin.messaging().send({
            token: user.fcmToken,
            notification: { title, body },
            data: data !== null && data !== void 0 ? data : {},
            android: { priority: "high" },
            apns: {
                payload: {
                    aps: { sound: "default", badge: 1 },
                },
            },
        });
    }
    catch (err) {
        console.error("[notify] FCM push failed:", err);
    }
    yield dbWrite;
});
exports.sendPushNotification = sendPushNotification;
/**
 * Send push notification to multiple users by their userIds.
 */
const sendPushNotificationToMany = (userIds, title, body, data) => __awaiter(void 0, void 0, void 0, function* () {
    yield Promise.allSettled(userIds.map((uid) => (0, exports.sendPushNotification)(uid, title, body, data)));
});
exports.sendPushNotificationToMany = sendPushNotificationToMany;
