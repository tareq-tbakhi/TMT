/**
 * Bridgefy Capacitor Plugin - Type Definitions
 *
 * Defines the interface for the native Bridgefy SDK wrapper.
 * Used for Bluetooth mesh networking in offline SOS scenarios.
 */

import type { PluginListenerHandle } from '@capacitor/core';

// ─── Plugin Interface ─────────────────────────────────────────────

export interface BridgefyPlugin {
  /**
   * Initialize the Bridgefy SDK with API credentials
   */
  initialize(options: InitializeOptions): Promise<InitializeResult>;

  /**
   * Start the Bridgefy mesh network
   */
  start(options?: StartOptions): Promise<void>;

  /**
   * Stop the Bridgefy mesh network
   */
  stop(): Promise<void>;

  /**
   * Send a message via mesh network
   */
  send(options: SendOptions): Promise<SendResult>;

  /**
   * Get current mesh network status
   */
  getStatus(): Promise<MeshStatus>;

  /**
   * Get count and info of nearby devices
   */
  getNearbyDevices(): Promise<NearbyDevicesResult>;

  /**
   * Check if Bluetooth is available and enabled
   */
  isBluetoothAvailable(): Promise<BluetoothStatus>;

  /**
   * Request Bluetooth and location permissions
   */
  requestPermissions(): Promise<PermissionStatus>;

  // ─── Event Listeners ────────────────────────────────────────────

  /**
   * Listen for incoming messages
   */
  addListener(
    eventName: 'messageReceived',
    callback: (message: ReceivedMessage) => void
  ): Promise<PluginListenerHandle>;

  /**
   * Listen for message sent confirmations
   */
  addListener(
    eventName: 'messageSent',
    callback: (result: MessageSentEvent) => void
  ): Promise<PluginListenerHandle>;

  /**
   * Listen for message send failures
   */
  addListener(
    eventName: 'messageFailedToSend',
    callback: (error: MessageFailedEvent) => void
  ): Promise<PluginListenerHandle>;

  /**
   * Listen for device connections
   */
  addListener(
    eventName: 'deviceConnected',
    callback: (device: DeviceInfo) => void
  ): Promise<PluginListenerHandle>;

  /**
   * Listen for device disconnections
   */
  addListener(
    eventName: 'deviceDisconnected',
    callback: (device: DeviceInfo) => void
  ): Promise<PluginListenerHandle>;

  /**
   * Listen for mesh status changes
   */
  addListener(
    eventName: 'meshStatusChanged',
    callback: (status: MeshStatus) => void
  ): Promise<PluginListenerHandle>;

  /**
   * Listen for Bluetooth state changes
   */
  addListener(
    eventName: 'bluetoothStateChanged',
    callback: (state: BluetoothStatus) => void
  ): Promise<PluginListenerHandle>;

  /**
   * Remove all event listeners
   */
  removeAllListeners(): Promise<void>;
}

// ─── Options Types ────────────────────────────────────────────────

export interface InitializeOptions {
  /** Bridgefy API key from developer portal */
  apiKey: string;
  /** Unique user identifier for this device */
  userId: string;
  /** Message propagation profile */
  propagationProfile?: PropagationProfile;
}

export type PropagationProfile = 'standard' | 'long_reach' | 'short_reach';

export interface StartOptions {
  /** Automatically connect to nearby devices */
  autoConnect?: boolean;
  /** Bluetooth transmit power level */
  transmitPower?: TransmitPower;
}

export type TransmitPower = 'low' | 'medium' | 'high';

export interface SendOptions {
  /** Unique message identifier (UUID) */
  messageId: string;
  /** JSON-encoded message content */
  content: string;
  /** Target type: broadcast to all or direct to specific user */
  target: MessageTarget;
  /** Target user ID for direct messages */
  targetUserId?: string;
  /** Time-to-live in hops (default: 15) */
  ttl?: number;
}

export type MessageTarget = 'broadcast' | 'direct';

// ─── Result Types ─────────────────────────────────────────────────

export interface InitializeResult {
  /** Whether initialization succeeded */
  success: boolean;
  /** The user ID registered with the SDK */
  userId: string;
  /** Bridgefy SDK version */
  sdkVersion: string;
}

export interface SendResult {
  /** The message ID */
  messageId: string;
  /** Whether the message was queued for sending */
  queued: boolean;
}

export interface MeshStatus {
  /** Whether the mesh network is running */
  isRunning: boolean;
  /** Whether connected to at least one device */
  isConnected: boolean;
  /** Number of nearby connected devices */
  nearbyDeviceCount: number;
  /** Current user ID */
  userId: string;
}

export interface NearbyDevicesResult {
  /** Number of nearby devices */
  count: number;
  /** List of device information */
  devices: DeviceInfo[];
}

export interface BluetoothStatus {
  /** Whether Bluetooth hardware is available */
  available: boolean;
  /** Whether Bluetooth is currently enabled */
  enabled: boolean;
}

export interface PermissionStatus {
  /** Bluetooth permission state */
  bluetooth: PermissionState;
  /** Location permission state (required for BLE scanning) */
  location: PermissionState;
}

export type PermissionState = 'granted' | 'denied' | 'prompt';

// ─── Event Types ──────────────────────────────────────────────────

export interface ReceivedMessage {
  /** Unique message identifier */
  messageId: string;
  /** Sender's user ID */
  senderId: string;
  /** JSON-encoded message content */
  content: string;
  /** Timestamp when message was received (ms) */
  receivedAt: number;
  /** Number of hops the message traveled */
  hops: number;
}

export interface MessageSentEvent {
  /** The message ID that was sent */
  messageId: string;
  /** User ID of the recipient (for direct messages) */
  deliveredTo?: string;
}

export interface MessageFailedEvent {
  /** The message ID that failed */
  messageId: string;
  /** Error description */
  error: string;
}

export interface DeviceInfo {
  /** Unique device identifier */
  deviceId: string;
  /** User ID associated with the device */
  userId?: string;
  /** Signal strength (RSSI) */
  rssi?: number;
  /** Last seen timestamp (ms) */
  lastSeen: number;
}

// ─── Message Types for TMT SOS ────────────────────────────────────

export interface BridgefySOSMessage {
  type: 'sos';
  version: 1;
  messageId: string;
  senderId: string;
  payload: BridgefySOSPayload;
  ttl: number;
  hops: number;
  routedVia: string[];
  target: 'broadcast';
}

export interface BridgefySOSPayload {
  lat: number;
  lng: number;
  accuracy: number;
  severity: 1 | 2 | 3 | 4 | 5;
  status: PatientStatusCode;
  timestamp: number;
  details?: string;
  patientName?: string;
  bloodType?: string;
  medicalConditions?: string[];
}

export type PatientStatusCode = 'S' | 'I' | 'T' | 'E'; // Safe, Injured, Trapped, Evacuate

export interface BridgefyAckMessage {
  type: 'sos_ack';
  originalMessageId: string;
  acknowledgedBy: 'backend' | 'responder';
  sosId?: string;
  responderId?: string;
  eta?: number;
  timestamp: number;
}

export interface BridgefyStatusUpdate {
  type: 'status_update';
  sosId: string;
  newStatus: 'dispatched' | 'en_route' | 'on_scene' | 'resolved';
  responderType: 'ambulance' | 'police' | 'civil_defense' | 'firefighter';
  timestamp: number;
}

export type BridgefyMessage = BridgefySOSMessage | BridgefyAckMessage | BridgefyStatusUpdate;
