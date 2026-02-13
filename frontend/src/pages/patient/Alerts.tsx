import { useState, useEffect, useCallback, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { getAlerts, getHospitals, type Alert, type Hospital } from "../../services/api";
import { useAuthStore } from "../../store/authStore";
import { getCurrentPosition } from "../../utils/locationCodec";
import {
  getSeverityInfo,
  eventTypeLabels,
  timeAgo,
  formatDate,
} from "../../utils/formatting";

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

// ─── Alert Card Component ───────────────────────────────────────

function AlertCard({
  alert,
  distance,
  nearestHospital,
  expanded,
  onToggle,
}: {
  alert: Alert;
  distance: number | null;
  nearestHospital: (Hospital & { distance: number }) | null;
  expanded: boolean;
  onToggle: () => void;
}) {
  const severityInfo = getSeverityInfo(alert.severity);
  const eventLabel =
    eventTypeLabels[alert.event_type]?.en || alert.event_type;
  const isExpired = alert.expires_at && new Date(alert.expires_at) < new Date();

  return (
    <div
      className={`bg-white rounded-xl border shadow-sm overflow-hidden transition-all ${
        isExpired
          ? "border-gray-200 opacity-60"
          : alert.severity === "critical"
            ? "border-red-200"
            : alert.severity === "high"
              ? "border-orange-200"
              : "border-gray-200"
      }`}
    >
      {/* Main row */}
      <button
        onClick={onToggle}
        className="w-full px-5 py-4 flex items-start gap-4 text-start hover:bg-gray-50 transition"
      >
        {/* Severity Badge */}
        <div
          className={`px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider shrink-0 mt-0.5 ${severityInfo.bgColor} ${severityInfo.color}`}
        >
          {severityInfo.label}
        </div>

        {/* Content */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs font-medium text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
              {eventLabel}
            </span>
            {isExpired && (
              <span className="text-xs text-gray-400 bg-gray-50 px-2 py-0.5 rounded">
                Expired
              </span>
            )}
          </div>
          <h3 className="font-semibold text-gray-900 text-sm leading-tight truncate">
            {alert.title}
          </h3>
          <div className="flex items-center gap-3 mt-1.5 text-xs text-gray-500">
            {distance !== null && (
              <span className="flex items-center gap-1">
                <svg
                  className="w-3.5 h-3.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path
                    fillRule="evenodd"
                    d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z"
                    clipRule="evenodd"
                  />
                </svg>
                {distance.toFixed(1)} km away
              </span>
            )}
            <span className="flex items-center gap-1">
              <svg
                className="w-3.5 h-3.5"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.415-1.415L11 9.586V6z"
                  clipRule="evenodd"
                />
              </svg>
              {timeAgo(alert.created_at)}
            </span>
            {alert.affected_patients_count > 0 && (
              <span className="flex items-center gap-1">
                <svg
                  className="w-3.5 h-3.5"
                  fill="currentColor"
                  viewBox="0 0 20 20"
                >
                  <path d="M9 6a3 3 0 11-6 0 3 3 0 016 0zM17 6a3 3 0 11-6 0 3 3 0 016 0zM12.93 17c.046-.327.07-.66.07-1a6.97 6.97 0 00-1.5-4.33A5 5 0 0119 16v1h-6.07zM6 11a5 5 0 015 5v1H1v-1a5 5 0 015-5z" />
                </svg>
                {alert.affected_patients_count} affected
              </span>
            )}
          </div>
        </div>

        {/* Expand chevron */}
        <svg
          className={`w-5 h-5 text-gray-400 shrink-0 mt-1 transition-transform ${
            expanded ? "rotate-180" : ""
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {/* Expanded Details - Minimal Version */}
      {expanded && (
        <div className="px-5 pb-5 border-t border-gray-100 pt-4 space-y-4">
          {/* Description */}
          {alert.details && (
            <p className="text-sm text-gray-700 leading-relaxed">
              {alert.details}
            </p>
          )}

          {/* Safety Instructions */}
          <div className="bg-amber-50 rounded-lg p-4">
            <h4 className="text-xs font-semibold text-amber-800 uppercase tracking-wide mb-2 flex items-center gap-1.5">
              <svg
                className="w-4 h-4"
                fill="currentColor"
                viewBox="0 0 20 20"
              >
                <path
                  fillRule="evenodd"
                  d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z"
                  clipRule="evenodd"
                />
              </svg>
              What to do
            </h4>
            <ul className="text-sm text-amber-900 space-y-2">
              {getSafetyInstructions(alert.event_type).map((instruction, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="w-5 h-5 rounded-full bg-amber-200 text-amber-800 flex items-center justify-center text-xs font-bold shrink-0">
                    {i + 1}
                  </span>
                  {instruction}
                </li>
              ))}
            </ul>
          </div>

          {/* Source - Simple footer */}
          {alert.source && (
            <p className="text-xs text-gray-500">
              Source: <span className="font-medium text-gray-700">{alert.source}</span>
            </p>
          )}
        </div>
      )}
    </div>
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

// ─── Filter Tabs ────────────────────────────────────────────────

type FilterTab = "all" | "critical" | "high" | "medium" | "low";

// ─── Demo Crisis Alerts (earthquakes, floods, wars, etc.) ────────

const DEMO_CRISIS_ALERTS: Alert[] = [
  {
    id: "demo-critical-1",
    title: "EARTHQUAKE ALERT: Magnitude 6.2 Detected",
    details: "A significant earthquake has been detected in the northern region. The Ministry of Health has issued an emergency alert for all residents in affected areas. Please follow safety protocols immediately.",
    severity: "critical",
    event_type: "earthquake",
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
  const [filter, setFilter] = useState<FilterTab>("all");
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

  // Use demo alerts based on selected main tab
  // "alerts" = crisis alerts (earthquakes, floods, wars)
  // "needs" = hospital needs (blood donations, supplies, volunteers)
  const displayAlerts: Alert[] = mainTab === "alerts" ? DEMO_CRISIS_ALERTS : DEMO_HOSPITAL_NEEDS;

  // Filter alerts
  const filteredAlerts = displayAlerts.filter((a: Alert) => {
    if (filter === "all") return true;
    return a.severity === filter;
  });

  // Sort: non-expired first, then by severity, then by recency
  const severityOrder: Record<string, number> = {
    critical: 0,
    high: 1,
    medium: 2,
    low: 3,
  };

  const sortedAlerts = [...filteredAlerts].sort((a, b) => {
    const aExpired = a.expires_at && new Date(a.expires_at) < new Date();
    const bExpired = b.expires_at && new Date(b.expires_at) < new Date();
    if (aExpired && !bExpired) return 1;
    if (!aExpired && bExpired) return -1;

    const aSev = severityOrder[a.severity] ?? 2;
    const bSev = severityOrder[b.severity] ?? 2;
    if (aSev !== bSev) return aSev - bSev;

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  });

  // Count by severity
  const counts = {
    all: displayAlerts.length,
    critical: displayAlerts.filter((a) => a.severity === "critical").length,
    high: displayAlerts.filter((a) => a.severity === "high").length,
    medium: displayAlerts.filter((a) => a.severity === "medium").length,
    low: displayAlerts.filter((a) => a.severity === "low").length,
  };

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
      <div className="min-h-full bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <svg
            className="w-12 h-12 text-red-500 animate-spin mx-auto mb-4"
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
          <p className="text-gray-500">Loading alerts...</p>
        </div>
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
    <div className="min-h-full bg-gray-50">
      {/* Emergency Alert Overlay - Full Screen, No Scroll */}
      {showEmergencyOverlay && emergencyAlert && (
        <div className="fixed inset-0 z-[100] bg-gradient-to-b from-red-900 via-red-800 to-black">
          {/* Flashing red border */}
          <div className="absolute inset-0 animate-pulse pointer-events-none">
            <div className="absolute inset-0 border-[4px] border-red-500" />
          </div>

          <div className="relative h-full flex flex-col justify-center overflow-hidden px-5 py-6">
            {/* Header - Fixed at top */}
            <div className="absolute top-4 left-5 right-5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-400 rounded-full animate-pulse" />
                <span className="text-white/80 text-xs font-semibold uppercase tracking-wider">
                  Emergency Alert
                </span>
              </div>
              <span className="text-white/60 text-xs">
                {new Date().toLocaleTimeString()}
              </span>
            </div>

            {/* Centered Content */}
            <div className="flex flex-col items-center">
              {/* Alert Icon */}
              <div className="w-20 h-20 bg-red-600 rounded-full flex items-center justify-center animate-pulse mb-4">
                <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              </div>

              {/* Alert Type Badge */}
              <span className="inline-block bg-red-600 text-white px-4 py-1 rounded-full text-sm font-bold uppercase mb-3">
                {eventTypeLabels[emergencyAlert.event_type]?.en || emergencyAlert.event_type}
              </span>

              {/* Alert Title */}
              <h1 className="text-white text-lg font-bold text-center mb-2 leading-tight">
                {emergencyAlert.title}
              </h1>

              {/* Alert Message */}
              <p className="text-white/80 text-center text-sm mb-4">
                {emergencyAlert.details}
              </p>

              {/* Safety Instructions */}
              <div className="w-full bg-white/10 rounded-xl p-3 mb-4">
                <p className="text-amber-400 text-xs font-bold uppercase mb-2">What to do:</p>
                <div className="space-y-1.5">
                  {getSafetyInstructions(emergencyAlert.event_type).slice(0, 3).map((instruction, i) => (
                    <div key={i} className="flex items-start gap-2">
                      <span className="w-4 h-4 bg-amber-500 rounded-full flex items-center justify-center text-[10px] font-bold text-black shrink-0 mt-0.5">
                        {i + 1}
                      </span>
                      <span className="text-white text-xs leading-snug">{instruction}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Source */}
              <p className="text-center text-white/50 text-xs mb-4">
                Source: <span className="text-white/70">{emergencyAlert.source}</span>
              </p>

              {/* Dismiss Button */}
              <button
                onClick={dismissEmergencyAlert}
                className="w-full bg-white text-red-700 font-bold py-3.5 rounded-xl text-base active:bg-gray-100 transition-colors"
              >
                I Understand
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Offline Banner */}
      {!isOnline && (
        <div className="px-4 py-2.5 bg-amber-500 text-white text-center text-sm font-medium flex items-center justify-center gap-2">
          <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M3.707 2.293a1 1 0 00-1.414 1.414l6.921 6.922c.05.062.105.118.168.167l6.91 6.911a1 1 0 001.415-1.414l-.675-.675A9.001 9.001 0 0010 2H9.5a1 1 0 000 2H10a7 7 0 014.95 2.05l-1.414 1.414A5 5 0 0010 6a4.978 4.978 0 00-2.793.856L3.707 2.293z"
              clipRule="evenodd"
            />
          </svg>
          You are offline - showing cached alerts
        </div>
      )}

      <div className="max-w-2xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {mainTab === "alerts" ? "Crisis Alerts" : "Hospital Needs"}
            </h1>
            <p className="text-gray-500 text-sm mt-1">
              {mainTab === "alerts"
                ? "Emergency alerts in your area"
                : "Hospitals requesting donations & supplies"}
            </p>
          </div>
          <button
            onClick={fetchData}
            disabled={!isOnline}
            className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition disabled:opacity-50"
            title="Refresh alerts"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
              />
            </svg>
          </button>
        </div>

        {/* Main Tabs: Alerts vs Needs */}
        <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
          <button
            onClick={() => setMainTab("alerts")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
              mainTab === "alerts"
                ? "bg-white text-red-600 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
            </svg>
            Alerts
            <span className={`px-1.5 py-0.5 rounded text-xs ${
              mainTab === "alerts" ? "bg-red-100 text-red-600" : "bg-gray-200 text-gray-500"
            }`}>
              {DEMO_CRISIS_ALERTS.length}
            </span>
          </button>
          <button
            onClick={() => setMainTab("needs")}
            className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-semibold transition-all ${
              mainTab === "needs"
                ? "bg-white text-blue-600 shadow-sm"
                : "text-gray-600 hover:text-gray-900"
            }`}
          >
            <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
            </svg>
            Needs
            <span className={`px-1.5 py-0.5 rounded text-xs ${
              mainTab === "needs" ? "bg-blue-100 text-blue-600" : "bg-gray-200 text-gray-500"
            }`}>
              {DEMO_HOSPITAL_NEEDS.length}
            </span>
          </button>
        </div>

        {/* Nearest Hospital Card (global) - Commented out */}
        {/* {patientNearestHospital && (
          <div className="bg-white rounded-xl border border-green-200 shadow-sm p-4 mb-6">
            <div className="flex items-center gap-3">
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
                <p className="text-xs font-medium text-green-700 uppercase tracking-wide">
                  Nearest Hospital
                </p>
                <p className="font-semibold text-gray-900">
                  {patientNearestHospital.name}
                </p>
                <div className="flex items-center gap-3 mt-0.5">
                  <span className="text-sm text-gray-500">
                    {patientNearestHospital.distance.toFixed(1)} km
                  </span>
                  <span className="text-sm text-green-600 font-medium">
                    {patientNearestHospital.status === "operational"
                      ? "Operational"
                      : patientNearestHospital.status}
                  </span>
                  {patientNearestHospital.phone && (
                    <a
                      href={`tel:${patientNearestHospital.phone}`}
                      className="text-sm text-blue-600 hover:text-blue-700 font-medium"
                    >
                      Call
                    </a>
                  )}
                </div>
              </div>
            </div>
          </div>
        )} */}

        {/* Filter Pills */}
        <div className="flex flex-wrap gap-2 mb-6">
          {(["all", "critical", "high", "medium", "low"] as FilterTab[]).map(
            (tab) => {
              const tabColors: Record<FilterTab, string> = {
                all: "bg-gray-100 text-gray-700",
                critical: "bg-red-100 text-red-700",
                high: "bg-orange-100 text-orange-700",
                medium: "bg-yellow-100 text-yellow-700",
                low: "bg-blue-100 text-blue-700",
              };
              const activeColors: Record<FilterTab, string> = {
                all: "bg-gray-800 text-white",
                critical: "bg-red-600 text-white",
                high: "bg-orange-500 text-white",
                medium: "bg-yellow-500 text-white",
                low: "bg-blue-500 text-white",
              };
              return (
                <button
                  key={tab}
                  onClick={() => setFilter(tab)}
                  className={`px-4 py-2 rounded-full text-sm font-semibold capitalize transition ${
                    filter === tab ? activeColors[tab] : tabColors[tab]
                  }`}
                >
                  {tab} ({counts[tab]})
                </button>
              );
            }
          )}
        </div>

        {/* Error */}
        {error && (
          <div className="mb-6 bg-red-50 border border-red-200 rounded-lg p-4 flex items-center gap-3">
            <svg
              className="w-5 h-5 text-red-500 shrink-0"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <p className="text-red-700 text-sm">{error}</p>
            <button
              onClick={fetchData}
              className="ms-auto text-sm text-red-600 font-medium hover:text-red-700"
            >
              Retry
            </button>
          </div>
        )}

        {/* Alerts List */}
        {sortedAlerts.length === 0 ? (
          <div className="text-center py-16">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                className="w-8 h-8 text-green-500"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
                />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-gray-900 mb-1">
              {mainTab === "alerts" ? "No Active Alerts" : "No Current Needs"}
            </h3>
            <p className="text-gray-500 text-sm">
              {filter === "all"
                ? mainTab === "alerts"
                  ? "There are no crisis alerts in your area at this time."
                  : "No hospitals are requesting donations or supplies at this time."
                : `No ${filter} severity ${mainTab === "alerts" ? "alerts" : "needs"} found.`}
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {sortedAlerts.map((alert) => (
              <AlertCard
                key={alert.id}
                alert={alert}
                distance={getDistanceToAlert(alert)}
                nearestHospital={getNearestHospitalForAlert(alert)}
                expanded={expandedId === alert.id}
                onToggle={() =>
                  setExpandedId(expandedId === alert.id ? null : alert.id)
                }
              />
            ))}
          </div>
        )}

        {/* Demo Emergency Alert Button (for prototype demonstration) - Only on Alerts tab */}
        {mainTab === "alerts" && (
          <div className="mt-8 p-4 bg-gray-100 rounded-xl border border-dashed border-gray-300">
            <p className="text-xs text-gray-500 uppercase tracking-wide font-semibold mb-2">
              Prototype Demo
            </p>
            <p className="text-sm text-gray-600 mb-3">
              Simulate receiving a government-level emergency broadcast alert:
            </p>
            <button
              onClick={() => {
                const criticalAlert = DEMO_CRISIS_ALERTS.find(a => a.severity === "critical");
                if (criticalAlert) {
                  triggerEmergencyAlert(criticalAlert);
                }
              }}
              className="w-full bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-4 rounded-lg flex items-center justify-center gap-2 transition-colors"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
              Trigger Emergency Alert Demo
            </button>
          </div>
        )}

        {/* Real-time indicator */}
        {isOnline && (
          <div className="mt-8 text-center">
            <span className="inline-flex items-center gap-2 text-xs text-gray-400">
              <span className="w-2 h-2 bg-green-400 rounded-full animate-pulse" />
              Receiving real-time updates
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
