import { NextFunction, Request, Response } from "express";
import jwt from "jsonwebtoken";
import User from "../model/user";
import { Portal, Role } from "../types";

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
    const user = await User.findById(decoded.userId).select("_id role portal name isActive");
    if (!user) {
      return res.status(401).json({ message: "User not found" });
    }
    if (!user.isActive) {
      return res.status(403).json({ message: "Account is deactivated. Contact admin." });
    }
    req.userId = decoded.userId;
    (req as any).userRole = user.role;
    req.userPortal = user.portal;
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
        { userId: refreshDecoded.userId, role: refreshDecoded.role, portal: refreshDecoded.portal },
        process.env.JWT_SECRET_KEY || "",
        { expiresIn: "30d" }
      );
      res.header("Authorization", `Bearer ${newAuthToken}`);
      req.userId = refreshDecoded.userId;
      (req as any).userRole = refreshDecoded.role;
      req.userPortal = refreshDecoded.portal;
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
    const user = await User.findById(req.userId).select("portal");
    if (!user || !portals.includes(user.portal)) {
      return res.status(403).json({
        message: `Access denied. Required portal(s): ${portals.join(", ")}`,
      });
    }
    req.userPortal = user.portal;
    next();
  };
};
