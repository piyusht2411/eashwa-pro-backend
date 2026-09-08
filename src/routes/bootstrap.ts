import { Request, Response, Router } from "express";
import User from "../model/user";
import { Portal } from "../types";

const router = Router();

// Creates only the first admin for each portal. Remove BOOTSTRAP_SECRET after setup.
router.post("/admin", async (req: Request, res: Response) => {
  try {
    if (!process.env.BOOTSTRAP_SECRET || req.header("x-bootstrap-secret") !== process.env.BOOTSTRAP_SECRET) {
      return res.status(401).json({ message: "Invalid bootstrap secret" });
    }

    const { name, email, password, phone = "", portal } = req.body as {
      name?: string; email?: string; password?: string; phone?: string; portal?: Portal;
    };
    if (!name || !email || !password || !portal) {
      return res.status(400).json({ message: "name, email, password and portal are required" });
    }
    if (portal !== "production" && portal !== "transport") {
      return res.status(400).json({ message: "portal must be production or transport" });
    }
    if (password.length < 6) return res.status(400).json({ message: "Password must be at least 6 characters" });
    if (await User.exists({ portal, role: "admin" })) {
      return res.status(409).json({ message: `The ${portal} admin already exists` });
    }
    if (await User.exists({ email: email.toLowerCase().trim() })) {
      return res.status(409).json({ message: "Email already registered" });
    }

    const user = await User.create({ name, email, password, phone, portal, role: "admin" });
    return res.status(201).json({
      message: `${portal} admin created successfully`,
      user: { _id: user._id, name: user.name, email: user.email, phone: user.phone, role: user.role, portal: user.portal },
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

// One-time switch to let an existing admin account run both portals. After
// this the admin sees a portal switch in the app; revoke with enabled: false.
router.post("/cross-portal-admin", async (req: Request, res: Response) => {
  try {
    if (!process.env.BOOTSTRAP_SECRET || req.header("x-bootstrap-secret") !== process.env.BOOTSTRAP_SECRET) {
      return res.status(401).json({ message: "Invalid bootstrap secret" });
    }

    const { email, enabled = true } = req.body as { email?: string; enabled?: boolean };
    if (!email) return res.status(400).json({ message: "email is required" });

    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role !== "admin") {
      return res.status(400).json({ message: "Only an admin account can be given cross-portal access" });
    }

    user.crossPortalAccess = Boolean(enabled);
    await user.save();

    return res.status(200).json({
      message: user.crossPortalAccess
        ? "Cross-portal access enabled"
        : "Cross-portal access revoked",
      user: {
        _id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        portal: user.portal,
        crossPortalAccess: user.crossPortalAccess,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ message: err.message });
  }
});

export default router;
