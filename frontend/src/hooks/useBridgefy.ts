/**
 * Bridgefy React Hook
 *
 * Provides reactive access to Bridgefy mesh network status.
 *
 * @module hooks/useBridgefy
 */

import { useState, useEffect, useCallback } from 'react';
import { BridgefyService } from '../native/bridgefyService';
import type { MeshStatus, BridgefySOSMessage, BridgefyAckMessage } from '../plugins/bridgefy';

// ─── Types ───────────────────────────────────────────────────────

export interface UseBridgefyResult {
  /** Whether the service is initialized */
  initialized: boolean;
  /** Whether the mesh network is running */
  isRunning: boolean;
  /** Whether connected to at least one device */
  isConnected: boolean;
  /** Number of nearby connected devices */
  nearbyDevices: number;
  /** Current mesh status */
  status: MeshStatus | null;
  /** Initialize and start Bridgefy */
  start: (userId: string) => Promise<boolean>;
  /** Stop the mesh network */
  stop: () => Promise<void>;
}

// ─── Hook Implementation ─────────────────────────────────────────

export function useBridgefy(): UseBridgefyResult {
  const [initialized, setInitialized] = useState(BridgefyService.isInitialized());
  const [status, setStatus] = useState<MeshStatus | null>(null);

  // Subscribe to status changes
  useEffect(() => {
    const unsubscribe = BridgefyService.onStatusChange((newStatus) => {
      setStatus(newStatus);
    });

    // Get initial status
    BridgefyService.getStatus().then(setStatus);

    return unsubscribe;
  }, []);

  // Start function
  const start = useCallback(async (userId: string): Promise<boolean> => {
    const initSuccess = await BridgefyService.initialize(userId);
    if (!initSuccess) {
      return false;
    }

    const startSuccess = await BridgefyService.start();
    if (startSuccess) {
      setInitialized(true);
    }

    return startSuccess;
  }, []);

  // Stop function
  const stop = useCallback(async (): Promise<void> => {
    await BridgefyService.stop();
  }, []);

  return {
    initialized,
    isRunning: status?.isRunning ?? false,
    isConnected: status?.isConnected ?? false,
    nearbyDevices: status?.nearbyDeviceCount ?? 0,
    status,
    start,
    stop,
  };
}

// ─── SOS Message Hook ────────────────────────────────────────────

export interface UseBridgefyMessagesResult {
  /** Recent SOS messages received */
  sosMessages: BridgefySOSMessage[];
  /** Recent acknowledgments received */
  acks: BridgefyAckMessage[];
  /** Clear all messages */
  clear: () => void;
}

export function useBridgefyMessages(): UseBridgefyMessagesResult {
  const [sosMessages, setSosMessages] = useState<BridgefySOSMessage[]>([]);
  const [acks, setAcks] = useState<BridgefyAckMessage[]>([]);

  useEffect(() => {
    const unsubSOS = BridgefyService.onSOSMessage((message) => {
      setSosMessages((prev) => [message, ...prev].slice(0, 100)); // Keep last 100
    });

    const unsubAck = BridgefyService.onAck((ack) => {
      setAcks((prev) => [ack, ...prev].slice(0, 100));
    });

    return () => {
      unsubSOS();
      unsubAck();
    };
  }, []);

  const clear = useCallback(() => {
    setSosMessages([]);
    setAcks([]);
  }, []);

  return {
    sosMessages,
    acks,
    clear,
  };
}
