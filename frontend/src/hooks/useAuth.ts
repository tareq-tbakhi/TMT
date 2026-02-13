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
  isSuperAdmin: boolean;
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
        hospitalId: response.hospital_id,
        patientId: response.patient_id,
      };

      storeLogin(response.access_token, authUser);

      // Redirect based on role
      if (authUser.role === "super_admin") {
        navigate("/admin");
      } else if (authUser.role === "hospital_admin") {
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

  const isHospitalStaff = user?.role === "hospital_admin";
  const isSuperAdmin = user?.role === "super_admin";
  const isPatient = user?.role === "patient";

  return {
    token,
    user,
    isAuthenticated,
    isHospitalStaff,
    isSuperAdmin,
    isPatient,
    login,
    logout,
  };
}
