import { Request } from "express";
import Driver from "../model/driver";

/**
 * Data isolation for the `driver` role.
 *
 * A driver may only ever read their own visits, expenses and profile. Their own
 * Driver record is resolved from the authenticated user — never from a
 * client-supplied id, which they could otherwise swap for someone else's.
 */

export const isDriverRole = (req: Request) => req.userRole === "driver";

/** The Driver._id linked to the authenticated user, or null if none is linked. */
export const getOwnDriverId = async (req: Request): Promise<string | null> => {
  const driver = await Driver.findOne({ userId: req.userId }).select("_id");
  return driver ? String(driver._id) : null;
};

/**
 * Resolves the driver id a request is allowed to act on.
 *
 * - driver role  → always their own id (any `requestedId` is ignored)
 * - admin/accounts → `requestedId` unchanged
 *
 * Returns `{ forbidden: true }` when a driver has no linked profile, or when a
 * driver asked for someone else's id.
 */
export const resolveDriverScope = async (
  req: Request,
  requestedId?: string
): Promise<{ driverId?: string; forbidden?: boolean; message?: string }> => {
  if (!isDriverRole(req)) return { driverId: requestedId };

  const ownId = await getOwnDriverId(req);
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
};
