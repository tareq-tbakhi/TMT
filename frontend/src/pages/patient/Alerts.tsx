import { useState, useEffect, useCallback, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { getAlerts, getHospitals, type Alert, type Hospital } from "../../services/api";
import { useAuthStore } from "../../store/authStore";
import { getCurrentPosition } from "../../utils/locationCodec";
import { eventTypeLabels, timeAgo } from "../../utils/formatting";
import { isDummyMode } from "../../hooks/useDataMode";

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
    critical: "bg-red-500",
    high: "bg-orange-500",
    medium: "bg-yellow-500",
    low: "bg-blue-500",
  };

  return (
    <div className={`w-3 h-3 rounded-full ${colors[severity] || "bg-gray-400"}`} />
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
    <div
      className={`bg-white rounded-2xl overflow-hidden transition-all ${
        isExpired ? "opacity-50" : ""
      } ${
        alert.severity === "critical"
          ? "ring-2 ring-red-100"
          : "ring-1 ring-gray-100"
      }`}
    >
      {/* Main row */}
      <button
        onClick={onToggle}
        className="w-full p-4 flex items-center gap-3 text-start active:bg-gray-50 transition"
      >
        {/* Severity indicator */}
        <SeverityIcon severity={alert.severity} />

        {/* Content */}
        <div className="flex-1 min-w-0">
          <h3 className="font-medium text-gray-900 text-[15px] leading-snug line-clamp-2">
            {alert.title}
          </h3>
          <p className="text-xs text-gray-400 mt-1">
            {timeAgo(alert.created_at)}
            {alert.source && ` · ${alert.source}`}
          </p>
        </div>

        {/* Expand chevron */}
        <svg
          className={`w-5 h-5 text-gray-300 shrink-0 transition-transform ${
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

      {/* Expanded Details */}
      {expanded && (
        <div className="px-4 pb-4 space-y-3">
          {/* Description */}
          {alert.details && (
            <p className="text-sm text-gray-600 leading-relaxed">
              {alert.details}
            </p>
          )}

          {/* Safety Instructions - Compact */}
          <div className="bg-amber-50/80 rounded-xl p-3">
            <p className="text-xs font-semibold text-amber-700 mb-2">What to do:</p>
            <div className="space-y-1.5">
              {getSafetyInstructions(alert.event_type).map((instruction, i) => (
                <div key={i} className="flex items-start gap-2">
                  <span className="w-4 h-4 rounded-full bg-amber-200 text-amber-700 flex items-center justify-center text-[10px] font-bold shrink-0 mt-0.5">
                    {i + 1}
                  </span>
                  <span className="text-sm text-amber-800">{instruction}</span>
                </div>
              ))}
            </div>
          </div>
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

      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="bg-white border-b border-gray-100 px-4 py-4">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center shadow-lg ${
              mainTab === "alerts"
                ? "bg-gradient-to-br from-red-500 to-red-600 shadow-red-200"
                : "bg-gradient-to-br from-pink-500 to-pink-600 shadow-pink-200"
            }`}>
              {mainTab === "alerts" ? (
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M8.257 3.099c.765-1.36 2.722-1.36 3.486 0l5.58 9.92c.75 1.334-.213 2.98-1.742 2.98H4.42c-1.53 0-2.493-1.646-1.743-2.98l5.58-9.92zM11 13a1 1 0 11-2 0 1 1 0 012 0zm-1-8a1 1 0 00-1 1v3a1 1 0 002 0V6a1 1 0 00-1-1z" clipRule="evenodd" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-white" fill="currentColor" viewBox="0 0 20 20">
                  <path fillRule="evenodd" d="M3.172 5.172a4 4 0 015.656 0L10 6.343l1.172-1.171a4 4 0 115.656 5.656L10 17.657l-6.828-6.829a4 4 0 010-5.656z" clipRule="evenodd" />
                </svg>
              )}
            </div>
            <div>
              <h1 className="font-bold text-gray-900 text-lg">
                {mainTab === "alerts" ? "Alerts" : "Hospital Needs"}
              </h1>
            </div>
          </div>
        </div>

        {/* Simple Tab Switcher */}
        <div className="bg-white border-b border-gray-100 px-4 py-2">
          <div className="flex gap-1">
            <button
              onClick={() => setMainTab("alerts")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                mainTab === "alerts"
                  ? "bg-red-50 text-red-600"
                  : "text-gray-500"
              }`}
            >
              Alerts ({isDummyMode() ? DEMO_CRISIS_ALERTS.length : patientAlerts.filter(a => !needsEventTypes.includes(a.event_type)).length})
            </button>
            <button
              onClick={() => setMainTab("needs")}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                mainTab === "needs"
                  ? "bg-pink-50 text-pink-600"
                  : "text-gray-500"
              }`}
            >
              Needs ({isDummyMode() ? DEMO_HOSPITAL_NEEDS.length : patientAlerts.filter(a => needsEventTypes.includes(a.event_type)).length})
            </button>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div className="mx-4 mt-4 bg-red-50 rounded-xl p-3 flex items-center gap-3">
            <svg className="w-5 h-5 text-red-500 shrink-0" fill="currentColor" viewBox="0 0 20 20">
              <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z" clipRule="evenodd" />
            </svg>
            <p className="text-red-700 text-sm flex-1">{error}</p>
            <button onClick={fetchData} className="text-sm text-red-600 font-medium">Retry</button>
          </div>
        )}

        {/* Alerts List */}
        <div className="px-4 py-4">
          {sortedAlerts.length === 0 ? (
            <div className="text-center py-12">
              <div className="w-14 h-14 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-3">
                <svg className="w-7 h-7 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              </div>
              <h3 className="font-medium text-gray-900 mb-1">
                {mainTab === "alerts" ? "All Clear" : "No Requests"}
              </h3>
              <p className="text-gray-400 text-sm">
                {mainTab === "alerts"
                  ? "No alerts in your area"
                  : "No donation requests right now"}
              </p>
            </div>
          ) : (
            <div className="space-y-3">
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
            <span className="inline-flex items-center gap-1.5 text-xs text-gray-300">
              <span className="w-1.5 h-1.5 bg-green-400 rounded-full" />
              Live
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
