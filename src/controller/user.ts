import { Request, Response } from "express";
import { isValidObjectId } from "mongoose";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../model/user";
import { canUseBothPortals } from "../middleware/authMiddleware";
import { Portal } from "../types";
import Container from "../model/container";
import ProductionLog from "../model/productionLog";
import PdiVerification from "../model/pdiVerification";
import Payment from "../model/payment";

const getPagination = (query: Request["query"]) => {
  const page = Math.max(Number(query.page) || 1, 1);
  const limit = Math.min(Math.max(Number(query.limit) || 20, 1), 100);
  const skip = (page - 1) * limit;
  return { page, limit, skip };
};

// ─── Register / Create User ───────────────────────────────────────────────────
export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, phone, portal } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "name, email, password and role are required" });
    }

    const resolvedPortal = portal || "production";
    const productionRoles = ["admin", "team", "pdi"];
    const transportRoles = ["admin", "accounts", "driver"];
    const allowed = resolvedPortal === "transport" ? transportRoles : productionRoles;

    if (!allowed.includes(role)) {
      return res.status(400).json({
        message: resolvedPortal === "transport"
          ? "Role must be admin | accounts | driver"
          : "Role must be admin | team | pdi",
      });
    }

    if (resolvedPortal === "production" && role === "pdi") {
      const existingPdi = await User.findOne({ role: "pdi", portal: "production" });
      if (existingPdi) {
        return res.status(409).json({ message: "PDI team already exists" });
      }
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ message: "Email already registered" });
    }
    const user = await User.create({ name, email, password, role, phone, portal: resolvedPortal });
    return res.status(201).json({
      message: "User created successfully",
      user: { _id: user._id, name: user.name, email: user.email, role: user.role, portal: user.portal },
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Auth Token Helpers ──────────────────────────────────────────────────────
// `portal` is the portal the account belongs to; `activePortal` is the portal
// the session is currently working in. They only differ for a cross-portal
// admin who has switched.
const signTokens = (user: {
  _id: any;
  role: string;
  portal: Portal;
}, activePortal: Portal) => ({
  authToken: jwt.sign(
    { userId: user._id, role: user.role, portal: user.portal, activePortal },
    process.env.JWT_SECRET_KEY || "",
    { expiresIn: "30d" }
  ),
  refreshToken: jwt.sign(
    { userId: user._id, role: user.role, portal: user.portal, activePortal },
    process.env.JWT_REFRESH_SECRET_KEY || "",
    { expiresIn: "60d" }
  ),
});

const setRefreshCookie = (res: Response, refreshToken: string) => {
  res.cookie("refreshToken", refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
  });
};

const authUserPayload = (user: any, activePortal: Portal) => ({
  _id: user._id,
  name: user.name,
  email: user.email,
  role: user.role,
  // The portal the app should route into right now.
  portal: activePortal,
  // The portal the account itself lives in — unchanged by switching.
  homePortal: user.portal,
  crossPortalAccess: canUseBothPortals(user),
  availablePortals: canUseBothPortals(user)
    ? (["production", "transport"] as Portal[])
    : [user.portal],
  phone: user.phone,
});

// ─── Login ───────────────────────────────────────────────────────────────────
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: "Account is deactivated. Contact admin." });
    }

    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // A cross-portal admin starts in their own portal and can switch after.
    const { authToken, refreshToken } = signTokens(user, user.portal);
    setRefreshCookie(res, refreshToken);

    return res.status(200).json({
      message: "Login successful",
      token: authToken,
      user: authUserPayload(user, user.portal),
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Switch Portal (cross-portal admin) ──────────────────────────────────────
// Re-issues the session tokens against the requested portal so the admin can
// work in Production and Transport from a single account.
export const switchPortal = async (req: Request, res: Response) => {
  try {
    const { portal } = req.body as { portal?: Portal };
    if (portal !== "production" && portal !== "transport") {
      return res.status(400).json({ message: "portal must be production or transport" });
    }

    const user = await User.findById(req.userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (!user.isActive) {
      return res.status(403).json({ message: "Account is deactivated. Contact admin." });
    }
    if (!canUseBothPortals(user)) {
      return res.status(403).json({
        message: "This account is not enabled to switch portals",
      });
    }

    const { authToken, refreshToken } = signTokens(user, portal);
    setRefreshCookie(res, refreshToken);

    return res.status(200).json({
      message: `Switched to ${portal} portal`,
      token: authToken,
      user: authUserPayload(user, portal),
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Get Me ───────────────────────────────────────────────────────────────────
export const getMe = async (req: Request, res: Response) => {
  try {
    const user = await User.findById(req.userId).select("-password -passwordResetToken -fcmToken");
    if (!user) return res.status(404).json({ message: "User not found" });
    // Report the portal this session is working in, not just the account's own,
    // so a cross-portal admin who switched stays where they were.
    const activePortal = (req.userPortal as Portal) ?? user.portal;
    return res.status(200).json({
      user: { ...user.toObject(), ...authUserPayload(user, activePortal) },
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Update FCM Token ─────────────────────────────────────────────────────────
export const updateFcmToken = async (req: Request, res: Response) => {
  try {
    const { fcmToken } = req.body;
    if (!fcmToken) return res.status(400).json({ message: "fcmToken is required" });
    await User.findByIdAndUpdate(req.userId, { fcmToken });
    return res.status(200).json({ message: "FCM token updated" });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Get All Users (Admin) ────────────────────────────────────────────────────
export const getAllUsers = async (req: Request, res: Response) => {
  try {
    const { role } = req.query;
    const filter: any = {};
    if (role) filter.role = role;
    const { page, limit, skip } = getPagination(req.query);

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password -passwordResetToken -fcmToken")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    return res.status(200).json({
      users,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Get User By ID (Admin) ─────────────────────────────────────────────────
export const getUserById = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id).select("-password -passwordResetToken -fcmToken");
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.status(200).json({ user });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Update User / Team (Admin) ──────────────────────────────────────────────
export const updateUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, password, role, phone, isActive, crossPortalAccess } = req.body;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (role !== undefined) {
      const productionRoles = ["admin", "team", "pdi"];
      const transportRoles = ["admin", "accounts", "driver"];
      const allowed = user.portal === "transport" ? transportRoles : productionRoles;
      if (!allowed.includes(role)) {
        return res.status(400).json({
          message: user.portal === "transport"
            ? "Role must be admin | accounts | driver"
            : "Role must be admin | team | pdi",
        });
      }

      if (user.portal === "production" && role === "pdi") {
        const existingPdi = await User.findOne({ role: "pdi", portal: "production", _id: { $ne: id } });
        if (existingPdi) {
          return res.status(409).json({ message: "PDI team already exists" });
        }
      }
      user.role = role;
    }

    if (email !== undefined) {
      const exists = await User.findOne({ email, _id: { $ne: id } });
      if (exists) {
        return res.status(409).json({ message: "Email already registered" });
      }
      user.email = email;
    }

    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (password !== undefined) user.password = password;
    if (isActive !== undefined) user.isActive = isActive;

    if (crossPortalAccess !== undefined) {
      if (user.role !== "admin" && crossPortalAccess) {
        return res.status(400).json({
          message: "Only an admin account can be given cross-portal access",
        });
      }
      user.crossPortalAccess = Boolean(crossPortalAccess);
    }

    await user.save();

    return res.status(200).json({
      message: "User updated successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        portal: user.portal,
        crossPortalAccess: user.crossPortalAccess,
        phone: user.phone,
        isActive: user.isActive,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Delete User / Team (Admin) ──────────────────────────────────────────────
export const deleteUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (id === req.userId) {
      return res.status(400).json({ message: "You cannot delete your own account" });
    }

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    const linkedContainer = await Container.findOne({
      $or: [{ assignedTeam: id }, { createdBy: id }],
    }).select("_id");
    if (linkedContainer) {
      return res.status(400).json({
        message: "Cannot delete user because they are linked to containers",
      });
    }

    const linkedProductionLog = await ProductionLog.findOne({ team: id }).select("_id");
    if (linkedProductionLog) {
      return res.status(400).json({
        message: "Cannot delete user because they are linked to production logs",
      });
    }

    const linkedVerification = await PdiVerification.findOne({ verifiedBy: id }).select("_id");
    if (linkedVerification) {
      return res.status(400).json({
        message: "Cannot delete user because they are linked to PDI verifications",
      });
    }

    const linkedPayment = await Payment.findOne({
      $or: [{ team: id }, { createdBy: id }],
    }).select("_id");
    if (linkedPayment) {
      return res.status(400).json({
        message: "Cannot delete user because they are linked to payments",
      });
    }

    await user.deleteOne();

    return res.status(200).json({ message: "User deleted successfully" });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Change Password (by Email) ───────────────────────────────────────────────
// Identifies the account by either email or user id, so a caller that only
// holds one of them does not have to look up the other first — the app knows
// its user id, a web form knows the email. Knowing the current password is
// still what authorises the change; this route is deliberately unauthenticated.
export const changePassword = async (req: Request, res: Response) => {
  try {
    const { email, userId, id, currentPassword, newPassword } = req.body;
    const requestedId = userId ?? id;

    if (!currentPassword || !newPassword) {
      return res
        .status(400)
        .json({ message: "currentPassword and newPassword are required" });
    }

    if (!email && !requestedId) {
      return res
        .status(400)
        .json({ message: "email or userId is required" });
    }

    if (newPassword.length < 6) {
      return res
        .status(400)
        .json({ message: "newPassword must be at least 6 characters" });
    }

    if (currentPassword === newPassword) {
      return res
        .status(400)
        .json({ message: "New password must be different from current password" });
    }

    // An id lookup is preferred when both arrive — it is the unambiguous key.
    let user = null;
    if (requestedId) {
      if (!isValidObjectId(requestedId)) {
        return res.status(400).json({ message: "userId is not a valid id" });
      }
      user = await User.findById(requestedId);
    } else {
      user = await User.findOne({ email: String(email).toLowerCase().trim() });
    }
    if (!user) return res.status(404).json({ message: "User not found" });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(401).json({ message: "Current password is incorrect" });
    }

    user.password = newPassword; // hashed automatically by pre-save hook
    await user.save();

    return res.status(200).json({ message: "Password changed successfully" });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Logout ───────────────────────────────────────────────────────────────────
export const logout = async (req: Request, res: Response) => {
  res.clearCookie("refreshToken");
  return res.status(200).json({ message: "Logged out successfully" });
};
