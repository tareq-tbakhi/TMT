/**
 * Auth hook wrapping the Zustand auth store.
 * Provides convenient authentication methods and state.
 */

import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useAuthStore, type AuthUser } from "../store/authStore";
import { login as apiLogin, type LoginRequest } from "../services/api";

interface UseAuthReturn {
  token: string | null;
  user: AuthUser | null;
  isAuthenticated: boolean;
  isHospitalStaff: boolean;
  isPatient: boolean;
  login: (credentials: LoginRequest) => Promise<void>;
  logout: () => void;
}

export function useAuth(): UseAuthReturn {
  const { token, user, isAuthenticated, login: storeLogin, logout: storeLogout } =
    useAuthStore();
  const navigate = useNavigate();

  const login = useCallback(
    async (credentials: LoginRequest) => {
      const response = await apiLogin(credentials);

      const authUser: AuthUser = {
        id: response.user_id,
        role: response.role as AuthUser["role"],
      };

      // The JWT payload includes hospital_id and patient_id
      // We parse them from the JWT token
      try {
        const payload = JSON.parse(atob(response.access_token.split(".")[1]));
        if (payload.hospital_id) authUser.hospitalId = payload.hospital_id;
        if (payload.patient_id) authUser.patientId = payload.patient_id;
      } catch {
        // Token parse failed, continue with basic user info
      }

      storeLogin(response.access_token, authUser);

      // Redirect based on role
      if (
        authUser.role === "hospital_admin" ||
        authUser.role === "doctor"
      ) {
        navigate("/dashboard");
      } else {
        navigate("/sos");
      }
    },
    [storeLogin, navigate]
  );

  const logout = useCallback(() => {
    storeLogout();
    navigate("/login");
  }, [storeLogout, navigate]);

  const isHospitalStaff =
    user?.role === "hospital_admin" || user?.role === "doctor";
  const isPatient = user?.role === "patient";

  return {
    token,
    user,
    isAuthenticated,
    isHospitalStaff,
    isPatient,
    login,
    logout,
  };
}
