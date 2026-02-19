/**
 * Bridgefy Web Implementation (Fallback/Mock)
 *
 * Provides a web-compatible implementation for development and testing.
 * Real Bluetooth mesh is only available on native platforms.
 */

import { WebPlugin } from '@capacitor/core';
import type {
  BridgefyPlugin,
  InitializeOptions,
  InitializeResult,
  StartOptions,
  SendOptions,
  SendResult,
  MeshStatus,
  NearbyDevicesResult,
  BluetoothStatus,
  PermissionStatus,
} from './definitions';

export class BridgefyWeb extends WebPlugin implements BridgefyPlugin {
  private initialized = false;
  private running = false;
  private userId = '';
  private mockDevices: Array<{ deviceId: string; userId: string; lastSeen: number }> = [];

  async initialize(options: InitializeOptions): Promise<InitializeResult> {
    console.warn('Bridgefy: Running in web mode (mock). Real mesh networking requires native app.');

    if (!options.apiKey || !options.userId) {
      throw new Error('Missing apiKey or userId');
    }

    this.userId = options.userId;
    this.initialized = true;

    return {
      success: true,
      userId: options.userId,
      sdkVersion: 'web-mock-1.0.0',
    };
  }

  async start(_options?: StartOptions): Promise<void> {
    if (!this.initialized) {
      throw new Error('Bridgefy not initialized');
    }

    this.running = true;

    // Simulate finding nearby devices after a delay
    setTimeout(() => {
      this.mockDevices = [
        { deviceId: 'mock-device-1', userId: 'mock-user-1', lastSeen: Date.now() },
        { deviceId: 'mock-device-2', userId: 'mock-user-2', lastSeen: Date.now() },
      ];

      this.notifyListeners('meshStatusChanged', {
        isRunning: true,
        isConnected: true,
        nearbyDeviceCount: this.mockDevices.length,
        userId: this.userId,
      });

      this.mockDevices.forEach((device) => {
        this.notifyListeners('deviceConnected', device);
      });
    }, 1000);

    this.notifyListeners('meshStatusChanged', {
      isRunning: true,
      isConnected: false,
      nearbyDeviceCount: 0,
      userId: this.userId,
    });
  }

  async stop(): Promise<void> {
    this.running = false;
    this.mockDevices = [];

    this.notifyListeners('meshStatusChanged', {
      isRunning: false,
      isConnected: false,
      nearbyDeviceCount: 0,
      userId: this.userId,
    });
  }

  async send(options: SendOptions): Promise<SendResult> {
    if (!this.running) {
      throw new Error('Bridgefy not running');
    }

    console.log('Bridgefy (web mock): Simulating send', options);

    // Simulate message sent after delay
    setTimeout(() => {
      this.notifyListeners('messageSent', {
        messageId: options.messageId,
      });

      // If we have "mock devices", simulate a relay and acknowledgment
      if (this.mockDevices.length > 0) {
        setTimeout(() => {
          // Simulate receiving an acknowledgment
          const content = JSON.parse(options.content);
          if (content.type === 'sos') {
            this.notifyListeners('messageReceived', {
              messageId: `ack-${options.messageId}`,
              senderId: 'mock-relay-node',
              content: JSON.stringify({
                type: 'sos_ack',
                originalMessageId: options.messageId,
                acknowledgedBy: 'backend',
                sosId: `mock-sos-${Date.now()}`,
                timestamp: Date.now(),
              }),
              receivedAt: Date.now(),
              hops: 2,
            });
          }
        }, 2000);
      }
    }, 500);

    return {
      messageId: options.messageId,
      queued: true,
    };
  }

  async getStatus(): Promise<MeshStatus> {
    return {
      isRunning: this.running,
      isConnected: this.mockDevices.length > 0,
      nearbyDeviceCount: this.mockDevices.length,
      userId: this.userId,
    };
  }

  async getNearbyDevices(): Promise<NearbyDevicesResult> {
    return {
      count: this.mockDevices.length,
      devices: this.mockDevices.map((d) => ({
        ...d,
        rssi: -50 - Math.floor(Math.random() * 30),
      })),
    };
  }

  async isBluetoothAvailable(): Promise<BluetoothStatus> {
    // Web Bluetooth API availability check
    const available = 'bluetooth' in navigator;
    return {
      available,
      enabled: available, // Can't reliably check if enabled on web
    };
  }

  async requestPermissions(): Promise<PermissionStatus> {
    // Web doesn't need explicit permissions for our mock
    return {
      bluetooth: 'granted',
      location: 'granted',
    };
  }
}
