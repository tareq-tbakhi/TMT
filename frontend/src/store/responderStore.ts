/**
 * Zustand store for Field Responder state management
 * Includes demo data for frontend-only demo
 */

import { create } from "zustand";
import type {
  AssignedCase,
  CaseHistoryEntry,
  CaseStatus,
  GeoLocation,
} from "../types/responderTypes";
import type { ResponderType } from "./authStore";

// ─── Store Interface ─────────────────────────────────────────────

interface ResponderState {
  // Current GPS position
  currentLocation: GeoLocation | null;

  // Active case (one at a time)
  activeCase: AssignedCase | null;

  // Completed cases history
  completedCases: CaseHistoryEntry[];

  // Connection status
  isOnDuty: boolean;
  isConnected: boolean;
}

interface ResponderActions {
  // Location
  setCurrentLocation: (location: GeoLocation | null) => void;

  // Case management
  setActiveCase: (caseData: AssignedCase | null) => void;
  updateCaseStatus: (status: CaseStatus) => void;
  completeCase: () => void;

  // Duty status
  setOnDuty: (onDuty: boolean) => void;
  setConnected: (connected: boolean) => void;

  // Demo data loader
  loadDemoCase: (responderType: ResponderType) => void;
}

type ResponderStore = ResponderState & ResponderActions;

// ─── Demo Cases ──────────────────────────────────────────────────

const DEMO_AMBULANCE_CASE: AssignedCase = {
  id: "amb-demo-001",
  caseNumber: "AMB-2024-0847",
  type: "medical",
  priority: "critical",
  status: "pending",
  responderType: "ambulance",
  briefDescription: "Cardiac arrest - 65yo male, CPR in progress",
  victimCount: 1,
  notes: "Family on scene, AED available",
  victimInfo: {
    name: "Ahmad Al-Hassan",
    age: 65,
    gender: "male",
    phone: "+962-79-555-1234",
    bloodType: "A+",
    medicalConditions: ["Hypertension", "Type 2 Diabetes", "Previous MI (2019)"],
    allergies: ["Penicillin", "Sulfa drugs"],
    emergencyContact: {
      name: "Fatima Al-Hassan",
      phone: "+962-79-555-5678",
      relation: "Wife",
    },
  },
  pickupLocation: {
    lat: 31.9539,
    lng: 35.9106,
    address: "123 King Abdullah St, Amman",
    landmark: "Near City Mall, Building 7",
  },
  destination: {
    lat: 31.9654,
    lng: 35.9310,
    name: "Jordan Hospital",
    address: "Queen Rania St, Amman",
    type: "hospital",
    phone: "+962-6-560-8080",
  },
  aiRecommendations: [
    "Prepare defibrillator - patient in V-Fib",
    "Have epinephrine ready",
    "Oxygen mask on standby",
  ],
  dispatchPhone: "+962-6-911",
  createdAt: new Date(Date.now() - 5 * 60000).toISOString(),
  assignedAt: new Date(Date.now() - 2 * 60000).toISOString(),
};

const DEMO_POLICE_CASE: AssignedCase = {
  id: "pol-demo-001",
  caseNumber: "POL-2024-1293",
  type: "security",
  priority: "high",
  status: "pending",
  responderType: "police",
  briefDescription: "Armed robbery in progress - 2 suspects",
  victimCount: 3,
  notes: "Suspects possibly armed, hostages reported",
  victimInfo: {
    name: "Store Manager - Khalid Mansour",
    age: 45,
    gender: "male",
    phone: "+962-79-444-3210",
    emergencyContact: {
      name: "Nadia Mansour",
      phone: "+962-79-444-3211",
      relation: "Spouse",
    },
  },
  pickupLocation: {
    lat: 31.9456,
    lng: 35.9289,
    address: "Mecca Mall, Ground Floor",
    landmark: "Near main entrance, jewelry store",
  },
  destination: {
    lat: 31.9512,
    lng: 35.9234,
    name: "Central Police Station",
    address: "Prince Hassan St, Amman",
    type: "police_station",
    phone: "+962-6-191",
  },
  aiRecommendations: [
    "Approach from south entrance",
    "Backup unit en route - ETA 4 min",
    "Negotiate if possible - hostages present",
  ],
  dispatchPhone: "+962-6-191",
  createdAt: new Date(Date.now() - 8 * 60000).toISOString(),
  assignedAt: new Date(Date.now() - 3 * 60000).toISOString(),
};

const DEMO_CIVIL_DEFENSE_CASE: AssignedCase = {
  id: "cd-demo-001",
  caseNumber: "CD-2024-0456",
  type: "rescue",
  priority: "critical",
  status: "pending",
  responderType: "civil_defense",
  briefDescription: "Building collapse - 3 persons trapped",
  victimCount: 3,
  notes: "4-story residential building, partial collapse on east side",
  victimInfo: {
    name: "Mariam Saleh (+ 2 family members)",
    age: 34,
    gender: "female",
    phone: "+962-79-333-7890",
    emergencyContact: {
      name: "Omar Saleh",
      phone: "+962-79-333-7891",
      relation: "Brother",
    },
  },
  pickupLocation: {
    lat: 31.9500,
    lng: 35.9200,
    address: "45 Industrial Zone, Sahab",
    landmark: "Behind the water tower",
  },
  requiredEquipment: [
    "Hydraulic rescue tools (Jaws of Life)",
    "Concrete cutting saw",
    "Search camera / borescope",
    "Stabilization struts",
    "Medical kit - trauma",
    "Dust masks & eye protection",
  ],
  aiRecommendations: [
    "Structure unstable - approach from west side only",
    "Gas line nearby - check for leaks before entry",
    "Thermal imaging shows 2 heat signatures on floor 2",
    "Building engineer on route - ETA 15 min",
  ],
  dispatchPhone: "+962-6-199",
  createdAt: new Date(Date.now() - 12 * 60000).toISOString(),
  assignedAt: new Date(Date.now() - 5 * 60000).toISOString(),
};

const DEMO_FIREFIGHTER_CASE: AssignedCase = {
  id: "ff-demo-001",
  caseNumber: "FF-2024-0234",
  type: "fire",
  priority: "critical",
  status: "pending",
  responderType: "firefighter",
  briefDescription: "Structure fire - 3rd floor apartment, spreading",
  victimCount: 2,
  notes: "Elderly couple unable to evacuate, smoke inhalation risk",
  victimInfo: {
    name: "Hassan & Layla Ibrahim",
    age: 78,
    gender: "male",
    phone: "+962-79-222-4567",
    medicalConditions: ["Limited mobility", "Oxygen dependent"],
    emergencyContact: {
      name: "Samir Ibrahim",
      phone: "+962-79-222-4568",
      relation: "Son",
    },
  },
  pickupLocation: {
    lat: 31.9612,
    lng: 35.9156,
    address: "78 Gardens District, Amman",
    landmark: "White building with blue balconies",
  },
  requiredEquipment: [
    "Breathing apparatus (SCBA)",
    "Thermal imaging camera",
    "Halligan bar & axe",
    "Fire hose - 2.5 inch",
    "Rescue rope & harness",
    "First aid oxygen kit",
  ],
  aiRecommendations: [
    "Fire on 3rd floor - stairwell clear as of 2 min ago",
    "Wind from northwest - fire may spread to 4th floor",
    "Water pressure adequate at hydrant on corner",
    "Evacuate floors 4-6 immediately",
  ],
  dispatchPhone: "+962-6-199",
  createdAt: new Date(Date.now() - 6 * 60000).toISOString(),
  assignedAt: new Date(Date.now() - 1 * 60000).toISOString(),
};

// ─── Demo History ────────────────────────────────────────────────

const DEMO_HISTORY: CaseHistoryEntry[] = [
  {
    id: "hist-001",
    caseNumber: "AMB-2024-0845",
    type: "medical",
    priority: "high",
    briefDescription: "Fractured leg - construction accident",
    completedAt: new Date(Date.now() - 3 * 3600000).toISOString(),
    duration: 45,
    destination: "Al-Khalidi Hospital",
  },
  {
    id: "hist-002",
    caseNumber: "AMB-2024-0842",
    type: "accident",
    priority: "medium",
    briefDescription: "Minor car collision - 2 patients",
    completedAt: new Date(Date.now() - 8 * 3600000).toISOString(),
    duration: 32,
    destination: "Jordan Hospital",
  },
  {
    id: "hist-003",
    caseNumber: "AMB-2024-0839",
    type: "medical",
    priority: "critical",
    briefDescription: "Stroke symptoms - 72yo female",
    completedAt: new Date(Date.now() - 24 * 3600000).toISOString(),
    duration: 28,
    destination: "King Hussein Medical Center",
  },
];

// ─── Store ───────────────────────────────────────────────────────

export const useResponderStore = create<ResponderStore>((set, get) => ({
  // Initial state
  currentLocation: null,
  activeCase: null,
  completedCases: DEMO_HISTORY,
  isOnDuty: true,
  isConnected: true,

  // Actions
  setCurrentLocation: (location) => set({ currentLocation: location }),

  setActiveCase: (caseData) => set({ activeCase: caseData }),

  updateCaseStatus: (status) => {
    const { activeCase } = get();
    if (!activeCase) return;

    const now = new Date().toISOString();
    const updates: Partial<AssignedCase> = { status };

    if (status === "accepted") updates.acceptedAt = now;
    if (status === "on_scene") updates.arrivedAt = now;
    if (status === "completed") updates.completedAt = now;

    set({
      activeCase: { ...activeCase, ...updates },
    });
  },

  completeCase: () => {
    const { activeCase, completedCases } = get();
    if (!activeCase) return;

    // Calculate duration
    const start = new Date(activeCase.assignedAt).getTime();
    const end = Date.now();
    const duration = Math.round((end - start) / 60000);

    // Create history entry
    const historyEntry: CaseHistoryEntry = {
      id: activeCase.id,
      caseNumber: activeCase.caseNumber,
      type: activeCase.type,
      priority: activeCase.priority,
      briefDescription: activeCase.briefDescription,
      completedAt: new Date().toISOString(),
      duration,
      destination: activeCase.destination?.name,
    };

    set({
      activeCase: null,
      completedCases: [historyEntry, ...completedCases],
    });
  },

  setOnDuty: (onDuty) => set({ isOnDuty: onDuty }),
  setConnected: (connected) => set({ isConnected: connected }),

  loadDemoCase: (responderType) => {
    const demoMap: Record<ResponderType, AssignedCase> = {
      ambulance: DEMO_AMBULANCE_CASE,
      police: DEMO_POLICE_CASE,
      civil_defense: DEMO_CIVIL_DEFENSE_CASE,
      firefighter: DEMO_FIREFIGHTER_CASE,
    };

    set({ activeCase: demoMap[responderType] });
  },
}));

// ─── Selectors ───────────────────────────────────────────────────

export const selectActiveCase = (state: ResponderStore) => state.activeCase;
export const selectIsOnDuty = (state: ResponderStore) => state.isOnDuty;
export const selectCompletedCases = (state: ResponderStore) => state.completedCases;
