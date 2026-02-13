/**
 * Global Socket.IO context — maintains ONE persistent connection
 * shared across all dashboard pages.
 *
 * The DashboardLayout mounts this provider and subscribes to global
 * events (new alerts, SOS, hospital status) so badge counts and stores
 * stay in sync regardless of which page the user is on.
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
} from "react";
import { io, Socket } from "socket.io-client";
import { useAlertStore } from "../store/alertStore";
import type { Alert } from "../services/api";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

// ─── Context types ──────────────────────────────────────────────

interface SocketContextValue {
  socket: Socket | null;
  isConnected: boolean;
}

const SocketContext = createContext<SocketContextValue>({
  socket: null,
  isConnected: false,
});

// ─── Provider ───────────────────────────────────────────────────

export const SocketProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const socketRef = useRef<Socket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const { addAlert } = useAlertStore();

  useEffect(() => {
    const socket = io(API_URL, {
      path: "/socket.io",
      transports: ["websocket", "polling"],
      reconnection: true,
      reconnectionAttempts: Infinity,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
    });

    socketRef.current = socket;

    socket.on("connect", () => {
      setIsConnected(true);
      // Join all rooms the dashboard needs
      socket.emit("join_alerts");
      socket.emit("join_map");
    });

    socket.on("disconnect", () => {
      setIsConnected(false);
    });

    // ── Global alert store updates (badge counts) ─────────────
    socket.on("new_alert", (alert: Alert) => {
      addAlert(alert);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [addAlert]);

  return (
    <SocketContext.Provider
      value={{ socket: socketRef.current, isConnected }}
    >
      {children}
    </SocketContext.Provider>
  );
};

// ─── Hook ───────────────────────────────────────────────────────

export function useSocket(): SocketContextValue {
  return useContext(SocketContext);
}

/**
 * Subscribe to a socket event. Automatically attaches/detaches the
 * listener when the component mounts/unmounts.
 */
export function useSocketEvent<T = unknown>(
  event: string,
  handler: (data: T) => void
) {
  const { socket } = useSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    if (!socket) return;
    const fn = (data: T) => handlerRef.current(data);
    socket.on(event, fn as (...args: unknown[]) => void);
    return () => {
      socket.off(event, fn as (...args: unknown[]) => void);
    };
  }, [socket, event]);
}
