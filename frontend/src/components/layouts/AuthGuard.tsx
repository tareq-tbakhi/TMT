/**
 * AuthGuard component that redirects unauthenticated users to login.
 */

import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "../../store/authStore";

interface AuthGuardProps {
  /** Allowed roles. If empty, any authenticated user is allowed. */
  roles?: string[];
}

export default function AuthGuard({ roles }: AuthGuardProps) {
  const { isAuthenticated, user } = useAuthStore();
  const location = useLocation();

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (roles && roles.length > 0 && user && !roles.includes(user.role)) {
    // User doesn't have the required role - redirect to appropriate page
    if (user.role === "super_admin") {
      return <Navigate to="/admin" replace />;
    }
    if (user.role === "hospital_admin") {
      return <Navigate to="/dashboard" replace />;
    }
    if (user.role === "patient") {
      return <Navigate to="/sos" replace />;
    }
    return <Navigate to="/login" replace />;
  }

  return <Outlet />;
}
