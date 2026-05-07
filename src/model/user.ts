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
    role: {
      type: String,
      enum: ["admin", "team", "pdi"],
      default: "team",
      required: true,
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
