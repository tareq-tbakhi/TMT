/**
 * Zustand auth store for managing authentication state.
 */

import { create } from "zustand";

export interface AuthUser {
  id: string;
  role: "patient" | "hospital_admin" | "super_admin";
  hospitalId?: string;
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
