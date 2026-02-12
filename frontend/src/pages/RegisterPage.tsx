/**
 * Registration page for patients and hospitals.
 */

import { useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { registerPatient, registerHospital } from "../services/api";

type RegistrationType = "patient" | "hospital";

export default function RegisterPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [type, setType] = useState<RegistrationType>("patient");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (type === "patient") {
        await registerPatient({ phone, password, name });
      } else {
        await registerHospital({ name, phone, password, email: email || undefined });
      }
      navigate("/login");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100 px-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">TMT</h1>
          <p className="text-sm text-gray-500 mt-1">
            Triage & Monitor for Threats
          </p>
        </div>

        <h2 className="text-xl font-semibold mb-6">{t("auth.register")}</h2>

        {/* Type selector */}
        <div className="flex gap-2 mb-6">
          <button
            type="button"
            onClick={() => setType("patient")}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              type === "patient"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Patient
          </button>
          <button
            type="button"
            onClick={() => setType("hospital")}
            className={`flex-1 py-2 px-4 rounded-lg text-sm font-medium transition-colors ${
              type === "hospital"
                ? "bg-blue-600 text-white"
                : "bg-gray-100 text-gray-700 hover:bg-gray-200"
            }`}
          >
            Hospital
          </button>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {type === "patient" ? t("patients.name") : "Hospital Name"}
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("auth.phone")}
            </label>
            <input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              placeholder="+970..."
              required
            />
          </div>

          {type === "hospital" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                {t("auth.email")}
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              {t("auth.password")}
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              required
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? t("common.loading") : t("auth.registerButton")}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-gray-500">
          {t("auth.login")}?{" "}
          <Link to="/login" className="text-blue-600 hover:underline">
            {t("auth.loginButton")}
          </Link>
        </p>
      </div>
    </div>
  );
}
