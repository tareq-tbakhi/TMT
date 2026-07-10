import { useState, useEffect, useCallback, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  HeartHandshake,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { getAlerts, getHospitals, type Alert, type Hospital } from "../../services/api";
import { useAuthStore } from "../../store/authStore";
import { getCurrentPosition } from "../../utils/locationCodec";
import { eventTypeLabels, timeAgo } from "../../utils/formatting";
import { isDummyMode } from "../../hooks/useDataMode";
import { Button, Card, EmptyState, LoadingState } from "../../components/ui";

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

// ─── Severity Icon Component ────────────────────────────────────

function SeverityIcon({ severity }: { severity: string }) {
  const colors: Record<string, string> = {
    critical: "bg-sev-critical",
    high: "bg-sev-high",
    medium: "bg-sev-medium",
    low: "bg-sev-low",
  };

  return (
    <>
      <span
        aria-hidden="true"
        className={`h-3 w-3 shrink-0 rounded-full ${colors[severity] || "bg-ink-faint"}`}
      />
      <span className="sr-only">{severity} severity.</span>
    </>
  );
}

// ─── Alert Card Component ───────────────────────────────────────

function AlertCard({
  alert,
  expanded,
  onToggle,
}: {
  alert: Alert;
  expanded: boolean;
  onToggle: () => void;
}) {
  const isExpired = alert.expires_at && new Date(alert.expires_at) < new Date();

  return (
    <Card
      flush
      className={`overflow-hidden ${isExpired ? "opacity-50" : ""} ${
        alert.severity === "critical"
          ? "border-sev-critical/40! ring-2 ring-sev-critical/20"
          : ""
      }`}
    >
      {/* Main row */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={expanded}
        className="flex min-h-14 w-full items-center gap-3 p-4 text-start transition-colors hover:bg-surface-2 focus-visible:outline-3 focus-visible:outline-focus focus-visible:-outline-offset-2"
      >
        {/* Severity indicator */}
        <SeverityIcon severity={alert.severity} />

        {/* Content */}
        <span className="min-w-0 flex-1">
          <span className="line-clamp-2 text-base font-semibold leading-snug text-ink">
            {alert.title}
          </span>
          <span className="mt-1 block text-sm text-ink-muted">
            {timeAgo(alert.created_at)}
            {alert.source && ` · ${alert.source}`}
          </span>
        </span>

        {/* Expand chevron */}
        <ChevronDown
          aria-hidden="true"
          className={`h-5 w-5 shrink-0 text-ink-faint transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
        />
      </button>

      {/* Expanded Details */}
      {expanded && (
        <div className="flex flex-col gap-3 px-4 pb-4">
          {/* Description */}
          {alert.details && (
            <p className="text-base leading-relaxed text-ink-muted">
              {alert.details}
            </p>
          )}

          {/* Safety Instructions - Compact */}
          <div className="rounded-lg bg-warning-soft p-3.5">
            <p className="mb-2 text-sm font-bold text-on-warning-soft">What to do:</p>
            <ol className="flex flex-col gap-1.5">
              {getSafetyInstructions(alert.event_type).map((instruction, i) => (
                <li key={i} className="flex items-start gap-2.5">
                  <span
                    aria-hidden="true"
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-warning text-xs font-bold text-white"
                  >
                    {i + 1}
                  </span>
                  <span className="text-base text-on-warning-soft">{instruction}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      )}
    </Card>
  );
}

// ─── Safety Instructions per Event Type ─────────────────────────

function getSafetyInstructions(eventType: string): string[] {
  const instructions: Record<string, string[]> = {
    bombing: [
      "Move to the lowest floor or basement immediately",
      "Stay away from windows and exterior walls",
      "Cover your head and neck with your arms",
      "Wait for an all-clear signal before moving",
    ],
    earthquake: [
      "Drop, cover, and hold on under sturdy furniture",
      "Stay away from windows, mirrors, and heavy objects",
      "If outdoors, move to an open area away from buildings",
      "After shaking stops, check for injuries and structural damage",
    ],
    flood: [
      "Move to higher ground immediately",
      "Do not walk or drive through flood water",
      "Avoid contact with floodwater as it may be contaminated",
      "If trapped, signal for help from the highest point",
    ],
    fire: [
      "Evacuate immediately using the nearest exit",
      "Stay low to the ground to avoid smoke inhalation",
      "Cover your nose and mouth with a wet cloth",
      "Do not use elevators during a fire",
    ],
    building_collapse: [
      "If trapped, tap on pipes or walls to signal rescuers",
      "Conserve energy and air by staying calm",
      "Cover your mouth with a cloth to filter dust",
      "If safe, move to the nearest exit or open area",
    ],
    shooting: [
      "Run if there is a safe escape route",
      "Hide in a secure, locked room if you cannot run",
      "As a last resort, fight back with whatever is available",
      "Once safe, call emergency services immediately",
    ],
    chemical: [
      "Move upwind and uphill from the chemical source",
      "Cover your nose and mouth with a wet cloth",
      "Remove contaminated clothing if safe to do so",
      "Seek medical attention immediately if exposed",
    ],
    medical_emergency: [
      "Stay calm and assess the situation",
      "Call for medical help immediately",
      "Apply first aid if trained to do so",
      "Do not move an injured person unless necessary",
    ],
    disease_outbreak: [
      "Stay home and avoid contact with others",
      "Wash your hands frequently with soap for at least 20 seconds",
      "Wear a mask if you must go outside",
      "Monitor your symptoms and seek medical help if needed",
    ],
  };

  return (
    instructions[eventType] || [
      "Stay calm and assess your surroundings",
      "Follow instructions from local authorities",
      "Keep your phone charged for emergency communication",
      "Move to a safe location if possible",
    ]
  );
}

// ─── Main Tabs ──────────────────────────────────────────────────

type MainTab = "alerts" | "needs";

// ─── Demo Crisis Alerts ─────────────────────────────────────────

const DEMO_CRISIS_ALERTS: Alert[] = [
  {
    id: "demo-critical-1",
    title: "DISEASE OUTBREAK: Infectious Virus Spreading in Your Area",
    details: "A contagious disease has been detected spreading in your area. The Ministry of Health urges all residents to take precautions immediately. Stay home and avoid contact with others.",
    severity: "critical",
    event_type: "disease_outbreak",
    latitude: 33.8869,
    longitude: 35.5131,
    radius_m: 50000,
    source: "Ministry of Health",
    confidence: 1.0,
    acknowledged: null,
    affected_patients_count: 0,
    created_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
  },
];

// ─── Demo Hospital Needs (blood donations, supplies, volunteers) ────────

const DEMO_HOSPITAL_NEEDS: Alert[] = [
  {
    id: "demo-need-1",
    title: "Urgent: Blood Donation Needed",
    details: "Al-Shifa Medical Complex is experiencing a critical shortage of O-negative and B-positive blood types. If you are able to donate, please visit the hospital's blood bank. Your donation can save lives.",
    severity: "high",
    event_type: "blood_donation",
    latitude: 33.8869,
    longitude: 35.5131,
    radius_m: 25000,
    source: "Al-Shifa Medical Complex",
    confidence: 1.0,
    acknowledged: null,
    affected_patients_count: 0,
    created_at: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
  },
  {
    id: "demo-need-2",
    title: "Medical Supplies Needed",
    details: "Gaza Central Hospital urgently needs medical supplies including bandages, antiseptics, and basic medications. Donations can be dropped off at the main entrance.",
    severity: "medium",
    event_type: "supplies_needed",
    latitude: 33.8900,
    longitude: 35.5200,
    radius_m: 30000,
    source: "Gaza Central Hospital",
    confidence: 1.0,
    acknowledged: null,
    affected_patients_count: 0,
    created_at: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
    expires_at: new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString(),
  },
];

// ─── Main Component ─────────────────────────────────────────────

export default function Alerts() {
  const user = useAuthStore((s) => s.user);

  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [hospitals, setHospitals] = useState<Hospital[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // GPS
  const [latitude, setLatitude] = useState<number | null>(null);
  const [longitude, setLongitude] = useState<number | null>(null);

  // UI
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [mainTab, setMainTab] = useState<MainTab>("alerts");

  // Emergency Alert Overlay (for critical alerts demo)
  const [emergencyAlert, setEmergencyAlert] = useState<Alert | null>(null);
  const [showEmergencyOverlay, setShowEmergencyOverlay] = useState(false);

  // WebSocket ref
  const socketRef = useRef<Socket | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // ─── Online/Offline ───────────────────────────────────────

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // ─── GPS ──────────────────────────────────────────────────

  useEffect(() => {
    getCurrentPosition()
      .then((pos) => {
        setLatitude(pos.latitude);
        setLongitude(pos.longitude);
      })
      .catch(() => {
        // GPS not available - alerts still work without distance
      });
  }, []);

  // ─── Fetch Data ───────────────────────────────────────────

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [alertsData, hospitalsData] = await Promise.all([
        getAlerts({ limit: 50 }),
        getHospitals(),
      ]);
      setAlerts(alertsData);
      setHospitals(hospitalsData);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to load alerts"
      );
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isOnline) {
      fetchData();
    }
  }, [fetchData, isOnline]);

  // ─── WebSocket for Real-time Updates ──────────────────────

  useEffect(() => {
    if (!isOnline) return;

    const WS_URL = import.meta.env.VITE_WS_URL || "http://localhost:8000";
    const token = localStorage.getItem("tmt-token");

    const socket = io(WS_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
    });

    socket.on("connect", () => {
      // Join patient-specific room
      if (user?.id) {
        socket.emit("join", { room: `patient_${user.id}` });
      }
    });

    socket.on("patient_alert", (data: Alert) => {
      setAlerts((prev) => {
        // Avoid duplicates
        const exists = prev.find((a) => a.id === data.id);
        if (exists) {
          return prev.map((a) => (a.id === data.id ? data : a));
        }
        return [data, ...prev];
      });
    });

    socket.on("alert_update", (data: Alert) => {
      setAlerts((prev) =>
        prev.map((a) => (a.id === data.id ? data : a))
      );
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [isOnline, user?.id]);

  // ─── Computed Values ──────────────────────────────────────

  const getDistanceToAlert = (alert: Alert): number | null => {
    if (
      latitude === null ||
      longitude === null ||
      alert.latitude === null ||
      alert.longitude === null
    )
      return null;
    return haversineKm(latitude, longitude, alert.latitude, alert.longitude);
  };

  const getNearestHospitalForAlert = (
    alert: Alert
  ): (Hospital & { distance: number }) | null => {
    const alertLat = alert.latitude ?? latitude;
    const alertLng = alert.longitude ?? longitude;
    if (alertLat === null || alertLng === null) return null;

    const operational = hospitals.filter(
      (h) =>
        (h.status === "operational" || h.status === "limited") &&
        h.latitude !== null &&
        h.longitude !== null
    );

    if (operational.length === 0) return null;

    let closest = operational[0];
    let minDist = haversineKm(
      alertLat,
      alertLng,
      closest.latitude!,
      closest.longitude!
    );

    for (let i = 1; i < operational.length; i++) {
      const dist = haversineKm(
        alertLat,
        alertLng,
        operational[i].latitude!,
        operational[i].longitude!
      );
      if (dist < minDist) {
        minDist = dist;
        closest = operational[i];
      }
    }

    return { ...closest, distance: minDist };
  };

  // Filter out SOS-sourced alerts (those are for admin dashboards, not patients)
  // and filter by proximity (only show alerts within their radius or 50km)
  const patientAlerts = isDummyMode() ? alerts : alerts.filter(a => {
    // Exclude SOS-originated alerts — patients don't need to see other people's SOS
    if (a.source === "sos") return false;

    // If we have patient location and alert location, filter by distance
    if (latitude !== null && longitude !== null && a.latitude !== null && a.longitude !== null) {
      const dist = haversineKm(latitude, longitude, a.latitude, a.longitude);
      const radiusKm = (a.radius_m || 50000) / 1000; // default 50km
      return dist <= radiusKm;
    }

    // No location data — show the alert anyway (better safe than sorry)
    return true;
  });

  // Filter alerts by tab - "alerts" shows crisis alerts, "needs" shows hospital needs (blood, supplies)
  const needsEventTypes = ['blood_donation', 'supplies_needed', 'volunteers_needed'];
  const displayAlerts: Alert[] = isDummyMode()
    ? (mainTab === "alerts" ? DEMO_CRISIS_ALERTS : DEMO_HOSPITAL_NEEDS)
    : (mainTab === "alerts"
        ? patientAlerts.filter(a => !needsEventTypes.includes(a.event_type))
        : patientAlerts.filter(a => needsEventTypes.includes(a.event_type)));

  // Sort: non-expired first, then by severity, then by recency
  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  const sortedAlerts = [...displayAlerts].sort((a, b) => {
    const aExpired = a.expires_at && new Date(a.expires_at) < new Date();
    const bExpired = b.expires_at && new Date(b.expires_at) < new Date();
    if (aExpired && !bExpired) return 1;
    if (!aExpired && bExpired) return -1;

    const aSev = severityOrder[a.severity] ?? 2;
    const bSev = severityOrder[b.severity] ?? 2;
    if (aSev !== bSev) return aSev - bSev;

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Nearest hospital to patient
  const patientNearestHospital = (() => {
    if (latitude === null || longitude === null) return null;
    const operational = hospitals.filter(
      (h) =>
        h.status === "operational" &&
        h.latitude !== null &&
        h.longitude !== null
    );
    if (operational.length === 0) return null;

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

    return { ...closest, distance: minDist };
  })();

  // ─── Loading ──────────────────────────────────────────────

  if (loading) {
    return (
      <div className="flex min-h-full items-center justify-center">
        <LoadingState label="Loading alerts" />
      </div>
    );
  }

  // ─── Emergency Alert Functions ─────────────────────────────

  const triggerEmergencyAlert = (alert: Alert) => {
    setEmergencyAlert(alert);
    setShowEmergencyOverlay(true);

    // Try to vibrate (Android only)
    if (navigator.vibrate) {
      // Emergency vibration pattern: long-short-long-short-long
      navigator.vibrate([500, 200, 500, 200, 1000]);
    }

    // Try to play alarm sound
    try {
      // Create oscillator for emergency tone (works without audio file)
      const audioContext = new (window.AudioContext || (window as typeof window & { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 880; // High-pitched alert tone
      oscillator.type = 'square';
      gainNode.gain.value = 0.3;

      oscillator.start();

      // Siren effect: alternate between two frequencies
      let high = true;
      const sirenInterval = setInterval(() => {
        oscillator.frequency.value = high ? 880 : 660;
        high = !high;
      }, 500);

      // Stop after 3 seconds
      setTimeout(() => {
        clearInterval(sirenInterval);
        oscillator.stop();
        audioContext.close();
      }, 3000);

      audioRef.current = null; // We're using AudioContext instead
    } catch {
      console.log('Audio not available');
    }
  };

  const dismissEmergencyAlert = () => {
    setShowEmergencyOverlay(false);
    setEmergencyAlert(null);
  };

  // ─── Render ───────────────────────────────────────────────

  return (
    <div className="min-h-full">
      {/* Emergency Alert Overlay - Full Screen, No Scroll */}
      {showEmergencyOverlay && emergencyAlert && (
        <div
          role="alertdialog"
          aria-modal="true"
          aria-label="Emergency Alert"
          className="fixed inset-0 z-[100] bg-sos text-on-sos"
        >
          {/* Flashing border */}
          <div className="pointer-events-none absolute inset-0 animate-pulse">
            <div className="absolute inset-0 border-4 border-on-sos/60" />
          </div>

          <div className="relative flex h-full flex-col justify-center overflow-hidden px-5 py-6">
            {/* Header - Fixed at top */}
            <div className="absolute inset-x-5 top-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span aria-hidden="true" className="h-2 w-2 animate-pulse rounded-full bg-on-sos" />
                <span className="text-xs font-bold uppercase tracking-wider text-on-sos/90">
                  Emergency Alert
                </span>
              </div>
              <span className="text-xs text-on-sos/70">
                {new Date().toLocaleTimeString()}
              </span>
            </div>

            {/* Centered Content */}
            <div className="mx-auto flex w-full max-w-lg flex-col items-center">
              {/* Alert Icon */}
              <span
                aria-hidden="true"
                className="mb-4 flex h-20 w-20 animate-pulse items-center justify-center rounded-full bg-on-sos/20"
              >
                <TriangleAlert className="h-12 w-12" />
              </span>

              {/* Alert Type Badge */}
              <span className="mb-3 inline-block rounded-full bg-on-sos px-4 py-1 text-sm font-bold uppercase text-sos">
                {eventTypeLabels[emergencyAlert.event_type]?.en || emergencyAlert.event_type}
              </span>

              {/* Alert Title */}
              <h2 className="mb-2 text-center text-xl font-bold leading-tight">
                {emergencyAlert.title}
              </h2>

              {/* Alert Message */}
              <p className="mb-4 text-center text-base text-on-sos/90">
                {emergencyAlert.details}
              </p>

              {/* Safety Instructions */}
              <div className="mb-4 w-full rounded-lg bg-on-sos/15 p-3.5">
                <p className="mb-2 text-xs font-bold uppercase tracking-wide">What to do:</p>
                <ol className="flex flex-col gap-1.5">
                  {getSafetyInstructions(emergencyAlert.event_type).slice(0, 3).map((instruction, i) => (
                    <li key={i} className="flex items-start gap-2">
                      <span
                        aria-hidden="true"
                        className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-on-sos text-xs font-bold text-sos"
                      >
                        {i + 1}
                      </span>
                      <span className="text-sm leading-snug">{instruction}</span>
                    </li>
                  ))}
                </ol>
              </div>

              {/* Source */}
              <p className="mb-4 text-center text-xs text-on-sos/70">
                Source: <span className="text-on-sos/90">{emergencyAlert.source}</span>
              </p>

              {/* Dismiss Button */}
              <button
                type="button"
                onClick={dismissEmergencyAlert}
                className="min-h-14 w-full rounded-lg bg-on-sos text-lg font-bold text-sos transition-opacity focus-visible:outline-4 focus-visible:outline-focus focus-visible:outline-offset-2 active:opacity-90"
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offline Banner */}
      {!isOnline && (
        <div
          role="status"
          className="flex items-center justify-center gap-2 bg-warning px-4 py-2.5 text-center text-sm font-semibold text-white"
        >
          <WifiOff aria-hidden="true" className="h-4 w-4 shrink-0" />
          You are offline - showing cached alerts
        </div>
      )}

      <div className="mx-auto max-w-lg">
        {/* Header */}
        <header className="border-b border-edge bg-surface px-4 py-4">
          <div className="flex items-center gap-3">
            <span
              aria-hidden="true"
              className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ${
                mainTab === "alerts"
                  ? "bg-danger-soft text-on-danger-soft"
                  : "bg-accent-soft text-on-accent-soft"
              }`}
            >
              {mainTab === "alerts" ? (
                <Bell className="h-6 w-6" />
              ) : (
                <HeartHandshake className="h-6 w-6" />
              )}
            </span>
            <h2 className="text-lg font-bold text-ink">
              {mainTab === "alerts" ? "Alerts" : "Hospital Needs"}
            </h2>
          </div>
        </header>

        {/* Simple Tab Switcher */}
        <div className="border-b border-edge bg-surface px-4 py-2">
          <div className="flex gap-1.5" role="group" aria-label="Alert categories">
            <button
              type="button"
              onClick={() => setMainTab("alerts")}
              aria-pressed={mainTab === "alerts"}
              className={`min-h-11 flex-1 rounded-md px-2 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
                mainTab === "alerts"
                  ? "bg-danger-soft text-on-danger-soft"
                  : "text-ink-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              Alerts ({isDummyMode() ? DEMO_CRISIS_ALERTS.length : patientAlerts.filter(a => !needsEventTypes.includes(a.event_type)).length})
            </button>
            <button
              type="button"
              onClick={() => setMainTab("needs")}
              aria-pressed={mainTab === "needs"}
              className={`min-h-11 flex-1 rounded-md px-2 text-sm font-semibold transition-colors focus-visible:outline-3 focus-visible:outline-focus focus-visible:outline-offset-2 ${
                mainTab === "needs"
                  ? "bg-accent-soft text-on-accent-soft"
                  : "text-ink-muted hover:bg-surface-2 hover:text-ink"
              }`}
            >
              Needs ({isDummyMode() ? DEMO_HOSPITAL_NEEDS.length : patientAlerts.filter(a => needsEventTypes.includes(a.event_type)).length})
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div
            role="alert"
            className="mx-4 mt-4 flex flex-wrap items-center gap-3 rounded-lg border border-danger/30 bg-danger-soft p-3.5"
          >
            <TriangleAlert aria-hidden="true" className="h-5 w-5 shrink-0 text-on-danger-soft" />
            <p className="min-w-0 flex-1 text-sm font-medium text-on-danger-soft">{error}</p>
            <Button variant="danger" size="sm" onClick={fetchData}>
              Retry
            </Button>
          </div>
        )}

        {/* Alerts List */}
        <div className="px-4 py-4">
          {sortedAlerts.length === 0 ? (
            <EmptyState
              icon={mainTab === "alerts" ? <CheckCircle2 /> : <HeartHandshake />}
              title={mainTab === "alerts" ? "All Clear" : "No Requests"}
              description={
                mainTab === "alerts"
                  ? "No alerts in your area"
                  : "No donation requests right now"
              }
            />
          ) : (
            <div className="flex flex-col gap-3">
              {sortedAlerts.map((alert) => (
                <AlertCard
                  key={alert.id}
                  alert={alert}
                  expanded={expandedId === alert.id}
                  onToggle={() =>
                    setExpandedId(expandedId === alert.id ? null : alert.id)
                  }
                />
              ))}
            </div>
          )}
        </div>

        {/* Connection status - subtle */}
        {isOnline && (
          <div className="pb-4 text-center">
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-ink-faint">
              <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-success" />
              Live
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
