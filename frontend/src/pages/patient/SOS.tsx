import { useState, useEffect, useCallback, useRef } from "react";
import {
  Bluetooth,
  CheckCircle2,
  Hospital,
  Loader2,
  MapPin,
  MessageSquare,
  Navigation,
  ShieldAlert,
  TriangleAlert,
  WifiOff,
  X,
} from "lucide-react";
import { createSOS, updateSOSTriage, getHospitals, type Hospital as HospitalType } from "../../services/api";
import { buildSMSBody, sendViaSMS } from "../../services/smsService";
import { useAuthStore } from "../../store/authStore";
import { useAIAssistantStore } from "../../store/aiAssistantStore";
import { getCurrentPosition } from "../../utils/locationCodec";
import { patientStatusConfig } from "../../utils/formatting";
import type { TriageData } from "../../types/sosTypes";
import { Badge, Button, Card, EmptyState, Skeleton } from "../../components/ui";

// SOSDispatcher with fallback chain (Internet → SMS → Bluetooth Mesh)
import { SOSDispatcher } from "../../services/sosDispatcher";
import { ConnectionManager } from "../../services/connectionManager";
import { useConnectionStatus, useConnectionIndicator } from "../../hooks/useConnectionStatus";

// AI Assistant Components
import { AIAssistantScreen } from "../../components/sos/AIAssistantScreen";
import { CallingScreen } from "../../components/sos/CallingScreen";

// ─── Types ───────────────────────────────────────────────────────

type PatientStatus = "safe" | "injured" | "trapped" | "evacuate";

interface SOSFormData {
  patientStatus: PatientStatus;
  severity: number;
  details: string;
}

type SOSState = "idle" | "ai_assistant" | "calling" | "sending" | "sent" | "sms_ready" | "error" | "cancelled";

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

// ─── Safety tips shown after an SOS is sent ─────────────────────

const SAFETY_TIPS = [
  "Stay where you are if it is safe to do so",
  "Keep your phone charged and nearby",
  "If you can, move to an open area away from buildings",
  "Signal rescuers if you hear them approaching",
  "Conserve water and food if available",
];

// ─── Main Component ─────────────────────────────────────────────

export default function SOS() {
  const user = useAuthStore((s) => s.user);

  // Connection status from unified ConnectionManager
  const connectionStatus = useConnectionStatus();
  const connectionIndicator = useConnectionIndicator();

  // Online/Offline state (derived from connection status)
  const isOnline = connectionStatus.hasInternet;

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
    (HospitalType & { distance: number })[]
  >([]);
  const [hospitalLoading, setHospitalLoading] = useState(false);

  // Pending SOS count
  const [pendingCount, setPendingCount] = useState(0);

  // Countdown removed — SOS sends immediately

  // Active SOS ID (so triage can update it)
  const [activeSosId, setActiveSosId] = useState<string | null>(null);

  // Refs for cleanup
  const syncTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | undefined>(undefined);

  // ─── Initialize SOSDispatcher and ConnectionManager ─────────

  useEffect(() => {
    // Initialize the connection manager with user ID
    const userId = user?.patientId || user?.id;
    if (userId) {
      ConnectionManager.initialize(userId);
    }

    // Initialize SOS dispatcher
    SOSDispatcher.initialize();

    // Sync pending SOS when connection changes
    const unsubscribe = ConnectionManager.subscribe((state) => {
      if (state.currentLayer !== 'none') {
        syncPendingSOS();
      }
    });

    return () => {
      unsubscribe();
    };
  }, [user]);

  // AI Assistant store
  const resetAIAssistant = useAIAssistantStore((s: { reset: () => void }) => s.reset);
  const aiMessages = useAIAssistantStore((s: { messages: Array<{ role: string; content: string; timestamp: Date }> }) => s.messages);

  // Countdown no longer used — SOS sends immediately on button press

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

    try {
      const hospitals = await getHospitals();
      // Calculate distance and sort by nearest
      const withDistance = hospitals
        .filter((h: HospitalType) => h.latitude != null && h.longitude != null)
        .map((h: HospitalType) => {
          const R = 6371;
          const hLat = h.latitude!;
          const hLon = h.longitude!;
          const dLat = ((hLat - latitude) * Math.PI) / 180;
          const dLon = ((hLon - longitude) * Math.PI) / 180;
          const a =
            Math.sin(dLat / 2) ** 2 +
            Math.cos((latitude * Math.PI) / 180) *
              Math.cos((hLat * Math.PI) / 180) *
              Math.sin(dLon / 2) ** 2;
          const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
          return { ...h, distance: Math.round(distance * 10) / 10 };
        });
      withDistance.sort((a, b) => a.distance - b.distance);
      setNearestHospitals(withDistance.slice(0, 3));
    } catch (err) {
      console.warn("Failed to fetch hospitals, using fallback:", err);
      const now = new Date().toISOString();
      setNearestHospitals([
        { id: "fallback-1", name: "Nearest Hospital", latitude: 0, longitude: 0, status: "operational", available_beds: 0, bed_capacity: 0, icu_beds: 0, specialties: [], coverage_radius_km: 0, phone: null, email: null, address: null, website: null, supply_levels: {}, created_at: now, updated_at: now, distance: 0 },
      ]);
    }
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

  const handleSOS = async () => {
    if (latitude === null || longitude === null) {
      setSosError("GPS location is required. Please enable location services.");
      return;
    }

    // Send SOS IMMEDIATELY — no waiting
    setSosState("sending");
    setSosError(null);

    const patientId = user?.patientId || user?.id || "UNKNOWN";

    try {
      const result = await SOSDispatcher.dispatch({
        patientId,
        latitude,
        longitude,
        patientStatus: form.patientStatus,
        severity: form.severity,
        details: form.details || undefined,
      });

      if (result.success) {
        // Store the SOS ID so triage can update it later
        setActiveSosId(result.sosId || null);
        setSosResponse({
          id: result.sosId,
          hospital_name: nearestHospitals[0]?.name,
        });

        if (result.layer === 'sms') {
          const smsBodyText = await buildSMSBody(
            patientId, latitude, longitude,
            form.patientStatus, String(form.severity)
          );
          setSmsBody(smsBodyText);
          setSosState("sms_ready");
        } else {
          // SOS sent successfully — now show AI triage to collect more info
          console.log(`[SOS] Sent via ${result.layer}, SOS ID: ${result.sosId}`);
          resetAIAssistant();
          setSosState("ai_assistant");
        }
      } else {
        setSosError(result.error || "Failed to send SOS through all available channels.");
        setSosState("error");
      }
    } catch (err) {
      setSosError(
        err instanceof Error ? err.message : "Failed to send SOS. Please try again."
      );
      setSosState("error");
    }
  };

  // Countdown cancel removed — SOS sends immediately

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
    setActiveSosId(null);
    resetAIAssistant();
  };

  // ─── Handle AI Assistant Send SOS ────────────────────────

  const handleAISendSOS = async (triageData: TriageData) => {
    // Map triage emergencyType → valid PatientStatus enum (safe|injured|trapped|evacuate)
    const statusMap: Record<string, string> = {
      medical: "injured",
      danger: "injured",
      trapped: "trapped",
      evacuate: "evacuate",
    };
    const patientStatus = statusMap[triageData.emergencyType || ""] || "injured";
    const severity = triageData.injuryStatus === "serious" ? 5 : triageData.injuryStatus === "minor" ? 3 : 1;

    // Build details string from triage data
    const detailsParts: string[] = [];
    if (triageData.emergencyType) detailsParts.push(`Type: ${triageData.emergencyType}`);
    if (triageData.injuryStatus) detailsParts.push(`Injury: ${triageData.injuryStatus}`);
    if (triageData.peopleCount) detailsParts.push(`People: ${triageData.peopleCount.replace(/_/g, " ")}`);
    if (triageData.canMove) detailsParts.push(`Mobility: ${triageData.canMove.replace(/_/g, " ")}`);
    if (triageData.additionalDetails) detailsParts.push(`Details: ${triageData.additionalDetails}`);

    const details = detailsParts.join("; ");

    // Build triage transcript from AI conversation
    const transcript = aiMessages.length > 0
      ? aiMessages.map((m) => ({
          role: m.role,
          content: m.content,
          timestamp: m.timestamp instanceof Date ? m.timestamp.toISOString() : String(m.timestamp),
        }))
      : undefined;

    // UPDATE the existing SOS with triage data (SOS was already sent on button press)
    if (activeSosId) {
      try {
        await updateSOSTriage(activeSosId, {
          patient_status: patientStatus,
          severity,
          details,
          triage_transcript: transcript,
        });
        console.log(`[SOS] Updated SOS ${activeSosId} with triage data`);
      } catch (err) {
        console.warn("[SOS] Failed to update triage data:", err);
      }
    }

    // Show confirmation
    setSosState("sent");
  };

  // ─── Handle Urgent Call ──────────────────────────────────

  const handleUrgentCall = () => {
    setSosState("calling");
  };

  // ─── Handle End Call ─────────────────────────────────────

  const handleEndCall = () => {
    setSosState("ai_assistant");
  };

  // ─── Handle Cancel from AI Assistant ─────────────────────

  const handleAICancel = () => {
    resetAIAssistant();
    handleCancel();
  };

  // ─── Render: AI Assistant Screen ─────────────────────────

  if (sosState === "ai_assistant") {
    return (
      <AIAssistantScreen
        onSendSOS={handleAISendSOS}
        onUrgentCall={handleUrgentCall}
        onCancel={handleAICancel}
        latitude={latitude}
        longitude={longitude}
      />
    );
  }

  // ─── Render: Calling Screen ──────────────────────────────

  if (sosState === "calling") {
    return <CallingScreen onEndCall={handleEndCall} />;
  }

  // Countdown screen removed — SOS sends immediately

  // ─── Render: Confirmation Screen ──────────────────────────

  if (sosState === "sent" || sosState === "sms_ready") {
    return (
      <div className="flex min-h-full items-center justify-center px-4 py-6">
        <div className="w-full max-w-lg">
          {/* Success Card */}
          <Card className="mb-4 p-6 text-center shadow-2 sm:p-8">
            <span
              aria-hidden="true"
              className={`mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full ${
                sosState === "sent"
                  ? "bg-success-soft text-on-success-soft"
                  : "bg-info-soft text-on-info-soft"
              }`}
            >
              {sosState === "sent" ? (
                <CheckCircle2 className="h-10 w-10" />
              ) : (
                <MessageSquare className="h-10 w-10" />
              )}
            </span>

            <h2 className="mb-6 text-2xl font-bold text-ink">
              {sosState === "sent"
                ? "SOS Received"
                : "SMS Ready to Send"}
            </h2>

            {/* SMS Send Button */}
            {sosState === "sms_ready" && smsBody && (
              <Button
                size="xl"
                fullWidth
                icon={<MessageSquare />}
                onClick={openSMSApp}
              >
                Open SMS App to Send
              </Button>
            )}
          </Card>

          {/* Safety Instructions */}
          <Card className="mb-4 border-warning/30! bg-warning-soft">
            <h3 className="mb-3 flex items-center gap-2 text-base font-bold text-on-warning-soft">
              <ShieldAlert aria-hidden="true" className="h-5 w-5 shrink-0" />
              Stay Safe
            </h3>
            <ul className="flex flex-col gap-2">
              {SAFETY_TIPS.map((tip) => (
                <li
                  key={tip}
                  className="flex items-start gap-2.5 text-base text-on-warning-soft"
                >
                  <span
                    aria-hidden="true"
                    className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-current"
                  />
                  {tip}
                </li>
              ))}
            </ul>
          </Card>

          {/* Action Button */}
          <Button variant="secondary" size="lg" fullWidth onClick={handleCancel}>
            Cancel SOS
          </Button>
        </div>
      </div>
    );
  }

  // ─── Render: Cancelled Screen ─────────────────────────────

  if (sosState === "cancelled") {
    return (
      <div className="flex min-h-full items-center justify-center px-4 py-6">
        <Card className="w-full max-w-lg p-8 text-center shadow-2">
          <span
            aria-hidden="true"
            className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-surface-2 text-ink-muted"
          >
            <X className="h-8 w-8" />
          </span>
          <h2 className="mb-2 text-xl font-bold text-ink">SOS Cancelled</h2>
          <p className="text-base text-ink-muted" role="status">
            Returning to SOS screen...
          </p>
        </Card>
      </div>
    );
  }

  // ─── Render: Main SOS Screen ──────────────────────────────

  return (
    <div className="flex h-full flex-col overflow-hidden">
      {/* Connection Status Banner */}
      {!isOnline && (
        <div
          role="status"
          className={`px-4 py-2.5 text-center text-sm font-semibold text-white ${
            connectionStatus.hasBluetooth ? 'bg-info' :
            connectionStatus.hasSMS ? 'bg-warning' : 'bg-danger'
          }`}
        >
          <span className="flex items-center justify-center gap-2">
            {connectionStatus.hasBluetooth ? (
              <>
                <Bluetooth aria-hidden="true" className="h-4 w-4 shrink-0" />
                Bluetooth Mesh Mode ({connectionIndicator.description})
              </>
            ) : connectionStatus.hasSMS ? (
              <>
                <MessageSquare aria-hidden="true" className="h-4 w-4 shrink-0" />
                No Internet - SMS Fallback Mode
              </>
            ) : (
              <>
                <WifiOff aria-hidden="true" className="h-4 w-4 shrink-0" />
                No Connectivity - SOS will be queued
              </>
            )}
          </span>
        </div>
      )}

      {/* Pending SOS Sync Badge */}
      {pendingCount > 0 && isOnline && (
        <div
          role="status"
          className="flex items-center justify-center gap-2 bg-info-soft px-4 py-2 text-center text-sm font-medium text-on-info-soft"
        >
          <Loader2 aria-hidden="true" className="h-4 w-4 shrink-0 animate-spin" />
          Syncing {pendingCount} pending SOS signal{pendingCount > 1 ? "s" : ""}...
        </div>
      )}

      {/* GPS Status - Compact */}
      <div className="mx-auto w-full max-w-lg px-4 pt-4 pb-2">
        <div
          role="status"
          className={`rounded-lg border p-3 ${
            latitude !== null && longitude !== null
              ? "border-success/30 bg-success-soft"
              : gpsLoading
                ? "border-info/30 bg-info-soft"
                : "border-danger/30 bg-danger-soft"
          }`}
        >
          <div className="flex items-center gap-2.5">
            {gpsLoading ? (
              <Loader2
                aria-hidden="true"
                className="h-5 w-5 shrink-0 animate-spin text-on-info-soft"
              />
            ) : (
              <MapPin
                aria-hidden="true"
                className={`h-5 w-5 shrink-0 ${
                  latitude !== null ? "text-on-success-soft" : "text-on-danger-soft"
                }`}
              />
            )}
            <div className="min-w-0">
              {gpsLoading ? (
                <p className="text-sm font-semibold text-on-info-soft">
                  Detecting location...
                </p>
              ) : latitude !== null && longitude !== null ? (
                <>
                  <p className="truncate text-sm font-semibold text-on-success-soft">
                    {locationAddress || "Location detected"}
                  </p>
                  {!locationAddress && (
                    <p className="text-xs text-on-success-soft">
                      {latitude.toFixed(6)}, {longitude.toFixed(6)}
                    </p>
                  )}
                </>
              ) : (
                <p className="text-sm font-semibold text-on-danger-soft">
                  {gpsError || "Location not available"}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto flex w-full max-w-lg flex-1 flex-col px-4 pb-20">
        {/* SOS BUTTON - Centered */}
        <div className="flex flex-1 items-center justify-center py-6">
          <div className="flex flex-col items-center">
            <button
              onClick={handleSOS}
              disabled={sosState === "sending" || (latitude === null && !gpsLoading)}
              aria-label={isOnline ? "Send SOS now" : "Send SOS via SMS"}
              className={`relative flex h-64 w-64 items-center justify-center rounded-full text-on-sos shadow-3 transition-all duration-150 focus-visible:outline-4 focus-visible:outline-focus focus-visible:outline-offset-4 ${
                sosState === "sending"
                  ? "cursor-wait bg-ink-faint"
                  : `bg-sos hover:bg-sos-hover active:scale-[0.97] ${
                      latitude !== null ? "sos-button" : "opacity-70"
                    }`
              }`}
            >
              {sosState === "sending" ? (
                <span className="flex flex-col items-center">
                  <Loader2 aria-hidden="true" className="mb-2 h-12 w-12 animate-spin" />
                  <span className="text-xl font-bold">Sending...</span>
                </span>
              ) : (
                <span className="relative z-10 flex flex-col items-center">
                  <span className="text-6xl font-black tracking-wider">SOS</span>
                  <span className="mt-2 text-base font-semibold opacity-90">
                    {isOnline ? "TAP TO SEND" : "TAP FOR SMS"}
                  </span>
                </span>
              )}
            </button>

            {/* Offline SMS reminder */}
            {!isOnline && (
              <p className="mt-3 max-w-xs text-center text-sm font-medium text-warning">
                Your SOS will be prepared as an encrypted SMS message.
              </p>
            )}

            {/* Error */}
            {sosError && (
              <div
                role="alert"
                className="mt-4 w-full max-w-xs rounded-lg border border-danger/30 bg-danger-soft p-3.5"
              >
                <div className="flex items-start gap-2.5">
                  <TriangleAlert
                    aria-hidden="true"
                    className="mt-0.5 h-5 w-5 shrink-0 text-on-danger-soft"
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-semibold text-on-danger-soft">{sosError}</p>
                    {!isOnline && (
                      <button
                        onClick={handleSOSOffline}
                        className="mt-1 min-h-11 rounded-md text-sm font-bold text-on-danger-soft underline transition-opacity hover:opacity-80 focus-visible:outline-3 focus-visible:outline-focus"
                      >
                        Try SMS Fallback
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Nearest Hospitals */}
        {hospitalLoading && (
          <div className="mb-4 mt-8 flex flex-col gap-3" aria-hidden="true">
            <Skeleton className="h-16" />
            <Skeleton className="h-16" />
          </div>
        )}

        {nearestHospitals.length > 0 && !hospitalLoading && (
          <Card className="mb-4 mt-8">
            <h2 className="mb-3 text-sm font-bold text-ink">Nearest Hospitals</h2>
            <ul className="flex flex-col gap-2.5">
              {nearestHospitals.map((hospital: HospitalType & { distance: number }, index: number) => {
                const isAvailable = hospital.status === "operational";
                const googleMapsUrl = `https://www.google.com/maps/dir/?api=1&origin=${latitude},${longitude}&destination=${hospital.latitude},${hospital.longitude}&travelmode=driving`;
                return (
                  <li key={hospital.id}>
                    <a
                      href={googleMapsUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={`flex min-h-14 items-center gap-3 rounded-lg bg-surface-2 p-2.5 transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
                        !isAvailable ? "opacity-60" : "hover:bg-surface-3"
                      }`}
                    >
                      <span
                        aria-hidden="true"
                        className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${
                          !isAvailable
                            ? "bg-surface-3 text-ink-faint"
                            : index === 0
                              ? "bg-success-soft text-on-success-soft"
                              : "bg-accent-soft text-on-accent-soft"
                        }`}
                      >
                        <Hospital className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span
                          className={`block truncate text-base font-semibold ${
                            !isAvailable ? "text-ink-muted" : "text-ink"
                          }`}
                        >
                          {hospital.name}
                        </span>
                        <span className="mt-0.5 flex items-center gap-2">
                          <Badge size="sm" dot tone={isAvailable ? "success" : "danger"}>
                            {isAvailable ? "Available" : "Unavailable"}
                          </Badge>
                          <span className="text-sm text-ink-muted">
                            {hospital.distance.toFixed(1)} km away
                          </span>
                        </span>
                      </span>
                      <Navigation
                        aria-hidden="true"
                        className="h-4 w-4 shrink-0 text-ink-faint"
                      />
                    </a>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        {!hospitalLoading && nearestHospitals.length === 0 && (
          <EmptyState
            className="mb-4 mt-8 py-8"
            icon={<Hospital />}
            title="No hospitals to show yet"
            description="Nearby hospitals will appear here once your location is available."
          />
        )}
      </div>
    </div>
  );
}
