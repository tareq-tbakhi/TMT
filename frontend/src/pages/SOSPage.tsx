/**
 * SOS emergency page for patients.
 * Supports both online (API) and offline (SMS) SOS.
 */

import { useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";
import { useAuth } from "../hooks/useAuth";
import { useOffline } from "../hooks/useOffline";
import { useSMSFallback } from "../hooks/useSMSFallback";
import { createSOS } from "../services/api";
import { getCurrentPosition } from "../utils/locationCodec";

export default function SOSPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isOffline } = useOffline();
  const smsFallback = useSMSFallback();

  const [status, setStatus] = useState("injured");
  const [severity, setSeverity] = useState("3");
  const [details, setDetails] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSending(true);

    try {
      if (isOffline) {
        // Use SMS fallback
        const success = await smsFallback.sendSOS(status, severity);
        if (success) {
          setSent(true);
        } else {
          setError(smsFallback.error || "Failed to send SMS SOS");
        }
      } else {
        // Use API
        const pos = await getCurrentPosition();
        await createSOS({
          latitude: pos.latitude,
          longitude: pos.longitude,
          patient_status: status,
          severity: parseInt(severity),
          details: details || undefined,
        });
        setSent(true);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send SOS");
    } finally {
      setSending(false);
    }
  }

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-green-50 px-4">
        <div className="text-center">
          <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-6">
            <span className="text-white text-3xl">&#10003;</span>
          </div>
          <h1 className="text-2xl font-bold text-green-800 mb-2">
            {t("sos.sent")}
          </h1>
          <p className="text-green-600">
            Help is on the way. Stay calm and stay safe.
          </p>
          <button
            onClick={() => {
              setSent(false);
              setDetails("");
            }}
            className="mt-6 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
          >
            Send Another SOS
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-red-50 px-4 py-8">
      <div className="max-w-lg mx-auto">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-red-800">
            {t("sos.title")}
          </h1>
          {user && (
            <p className="text-sm text-red-600 mt-1">
              Logged in as {user.role}
            </p>
          )}
        </div>

        {/* Offline warning */}
        {isOffline && (
          <div className="bg-yellow-100 border border-yellow-300 text-yellow-800 px-4 py-3 rounded-lg mb-6 text-sm">
            {t("sos.offline")}
          </div>
        )}

        {error && (
          <div className="bg-red-100 text-red-700 px-4 py-3 rounded-lg mb-4 text-sm">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Patient Status */}
          <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6">
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              {t("sos.status")}
            </label>
            <div className="grid grid-cols-2 gap-3">
              {[
                { value: "safe", label: "Safe", color: "bg-green-500" },
                { value: "injured", label: "Injured", color: "bg-orange-500" },
                { value: "trapped", label: "Trapped", color: "bg-red-500" },
                { value: "evacuate", label: "Evacuate", color: "bg-purple-500" },
              ].map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setStatus(opt.value)}
                  className={`p-4 rounded-xl text-sm font-medium transition-all ${
                    status === opt.value
                      ? `${opt.color} text-white shadow-lg scale-105`
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Severity */}
          <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6">
            <label className="block text-sm font-semibold text-gray-900 mb-3">
              {t("sos.severity")}
            </label>
            <div className="flex gap-2">
              {["1", "2", "3", "4", "5"].map((level) => (
                <button
                  key={level}
                  type="button"
                  onClick={() => setSeverity(level)}
                  className={`flex-1 py-3 rounded-lg text-sm font-bold transition-all ${
                    severity === level
                      ? "bg-red-600 text-white shadow-lg"
                      : "bg-gray-100 text-gray-700 hover:bg-gray-200"
                  }`}
                >
                  {level}
                </button>
              ))}
            </div>
            <div className="flex justify-between text-xs text-gray-400 mt-1 px-1">
              <span>Low</span>
              <span>Critical</span>
            </div>
          </div>

          {/* Details */}
          {!isOffline && (
            <div className="bg-white rounded-xl shadow-sm border border-red-100 p-6">
              <label className="block text-sm font-semibold text-gray-900 mb-3">
                Details (optional)
              </label>
              <textarea
                value={details}
                onChange={(e) => setDetails(e.target.value)}
                rows={3}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-red-500 focus:border-transparent"
                placeholder="Describe your situation..."
              />
            </div>
          )}

          {/* Submit */}
          <button
            type="submit"
            disabled={sending}
            className="w-full bg-red-600 text-white py-4 px-6 rounded-xl text-lg font-bold hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-lg"
          >
            {sending ? t("sos.sending") : t("sos.send")}
          </button>
        </form>
      </div>
    </div>
  );
}
