/**
 * Connection Manager Service
 *
 * Monitors all connectivity layers (Internet, SMS, Bluetooth mesh)
 * and provides unified connection state for the SOS fallback system.
 *
 * @module services/connectionManager
 */

import { getNetworkStatus, addNetworkListener, type NetworkState } from '../native/networkService';
import { BridgefyService } from '../native/bridgefyService';
import { isNative } from '../native/platform';
import type { MeshStatus } from '../plugins/bridgefy';

// ─── Types ───────────────────────────────────────────────────────

export type ConnectionLayer = 'internet' | 'sms' | 'bluetooth' | 'none';

export type InternetQuality = 'good' | 'poor' | 'none';

export interface ConnectionState {
  /** Current best available layer */
  currentLayer: ConnectionLayer;

  /** Internet connectivity status */
  internet: {
    available: boolean;
    quality: InternetQuality;
    lastCheck: number;
    rtt?: number;
  };

  /** Cellular/SMS status */
  cellular: {
    available: boolean;
    canSendSMS: boolean;
  };

  /** Bluetooth mesh status */
  bluetooth: {
    available: boolean;
    meshRunning: boolean;
    meshConnected: boolean;
    nearbyDevices: number;
  };
}

type ConnectionListener = (state: ConnectionState) => void;

// ─── Constants ───────────────────────────────────────────────────

const HEALTH_CHECK_INTERVAL = 10000; // 10 seconds
const HEALTH_CHECK_TIMEOUT = 5000; // 5 seconds
const RTT_GOOD_THRESHOLD = 1000; // 1 second
const RTT_POOR_THRESHOLD = 5000; // 5 seconds
const HEALTH_ENDPOINT = '/api/v1/health';

// ─── Service Class ───────────────────────────────────────────────

class ConnectionManagerImpl {
  private state: ConnectionState;
  private listeners = new Set<ConnectionListener>();
  private networkCleanup: (() => void) | null = null;
  private meshCleanup: (() => void) | null = null;
  private healthCheckInterval: ReturnType<typeof setInterval> | null = null;
  private initialized = false;

  constructor() {
    this.state = this.createInitialState();
  }

  /**
   * Initialize connection monitoring
   *
   * @param userId - User ID for Bridgefy initialization (optional)
   */
  async initialize(userId?: string): Promise<void> {
    if (this.initialized) {
      return;
    }

    console.log('[ConnectionManager] Initializing...');

    // Start network monitoring
    this.networkCleanup = addNetworkListener((status) => {
      this.handleNetworkChange(status);
    });

    // Initialize Bridgefy if on native platform
    if (isNative && userId) {
      const bridgefyReady = await BridgefyService.initialize(userId);
      if (bridgefyReady) {
        await BridgefyService.start();

        this.meshCleanup = BridgefyService.onStatusChange((status) => {
          this.handleMeshStatusChange(status);
        });
      }
    }

    // Start periodic health checks
    this.healthCheckInterval = setInterval(() => {
      this.performHealthCheck();
    }, HEALTH_CHECK_INTERVAL);

    // Initial health check
    await this.performHealthCheck();

    this.initialized = true;
    console.log('[ConnectionManager] Initialized');
  }

  /**
   * Get current connection state
   */
  getState(): ConnectionState {
    return { ...this.state };
  }

  /**
   * Get the best available layer for SOS delivery
   */
  getBestLayer(): ConnectionLayer {
    // Priority: Internet (good) > SMS > Bluetooth > Internet (poor)
    if (this.state.internet.available && this.state.internet.quality === 'good') {
      return 'internet';
    }
    if (this.state.cellular.canSendSMS) {
      return 'sms';
    }
    if (this.state.bluetooth.meshConnected && this.state.bluetooth.nearbyDevices > 0) {
      return 'bluetooth';
    }
    if (this.state.internet.available) {
      return 'internet'; // Fall back to poor internet as last resort
    }
    return 'none';
  }

  /**
   * Get ordered fallback chain based on current state
   *
   * @returns Array of connection layers in priority order
   */
  getFallbackChain(): ConnectionLayer[] {
    const chain: ConnectionLayer[] = [];
    const hasInternet = this.state.internet.available || navigator.onLine;

    // Internet first — always prioritize when available
    if (hasInternet) {
      chain.push('internet');
    }

    // SMS if cellular available
    if (this.state.cellular.canSendSMS) {
      chain.push('sms');
    }

    // Bluetooth mesh if running and has devices
    if (this.state.bluetooth.meshRunning) {
      chain.push('bluetooth');
    }

    return chain;
  }

  /**
   * Subscribe to connection state changes
   *
   * @param listener - Callback for state changes
   * @returns Unsubscribe function
   */
  subscribe(listener: ConnectionListener): () => void {
    this.listeners.add(listener);
    // Immediately call with current state
    listener(this.state);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /**
   * Force a health check
   */
  async checkNow(): Promise<ConnectionState> {
    await this.performHealthCheck();
    return this.state;
  }

  /**
   * Cleanup and destroy the service
   */
  destroy(): void {
    this.networkCleanup?.();
    this.meshCleanup?.();

    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
    }

    this.listeners.clear();
    this.initialized = false;

    console.log('[ConnectionManager] Destroyed');
  }

  // ─── Private Methods ───────────────────────────────────────────

  private createInitialState(): ConnectionState {
    return {
      currentLayer: 'none',
      internet: {
        available: typeof navigator !== 'undefined' ? navigator.onLine : false,
        quality: 'none',
        lastCheck: 0,
      },
      cellular: {
        available: false,
        canSendSMS: isNative, // Assume SMS available on native
      },
      bluetooth: {
        available: false,
        meshRunning: false,
        meshConnected: false,
        nearbyDevices: 0,
      },
    };
  }

  private async performHealthCheck(): Promise<void> {
    await Promise.all([
      this.checkInternetQuality(),
      this.checkCellularStatus(),
      this.checkBluetoothStatus(),
    ]);

    this.updateCurrentLayer();
    this.notifyListeners();
  }

  private async checkInternetQuality(): Promise<void> {
    const networkStatus = await getNetworkStatus();

    if (!networkStatus.connected) {
      this.state.internet = {
        available: false,
        quality: 'none',
        lastCheck: Date.now(),
      };
      return;
    }

    // Ping health endpoint to measure actual connectivity
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), HEALTH_CHECK_TIMEOUT);

      const start = Date.now();
      const response = await fetch(HEALTH_ENDPOINT, {
        method: 'HEAD',
        cache: 'no-store',
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const rtt = Date.now() - start;

      let quality: InternetQuality;
      if (rtt < RTT_GOOD_THRESHOLD) {
        quality = 'good';
      } else if (rtt < RTT_POOR_THRESHOLD) {
        quality = 'poor';
      } else {
        quality = 'none';
      }

      this.state.internet = {
        available: response.ok,
        quality: response.ok ? quality : 'none',
        lastCheck: Date.now(),
        rtt,
      };
    } catch {
      this.state.internet = {
        available: false,
        quality: 'none',
        lastCheck: Date.now(),
      };
    }
  }

  private async checkCellularStatus(): Promise<void> {
    const networkStatus = await getNetworkStatus();

    this.state.cellular = {
      available: networkStatus.connectionType === 'cellular',
      canSendSMS: isNative, // SMS always available on native devices
    };
  }

  private async checkBluetoothStatus(): Promise<void> {
    if (!BridgefyService.isInitialized()) {
      this.state.bluetooth = {
        available: false,
        meshRunning: false,
        meshConnected: false,
        nearbyDevices: 0,
      };
      return;
    }

    const meshStatus = await BridgefyService.getStatus();
    this.state.bluetooth = {
      available: true,
      meshRunning: meshStatus.isRunning,
      meshConnected: meshStatus.isConnected,
      nearbyDevices: meshStatus.nearbyDeviceCount,
    };
  }

  private handleNetworkChange(status: NetworkState): void {
    this.state.internet.available = status.connected;
    if (!status.connected) {
      this.state.internet.quality = 'none';
    }
    this.state.cellular.available = status.connectionType === 'cellular';

    this.updateCurrentLayer();
    this.notifyListeners();
  }

  private handleMeshStatusChange(status: MeshStatus): void {
    this.state.bluetooth = {
      available: true,
      meshRunning: status.isRunning,
      meshConnected: status.isConnected,
      nearbyDevices: status.nearbyDeviceCount,
    };

    this.updateCurrentLayer();
    this.notifyListeners();
  }

  private updateCurrentLayer(): void {
    this.state.currentLayer = this.getBestLayer();
  }

  private notifyListeners(): void {
    const stateCopy = { ...this.state };
    this.listeners.forEach((listener) => {
      try {
        listener(stateCopy);
      } catch (error) {
        console.error('[ConnectionManager] Listener error:', error);
      }
    });
  }
}

// ─── Export Singleton ────────────────────────────────────────────

export const ConnectionManager = new ConnectionManagerImpl();
