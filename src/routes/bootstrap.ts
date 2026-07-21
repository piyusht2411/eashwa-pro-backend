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

export default router;
