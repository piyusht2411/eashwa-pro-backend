import { Request, Response } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import User from "../model/user";
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

// ─── Register / Create User-Team ─────────────────────────────────────────────
export const register = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, phone } = req.body;
    if (!name || !email || !password || !role) {
      return res.status(400).json({ message: "name, email, password and role are required" });
    }
    const allowed = ["admin", "team", "pdi"];
    if (!allowed.includes(role)) {
      return res.status(400).json({ message: "Role must be admin | team | pdi" });
    }

    if (role === "pdi") {
      const existingPdi = await User.findOne({ role: "pdi" });
      if (existingPdi) {
        return res.status(409).json({ message: "PDI team already exists" });
      }
    }

    const exists = await User.findOne({ email });
    if (exists) {
      return res.status(409).json({ message: "Email already registered" });
    }
    const user = await User.create({ name, email, password, role, phone });
    return res.status(201).json({
      message: "User created successfully",
      user: { _id: user._id, name: user.name, email: user.email, role: user.role },
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Login ───────────────────────────────────────────────────────────────────
export const login = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    if (!email || !password) {
      return res.status(400).json({ message: "email and password are required" });
    }
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(401).json({ message: "Invalid credentials" });
    }
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const authToken = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET_KEY || "",
      { expiresIn: "30d" }
    );
    const refreshToken = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_REFRESH_SECRET_KEY || "",
      { expiresIn: "60d" }
    );

    res.cookie("refreshToken", refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
    });

    return res.status(200).json({
      message: "Login successful",
      token: authToken,
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
      },
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
    return res.status(200).json({ user });
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
    const { name, email, password, role, phone } = req.body;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (role !== undefined) {
      const allowed = ["admin", "team", "pdi"];
      if (!allowed.includes(role)) {
        return res.status(400).json({ message: "Role must be admin | team | pdi" });
      }

      if (role === "pdi") {
        const existingPdi = await User.findOne({ role: "pdi", _id: { $ne: id } });
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

    await user.save();

    return res.status(200).json({
      message: "User updated successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        phone: user.phone,
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

// ─── Logout ───────────────────────────────────────────────────────────────────
export const logout = async (req: Request, res: Response) => {
  res.clearCookie("refreshToken");
  return res.status(200).json({ message: "Logged out successfully" });
};
