import { useState, useEffect, useCallback, useRef } from "react";
import { createSOS, getHospitals, type Hospital } from "../../services/api";
import { buildSMSBody, sendViaSMS } from "../../services/smsService";
import { useAuthStore } from "../../store/authStore";
import { getCurrentPosition } from "../../utils/locationCodec";
import { patientStatusConfig } from "../../utils/formatting";

// ─── Types ───────────────────────────────────────────────────────

type PatientStatus = "safe" | "injured" | "trapped" | "evacuate";

interface SOSFormData {
  patientStatus: PatientStatus;
  severity: number;
  details: string;
}

type SOSState = "idle" | "sending" | "sent" | "sms_ready" | "error" | "cancelled";

// ─── IndexedDB Helper ───────────────────────────────────────────

const DB_NAME = "tmt-offline";
const DB_VERSION = 1;
const STORE_NAME = "pending_sos";

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: "id", autoIncrement: true });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function storePendingSOS(data: Record<string, unknown>): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.add({ ...data, created_at: new Date().toISOString() });
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function getPendingSOS(): Promise<Array<Record<string, unknown>>> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readonly");
  const store = tx.objectStore(STORE_NAME);
  const request = store.getAll();
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function clearPendingSOS(): Promise<void> {
  const db = await openDB();
  const tx = db.transaction(STORE_NAME, "readwrite");
  const store = tx.objectStore(STORE_NAME);
  store.clear();
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

// ─── TMT SMS Number ─────────────────────────────────────────────

const TMT_SMS_NUMBER = import.meta.env.VITE_TMT_SMS_NUMBER || "+970599000000";

// ─── Haversine Distance ─────────────────────────────────────────

function haversineKm(
  lat1: number,
  lon1: number,
  lat2: number,
  lon2: number
): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─── Main Component ─────────────────────────────────────────────

export default function SOS() {
  const user = useAuthStore((s) => s.user);

  // Online/Offline state
  const [isOnline, setIsOnline] = useState(navigator.onLine);

  // GPS state
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);
  const [gpsLoading, setGpsLoading] = useState(false);
  const [gpsError, setGpsError] = useState<string | null>(null);

  // SOS form
  const [form, setForm] = useState<SOSFormData>({
    patientStatus: "injured",
    severity: 3,
    details: "",
  });

  // SOS state
  const [sosState, setSosState] = useState<SOSState>("idle");
  const [sosError, setSosError] = useState<string | null>(null);
  const [sosResponse, setSosResponse] = useState<{
    id?: string;
    hospital_name?: string;
  } | null>(null);

  // SMS state
  const [smsBody, setSmsBody] = useState<string | null>(null);

  // Nearest hospital
  const [nearestHospital, setNearestHospital] = useState<
    (Hospital & { distance: number }) | null
  >(null);
  const [hospitalLoading, setHospitalLoading] = useState(false);

  // Pending SOS count
  const [pendingCount, setPendingCount] = useState(0);

  // Refs for cleanup
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // ─── Online/Offline Listeners ─────────────────────────────

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      syncPendingSOS();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // ─── Auto-detect GPS on Load ──────────────────────────────

  const detectGPS = useCallback(async () => {
    setGpsLoading(true);
    setGpsError(null);
    try {
      const pos = await getCurrentPosition();
      setLatitude(pos.latitude);
      setLongitude(pos.longitude);
    } catch (err) {
      setGpsError(
        err instanceof Error
          ? err.message
          : "Could not detect GPS location. Please enable location services."
      );
    } finally {
      setGpsLoading(false);
    }
  }, []);

  useEffect(() => {
    detectGPS();
  }, [detectGPS]);

  // ─── Fetch Nearest Hospital ───────────────────────────────

  const fetchNearestHospital = useCallback(async () => {
    if (latitude === null || longitude === null || !isOnline) return;
    setHospitalLoading(true);
    try {
      const hospitals = await getHospitals();
      const operational = hospitals.filter(
        (h) =>
          h.status === "operational" &&
          h.latitude !== null &&
          h.longitude !== null
      );

      if (operational.length > 0) {
        let closest = operational[0];
        let minDist = haversineKm(
          latitude,
          longitude,
          closest.latitude!,
          closest.longitude!
        );

        for (let i = 1; i < operational.length; i++) {
          const dist = haversineKm(
            latitude,
            longitude,
            operational[i].latitude!,
            operational[i].longitude!
          );
          if (dist < minDist) {
            minDist = dist;
            closest = operational[i];
          }
        }

        setNearestHospital({ ...closest, distance: minDist });
      }
    } catch {
      // Silently fail - hospital info is supplementary
    } finally {
      setHospitalLoading(false);
    }
  }, [latitude, longitude, isOnline]);

  useEffect(() => {
    fetchNearestHospital();
  }, [fetchNearestHospital]);

  // ─── Check Pending SOS ────────────────────────────────────

  useEffect(() => {
    const checkPending = async () => {
      try {
        const pending = await getPendingSOS();
        setPendingCount(pending.length);
      } catch {
        // IndexedDB might not be available
      }
    };
    checkPending();
  }, [sosState]);

  // ─── Sync Pending SOS When Online ─────────────────────────

  const syncPendingSOS = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const pending = await getPendingSOS();
      if (pending.length === 0) return;

      for (const sos of pending) {
        try {
          await createSOS({
            latitude: sos.latitude as number,
            longitude: sos.longitude as number,
            patient_status: sos.patient_status as string,
            severity: sos.severity as number,
            details: sos.details as string,
          });
        } catch {
          // Keep trying with next
        }
      }
      await clearPendingSOS();
      setPendingCount(0);
    } catch {
      // IndexedDB error
    }
  }, []);

  // Periodic sync attempt
  useEffect(() => {
    if (isOnline && pendingCount > 0) {
      syncPendingSOS();
    }
    syncTimerRef.current = setInterval(() => {
      if (navigator.onLine) syncPendingSOS();
    }, 30000);

    return () => {
      if (syncTimerRef.current) clearInterval(syncTimerRef.current);
    };
  }, [isOnline, pendingCount, syncPendingSOS]);

  // ─── Send SOS Online ──────────────────────────────────────

  const handleSOSOnline = async () => {
    if (latitude === null || longitude === null) {
      setSosError("GPS location is required. Please enable location services.");
      return;
    }

    setSosState("sending");
    setSosError(null);

    try {
      const response = await createSOS({
        latitude,
        longitude,
        patient_status: form.patientStatus,
        severity: form.severity,
        details: form.details || undefined,
      });

      setSosResponse({
        id: response.id,
        hospital_name: nearestHospital?.name,
      });
      setSosState("sent");
    } catch (err) {
      setSosError(
        err instanceof Error
          ? err.message
          : "Failed to send SOS. Try SMS fallback."
      );
      setSosState("error");
    }
  };

  // ─── Send SOS Offline (SMS) ───────────────────────────────

  const handleSOSOffline = async () => {
    if (latitude === null || longitude === null) {
      // Try GPS one more time
      try {
        const pos = await getCurrentPosition();
        setLatitude(pos.latitude);
        setLongitude(pos.longitude);
        await buildAndSendSMS(pos.latitude, pos.longitude);
      } catch {
        setSosError(
          "GPS location is required. Please enable location services and try again."
        );
        return;
      }
    } else {
      await buildAndSendSMS(latitude, longitude);
    }
  };

  const buildAndSendSMS = async (lat: number, lng: number) => {
    setSosState("sending");
    setSosError(null);

    try {
      const patientId =
        localStorage.getItem("tmt-patient-short-id") ||
        user?.id ||
        "UNKNOWN";
      const encryptionKey = localStorage.getItem("tmt-sms-key");

      // Build encrypted SMS payload
      const body = await buildSMSBody(
        patientId,
        lat,
        lng,
        form.patientStatus,
        String(form.severity),
        encryptionKey || undefined
      );

      setSmsBody(body);

      // Store in IndexedDB for later sync
      await storePendingSOS({
        latitude: lat,
        longitude: lng,
        patient_status: form.patientStatus,
        severity: form.severity,
        details: form.details,
        sms_sent: true,
      });

      setSosState("sms_ready");
    } catch (err) {
      setSosError(
        err instanceof Error ? err.message : "Failed to prepare SMS"
      );
      setSosState("error");
    }
  };

  const openSMSApp = async () => {
    if (!smsBody) return;
    await sendViaSMS(smsBody, TMT_SMS_NUMBER);
  };

  // ─── Handle SOS Button Press ──────────────────────────────

  const handleSOS = () => {
    if (isOnline) {
      handleSOSOnline();
    } else {
      handleSOSOffline();
    }
  };

  // ─── Cancel SOS ───────────────────────────────────────────

  const handleCancel = () => {
    setSosState("cancelled");
    setTimeout(() => {
      setSosState("idle");
      setSosResponse(null);
      setSmsBody(null);
      setSosError(null);
    }, 2000);
  };

  const resetSOS = () => {
    setSosState("idle");
    setSosResponse(null);
    setSmsBody(null);
    setSosError(null);
  };

  // ─── Render: Confirmation Screen ──────────────────────────

  if (sosState === "sent" || sosState === "sms_ready") {
    return (
      <div className="min-h-full bg-gray-50 flex items-center justify-center p-4">
        <div className="max-w-md w-full">
          {/* Success Card */}
          <div className="bg-white rounded-2xl shadow-xl p-8 text-center mb-6">
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center mx-auto mb-6 ${
                sosState === "sent" ? "bg-green-100" : "bg-blue-100"
              }`}
            >
              {sosState === "sent" ? (
                <svg
                  className="w-10 h-10 text-green-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M5 13l4 4L19 7"
                  />
                </svg>
              ) : (
                <svg
                  className="w-10 h-10 text-blue-500"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                  />
                </svg>
              )}
            </div>

            <h2 className="text-2xl font-bold text-gray-900 mb-2">
              {sosState === "sent"
                ? "SOS Received"
                : "SMS Ready to Send"}
            </h2>
            <p className="text-gray-600 mb-6">
              {sosState === "sent"
                ? "Your emergency signal has been received. The nearest hospital has been notified."
                : "Your SOS message is encrypted and ready. Tap the button below to open your SMS app."}
            </p>

            {/* SMS Send Button */}
            {sosState === "sms_ready" && smsBody && (
              <button
                onClick={openSMSApp}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 text-white rounded-xl text-lg font-bold hover:bg-blue-700 transition mb-4"
              >
                <svg
                  className="w-6 h-6"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M8 10h.01M12 10h.01M16 10h.01M9 16H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-5l-5 5v-5z"
                  />
                </svg>
                Open SMS App to Send
              </button>
            )}

            {/* SOS ID */}
            {sosResponse?.id && (
              <div className="bg-gray-50 rounded-lg p-3 mb-4">
                <p className="text-xs text-gray-500">SOS Reference</p>
                <p className="text-sm font-mono font-medium text-gray-800">
                  {sosResponse.id}
                </p>
              </div>
            )}
          </div>

          {/* Nearest Hospital Card */}
          {nearestHospital && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 mb-4">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                  <svg
                    className="w-5 h-5 text-green-600"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <h3 className="font-semibold text-gray-900">
                    {nearestHospital.name}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {nearestHospital.distance.toFixed(1)} km away
                  </p>
                  <p className="text-sm text-green-600 font-medium">
                    {nearestHospital.status === "operational"
                      ? "Operational"
                      : nearestHospital.status}
                  </p>
                  {nearestHospital.phone && (
                    <a
                      href={`tel:${nearestHospital.phone}`}
                      className="inline-flex items-center gap-1 mt-1 text-sm text-blue-600 hover:text-blue-700"
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M3 5a2 2 0 012-2h3.28a1 1 0 01.948.684l1.498 4.493a1 1 0 01-.502 1.21l-2.257 1.13a11.042 11.042 0 005.516 5.516l1.13-2.257a1 1 0 011.21-.502l4.493 1.498a1 1 0 01.684.949V19a2 2 0 01-2 2h-1C9.716 21 3 14.284 3 6V5z"
                        />
                      </svg>
                      {nearestHospital.phone}
                    </a>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Safety Instructions */}
          <div className="bg-amber-50 border border-amber-200 rounded-xl p-5 mb-4">
            <h3 className="font-semibold text-amber-800 mb-2 flex items-center gap-2">
              <svg
                className="w-5 h-5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              Stay Safe
            </h3>
            <ul className="text-sm text-amber-700 space-y-1.5">
              <li>Stay where you are if it is safe to do so</li>
              <li>Keep your phone charged and nearby</li>
              <li>If you can, move to an open area away from buildings</li>
              <li>Signal rescuers if you hear them approaching</li>
              <li>Conserve water and food if available</li>
            </ul>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <button
              onClick={handleCancel}
              className="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl font-medium hover:bg-gray-50 transition"
            >
              Cancel SOS
            </button>
            <button
              onClick={resetSOS}
              className="flex-1 px-4 py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200 transition"
            >
              Send Another
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ─── Render: Cancelled Screen ─────────────────────────────

  if (sosState === "cancelled") {
    return (
      <div className="min-h-full bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <svg
              className="w-8 h-8 text-gray-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </div>
          <h2 className="text-xl font-bold text-gray-900 mb-2">SOS Cancelled</h2>
          <p className="text-gray-500">Returning to SOS screen...</p>
        </div>
      </div>
    );
  }

  // ─── Render: Main SOS Screen ──────────────────────────────

  return (
    <div className="min-h-full bg-gray-50">
      {/* Online/Offline Banner */}
      <div
        className={`px-4 py-2.5 text-center text-sm font-medium ${
          isOnline
            ? "bg-green-500 text-white"
            : "bg-amber-500 text-white"
        }`}
      >
        {isOnline ? (
          <span className="flex items-center justify-center gap-2">
            <span className="w-2 h-2 bg-white rounded-full animate-pulse" />
            Connected - SOS will be sent via internet
          </span>
        ) : (
          <span className="flex items-center justify-center gap-2">
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path
                fillRule="evenodd"
                d="M3.707 2.293a1 1 0 00-1.414 1.414l6.921 6.922c.05.062.105.118.168.167l6.91 6.911a1 1 0 001.415-1.414l-.675-.675A9.001 9.001 0 0010 2H9.5a1 1 0 000 2H10a7 7 0 014.95 2.05l-1.414 1.414A5 5 0 0010 6a4.978 4.978 0 00-2.793.856L3.707 2.293z"
                clipRule="evenodd"
              />
            </svg>
            No Internet - SMS SOS Mode
          </span>
        )}
      </div>

      {/* Pending SOS Sync Badge */}
      {pendingCount > 0 && isOnline && (
        <div className="px-4 py-2 bg-blue-50 text-center text-sm text-blue-700">
          Syncing {pendingCount} pending SOS signal{pendingCount > 1 ? "s" : ""}...
        </div>
      )}

      <div className="max-w-md mx-auto px-4 py-6">
        {/* Header */}
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-gray-900">Emergency SOS</h1>
          <p className="text-gray-500 text-sm mt-1">
            Send an emergency signal to the nearest hospital
          </p>
        </div>

        {/* GPS Status */}
        <div
          className={`rounded-xl p-4 mb-6 ${
            latitude !== null && longitude !== null
              ? "bg-green-50 border border-green-200"
              : gpsLoading
                ? "bg-blue-50 border border-blue-200"
                : "bg-red-50 border border-red-200"
          }`}
        >
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <svg
                className={`w-5 h-5 ${
                  latitude !== null
                    ? "text-green-600"
                    : gpsLoading
                      ? "text-blue-600 animate-pulse"
                      : "text-red-600"
                }`}
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                  clipRule="evenodd"
                />
              </svg>
              <div>
                {gpsLoading ? (
                  <p className="text-sm font-medium text-blue-700">
                    Detecting location...
                  </p>
                ) : latitude !== null && longitude !== null ? (
                  <>
                    <p className="text-sm font-medium text-green-700">
                      Location detected
                    </p>
                    <p className="text-xs text-green-600">
                      {latitude.toFixed(6)}, {longitude.toFixed(6)}
                    </p>
                  </>
                ) : (
                  <p className="text-sm font-medium text-red-700">
                    {gpsError || "Location not available"}
                  </p>
                )}
              </div>
            </div>
            {!gpsLoading && (
              <button
                onClick={detectGPS}
                className="px-3 py-1.5 text-xs font-medium bg-white border border-gray-200 rounded-lg hover:bg-gray-50 transition"
              >
                Refresh
              </button>
            )}
          </div>
        </div>

        {/* Nearest Hospital */}
        {nearestHospital && !hospitalLoading && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-green-100 rounded-full flex items-center justify-center shrink-0">
                <svg
                  className="w-4 h-4 text-green-600"
                  fill="none"
                  stroke="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth={2}
                    d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4"
                  />
                </svg>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 truncate">
                  Nearest: {nearestHospital.name}
                </p>
                <p className="text-xs text-gray-500">
                  {nearestHospital.distance.toFixed(1)} km away - {nearestHospital.available_beds} beds available
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Patient Status Selection */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-900 mb-3">
            Your Current Status
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(
              Object.entries(patientStatusConfig) as Array<
                [PatientStatus, (typeof patientStatusConfig)[string]]
              >
            ).map(([key, config]) => (
              <button
                key={key}
                type="button"
                onClick={() =>
                  setForm((prev) => ({ ...prev, patientStatus: key }))
                }
                className={`px-4 py-3 rounded-xl border-2 text-sm font-medium transition ${
                  form.patientStatus === key
                    ? key === "safe"
                      ? "border-green-500 bg-green-50 text-green-700"
                      : key === "injured"
                        ? "border-orange-500 bg-orange-50 text-orange-700"
                        : key === "trapped"
                          ? "border-red-500 bg-red-50 text-red-700"
                          : "border-purple-500 bg-purple-50 text-purple-700"
                    : "border-gray-200 text-gray-600 hover:border-gray-300"
                }`}
              >
                {config.label}
              </button>
            ))}
          </div>
        </div>

        {/* Severity */}
        <div className="mb-6">
          <label className="block text-sm font-semibold text-gray-900 mb-3">
            Severity Level:{" "}
            <span
              className={
                form.severity <= 2
                  ? "text-yellow-600"
                  : form.severity <= 3
                    ? "text-orange-600"
                    : "text-red-600"
              }
            >
              {form.severity}/5
            </span>
          </label>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((level) => (
              <button
                key={level}
                type="button"
                onClick={() =>
                  setForm((prev) => ({ ...prev, severity: level }))
                }
                className={`flex-1 py-3 rounded-xl border-2 text-sm font-bold transition ${
                  form.severity >= level
                    ? level <= 2
                      ? "border-yellow-400 bg-yellow-50 text-yellow-700"
                      : level <= 3
                        ? "border-orange-400 bg-orange-50 text-orange-700"
                        : "border-red-500 bg-red-50 text-red-700"
                    : "border-gray-200 text-gray-400 hover:border-gray-300"
                }`}
              >
                {level}
              </button>
            ))}
          </div>
          <div className="flex justify-between mt-1 px-1">
            <span className="text-xs text-gray-400">Low</span>
            <span className="text-xs text-gray-400">Critical</span>
          </div>
        </div>

        {/* Details */}
        <div className="mb-8">
          <label className="block text-sm font-semibold text-gray-900 mb-2">
            Additional Details{" "}
            <span className="font-normal text-gray-400">(optional)</span>
          </label>
          <textarea
            value={form.details}
            onChange={(e) =>
              setForm((prev) => ({ ...prev, details: e.target.value }))
            }
            rows={3}
            className="w-full px-4 py-3 border border-gray-300 rounded-xl focus:ring-2 focus:ring-red-500 focus:border-red-500 outline-none resize-none text-sm"
            placeholder="Describe your situation briefly..."
          />
        </div>

        {/* Error */}
        {sosError && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 flex items-start gap-3">
            <svg
              className="w-5 h-5 text-red-500 mt-0.5 shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <div>
              <p className="text-red-700 text-sm font-medium">{sosError}</p>
              {!isOnline && (
                <button
                  onClick={handleSOSOffline}
                  className="mt-2 text-sm text-red-600 underline hover:text-red-700"
                >
                  Try SMS Fallback
                </button>
              )}
            </div>
          </div>
        )}

        {/* SOS BUTTON */}
        <div className="flex flex-col items-center mb-8">
          <button
            onClick={handleSOS}
            disabled={sosState === "sending" || (latitude === null && !gpsLoading)}
            className={`relative w-48 h-48 rounded-full flex items-center justify-center text-white font-bold text-2xl shadow-2xl transition-all duration-300 ${
              sosState === "sending"
                ? "bg-gray-400 cursor-wait"
                : "bg-red-600 hover:bg-red-700 hover:scale-105 active:scale-95"
            } ${
              sosState !== "sending" && latitude !== null
                ? "animate-pulse"
                : ""
            }`}
            style={
              sosState !== "sending" && latitude !== null
                ? {
                    boxShadow:
                      "0 0 0 0 rgba(220, 38, 38, 0.7), 0 0 60px rgba(220, 38, 38, 0.3)",
                    animation: "sos-pulse 2s ease-in-out infinite",
                  }
                : undefined
            }
          >
            {/* Pulsing ring */}
            {sosState !== "sending" && latitude !== null && (
              <>
                <span className="absolute inset-0 rounded-full border-4 border-red-400 opacity-75 animate-ping" />
                <span className="absolute inset-[-8px] rounded-full border-2 border-red-300 opacity-50 animate-ping" style={{ animationDelay: "0.5s" }} />
              </>
            )}

            {sosState === "sending" ? (
              <div className="flex flex-col items-center">
                <svg
                  className="w-10 h-10 animate-spin mb-2"
                  fill="none"
                  viewBox="0 0 24 24"
                >
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                  />
                </svg>
                <span className="text-lg">Sending...</span>
              </div>
            ) : (
              <div className="flex flex-col items-center relative z-10">
                <span className="text-5xl font-black tracking-wider">SOS</span>
                <span className="text-sm font-medium mt-1 opacity-80">
                  {isOnline ? "TAP TO SEND" : "TAP FOR SMS"}
                </span>
              </div>
            )}
          </button>

          {/* Offline SMS reminder */}
          {!isOnline && (
            <p className="mt-4 text-center text-sm text-amber-600 max-w-xs">
              Your SOS will be prepared as an encrypted SMS message. You will
              need to send it through your SMS app.
            </p>
          )}
        </div>

        {/* Custom CSS for SOS pulse */}
        <style>{`
          @keyframes sos-pulse {
            0%, 100% {
              box-shadow: 0 0 0 0 rgba(220, 38, 38, 0.7), 0 0 40px rgba(220, 38, 38, 0.2);
              transform: scale(1);
            }
            50% {
              box-shadow: 0 0 0 15px rgba(220, 38, 38, 0), 0 0 80px rgba(220, 38, 38, 0.4);
              transform: scale(1.02);
            }
          }
        `}</style>
      </div>
    </div>
  );
}
