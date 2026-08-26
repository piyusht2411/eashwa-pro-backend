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
exports.resolveDriverScope = exports.getOwnDriverId = exports.isDriverRole = void 0;
const driver_1 = __importDefault(require("../model/driver"));
/**
 * Data isolation for the `driver` role.
 *
 * A driver may only ever read their own visits, expenses and profile. Their own
 * Driver record is resolved from the authenticated user — never from a
 * client-supplied id, which they could otherwise swap for someone else's.
 */
const isDriverRole = (req) => req.userRole === "driver";
exports.isDriverRole = isDriverRole;
/** The Driver._id linked to the authenticated user, or null if none is linked. */
const getOwnDriverId = (req) => __awaiter(void 0, void 0, void 0, function* () {
    const driver = yield driver_1.default.findOne({ userId: req.userId }).select("_id");
    return driver ? String(driver._id) : null;
});
exports.getOwnDriverId = getOwnDriverId;
/**
 * Resolves the driver id a request is allowed to act on.
 *
 * - driver role  → always their own id (any `requestedId` is ignored)
 * - admin/accounts → `requestedId` unchanged
 *
 * Returns `{ forbidden: true }` when a driver has no linked profile, or when a
 * driver asked for someone else's id.
 */
const resolveDriverScope = (req, requestedId) => __awaiter(void 0, void 0, void 0, function* () {
    if (!(0, exports.isDriverRole)(req))
        return { driverId: requestedId };
    const ownId = yield (0, exports.getOwnDriverId)(req);
    if (!ownId) {
        return {
            forbidden: true,
            message: "No driver profile is linked to this account",
        };
    }
    if (requestedId && String(requestedId) !== ownId) {
        return { forbidden: true, message: "Access denied" };
    }
    return { driverId: ownId };
});
exports.resolveDriverScope = resolveDriverScope;
