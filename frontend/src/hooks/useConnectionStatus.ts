/**
 * Connection Status React Hook
 *
 * Provides reactive access to unified connection state across all layers.
 *
 * @module hooks/useConnectionStatus
 */

import { useState, useEffect, useCallback } from 'react';
import { ConnectionManager, type ConnectionState, type ConnectionLayer } from '../services/connectionManager';

// ─── Types ───────────────────────────────────────────────────────

export interface UseConnectionStatusResult {
  /** Current connection state */
  state: ConnectionState;
  /** Best available layer */
  bestLayer: ConnectionLayer;
  /** Ordered fallback chain */
  fallbackChain: ConnectionLayer[];
  /** Whether any connectivity is available */
  isConnected: boolean;
  /** Whether internet is available */
  hasInternet: boolean;
  /** Whether SMS is available */
  hasSMS: boolean;
  /** Whether Bluetooth mesh is available */
  hasBluetooth: boolean;
  /** Force a connection check */
  checkNow: () => Promise<void>;
}

// ─── Hook Implementation ─────────────────────────────────────────

export function useConnectionStatus(): UseConnectionStatusResult {
  const [state, setState] = useState<ConnectionState>(ConnectionManager.getState());

  useEffect(() => {
    const unsubscribe = ConnectionManager.subscribe((newState) => {
      setState(newState);
    });

    return unsubscribe;
  }, []);

  const checkNow = useCallback(async (): Promise<void> => {
    await ConnectionManager.checkNow();
  }, []);

  return {
    state,
    bestLayer: state.currentLayer,
    fallbackChain: ConnectionManager.getFallbackChain(),
    isConnected: state.currentLayer !== 'none',
    hasInternet: state.internet.available,
    hasSMS: state.cellular.canSendSMS,
    hasBluetooth: state.bluetooth.meshConnected,
    checkNow,
  };
}

// ─── Connection Layer Indicator Hook ─────────────────────────────

export interface ConnectionIndicatorInfo {
  layer: ConnectionLayer;
  label: string;
  icon: string;
  color: string;
  description: string;
}

export function useConnectionIndicator(): ConnectionIndicatorInfo {
  const { bestLayer, state } = useConnectionStatus();

  switch (bestLayer) {
    case 'internet':
      return {
        layer: 'internet',
        label: state.internet.quality === 'good' ? 'Online' : 'Slow',
        icon: state.internet.quality === 'good' ? 'wifi' : 'wifi-low',
        color: state.internet.quality === 'good' ? 'green' : 'yellow',
        description: state.internet.quality === 'good'
          ? 'Connected via internet'
          : 'Poor internet connection',
      };
    case 'sms':
      return {
        layer: 'sms',
        label: 'Cellular',
        icon: 'signal',
        color: 'yellow',
        description: 'Connected via cellular (SMS fallback)',
      };
    case 'bluetooth':
      return {
        layer: 'bluetooth',
        label: `Mesh (${state.bluetooth.nearbyDevices})`,
        icon: 'bluetooth',
        color: 'blue',
        description: `Connected to ${state.bluetooth.nearbyDevices} nearby devices`,
      };
    default:
      return {
        layer: 'none',
        label: 'Offline',
        icon: 'wifi-off',
        color: 'red',
        description: 'No connectivity available',
      };
  }
}
