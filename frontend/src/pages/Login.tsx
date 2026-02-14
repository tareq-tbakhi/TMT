import React, { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { useAuthStore, type UserRole, type DepartmentType } from "../store/authStore";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

const Login: React.FC = () => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const { login } = useAuthStore();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

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
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="w-full max-w-md">
        {/* Logo / Header */}
        <div className="mb-8 text-center">
          <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-blue-600 text-3xl text-white shadow-lg">
            &#x1F3E5;
          </div>
          <h1 className="text-3xl font-bold text-gray-900">TMT</h1>
          <p className="mt-1 text-sm text-gray-500">
            Triage & Monitor for Threats
          </p>
        </div>

        {/* Login Card */}
        <div className="rounded-2xl border border-gray-200 bg-white p-8 shadow-xl">
          <h2 className="mb-6 text-xl font-semibold text-gray-900">
            {t("auth.login")}
          </h2>

          {error && (
            <div className="mb-4 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Phone */}
            <div>
              <label
                htmlFor="phone"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                {t("auth.phone")}
              </label>
              <input
                id="phone"
                type="tel"
                required
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="+970..."
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                dir="ltr"
              />
            </div>

            {/* Password */}
            <div>
              <label
                htmlFor="password"
                className="mb-1 block text-sm font-medium text-gray-700"
              >
                {t("auth.password")}
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="********"
                className="w-full rounded-lg border border-gray-300 px-4 py-2.5 text-sm focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20"
              />
            </div>

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? t("common.loading") : t("auth.loginButton")}
            </button>
          </form>

          {/* Register link */}
          <div className="mt-4 text-center">
            <Link
              to="/register"
              className="text-sm text-blue-600 hover:text-blue-800"
            >
              {t("auth.register", "Create an account")}
            </Link>
          </div>

          {/* Language toggle */}
          <div className="mt-4 text-center">
            <button
              onClick={toggleLanguage}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              {i18n.language === "ar" ? "English" : "\u0627\u0644\u0639\u0631\u0628\u064a\u0629"}
            </button>
          </div>
        </div>

        {/* Footer */}
        <p className="mt-6 text-center text-xs text-gray-400">
          TMT - Emergency Crisis Management System
        </p>
      </div>
    </div>
  );
};

export default Login;
