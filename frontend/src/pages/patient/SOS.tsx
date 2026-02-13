import { useState, useEffect, useCallback, useRef } from "react";
import { createSOS, getHospitals, type Hospital } from "../../services/api";
import { buildSMSBody, sendViaSMS } from "../../services/smsService";
import { useAuthStore } from "../../store/authStore";
import { getCurrentPosition } from "../../utils/locationCodec";
import { patientStatusConfig } from "../../utils/formatting";

// ─── Heartbeat Animation CSS ─────────────────────────────────────

const heartbeatStyle = `
@keyframes heartbeat {
  0% { transform: scale(1); }
  14% { transform: scale(1.08); }
  28% { transform: scale(1); }
  42% { transform: scale(1.08); }
  70% { transform: scale(1); }
}
`;

// ─── Types ───────────────────────────────────────────────────────

type PatientStatus = "safe" | "injured" | "trapped" | "evacuate";

interface SOSFormData {
  patientStatus: PatientStatus;
  severity: number;
  details: string;
}

type SOSState = "idle" | "countdown" | "sending" | "sent" | "sms_ready" | "error" | "cancelled";

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
  const [locationAddress, setLocationAddress] = useState<string | null>(null);

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

  // Nearest hospitals (top 3)
  const [nearestHospitals, setNearestHospitals] = useState<
    (Hospital & { distance: number })[]
  >([]);
  const [hospitalLoading, setHospitalLoading] = useState(false);

  // Pending SOS count
  const [pendingCount, setPendingCount] = useState(0);

  // Countdown before sending (cancellation window)
  const [countdownSeconds, setCountdownSeconds] = useState(5);

  // Refs for cleanup
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

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

  // ─── Countdown Timer (Cancellation Window) ─────────────────

  useEffect(() => {
    if (sosState === "countdown") {
      // Reset countdown to 5 seconds
      setCountdownSeconds(5);

      countdownTimerRef.current = setInterval(() => {
        setCountdownSeconds((prev: number) => {
          if (prev <= 1) {
            // Countdown finished - actually send the SOS
            clearInterval(countdownTimerRef.current);
            if (isOnline) {
              handleSOSOnline();
            } else {
              handleSOSOffline();
            }
            return 0;
          }
          return prev - 1;
        });
      }, 1000);

      return () => {
        if (countdownTimerRef.current) {
          clearInterval(countdownTimerRef.current);
        }
      };
    }
  }, [sosState, isOnline]);

  // ─── Auto-detect GPS on Load ──────────────────────────────

  const detectGPS = useCallback(async () => {
    setGpsLoading(true);
    setGpsError(null);
    setLocationAddress(null);
    try {
      const pos = await getCurrentPosition();
      setLatitude(pos.latitude);
      setLongitude(pos.longitude);

      // Reverse geocode to get address
      try {
        const response = await fetch(
          `https://nominatim.openstreetmap.org/reverse?format=json&lat=${pos.latitude}&lon=${pos.longitude}&zoom=18&addressdetails=1`,
          {
            headers: {
              'Accept-Language': 'en',
            },
          }
        );
        if (response.ok) {
          const data = await response.json();
          const addr = data.address;
          let addressParts: string[] = [];

          if (addr.road || addr.street) addressParts.push(addr.road || addr.street);
          if (addr.neighbourhood || addr.suburb) addressParts.push(addr.neighbourhood || addr.suburb);
          if (addr.city || addr.town || addr.village) addressParts.push(addr.city || addr.town || addr.village);
          if (addr.country) addressParts.push(addr.country);

          if (addressParts.length > 0) {
            setLocationAddress(addressParts.slice(0, 3).join(', '));
          } else if (data.display_name) {
            const parts = data.display_name.split(',').slice(0, 3);
            setLocationAddress(parts.join(',').trim());
          }
        }
      } catch {
        // Silently fail - we still have coordinates
      }
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

  // ─── Fetch Nearest Hospitals ───────────────────────────────

  const fetchNearestHospitals = useCallback(async () => {
    if (latitude === null || longitude === null) return;
    setHospitalLoading(true);

    // Always use dummy data for now (demo purposes)
    setNearestHospitals([
      { id: "dummy-1", name: "Al-Shifa Medical Complex", latitude: 31.5, longitude: 34.45, status: "operational" as const, available_beds: 120, total_beds: 200, distance: 2.3 },
      { id: "dummy-2", name: "Al-Quds Hospital", latitude: 31.52, longitude: 34.47, status: "offline" as const, available_beds: 0, total_beds: 150, distance: 5.7 },
      { id: "dummy-3", name: "European Gaza Hospital", latitude: 31.35, longitude: 34.32, status: "operational" as const, available_beds: 45, total_beds: 100, distance: 12.1 },
    ]);
    setHospitalLoading(false);
  }, [latitude, longitude]);

  useEffect(() => {
    fetchNearestHospitals();
  }, [fetchNearestHospitals]);

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
        hospital_name: nearestHospitals[0]?.name,
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
    // Start countdown instead of directly sending
    setSosState("countdown");
    setCountdownSeconds(5);
  };

  // ─── Cancel SOS (during countdown) ─────────────────────────

  const cancelCountdown = () => {
    if (countdownTimerRef.current) {
      clearInterval(countdownTimerRef.current);
    }
    setSosState("idle");
    setCountdownSeconds(5);
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

  // ─── Render: Countdown Screen (Cancellation Window) ────────

  if (sosState === "countdown") {
    return (
      <div className="min-h-full bg-red-600 flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center">
          {/* Countdown Circle */}
          <div className="relative w-48 h-48 mx-auto mb-8">
            {/* Background circle */}
            <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="rgba(255,255,255,0.2)"
                strokeWidth="8"
              />
              {/* Animated progress circle */}
              <circle
                cx="50"
                cy="50"
                r="45"
                fill="none"
                stroke="white"
                strokeWidth="8"
                strokeLinecap="round"
                strokeDasharray={`${(countdownSeconds / 5) * 283} 283`}
                className="transition-all duration-1000 ease-linear"
              />
            </svg>
            {/* Countdown number */}
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-7xl font-bold text-white">{countdownSeconds}</span>
            </div>
          </div>

          <h2 className="text-2xl font-bold text-white mb-2">
            Sending SOS...
          </h2>
          <p className="text-white/80 mb-8">
            Tap cancel if this was a mistake
          </p>

          {/* Cancel Button */}
          <button
            onClick={cancelCountdown}
            className="w-full bg-white text-red-600 font-bold py-4 px-6 rounded-xl text-lg active:bg-gray-100 transition-colors"
          >
            CANCEL
          </button>
        </div>
      </div>
    );
  }

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

            <h2 className="text-2xl font-bold text-gray-900 mb-6">
              {sosState === "sent"
                ? "SOS Received"
                : "SMS Ready to Send"}
            </h2>

            {/* SMS Send Button */}
            {sosState === "sms_ready" && smsBody && (
              <button
                onClick={openSMSApp}
                className="w-full flex items-center justify-center gap-3 px-6 py-4 bg-blue-600 text-white rounded-xl text-lg font-bold hover:bg-blue-700 transition"
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
          </div>

          {/* Nearest Hospital Card - Commented out */}
          {/* {nearestHospitals[0] && (
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
                    {nearestHospitals[0].name}
                  </h3>
                  <p className="text-sm text-gray-500">
                    {nearestHospitals[0].distance.toFixed(1)} km away
                  </p>
                  <p className="text-sm text-green-600 font-medium">
                    {nearestHospitals[0].status === "operational"
                      ? "Operational"
                      : nearestHospitals[0].status}
                  </p>
                </div>
              </div>
            </div>
          )} */}

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
    <div className="h-full bg-gray-50 flex flex-col overflow-hidden">
      {/* Inject heartbeat animation CSS */}
      <style>{heartbeatStyle}</style>

      {/* Offline Banner - Only show when not connected */}
      {!isOnline && (
        <div className="px-4 py-2.5 text-center text-sm font-medium bg-amber-500 text-white">
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
        </div>
      )}

      {/* Pending SOS Sync Badge */}
      {pendingCount > 0 && isOnline && (
        <div className="px-4 py-2 bg-blue-50 text-center text-sm text-blue-700">
          Syncing {pendingCount} pending SOS signal{pendingCount > 1 ? "s" : ""}...
        </div>
      )}

      {/* GPS Status - Compact */}
      <div className="px-4 pt-4 pb-2 max-w-md mx-auto w-full">
        <div
          className={`rounded-xl p-3 ${
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
                      {locationAddress || "Location detected"}
                    </p>
                    {!locationAddress && (
                      <p className="text-xs text-green-600">
                        {latitude.toFixed(6)}, {longitude.toFixed(6)}
                      </p>
                    )}
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
      </div>

      <div className="flex-1 flex flex-col pb-20 px-4">
        {/* SOS BUTTON - Centered */}
        <div className="flex-1 flex items-center justify-center py-6">
          <div className="flex flex-col items-center">
            <button
              onClick={handleSOS}
              disabled={sosState === "sending" || (latitude === null && !gpsLoading)}
              className={`relative w-64 h-64 rounded-full flex items-center justify-center text-white font-bold text-2xl transition-all duration-100 ${
                sosState === "sending"
                  ? "bg-gray-400 cursor-wait"
                  : "bg-gradient-to-b from-red-500 to-red-700 active:from-red-600 active:to-red-800 active:translate-y-1 active:shadow-[0_2px_0_0_#991b1b,inset_0_1px_2px_rgba(0,0,0,0.2)]"
              }`}
              style={{
                boxShadow: sosState === "sending"
                  ? "0 4px 0 0 #9ca3af, 0 6px 20px rgba(0,0,0,0.2)"
                  : "0 6px 0 0 #991b1b, 0 8px 20px rgba(0,0,0,0.3), inset 0 1px 0 rgba(255,255,255,0.2)",
                animation: sosState !== "sending" && latitude !== null ? "heartbeat 1.5s ease-in-out infinite" : "none",
              }}
            >
              {sosState === "sending" ? (
                <div className="flex flex-col items-center">
                  <svg
                    className="w-12 h-12 animate-spin mb-2"
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
                  <span className="text-xl">Sending...</span>
                </div>
              ) : (
                <div className="flex flex-col items-center relative z-10">
                  <span className="text-6xl font-black tracking-wider drop-shadow-lg">SOS</span>
                  <span className="text-base font-medium mt-2 opacity-90">
                    {isOnline ? "TAP TO SEND" : "TAP FOR SMS"}
                  </span>
                </div>
              )}
            </button>

            {/* Offline SMS reminder */}
            {!isOnline && (
              <p className="mt-2 text-center text-sm text-amber-600 max-w-xs">
                Your SOS will be prepared as an encrypted SMS message.
              </p>
            )}

            {/* Error */}
            {sosError && (
              <div className="mt-3 bg-red-50 border border-red-200 rounded-xl p-3 flex items-start gap-2 max-w-xs">
                <svg
                  className="w-4 h-4 text-red-500 mt-0.5 shrink-0"
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
                  <p className="text-red-700 text-xs font-medium">{sosError}</p>
                  {!isOnline && (
                    <button
                      onClick={handleSOSOffline}
                      className="mt-1 text-xs text-red-600 underline hover:text-red-700"
                    >
                      Try SMS Fallback
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Nearest Hospitals */}
        {nearestHospitals.length > 0 && !hospitalLoading && (
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-4 mb-4 mt-8">
            <p className="text-sm font-semibold text-gray-900 mb-3">Nearest Hospitals</p>
            <div className="space-y-3">
              {nearestHospitals.map((hospital: Hospital & { distance: number }, index: number) => {
                const isAvailable = hospital.status === "operational";
                const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${latitude},${longitude}&destination=${hospital.latitude},${hospital.longitude}&travelmode=driving`;
                return (
                  <a
                    key={hospital.id}
                    href={googleMapsUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`flex items-center gap-3 p-2.5 rounded-xl transition-colors ${!isAvailable ? "opacity-60 bg-gray-50" : "bg-gray-50 hover:bg-gray-100 active:bg-gray-200"}`}
                  >
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      !isAvailable ? "bg-gray-200" : index === 0 ? "bg-green-100" : "bg-blue-100"
                    }`}>
                      <svg
                        className={`w-5 h-5 ${!isAvailable ? "text-gray-400" : index === 0 ? "text-green-600" : "text-blue-500"}`}
                        fill="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          fillRule="evenodd"
                          d="M11.54 22.351l.07.04.028.016a.76.76 0 00.723 0l.028-.015.071-.041a16.975 16.975 0 001.144-.742 19.58 19.58 0 002.683-2.282c1.944-1.99 3.963-4.98 3.963-8.827a8.25 8.25 0 00-16.5 0c0 3.846 2.02 6.837 3.963 8.827a19.58 19.58 0 002.682 2.282 16.975 16.975 0 001.145.742zM12 13.5a3 3 0 100-6 3 3 0 000 6z"
                          clipRule="evenodd"
                        />
                      </svg>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-semibold truncate ${!isAvailable ? "text-gray-500" : index === 0 ? "text-gray-900" : "text-gray-700"}`}>
                        {hospital.name}
                      </p>
                      <div className="flex items-center gap-2">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium shrink-0 ${
                          isAvailable ? "bg-green-100 text-green-700" : "bg-red-100 text-red-600"
                        }`}>
                          {isAvailable ? "Available" : "Unavailable"}
                        </span>
                        <p className="text-xs text-gray-500">
                          {hospital.distance.toFixed(1)} km away
                        </p>
                      </div>
                    </div>
                  </a>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
