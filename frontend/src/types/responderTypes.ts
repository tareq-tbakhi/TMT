/**
 * Type definitions for Field Responder views
 * Used by: Ambulance, Police, Civil Defense, Firefighter
 */

import type { ResponderType } from "../store/authStore";

// ─── Case Status Flow ────────────────────────────────────────────

export type CaseStatus =
  | "pending"      // Assigned but not accepted
  | "accepted"     // Responder accepted the case
  | "en_route"     // On the way to pickup location
  | "on_scene"     // Arrived at scene
  | "transporting" // Moving victim/patient to destination
  | "completed";   // Case finished

export type CasePriority = "critical" | "high" | "medium" | "low";

export type CaseType =
  | "medical"      // Medical emergency (ambulance)
  | "security"     // Security incident (police)
  | "fire"         // Fire emergency (firefighter)
  | "rescue"       // Rescue operation (civil defense)
  | "hazmat"       // Hazardous materials (civil defense/firefighter)
  | "accident";    // Traffic/industrial accident (any)

export type DestinationType =
  | "hospital"
  | "police_station"
  | "fire_station"
  | "civil_defense_center"
  | "shelter"
  | "morgue";

// ─── Location Types ──────────────────────────────────────────────

export interface GeoLocation {
  lat: number;
  lng: number;
  address: string;
  landmark?: string;
}

export interface Destination {
  lat: number;
  lng: number;
  name: string;
  address: string;
  type: DestinationType;
  phone?: string;
}

// ─── Victim/Patient Info ────────────────────────────────────────

export interface VictimInfo {
  name?: string;
  age?: number;
  gender?: "male" | "female" | "other";
  phone?: string;
  bloodType?: string;
  medicalConditions?: string[];
  allergies?: string[];
  emergencyContact?: {
    name: string;
    phone: string;
    relation: string;
  };
}

// ─── Assigned Case ───────────────────────────────────────────────

export interface AssignedCase {
  id: string;
  caseNumber: string; // e.g., "AMB-2024-001"
  type: CaseType;
  priority: CasePriority;
  status: CaseStatus;
  responderType: ResponderType;

  // Brief info (minimal for privacy during transport)
  briefDescription: string;
  victimCount?: number;
  notes?: string;

  // Victim/Patient information
  victimInfo?: VictimInfo;

  // Locations
  pickupLocation: GeoLocation;
  destination?: Destination;

  // AI Recommendations
  aiRecommendations?: string[];
  requiredEquipment?: string[];

  // Contact
  dispatchPhone?: string;

  // Timestamps
  createdAt: string;
  assignedAt: string;
  acceptedAt?: string;
  arrivedAt?: string;
  completedAt?: string;
}

// ─── Case History Entry ──────────────────────────────────────────

export interface CaseHistoryEntry {
  id: string;
  caseNumber: string;
  type: CaseType;
  priority: CasePriority;
  briefDescription: string;
  completedAt: string;
  duration: number; // in minutes
  destination?: string;
}

// ─── Responder State ─────────────────────────────────────────────

export interface ResponderState {
  // Current position (GPS)
  currentLocation: GeoLocation | null;

  // Active case (only one at a time)
  activeCase: AssignedCase | null;

  // Case history
  completedCases: CaseHistoryEntry[];

  // Status
  isOnDuty: boolean;
  isConnected: boolean;
}

// ─── UI Helpers ──────────────────────────────────────────────────

export const PRIORITY_COLORS: Record<CasePriority, { bg: string; text: string; dot: string }> = {
  critical: { bg: "bg-red-100", text: "text-red-700", dot: "bg-red-500" },
  high: { bg: "bg-orange-100", text: "text-orange-700", dot: "bg-orange-500" },
  medium: { bg: "bg-yellow-100", text: "text-yellow-700", dot: "bg-yellow-500" },
  low: { bg: "bg-blue-100", text: "text-blue-700", dot: "bg-blue-500" },
};

export const STATUS_LABELS: Record<CaseStatus, string> = {
  pending: "Pending",
  accepted: "Accepted",
  en_route: "En Route",
  on_scene: "On Scene",
  transporting: "Transporting",
  completed: "Completed",
};

export const STATUS_COLORS: Record<CaseStatus, { bg: string; text: string }> = {
  pending: { bg: "bg-gray-100", text: "text-gray-700" },
  accepted: { bg: "bg-blue-100", text: "text-blue-700" },
  en_route: { bg: "bg-indigo-100", text: "text-indigo-700" },
  on_scene: { bg: "bg-purple-100", text: "text-purple-700" },
  transporting: { bg: "bg-orange-100", text: "text-orange-700" },
  completed: { bg: "bg-green-100", text: "text-green-700" },
};

export const CASE_TYPE_ICONS: Record<CaseType, string> = {
  medical: "🏥",
  security: "🚨",
  fire: "🔥",
  rescue: "🆘",
  hazmat: "☢️",
  accident: "💥",
};
