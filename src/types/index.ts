import { Types } from "mongoose";

// ─── Roles ───────────────────────────────────────────────────────────────────
export type Role = "admin" | "team" | "pdi";

// ─── User ────────────────────────────────────────────────────────────────────
export interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string;
  passwordResetToken: string;
  tokenExpire?: Date | null;
  role: Role;
  phone?: string;
  fcmToken?: string | null;
}

// ─── Container (Job assigned by Admin) ───────────────────────────────────────
export interface IContainer {
  _id: Types.ObjectId;
  model: string;                    // scooter model name
  quantity: number;                 // total assigned quantity
  date: Date;                       // assignment date
  ratePerUnit: number;              // fixed price per scooter (₹)
  penaltyPerUnit: number;           // penalty per pending/undelivered scooter (₹)
  assignedTeam: Types.ObjectId;    // ref → User (role: team)
  status: "active" | "completed" | "cancelled";
  createdBy: Types.ObjectId;       // ref → User (role: admin)
}

// ─── ProductionLog (daily update by Team) ────────────────────────────────────
export interface IProductionLog {
  _id: Types.ObjectId;
  container: Types.ObjectId;        // ref → Container
  team: Types.ObjectId;             // ref → User (role: team)
  date: Date;                       // the day this log is for
  reportedQuantity: number;         // what team says they produced
  verifiedQuantity?: number;        // filled by PDI
  status: "pending" | "verified" | "incomplete";
  createdAt: Date;
  updatedAt: Date;
}

// ─── PdiVerification (PDI verifies each production log) ──────────────────────
export interface IPdiVerification {
  _id: Types.ObjectId;
  productionLog: Types.ObjectId;    // ref → ProductionLog
  container: Types.ObjectId;        // ref → Container (for quick queries)
  verifiedBy: Types.ObjectId;       // ref → User (role: pdi)
  verifiedQuantity: number;         // actual accepted quantity
  isIncomplete: boolean;            // true if not all scooters passed
  missingQuantity?: number;         // how many were rejected
  remarks?: string;
  verifiedAt: Date;
}

// ─── Payment (Admin pays Team) ────────────────────────────────────────────────
export interface IPayment {
  _id: Types.ObjectId;
  container: Types.ObjectId;        // ref → Container
  team: Types.ObjectId;             // ref → User (role: team)
  totalVerifiedQuantity: number;    // sum of all PDI-verified qty for container
  totalAmount: number;              // totalVerifiedQuantity × ratePerUnit
  paidAmount: number;               // cumulative paid so far
  remainingAmount: number;          // totalAmount - paidAmount
  payments: IPaymentEntry[];
  createdBy: Types.ObjectId;        // ref → User (role: admin)
}

export interface IPaymentEntry {
  amount: number;
  paidAt: Date;
  note?: string;
}
