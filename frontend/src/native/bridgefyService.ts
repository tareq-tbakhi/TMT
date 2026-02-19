/**
 * Bridgefy Service - TypeScript wrapper for the native Bridgefy plugin
 *
 * Provides a high-level API for Bluetooth mesh networking.
 * Handles SOS message sending, receiving, and relaying.
 *
 * @module native/bridgefyService
 */

import {
  Bridgefy,
  type MeshStatus,
  type ReceivedMessage,
  type BridgefySOSMessage,
  type BridgefyAckMessage,
  type BridgefyMessage,
  type PatientStatusCode,
} from '../plugins/bridgefy';
import { isNative } from './platform';
import { isOnline } from './networkService';

// ─── Types ───────────────────────────────────────────────────────

export interface SendSOSOptions {
  messageId: string;
  latitude: number;
  longitude: number;
  accuracy: number;
  severity: number;
  patientStatus: string;
  details?: string;
  patientName?: string;
  bloodType?: string;
  medicalConditions?: string[];
}

type SOSMessageListener = (message: BridgefySOSMessage) => void;
type AckListener = (ack: BridgefyAckMessage) => void;
type StatusListener = (status: MeshStatus) => void;

// ─── Constants ───────────────────────────────────────────────────

const MAX_PROCESSED_IDS = 1000;
const MAX_DETAILS_LENGTH = 100;
const DEFAULT_TTL = 15;
const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:8000';
const RELAY_ENDPOINT = `${API_BASE_URL}/api/v1/mesh/relay`;
const ACK_ENDPOINT = `${API_BASE_URL}/api/v1/mesh/ack`;

// ─── Service Class ───────────────────────────────────────────────

class BridgefyServiceImpl {
  private initialized = false;
  private running = false;
  private userId = '';
  private processedMessageIds = new Set<string>();

  // Event listeners
  private sosListeners: SOSMessageListener[] = [];
  private ackListeners: AckListener[] = [];
  private statusListeners: StatusListener[] = [];

  // Plugin listener cleanup functions
  private cleanupFunctions: Array<() => void> = [];

  /**
   * Initialize the Bridgefy SDK
   *
   * @param userId - Unique user identifier for this device
   * @returns Whether initialization succeeded
   */
  async initialize(userId: string): Promise<boolean> {
    if (!isNative) {
      console.warn('[Bridgefy] Running in web mode - mesh networking unavailable');
      // Still allow initialization for web mock
    }

    if (this.initialized) {
      return true;
    }

    const apiKey = import.meta.env.VITE_BRIDGEFY_API_KEY;
    if (!apiKey) {
      console.error('[Bridgefy] VITE_BRIDGEFY_API_KEY not configured');
      return false;
    }

    try {
      // Check Bluetooth availability
      const btStatus = await Bridgefy.isBluetoothAvailable();
      if (!btStatus.available) {
        console.warn('[Bridgefy] Bluetooth not available on this device');
        return false;
      }

      if (!btStatus.enabled) {
        console.warn('[Bridgefy] Bluetooth is disabled');
        // Could prompt user to enable Bluetooth here
      }

      // Request permissions if needed
      const permissions = await Bridgefy.requestPermissions();
      if (permissions.bluetooth !== 'granted') {
        console.error('[Bridgefy] Bluetooth permission denied');
        return false;
      }

      // Initialize SDK
      const result = await Bridgefy.initialize({
        apiKey,
        userId,
        propagationProfile: 'standard',
      });

      if (!result.success) {
        console.error('[Bridgefy] SDK initialization failed');
        return false;
      }

      this.userId = userId;
      this.initialized = true;

      // Set up event listeners
      await this.setupEventListeners();

      console.log(`[Bridgefy] Initialized successfully. SDK version: ${result.sdkVersion}`);
      return true;
    } catch (error) {
      console.error('[Bridgefy] Initialization error:', error);
      return false;
    }
  }

  /**
   * Start the mesh network
   *
   * @returns Whether start succeeded
   */
  async start(): Promise<boolean> {
    if (!this.initialized) {
      console.error('[Bridgefy] Cannot start - not initialized');
      return false;
    }

    if (this.running) {
      return true;
    }

    try {
      await Bridgefy.start({
        autoConnect: true,
        transmitPower: 'high', // Maximum range for emergencies
      });

      this.running = true;
      console.log('[Bridgefy] Mesh network started');
      return true;
    } catch (error) {
      console.error('[Bridgefy] Failed to start:', error);
      return false;
    }
  }

  /**
   * Stop the mesh network
   */
  async stop(): Promise<void> {
    if (!this.running) {
      return;
    }

    try {
      await Bridgefy.stop();
      this.running = false;
      console.log('[Bridgefy] Mesh network stopped');
    } catch (error) {
      console.error('[Bridgefy] Failed to stop:', error);
    }
  }

  /**
   * Send SOS via Bluetooth mesh network
   *
   * @param options - SOS data to send
   * @returns Whether the message was queued for sending
   */
  async sendSOS(options: SendSOSOptions): Promise<boolean> {
    if (!this.running) {
      console.warn('[Bridgefy] Cannot send SOS - mesh not running');
      return false;
    }

    const message: BridgefySOSMessage = {
      type: 'sos',
      version: 1,
      messageId: options.messageId,
      senderId: this.userId,
      payload: {
        lat: options.latitude,
        lng: options.longitude,
        accuracy: options.accuracy,
        severity: this.clampSeverity(options.severity),
        status: this.mapPatientStatus(options.patientStatus),
        timestamp: Date.now(),
        details: options.details?.substring(0, MAX_DETAILS_LENGTH),
        patientName: options.patientName,
        bloodType: options.bloodType,
        medicalConditions: options.medicalConditions?.slice(0, 5),
      },
      ttl: DEFAULT_TTL,
      hops: 0,
      routedVia: [],
      target: 'broadcast',
    };

    try {
      const result = await Bridgefy.send({
        messageId: options.messageId,
        content: JSON.stringify(message),
        target: 'broadcast',
        ttl: DEFAULT_TTL,
      });

      console.log(`[Bridgefy] SOS queued: ${options.messageId}`);
      return result.queued;
    } catch (error) {
      console.error('[Bridgefy] Failed to send SOS:', error);
      return false;
    }
  }

  /**
   * Get current mesh network status
   */
  async getStatus(): Promise<MeshStatus> {
    if (!this.initialized) {
      return {
        isRunning: false,
        isConnected: false,
        nearbyDeviceCount: 0,
        userId: '',
      };
    }

    return Bridgefy.getStatus();
  }

  /**
   * Get count of nearby connected devices
   */
  async getNearbyDeviceCount(): Promise<number> {
    const status = await this.getStatus();
    return status.nearbyDeviceCount;
  }

  /**
   * Check if mesh is connected to at least one device
   */
  async isConnected(): Promise<boolean> {
    const status = await this.getStatus();
    return status.isConnected;
  }

  /**
   * Check if mesh is running
   */
  isRunning(): boolean {
    return this.running;
  }

  /**
   * Check if service is initialized
   */
  isInitialized(): boolean {
    return this.initialized;
  }

  // ─── Event Subscriptions ───────────────────────────────────────

  /**
   * Subscribe to incoming SOS messages
   *
   * @param listener - Callback for SOS messages
   * @returns Unsubscribe function
   */
  onSOSMessage(listener: SOSMessageListener): () => void {
    this.sosListeners.push(listener);
    return () => {
      this.sosListeners = this.sosListeners.filter((l) => l !== listener);
    };
  }

  /**
   * Subscribe to SOS acknowledgments
   *
   * @param listener - Callback for acknowledgments
   * @returns Unsubscribe function
   */
  onAck(listener: AckListener): () => void {
    this.ackListeners.push(listener);
    return () => {
      this.ackListeners = this.ackListeners.filter((l) => l !== listener);
    };
  }

  /**
   * Subscribe to mesh status changes
   *
   * @param listener - Callback for status changes
   * @returns Unsubscribe function
   */
  onStatusChange(listener: StatusListener): () => void {
    this.statusListeners.push(listener);
    return () => {
      this.statusListeners = this.statusListeners.filter((l) => l !== listener);
    };
  }

  // ─── Cleanup ───────────────────────────────────────────────────

  /**
   * Cleanup and destroy the service
   */
  async destroy(): Promise<void> {
    // Remove all plugin listeners
    this.cleanupFunctions.forEach((fn) => fn());
    this.cleanupFunctions = [];

    // Stop the mesh
    await this.stop();

    // Clear state
    this.initialized = false;
    this.sosListeners = [];
    this.ackListeners = [];
    this.statusListeners = [];
    this.processedMessageIds.clear();

    console.log('[Bridgefy] Service destroyed');
  }

  // ─── Private Methods ───────────────────────────────────────────

  private async setupEventListeners(): Promise<void> {
    // Message received listener
    const messageHandle = await Bridgefy.addListener(
      'messageReceived',
      async (received: ReceivedMessage) => {
        await this.handleReceivedMessage(received);
      }
    );
    this.cleanupFunctions.push(() => messageHandle.remove());

    // Status change listener
    const statusHandle = await Bridgefy.addListener('meshStatusChanged', (status: MeshStatus) => {
      this.statusListeners.forEach((l) => l(status));
    });
    this.cleanupFunctions.push(() => statusHandle.remove());

    // Message sent confirmation
    const sentHandle = await Bridgefy.addListener('messageSent', (event) => {
      console.log(`[Bridgefy] Message sent: ${event.messageId}`);
    });
    this.cleanupFunctions.push(() => sentHandle.remove());

    // Message failed
    const failedHandle = await Bridgefy.addListener('messageFailedToSend', (event) => {
      console.error(`[Bridgefy] Message failed: ${event.messageId} - ${event.error}`);
    });
    this.cleanupFunctions.push(() => failedHandle.remove());

    // Device connected
    const connectedHandle = await Bridgefy.addListener('deviceConnected', (device) => {
      console.log(`[Bridgefy] Device connected: ${device.userId || device.deviceId}`);
    });
    this.cleanupFunctions.push(() => connectedHandle.remove());

    // Device disconnected
    const disconnectedHandle = await Bridgefy.addListener('deviceDisconnected', (device) => {
      console.log(`[Bridgefy] Device disconnected: ${device.userId || device.deviceId}`);
    });
    this.cleanupFunctions.push(() => disconnectedHandle.remove());
  }

  private async handleReceivedMessage(received: ReceivedMessage): Promise<void> {
    // Deduplication
    if (this.processedMessageIds.has(received.messageId)) {
      return;
    }
    this.processedMessageIds.add(received.messageId);

    // Limit cache size to prevent memory issues
    this.trimProcessedIds();

    try {
      const message: BridgefyMessage = JSON.parse(received.content);

      switch (message.type) {
        case 'sos':
          await this.handleSOSMessage(message, received.hops);
          break;
        case 'sos_ack':
          this.handleAckMessage(message);
          break;
        case 'status_update':
          // Handle responder status updates
          console.log('[Bridgefy] Received status update:', message);
          break;
        default:
          console.warn('[Bridgefy] Unknown message type:', (message as { type: string }).type);
      }
    } catch (error) {
      console.error('[Bridgefy] Failed to parse message:', error);
    }
  }

  private async handleSOSMessage(sos: BridgefySOSMessage, currentHops: number): Promise<void> {
    console.log(`[Bridgefy] Received SOS: ${sos.messageId} (${currentHops} hops)`);

    // Notify listeners
    this.sosListeners.forEach((l) => l(sos));

    // If we have internet, relay to backend
    if (await isOnline()) {
      await this.relayToBackend(sos, currentHops);
    }

    // If TTL remaining, re-broadcast to extend reach
    if (sos.ttl > 0) {
      await this.relayMessage(sos);
    }
  }

  private async relayToBackend(sos: BridgefySOSMessage, currentHops: number): Promise<void> {
    try {
      // Get auth token from localStorage
      const token = localStorage.getItem('tmt-auth-token');

      const response = await fetch(RELAY_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message_id: sos.messageId,
          patient_id: sos.senderId,
          latitude: sos.payload.lat,
          longitude: sos.payload.lng,
          patient_status: this.mapStatusCodeToString(sos.payload.status),
          severity: sos.payload.severity,
          details: sos.payload.details,
          original_timestamp: Math.floor(sos.payload.timestamp / 1000),
          hop_count: currentHops,
          relay_device_id: this.userId,
        }),
      });

      if (response.ok) {
        const result = await response.json();
        console.log(`[Bridgefy] SOS relayed to backend: ${result.sos_id}`);

        // Send acknowledgment back through mesh
        if (!result.is_duplicate) {
          await this.sendAcknowledgment(sos.messageId, sos.senderId, result.sos_id || '');
        }

        // Also notify backend of successful ack
        await this.notifyBackendAck(sos.messageId, result.sos_id);
      } else {
        console.error(`[Bridgefy] Backend relay failed: ${response.status}`);
      }
    } catch (error) {
      console.error('[Bridgefy] Failed to relay to backend:', error);
    }
  }

  private async notifyBackendAck(messageId: string, sosId?: string): Promise<void> {
    try {
      const token = localStorage.getItem('tmt-auth-token');

      await fetch(ACK_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          message_id: messageId,
          sos_id: sosId,
          delivered_to: 'backend',
          relay_device_id: this.userId,
        }),
      });
    } catch (error) {
      console.error('[Bridgefy] Failed to notify backend ack:', error);
    }
  }

  private mapStatusCodeToString(code: PatientStatusCode): string {
    switch (code) {
      case 'S':
        return 'safe';
      case 'I':
        return 'injured';
      case 'T':
        return 'trapped';
      case 'E':
        return 'evacuate';
      default:
        return 'injured';
    }
  }

  private async relayMessage(sos: BridgefySOSMessage): Promise<void> {
    const relayMessage: BridgefySOSMessage = {
      ...sos,
      ttl: sos.ttl - 1,
      hops: sos.hops + 1,
      routedVia: [...sos.routedVia, this.userId],
    };

    try {
      await Bridgefy.send({
        messageId: `${sos.messageId}-relay-${this.userId}`,
        content: JSON.stringify(relayMessage),
        target: 'broadcast',
        ttl: relayMessage.ttl,
      });
      console.log(`[Bridgefy] Message relayed: ${sos.messageId}`);
    } catch (error) {
      console.error('[Bridgefy] Failed to relay message:', error);
    }
  }

  private async sendAcknowledgment(
    originalMessageId: string,
    targetUserId: string,
    sosId: string
  ): Promise<void> {
    const ack: BridgefyAckMessage = {
      type: 'sos_ack',
      originalMessageId,
      acknowledgedBy: 'backend',
      sosId,
      timestamp: Date.now(),
    };

    try {
      // Broadcast acknowledgment to maximize delivery chance
      await Bridgefy.send({
        messageId: `ack-${originalMessageId}`,
        content: JSON.stringify(ack),
        target: 'broadcast',
      });
      console.log(`[Bridgefy] Acknowledgment sent for: ${originalMessageId}`);
    } catch (error) {
      console.error('[Bridgefy] Failed to send acknowledgment:', error);
    }
  }

  private handleAckMessage(ack: BridgefyAckMessage): void {
    console.log(`[Bridgefy] Received ACK for: ${ack.originalMessageId}`);
    this.ackListeners.forEach((l) => l(ack));
  }

  private mapPatientStatus(status: string): PatientStatusCode {
    switch (status.toLowerCase()) {
      case 'safe':
        return 'S';
      case 'injured':
        return 'I';
      case 'trapped':
        return 'T';
      case 'evacuate':
        return 'E';
      default:
        return 'I'; // Default to injured
    }
  }

  private clampSeverity(severity: number): 1 | 2 | 3 | 4 | 5 {
    const clamped = Math.min(5, Math.max(1, Math.round(severity)));
    return clamped as 1 | 2 | 3 | 4 | 5;
  }

  private trimProcessedIds(): void {
    if (this.processedMessageIds.size > MAX_PROCESSED_IDS) {
      const toRemove = this.processedMessageIds.size - MAX_PROCESSED_IDS + 100;
      const iterator = this.processedMessageIds.values();
      for (let i = 0; i < toRemove; i++) {
        const first = iterator.next();
        if (!first.done) {
          this.processedMessageIds.delete(first.value);
        }
      }
    }
  }
}

// ─── Export Singleton ────────────────────────────────────────────

export const BridgefyService = new BridgefyServiceImpl();
