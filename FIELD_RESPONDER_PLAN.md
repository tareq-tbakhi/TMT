# TMT Field Responder Mobile Views - Development Plan

> **Status**: COMPLETED
> **Last Updated**: 2026-02-14
> **Current Phase**: All Phases Complete
> **Current Step**: Done

---

## Overview

Creating mobile-first views for field responders (Ambulance, Police, Civil Defense, Firefighter) with minimal UI for emergency use. Each view includes assigned cases, destination routing, AI recommendations, and live map.

---

## Implementation Checklist

### Phase 1: Foundation & Core Architecture
- [x] **1.1** Add new responder roles to authStore.ts
- [x] **1.2** Create responder types in `types/responderTypes.ts`
- [x] **1.3** Create responder Zustand store `store/responderStore.ts`
- [x] **1.4** Create base ResponderLayout component with bottom nav

### Phase 2: Shared Components
- [x] **2.1** Create `ActiveCaseCard` component (shows current assignment)
- [x] **2.2** Create `DestinationCard` component (merged into ActiveCaseCard)
- [x] **2.3** Create `AIRecommendationBanner` component
- [x] **2.4** Create `EquipmentChecklist` component
- [x] **2.5** Create `CaseStatusButton` component (Accept/Arrived/Complete)
- [x] **2.6** Create `NoCaseView` component (standby state)

### Phase 3: Ambulance Driver View
- [x] **3.1** Create `pages/responder/ambulance/AmbulanceLayout.tsx`
- [x] **3.2** Create `pages/responder/ambulance/ActiveCase.tsx` (home tab)
- [x] **3.3** Create `pages/responder/ambulance/Map.tsx` (map tab)
- [x] **3.4** Create `pages/responder/ambulance/History.tsx` (history tab)
- [ ] **3.5** Add ambulance routes to App.tsx (Phase 7)

### Phase 4: Police Officer View
- [x] **4.1** Create `pages/responder/police/PoliceLayout.tsx`
- [x] **4.2** Create `pages/responder/police/ActiveCase.tsx`
- [x] **4.3** Create `pages/responder/police/Map.tsx`
- [x] **4.4** Create `pages/responder/police/History.tsx`
- [ ] **4.5** Add police routes to App.tsx (Phase 7)

### Phase 5: Civil Defense View
- [x] **5.1** Create `pages/responder/civil_defense/CivilDefenseLayout.tsx`
- [x] **5.2** Create `pages/responder/civil_defense/ActiveCase.tsx`
- [x] **5.3** Create `pages/responder/civil_defense/Equipment.tsx` (AI recommendations)
- [x] **5.4** Create `pages/responder/civil_defense/Map.tsx`
- [ ] **5.5** Add civil defense routes to App.tsx (Phase 7)

### Phase 6: Firefighter View
- [x] **6.1** Create `pages/responder/firefighter/FirefighterLayout.tsx`
- [x] **6.2** Create `pages/responder/firefighter/ActiveCase.tsx`
- [x] **6.3** Create `pages/responder/firefighter/Equipment.tsx`
- [x] **6.4** Create `pages/responder/firefighter/Map.tsx`
- [ ] **6.5** Add firefighter routes to App.tsx (Phase 7)

### Phase 7: Integration & Demo Data
- [x] **7.1** Create demo case data for each responder type (in responderStore.ts)
- [x] **7.2** Add login options for demo responder accounts (Login.tsx)
- [x] **7.3** Add routes for all responders (App.tsx)
- [x] **7.4** Update AuthGuard for responder roles

---

## Architecture Details

### New Roles (authStore.ts)
```typescript
export type UserRole =
  | "patient"
  | "hospital_admin"
  | "police_admin"
  | "civil_defense_admin"
  | "super_admin"
  // New field responder roles:
  | "ambulance_driver"
  | "police_officer"
  | "civil_defense_responder"
  | "firefighter";
```

### Responder Types (types/responderTypes.ts)
```typescript
export type ResponderType = "ambulance" | "police" | "civil_defense" | "firefighter";

export type CaseStatus = "pending" | "accepted" | "en_route" | "on_scene" | "transporting" | "completed";

export interface AssignedCase {
  id: string;
  type: string; // "medical", "security", "fire", "rescue"
  priority: "critical" | "high" | "medium" | "low";
  status: CaseStatus;

  // Patient/Victim info (minimal for privacy)
  victimCount?: number;
  briefDescription: string;

  // Pickup location
  pickupLocation: {
    lat: number;
    lng: number;
    address: string;
    landmark?: string;
  };

  // Destination (hospital, station, etc.)
  destination?: {
    lat: number;
    lng: number;
    name: string;
    address: string;
    type: "hospital" | "police_station" | "fire_station" | "shelter";
  };

  // AI recommendations
  aiRecommendations?: string[];
  requiredEquipment?: string[];

  // Timestamps
  assignedAt: string;
  acceptedAt?: string;
  arrivedAt?: string;
  completedAt?: string;
}
```

### Folder Structure
```
frontend/src/
├── pages/
│   └── responder/
│       ├── ambulance/
│       │   ├── AmbulanceLayout.tsx
│       │   ├── ActiveCase.tsx
│       │   ├── Map.tsx
│       │   └── History.tsx
│       ├── police/
│       │   ├── PoliceLayout.tsx
│       │   ├── ActiveCase.tsx
│       │   ├── Map.tsx
│       │   └── History.tsx
│       ├── civil_defense/
│       │   ├── CivilDefenseLayout.tsx
│       │   ├── ActiveCase.tsx
│       │   ├── Equipment.tsx
│       │   └── Map.tsx
│       └── firefighter/
│           ├── FirefighterLayout.tsx
│           ├── ActiveCase.tsx
│           ├── Equipment.tsx
│           └── Map.tsx
├── components/
│   └── responder/
│       ├── ActiveCaseCard.tsx
│       ├── DestinationCard.tsx
│       ├── AIRecommendationBanner.tsx
│       ├── ResponderMap.tsx
│       ├── CaseStatusButton.tsx
│       └── ResponderLayout.tsx  (base layout)
├── store/
│   └── responderStore.ts
└── types/
    └── responderTypes.ts
```

### UI Design Principles (Emergency-Focused)
1. **Large touch targets** - Buttons min 48px, preferably 56px+
2. **High contrast** - Dark text on light bg, colored status indicators
3. **Minimal text** - Icons + short labels
4. **Single action per screen** - Clear primary action
5. **Status-driven colors**:
   - Critical: Red (#EF4444)
   - High: Orange (#F97316)
   - Medium: Yellow (#EAB308)
   - Low: Blue (#3B82F6)
   - Success: Green (#22C55E)
6. **Bottom navigation** - 3-4 tabs max, thumb-friendly

### Color Scheme by Responder
| Responder | Primary | Accent | Icon |
|-----------|---------|--------|------|
| Ambulance | Red-500 | Red-600 | Ambulance |
| Police | Indigo-500 | Indigo-600 | Shield |
| Civil Defense | Orange-500 | Orange-600 | Hard Hat |
| Firefighter | Red-600 | Red-700 | Fire |

---

## How to Resume After Context Loss

1. Read this file: `FIELD_RESPONDER_PLAN.md`
2. Find the first unchecked `[ ]` item in the checklist
3. Continue implementation from that step
4. After completing a step, update the checklist to `[x]`
5. Update "Current Step" in the header

---

## Demo Data (for frontend-only demo)

Demo cases will be stored in `store/responderStore.ts` with mock data for each responder type.

### Ambulance Demo Case
```typescript
{
  id: "amb-001",
  type: "medical",
  priority: "critical",
  briefDescription: "Cardiac arrest - 65yo male",
  pickupLocation: {
    lat: 31.9539,
    lng: 35.9106,
    address: "123 Main St, Amman",
    landmark: "Near City Mall"
  },
  destination: {
    lat: 31.9654,
    lng: 35.9310,
    name: "Jordan Hospital",
    type: "hospital"
  },
  aiRecommendations: ["Prepare defibrillator", "Have oxygen ready"]
}
```

### Civil Defense Demo Case
```typescript
{
  id: "cd-001",
  type: "rescue",
  priority: "high",
  briefDescription: "Building collapse - 3 trapped",
  pickupLocation: {
    lat: 31.9500,
    lng: 35.9200,
    address: "45 Industrial Zone"
  },
  requiredEquipment: [
    "Hydraulic rescue tools",
    "Concrete saw",
    "Search camera",
    "Medical kit"
  ],
  aiRecommendations: [
    "Structure unstable - approach from east",
    "Gas line nearby - check for leaks"
  ]
}
```

---

## Notes

- Focus on frontend demo first
- Backend/DB integration will come later
- Use mock data stored in Zustand
- Existing PatientLayout pattern serves as reference for bottom nav
- Existing map components can be extended for routing display
