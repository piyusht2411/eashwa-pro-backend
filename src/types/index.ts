import { Document, Types } from "mongoose";

// ─── Portal ───────────────────────────────────────────────────────────────────
export type Portal = "production" | "transport";

// ─── Roles ───────────────────────────────────────────────────────────────────
// Production roles: admin | team | pdi
// Transport roles:  admin | accounts | driver
export type Role = "admin" | "team" | "pdi" | "accounts" | "driver";

// ─── Transport Types ──────────────────────────────────────────────────────────
export type PaidBy = "driver" | "company" | "both";
export type ExpenseStatus = "pending" | "approved" | "rejected" | "auto_approved";

// ─── User ────────────────────────────────────────────────────────────────────
export interface IUser {
  _id: Types.ObjectId;
  name: string;
  email: string;
  password: string;
  passwordResetToken: string;
  tokenExpire?: Date | null;
  portal: Portal;
  role: Role;
  // Admins who administer both portals with a single account. When true the
  // portal guard lets this user work in either portal and the app shows a
  // portal switch. Only meaningful for role "admin".
  crossPortalAccess: boolean;
  phone?: string;
  fcmToken?: string | null;
  isActive: boolean;
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

// ─── Miscellaneous (Admin-entered ad-hoc deductions) ─────────────────────────
export interface IMiscellaneous {
  _id: Types.ObjectId;
  amount: number;                   // ad-hoc amount entered by admin
  note?: string;                    // optional description
  createdBy: Types.ObjectId;        // ref → User (role: admin)
}

// ─── Driver (Transport) ───────────────────────────────────────────────────────
export interface IDriver extends Document {
  _id: Types.ObjectId;
  name: string;
  vehicleNumber?: string;           // optional — may be unassigned at creation time
  userId: Types.ObjectId | null;    // optional link to User account for login
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Visit (Transport) ────────────────────────────────────────────────────────
export interface IVisit extends Document {
  _id: Types.ObjectId;
  driver: Types.ObjectId;
  vehicleNumber: string;
  destination: string;
  startDate: Date;
  endDate: Date;
  totalDays: number;
  quantity: number;
  billNumber: string;
  distance: number;
  createdBy: Types.ObjectId;
  updatedBy: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Expense Sub-Document (Transport) ─────────────────────────────────────────
export interface IExpenseItem {
  /** Portion the driver paid out of pocket — the reimbursable part. */
  driverAmount: number;
  /** Portion the company paid directly — never reimbursed, never needs approval. */
  companyAmount: number;
  /** Derived: driverAmount + companyAmount. Kept stored for reports and older clients. */
  amount: number;
  /** Derived: "driver" | "company" | "both", based on which portions are non-zero. */
  paidBy: PaidBy;
  status: ExpenseStatus;
  approvedBy: Types.ObjectId | null;
  rejectedBy: Types.ObjectId | null;
  rejectionRemark: string;
  approvedAt: Date | null;
  description?: string;
}

// ─── Expense (Transport) ──────────────────────────────────────────────────────
export interface IExpense extends Document {
  _id: Types.ObjectId;
  visit: Types.ObjectId;
  driver: Types.ObjectId;
  food: IExpenseItem;
  cng: IExpenseItem;
  other: IExpenseItem & { description: string };
  totalExpense: number;
  pendingExpense: number;
  pendingReimbursement: number;
  approvedReimbursement: number;
  rejectedAmount: number;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Notification ─────────────────────────────────────────────────────────────
export interface INotification extends Document {
  _id: Types.ObjectId;
  recipient: Types.ObjectId;
  type: string;
  title: string;
  body: string;
  data: Record<string, string>;
  isRead: boolean;
  createdAt: Date;
  updatedAt: Date;
}

