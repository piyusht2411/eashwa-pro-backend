import { Schema, model } from "mongoose";
import { genSaltSync, hashSync } from "bcrypt";
import { IUser } from "../types";

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },
    password: {
      type: String,
      required: true,
    },
    passwordResetToken: {
      type: String,
      default: "",
    },
    tokenExpire: {
      type: Date,
      default: null,
    },
    // ─── Portal Separation ─────────────────────────────────────────────────────
    // "production" users: roles admin | team | pdi
    // "transport" users:  roles admin | accounts | driver
    portal: {
      type: String,
      enum: ["production", "transport"],
      default: "production",
      required: true,
    },
    role: {
      type: String,
      enum: ["admin", "team", "pdi", "accounts", "driver"],
      default: "team",
      required: true,
    },
    // Set on an admin who runs both portals from one account. The portal guard
    // then admits them to either portal and the app offers a portal switch.
    // Ignored for every non-admin role.
    crossPortalAccess: {
      type: Boolean,
      default: false,
    },
    phone: {
      type: String,
      default: "",
    },
    fcmToken: {
      type: String,
      default: null,
      sparse: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true },
);

// Hash password & reset token before save
userSchema.pre("save", async function (next) {
  const user = this;
  if (!user.isModified("password") && !user.isModified("passwordResetToken")) {
    return next();
  }
  const salt = genSaltSync(10);
  if (user.isModified("password")) {
    user.password = hashSync(user.password, salt);
  }
  if (user.isModified("passwordResetToken") && user.passwordResetToken) {
    user.passwordResetToken = hashSync(user.passwordResetToken, salt);
  }
  next();
});

const User = model<IUser>("User", userSchema);

export default User;
