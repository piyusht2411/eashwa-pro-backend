import { Request, Response } from "express";
import User from "../../model/user";
import Driver from "../../model/driver";
import { getPagination, buildPaginationMeta } from "../../utils/helpers";

// ─── Create Transport User (Admin only) ───────────────────────────────────────
export const createTransportUser = async (req: Request, res: Response) => {
  try {
    const { name, email, password, role, phone, vehicleNumber } = req.body;

    if (!name || !email || !password || !role) {
      return res
        .status(400)
        .json({ message: "name, email, password and role are required" });
    }

    // vehicleNumber is optional for driver accounts — it can be assigned later.

    const allowed = ["admin", "accounts", "driver"];
    if (!allowed.includes(role)) {
      return res
        .status(400)
        .json({ message: "Role must be admin | accounts | driver" });
    }

    const exists = await User.findOne({ email: email.toLowerCase().trim() });
    if (exists) {
      return res.status(409).json({ message: "Email already registered" });
    }

    if (password.length < 6) {
      return res
        .status(400)
        .json({ message: "Password must be at least 6 characters" });
    }

    const user = await User.create({
      name,
      email,
      password,
      role,
      phone: phone || "",
      portal: "transport",
    });

    if (role === "driver") {
      await Driver.create({
        name: user.name,
        vehicleNumber: vehicleNumber ? String(vehicleNumber).trim().toUpperCase() : "",
        userId: user._id,
      });
    }

    return res.status(201).json({
      message: "User created successfully",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        portal: user.portal,
        phone: user.phone,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Get All Transport Users (Admin only) ─────────────────────────────────────
export const getAllTransportUsers = async (req: Request, res: Response) => {
  try {
    const { role, search } = req.query;
    const filter: any = { portal: "transport" };
    if (role) filter.role = role;
    if (search) filter.name = { $regex: search, $options: "i" };

    const { page, limit, skip } = getPagination(req.query);

    const [users, total] = await Promise.all([
      User.find(filter)
        .select("-password -fcmToken")
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      User.countDocuments(filter),
    ]);

    return res.status(200).json({
      users,
      pagination: buildPaginationMeta(page, limit, total),
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Get Transport User By ID (Admin only) ────────────────────────────────────
export const getTransportUserById = async (req: Request, res: Response) => {
  try {
    const user = await User.findOne({
      _id: req.params.id,
      portal: "transport",
    }).select("-password -fcmToken");
    if (!user) return res.status(404).json({ message: "User not found" });
    return res.status(200).json({ user });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Update Transport User (Admin only) ───────────────────────────────────────
export const updateTransportUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { name, email, password, role, phone, isActive } = req.body;

    const user = await User.findOne({ _id: id, portal: "transport" });
    if (!user) return res.status(404).json({ message: "User not found" });

    if (role !== undefined) {
      const allowed = ["admin", "accounts", "driver"];
      if (!allowed.includes(role)) {
        return res
          .status(400)
          .json({ message: "Role must be admin | accounts | driver" });
      }
      user.role = role;
    }

    if (email !== undefined) {
      const exists = await User.findOne({
        email: email.toLowerCase().trim(),
        _id: { $ne: id },
      });
      if (exists)
        return res.status(409).json({ message: "Email already in use" });
      user.email = email;
    }

    if (name !== undefined) user.name = name;
    if (phone !== undefined) user.phone = phone;
    if (isActive !== undefined) user.isActive = isActive;
    if (password !== undefined) {
      if (password.length < 6)
        return res
          .status(400)
          .json({ message: "Password must be at least 6 characters" });
      user.password = password;
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
        phone: user.phone,
        isActive: user.isActive,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};

// ─── Delete Transport User (Admin only) ───────────────────────────────────────
export const deleteTransportUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    if (id === req.userId) {
      return res
        .status(400)
        .json({ message: "You cannot delete your own account" });
    }

    const user = await User.findOne({ _id: id, portal: "transport" });
    if (!user) return res.status(404).json({ message: "User not found" });

    await user.deleteOne();
    return res.status(200).json({ message: "User deleted successfully" });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
};
