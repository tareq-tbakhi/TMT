/**
 * Main App component with React Router configuration.
 * Defines all application routes and wraps them with auth guards.
 */

import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";

// Layouts
import AuthGuard from "./components/layouts/AuthGuard";
import DashboardLayout from "./components/common/DashboardLayout";
import PatientLayout from "./components/common/PatientLayout";
import AdminLayout from "./components/common/AdminLayout";

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
import AidRequests from "./pages/hospital/AidRequests";
import CaseTransfers from "./pages/hospital/CaseTransfers";

// Pages - Patient
import SOSPage from "./pages/patient/SOS";
import NewsPage from "./pages/patient/News";
import ProfilePage from "./pages/patient/Profile";
import PatientAlertsPage from "./pages/patient/Alerts";
import MedicalRecords from "./pages/patient/MedicalRecords";

// Pages - Super Admin
import AdminDashboard from "./pages/admin/AdminDashboard";
import HospitalManagement from "./pages/admin/HospitalManagement";
import UserManagement from "./pages/admin/UserManagement";
import TelegramManagement from "./pages/admin/TelegramManagement";

// Pages - Field Responders
import { AmbulanceLayout, AmbulanceActiveCase, AmbulanceMap, AmbulanceHistory } from "./pages/responder/ambulance";
import { PoliceLayout, PoliceActiveCase, PoliceMap, PoliceHistory } from "./pages/responder/police";
import { CivilDefenseLayout, CivilDefenseActiveCase, CivilDefenseEquipment, CivilDefenseMap } from "./pages/responder/civil_defense";
import { FirefighterLayout, FirefighterActiveCase, FirefighterEquipment, FirefighterMap } from "./pages/responder/firefighter";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        {/* Public routes */}
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />

        {/* Super Admin routes - require super_admin role */}
        <Route element={<AuthGuard roles={["super_admin"]} />}>
          <Route element={<AdminLayout />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/hospitals" element={<HospitalManagement />} />
            <Route path="/admin/users" element={<UserManagement />} />
            <Route path="/admin/analytics" element={<Analytics />} />
            <Route path="/admin/alerts" element={<CrisisAlerts />} />
            <Route path="/admin/social-media" element={<TelegramManagement />} />
          </Route>
        </Route>

        {/* Department dashboard routes - all department admins + super_admin */}
        <Route
          element={<AuthGuard roles={["hospital_admin", "police_admin", "civil_defense_admin", "super_admin"]} />}
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
            <Route path="/dashboard/aid-requests" element={<AidRequests />} />
            <Route path="/dashboard/transfers" element={<CaseTransfers />} />
            <Route path="/dashboard/status" element={<StatusUpdate />} />
          </Route>
        </Route>

        {/* Patient routes - require any authenticated user, wrapped in PatientLayout */}
        <Route element={<AuthGuard />}>
          <Route element={<PatientLayout />}>
            <Route path="/sos" element={<SOSPage />} />
            <Route path="/news" element={<NewsPage />} />
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/patient-alerts" element={<PatientAlertsPage />} />
            <Route path="/health-records" element={<MedicalRecords />} />
          </Route>
        </Route>

        {/* Field Responder Routes - Ambulance Driver */}
        <Route element={<AuthGuard roles={["ambulance_driver"]} />}>
          <Route element={<AmbulanceLayout />}>
            <Route path="/ambulance" element={<AmbulanceActiveCase />} />
            <Route path="/ambulance/map" element={<AmbulanceMap />} />
            <Route path="/ambulance/history" element={<AmbulanceHistory />} />
          </Route>
        </Route>

        {/* Field Responder Routes - Police Officer */}
        <Route element={<AuthGuard roles={["police_officer"]} />}>
          <Route element={<PoliceLayout />}>
            <Route path="/police" element={<PoliceActiveCase />} />
            <Route path="/police/map" element={<PoliceMap />} />
            <Route path="/police/history" element={<PoliceHistory />} />
          </Route>
        </Route>

        {/* Field Responder Routes - Civil Defense */}
        <Route element={<AuthGuard roles={["civil_defense_responder"]} />}>
          <Route element={<CivilDefenseLayout />}>
            <Route path="/civil_defense" element={<CivilDefenseActiveCase />} />
            <Route path="/civil_defense/equipment" element={<CivilDefenseEquipment />} />
            <Route path="/civil_defense/map" element={<CivilDefenseMap />} />
          </Route>
        </Route>

        {/* Field Responder Routes - Firefighter */}
        <Route element={<AuthGuard roles={["firefighter"]} />}>
          <Route element={<FirefighterLayout />}>
            <Route path="/firefighter" element={<FirefighterActiveCase />} />
            <Route path="/firefighter/equipment" element={<FirefighterEquipment />} />
            <Route path="/firefighter/map" element={<FirefighterMap />} />
          </Route>
        </Route>

        {/* Default redirect */}
        <Route path="/" element={<Navigate to="/login" replace />} />
        <Route path="*" element={<Navigate to="/login" replace />} />
      </Routes>
    </BrowserRouter>
  );
}

export default App;
