import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "../model/user";
import { Portal, Role } from "../types";

/**
 * An admin flagged with `crossPortalAccess` administers both portals from one
 * account, so the portal they are currently working in comes from the token
 * rather than from their user record.
 */
export const canUseBothPortals = (user: {
  role: Role;
  crossPortalAccess?: boolean;
}): boolean => user.role === "admin" && user.crossPortalAccess === true;

const resolveActivePortal = (
  user: { role: Role; portal: Portal; crossPortalAccess?: boolean },
  activePortalClaim: unknown
): Portal => {
  if (!canUseBothPortals(user)) return user.portal;
  return activePortalClaim === "production" || activePortalClaim === "transport"
    ? activePortalClaim
    : user.portal;
};

// ─── Authenticate JWT ─────────────────────────────────────────────────────────
export const authenticateToken = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  const authHeader = req.header("authorization");
  if (!authHeader) {
    return res.status(401).json({ message: "No token provided" });
  }

  const token = authHeader.replace("Bearer ", "").trim();

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET_KEY || "") as any;
    const user = await User.findById(decoded.userId).select(
      "_id role portal crossPortalAccess name isActive"
    );
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    if (!user.isActive) {
      return res.status(403).json({ message: "Account is deactivated. Contact admin." });
    }
    req.userId = decoded.userId;
    (req as any).userRole = user.role;
    // A cross-portal admin carries the portal they switched into on the token;
    // everyone else is pinned to the portal on their account.
    req.userPortal = resolveActivePortal(user, decoded.activePortal);
    next();
  } catch (err) {
    // Try refresh token from cookies
    const refreshToken = req.cookies?.refreshToken;
    if (!refreshToken) {
      return res.status(401).json({ message: "Token expired, please login again" });
    }
    try {
      const refreshDecoded = jwt.verify(
        refreshToken,
        process.env.JWT_REFRESH_SECRET_KEY || ""
      ) as any;

      const newAuthToken = jwt.sign(
        {
          userId: refreshDecoded.userId,
          role: refreshDecoded.role,
          portal: refreshDecoded.portal,
          activePortal: refreshDecoded.activePortal ?? refreshDecoded.portal,
        },
        process.env.JWT_SECRET_KEY || "",
        { expiresIn: "30d" }
      );
      res.header("Authorization", `Bearer ${newAuthToken}`);
      req.userId = refreshDecoded.userId;
      (req as any).userRole = refreshDecoded.role;
      req.userPortal = refreshDecoded.activePortal ?? refreshDecoded.portal;
      next();
    } catch {
      return res.status(401).json({ message: "Session expired, please login again" });
    }
  }
};

// ─── Role Guard ───────────────────────────────────────────────────────────────
export const requireRole = (...roles: Role[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await User.findById(req.userId).select("role");
    if (!user || !roles.includes(user.role)) {
      return res.status(403).json({
        message: `Access denied. Required role(s): ${roles.join(", ")}`,
      });
    }
    (req as any).userRole = user.role;
    next();
  };
};

// ─── Portal Guard ────────────────────────────────────────────────────────────
export const requirePortal = (...portals: Portal[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = await User.findById(req.userId).select("portal role crossPortalAccess");
    if (!user) {
      return res.status(403).json({
        message: `Access denied. Required portal(s): ${portals.join(", ")}`,
      });
    }

    if (portals.includes(user.portal)) {
      req.userPortal = user.portal;
      return next();
    }

    // A cross-portal admin may work outside their own portal.
    if (canUseBothPortals(user)) {
      req.userPortal = portals[0];
      return next();
    }

    return res.status(403).json({
      message: `Access denied. Required portal(s): ${portals.join(", ")}`,
    });
  };
};
