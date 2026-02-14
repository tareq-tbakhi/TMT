/**
 * Zustand auth store for managing authentication state.
 */

import { create } from "zustand";

export type UserRole =
  | "patient"
  | "hospital_admin"
  | "police_admin"
  | "civil_defense_admin"
  | "super_admin";

export type DepartmentType = "hospital" | "police" | "civil_defense";

export const DEPARTMENT_ADMIN_ROLES: UserRole[] = [
  "hospital_admin",
  "police_admin",
  "civil_defense_admin",
];

export const ROLE_TO_DEPARTMENT: Record<string, DepartmentType> = {
  hospital_admin: "hospital",
  police_admin: "police",
  civil_defense_admin: "civil_defense",
};

export const DEPARTMENT_LABELS: Record<DepartmentType, string> = {
  hospital: "Hospital",
  police: "Police",
  civil_defense: "Civil Defense",
};

export const DEPARTMENT_COLORS: Record<DepartmentType, { bg: string; text: string; accent: string }> = {
  hospital: { bg: "bg-blue-50", text: "text-blue-700", accent: "bg-blue-600" },
  police: { bg: "bg-indigo-50", text: "text-indigo-700", accent: "bg-indigo-600" },
  civil_defense: { bg: "bg-orange-50", text: "text-orange-700", accent: "bg-orange-600" },
};

export interface AuthUser {
  id: string;
  role: UserRole;
  hospitalId?: string;
  facilityType?: DepartmentType;
  patientId?: string;
}

interface AuthState {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
}

interface AuthActions {
  login: (token: string, user: AuthUser) => void;
  logout: () => void;
  setToken: (token: string) => void;
}

type AuthStore = AuthState & AuthActions;

/**
 * Parse the stored user from localStorage (if available).
 */
function loadStoredAuth(): { token: string | null; user: AuthUser | null } {
  const token = localStorage.getItem("tmt-token");
  const userJson = localStorage.getItem("tmt-user");
  let user: AuthUser | null = null;

  if (userJson) {
    try {
      user = JSON.parse(userJson) as AuthUser;
    } catch {
      user = null;
    }
  }

  return { token, user };
}

const stored = loadStoredAuth();

export const useAuthStore = create<AuthStore>((set) => ({
  // Initial state from localStorage
  token: stored.token,
  user: stored.user,
  isAuthenticated: !!stored.token && !!stored.user,

  login: (token: string, user: AuthUser) => {
    localStorage.setItem("tmt-token", token);
    localStorage.setItem("tmt-user", JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem("tmt-token");
    localStorage.removeItem("tmt-user");
    set({ token: null, user: null, isAuthenticated: false });
  },

  setToken: (token: string) => {
    localStorage.setItem("tmt-token", token);
    set({ token, isAuthenticated: true });
  },
}));
