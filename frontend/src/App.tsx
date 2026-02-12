/**
 * Main App component with React Router configuration.
 * Defines all application routes and wraps them with auth guards.
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Layouts
import AuthGuard from "./components/layouts/AuthGuard";
import DashboardLayout from "./components/common/DashboardLayout";

// Pages - Auth
import Login from "./pages/Login";
import Register from "./pages/patient/Register";

// Pages - Hospital Dashboard
import Dashboard from "./pages/hospital/Dashboard";
import CrisisAlerts from "./pages/hospital/CrisisAlerts";
import Analytics from "./pages/hospital/Analytics";
import PatientList from "./pages/hospital/PatientList";
import PatientDetail from "./pages/hospital/PatientDetail";
import LiveMap from "./pages/hospital/LiveMap";
import StatusUpdate from "./pages/hospital/StatusUpdate";

// Pages - Patient
import SOSPage from "./pages/patient/SOS";
import ProfilePage from "./pages/patient/Profile";
import PatientAlertsPage from "./pages/patient/Alerts";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Hospital dashboard routes - require hospital_admin or doctor role */}
        <Route
          element={<AuthGuard roles={["hospital_admin", "doctor"]} />}
        >
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/dashboard/alerts" element={<CrisisAlerts />} />
            <Route path="/dashboard/analytics" element={<Analytics />} />
            <Route path="/dashboard/patients" element={<PatientList />} />
            <Route
              path="/dashboard/patients/:id"
              element={<PatientDetail />}
            />
            <Route path="/dashboard/map" element={<LiveMap />} />
            <Route path="/dashboard/status" element={<StatusUpdate />} />
          </Route>
        </Route>

        {/* Patient routes - require any authenticated user */}
        <Route element={<AuthGuard />}>
          <Route path="/sos" element={<SOSPage />} />
          <Route path="/profile" element={<ProfilePage />} />
          <Route path="/patient-alerts" element={<PatientAlertsPage />} />
        </Route>

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
