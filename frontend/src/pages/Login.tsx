import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import {
  Ambulance,
  ChevronDown,
  Flame,
  HardHat,
  HeartPulse,
  Languages,
  Siren,
  TriangleAlert,
  UserPlus,
  type LucideIcon,
} from "lucide-react";
import { useAuthStore, type UserRole, type DepartmentType } from "../store/authStore";
import { Button, Card, Input } from "../components/ui";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// Demo responder accounts for frontend testing
const DEMO_RESPONDERS: Array<{
  role: UserRole;
  label: string;
  icon: LucideIcon;
  route: string;
}> = [
  { role: "ambulance_driver", label: "Ambulance", icon: Ambulance, route: "/ambulance" },
  { role: "police_officer", label: "Police", icon: Siren, route: "/police" },
  { role: "civil_defense_responder", label: "Civil Defense", icon: HardHat, route: "/civil_defense" },
  { role: "firefighter", label: "Firefighter", icon: Flame, route: "/firefighter" },
];

const Login: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuthStore();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [showDemoResponders, setShowDemoResponders] = useState(false);

  const toggleLanguage = () => {
    const newLang = i18n.language === "ar" ? "en" : "ar";
    i18n.changeLanguage(newLang);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch(`${API_URL}/api/v1/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(
          (data as { detail?: string }).detail || "Login failed"
        );
      }

      const data = await res.json();
      const token = data.access_token as string;
      const role = data.role as string;
      const userId = data.user_id as string;

      login(token, {
        id: userId,
        role: role as UserRole,
        hospitalId: data.hospital_id ?? undefined,
        facilityType: (data.facility_type as DepartmentType) ?? undefined,
        patientId: data.patient_id ?? undefined,
      });

      // Redirect based on role from server response
      if (role === "super_admin") {
        navigate("/admin");
      } else if (
        role === "hospital_admin" ||
        role === "police_admin" ||
        role === "civil_defense_admin"
      ) {
        navigate("/dashboard");
      } else if (role === "ambulance_driver") {
        navigate("/ambulance");
      } else if (role === "police_officer") {
        navigate("/police");
      } else if (role === "civil_defense_responder") {
        navigate("/civil_defense");
      } else if (role === "firefighter") {
        navigate("/firefighter");
      } else {
        navigate("/sos");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-canvas px-4 py-10">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="mb-8 text-center">
          <span
            aria-hidden="true"
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-xl bg-accent text-on-accent shadow-2"
          >
            <HeartPulse className="h-8 w-8" />
          </span>
          <h1 className="text-3xl font-bold tracking-tight text-ink">TMT</h1>
          <p className="mt-1 text-base text-ink-muted">
            Triage & Monitor for Threats
          </p>
        </div>

        {/* Login Card */}
        <Card className="p-6 shadow-2 sm:p-8">
          <h2 className="mb-6 text-xl font-bold text-ink">
            {t("auth.login")}
          </h2>

          {error && (
            <div
              role="alert"
              className="mb-5 flex items-start gap-2.5 rounded-md border border-danger/30 bg-danger-soft p-3.5 text-on-danger-soft"
            >
              <TriangleAlert aria-hidden="true" className="mt-0.5 h-5 w-5 shrink-0" />
              <p className="text-base font-medium">{error}</p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            {/* Phone */}
            <Input
              label={t("auth.phone")}
              type="tel"
              required
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+970..."
              autoComplete="tel"
              dir="ltr"
            />

            {/* Password */}
            <Input
              label={t("auth.password")}
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="********"
              autoComplete="current-password"
            />

            {/* Submit */}
            <Button type="submit" size="lg" fullWidth loading={loading} className="mt-1">
              {loading ? t("common.loading") : t("auth.loginButton")}
            </Button>
          </form>

          {/* Register link */}
          <div className="mt-4 text-center">
            <Link
              to="/register"
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-base font-semibold text-link hover:underline focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
            >
              <UserPlus aria-hidden="true" className="h-4.5 w-4.5" />
              {t("auth.register", "Create an account")}
            </Link>
          </div>

          {/* Language toggle */}
          <div className="text-center">
            <button
              type="button"
              onClick={toggleLanguage}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-3 text-base font-semibold text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
            >
              <Languages aria-hidden="true" className="h-4.5 w-4.5" />
              {i18n.language === "ar" ? "English" : "العربية"}
            </button>
          </div>

          {/* Demo Field Responder Login */}
          <div className="mt-6 border-t border-edge pt-5">
            <button
              type="button"
              onClick={() => setShowDemoResponders(!showDemoResponders)}
              aria-expanded={showDemoResponders}
              className="flex min-h-11 w-full items-center justify-center gap-2 rounded-md px-3 text-sm font-semibold text-ink-muted transition-colors hover:bg-surface-2 hover:text-ink focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
            >
              <span>Demo: Field Responder Login</span>
              <ChevronDown
                aria-hidden="true"
                className={`h-4 w-4 transition-transform ${showDemoResponders ? "rotate-180" : ""}`}
              />
            </button>

            {showDemoResponders && (
              <div className="mt-4 grid grid-cols-2 gap-2.5">
                {DEMO_RESPONDERS.map((demo) => {
                  const Icon = demo.icon;
                  return (
                    <button
                      key={demo.role}
                      type="button"
                      onClick={() => {
                        // Demo login - bypass API for frontend testing
                        login("demo-token-" + demo.role, {
                          id: "demo-" + demo.role,
                          role: demo.role,
                        });
                        navigate(demo.route);
                      }}
                      className="flex min-h-24 flex-col items-center justify-center gap-2 rounded-lg border border-edge bg-surface-2 p-3 transition-colors hover:border-edge-strong hover:bg-surface-3 focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2"
                    >
                      <span
                        aria-hidden="true"
                        className="flex h-10 w-10 items-center justify-center rounded-full bg-accent-soft text-on-accent-soft"
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="text-sm font-semibold text-ink">{demo.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </Card>

        {/* Footer */}
        <p className="mt-6 text-center text-sm text-ink-faint">
          TMT - Emergency Crisis Management System
        </p>
      </div>
    </div>
  );
};

export default Login;
