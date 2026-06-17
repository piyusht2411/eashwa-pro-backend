import { Types } from "mongoose";
import PdiVerification from "../model/pdiVerification";

// ─── Penalty helpers ─────────────────────────────────────────────────────────
// "Pending vehicles" for a container = quantity (target) − total PDI-verified.
// This automatically includes both never-produced units and PDI-rejected units
// (rejected units are never verified, so they stay in the pending pool).
// Penalty is applied live: totalPenalty = pendingVehicles × penaltyPerUnit.

export interface ContainerPenalty {
  verifiedQuantity: number;
  pendingQuantity: number;
  penaltyPerUnit: number;
  totalPenalty: number;
}

export const computePenalty = (
  quantity: number,
  verifiedQuantity: number,
  penaltyPerUnit: number
): ContainerPenalty => {
  const safeRate = penaltyPerUnit ?? 0;
  const target = quantity ?? 0;
  // Verified can never exceed the target. Cap it so any legacy/over-verified
  // record still displays correctly (verified ≤ target) on every endpoint.
  const cappedVerified = Math.min(target, verifiedQuantity ?? 0);
  const pendingQuantity = Math.max(0, target - cappedVerified);
  return {
    verifiedQuantity: cappedVerified,
    pendingQuantity,
    penaltyPerUnit: safeRate,
    totalPenalty: pendingQuantity * safeRate,
  };
};

// Returns a Map<containerId, totalVerifiedQuantity> for the given container ids.
export const getVerifiedByContainer = async (
  containerIds: Types.ObjectId[]
): Promise<Map<string, number>> => {
  if (containerIds.length === 0) return new Map();
  const agg = await PdiVerification.aggregate([
    { $match: { container: { $in: containerIds } } },
    { $group: { _id: "$container", totalVerified: { $sum: "$verifiedQuantity" } } },
  ]);
  const map = new Map<string, number>();
  for (const row of agg) {
    map.set(String(row._id), row.totalVerified ?? 0);
  }
  return map;
};
