/**
 * Socket.IO hook for real-time communication with the TMT backend.
 * Auto-joins rooms based on user role and handles reconnection.
 */

import { useEffect, useRef, useState, useCallback } from "react";
import { io, Socket } from "socket.io-client";
import { useAuthStore } from "../store/authStore";
import { useAlertStore } from "../store/alertStore";
import { useMapStore } from "../store/mapStore";
import type { Alert, MapEvent } from "../services/api";

const WS_URL = import.meta.env.VITE_WS_URL || "ws://localhost:8000";

interface WebSocketHookReturn {
  isConnected: boolean;
  lastEvent: { type: string; data: unknown } | null;
}

export function useWebSocket(): WebSocketHookReturn {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [lastEvent, setLastEvent] = useState<{
    type: string;
    data: unknown;
  } | null>(null);

  const { token, user, isAuthenticated } = useAuthStore();
  const addAlert = useAlertStore((s) => s.addAlert);
  const addMapEvent = useMapStore((s) => s.addEvent);

  const updateLastEvent = useCallback(
    (type: string, data: unknown) => {
      setLastEvent({ type, data });
    },
    []
  );

  useEffect(() => {
    if (!isAuthenticated || !token) {
      // Disconnect if not authenticated
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
        setIsConnected(false);
      }
      return;
    }

    // Create socket connection
    const socket = io(WS_URL, {
      auth: { token },
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    // Connection events
    socket.on("connect", () => {
      setIsConnected(true);

      // Auto-join rooms based on role
      if (user?.role === "hospital_admin" || user?.role === "super_admin") {
        socket.emit("join_alerts");
        socket.emit("join_map");
        if (user.hospitalId) {
          socket.emit("join_hospital", { hospital_id: user.hospitalId });
        }
      } else if (user?.role === "patient") {
        if (user.patientId) {
          socket.emit("join_patient", { patient_id: user.patientId });
        }
        socket.emit("join_map");
      }
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    // Application events
    socket.on("new_alert", (data: Alert) => {
      addAlert(data);
      updateLastEvent("new_alert", data);
    });

    socket.on("map_event", (data: MapEvent) => {
      addMapEvent(data);
      updateLastEvent("map_event", data);
    });

    socket.on("hospital_status", (data: unknown) => {
      updateLastEvent("hospital_status", data);
    });

    socket.on("new_sos", (data: unknown) => {
      updateLastEvent("new_sos", data);
    });

    socket.on("patient_alert", (data: unknown) => {
      updateLastEvent("patient_alert", data);
    });

    socket.on("joined", (data: { room: string }) => {
      console.log(`Joined room: ${data.room}`);
    });

    // Cleanup on unmount or re-render
    return () => {
      socket.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    };
  }, [isAuthenticated, token, user, addAlert, addMapEvent, updateLastEvent]);

  return { isConnected, lastEvent };
}
