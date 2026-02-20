/**
 * SOS Dispatcher Service
 *
 * Unified SOS dispatch with automatic fallback through multiple layers:
 * 1. Internet (HTTP API)
 * 2. SMS (Cellular)
 * 3. Bluetooth Mesh (Bridgefy)
 *
 * @module services/sosDispatcher
 */

import { createSOS } from './api';
import { buildSMSBody, sendViaSMS } from './smsService';
import { BridgefyService } from '../native/bridgefyService';
import { ConnectionManager, type ConnectionLayer } from './connectionManager';
import type { BridgefyAckMessage } from '../plugins/bridgefy';
import {
  addPendingSOS,
  getPendingSOS,
  removePendingSOS,
  clearPendingSOS,
  updatePendingSOSRetry,
} from './offlineDB';
import { requestSOSSync } from './swRegistration';
import type { PendingSOS } from '../types/cache';

// ─── Types ───────────────────────────────────────────────────────

export interface SOSPayload {
  patientId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  patientStatus: string;
  severity: number;
  details?: string;
  patientName?: string;
  bloodType?: string;
  medicalConditions?: string[];
  triageData?: Record<string, unknown>;
  triage_transcript?: Array<{ role: string; content: string; timestamp: string }>;
}

export interface SOSDispatchResult {
  /** Whether the SOS was successfully sent */
  success: boolean;
  /** The layer that was used for delivery */
  layer: ConnectionLayer;
  /** Unique message identifier */
  messageId: string;
  /** Backend SOS ID (if delivered via Internet) */
  sosId?: string;
  /** Layers that were attempted before success */
  fallbacksAttempted: ConnectionLayer[];
  /** Error message if failed */
  error?: string;
  /** Whether we're waiting for acknowledgment */
  acknowledgmentPending?: boolean;
}

interface PendingAck {
  resolve: (result: SOSDispatchResult) => void;
  timeout: ReturnType<typeof setTimeout>;
  fallbacksAttempted: ConnectionLayer[];
}

// ─── Constants ───────────────────────────────────────────────────

const TMT_SMS_NUMBER = import.meta.env.VITE_TMT_SMS_NUMBER || '+970599000000';
const INTERNET_TIMEOUT = 10000; // 10 seconds
const MESH_ACK_TIMEOUT = 60000; // 1 minute for mesh delivery

// ─── Service Class ───────────────────────────────────────────────

class SOSDispatcherImpl {
  private pendingAcks = new Map<string, PendingAck>();
  private initialized = false;

  /**
   * Initialize the dispatcher
   */
  initialize(): void {
    if (this.initialized) {
      return;
    }

    // Listen for mesh acknowledgments
    BridgefyService.onAck((ack: BridgefyAckMessage) => {
      this.handleAcknowledgment(ack);
    });

    // Set up online listener for retry
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => {
        this.retryPending();
      });
    }

    this.initialized = true;
    console.log('[SOSDispatcher] Initialized');
  }

  /**
   * Dispatch SOS through the best available channel with automatic fallback
   *
   * @param payload - SOS data to send
   * @returns Dispatch result
   */
  async dispatch(payload: SOSPayload): Promise<SOSDispatchResult> {
    const messageId = crypto.randomUUID();
    const fallbacksAttempted: ConnectionLayer[] = [];

    console.log(`[SOSDispatcher] Dispatching SOS: ${messageId}`);

    // Get fallback chain based on current connectivity
    const fallbackChain = ConnectionManager.getFallbackChain();

    // If no connectivity at all, store and try Bluetooth anyway
    if (fallbackChain.length === 0) {
      console.log('[SOSDispatcher] No connectivity - storing and trying Bluetooth');
      return this.handleNoConnectivity(payload, messageId);
    }

    // Try each layer in order
    for (const layer of fallbackChain) {
      fallbacksAttempted.push(layer);

      try {
        console.log(`[SOSDispatcher] Trying layer: ${layer}`);
        const result = await this.sendViaLayer(layer, payload, messageId, fallbacksAttempted);

        if (result.success) {
          console.log(`[SOSDispatcher] Success via ${layer}`);
          // Clear any stored pending SOS since we succeeded
          await clearPendingSOS();
          return result;
        }
      } catch (error) {
        console.warn(`[SOSDispatcher] ${layer} failed:`, error);
        // Continue to next fallback
      }
    }

    // All layers failed - store for later retry
    console.log('[SOSDispatcher] All layers failed - storing for retry');
    const pendingPayload: PendingSOS = {
      ...payload,
      messageId,
      createdAt: Date.now(),
      retryCount: 0,
    };
    await addPendingSOS(pendingPayload);

    // Request background sync
    await requestSOSSync();

    return {
      success: false,
      layer: 'none',
      messageId,
      fallbacksAttempted,
      error: 'All communication channels unavailable. SOS queued for retry when connection available.',
    };
  }

  /**
   * Retry any pending SOS messages
   *
   * @returns Number of successfully sent messages
   */
  async retryPending(): Promise<number> {
    const pending = await getPendingSOS();

    if (pending.length === 0) {
      return 0;
    }

    console.log(`[SOSDispatcher] Retrying ${pending.length} pending SOS`);

    let succeeded = 0;
    for (const sos of pending) {
      try {
        const result = await this.dispatch(sos);
        if (result.success) {
          await removePendingSOS(sos.messageId);
          succeeded++;
        } else {
          await updatePendingSOSRetry(sos.messageId, result.error);
        }
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';
        await updatePendingSOSRetry(sos.messageId, errorMessage);
      }
    }

    console.log(`[SOSDispatcher] Retry complete: ${succeeded}/${pending.length} succeeded`);
    return succeeded;
  }

  /**
   * Get count of pending SOS messages
   */
  async getPendingCount(): Promise<number> {
    const pending = await getPendingSOS();
    return pending.length;
  }

  // ─── Private Methods ───────────────────────────────────────────

  private async sendViaLayer(
    layer: ConnectionLayer,
    payload: SOSPayload,
    messageId: string,
    fallbacksAttempted: ConnectionLayer[]
  ): Promise<SOSDispatchResult> {
    switch (layer) {
      case 'internet':
        return this.sendViaInternet(payload, messageId, fallbacksAttempted);
      case 'sms':
        return this.sendViaSMSLayer(payload, messageId, fallbacksAttempted);
      case 'bluetooth':
        return this.sendViaBluetooth(payload, messageId, fallbacksAttempted);
      default:
        return {
          success: false,
          layer: 'none',
          messageId,
          fallbacksAttempted,
          error: 'Unknown layer',
        };
    }
  }

  private async sendViaInternet(
    payload: SOSPayload,
    messageId: string,
    fallbacksAttempted: ConnectionLayer[]
  ): Promise<SOSDispatchResult> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), INTERNET_TIMEOUT);

    try {
      const result = await createSOS({
        latitude: payload.latitude,
        longitude: payload.longitude,
        patient_status: payload.patientStatus,
        severity: payload.severity,
        details: payload.details,
        triage_transcript: payload.triage_transcript,
      });

      clearTimeout(timeout);

      return {
        success: true,
        layer: 'internet',
        messageId,
        sosId: result.id,
        fallbacksAttempted,
      };
    } catch (error) {
      clearTimeout(timeout);
      throw error;
    }
  }

  private async sendViaSMSLayer(
    payload: SOSPayload,
    messageId: string,
    fallbacksAttempted: ConnectionLayer[]
  ): Promise<SOSDispatchResult> {
    const smsBody = await buildSMSBody(
      payload.patientId,
      payload.latitude,
      payload.longitude,
      payload.patientStatus,
      String(payload.severity)
    );

    const sent = await sendViaSMS(smsBody, TMT_SMS_NUMBER);

    if (sent) {
      return {
        success: true,
        layer: 'sms',
        messageId,
        fallbacksAttempted,
        // SMS doesn't give immediate confirmation
        acknowledgmentPending: true,
      };
    }

    throw new Error('Failed to send SMS');
  }

  private async sendViaBluetooth(
    payload: SOSPayload,
    messageId: string,
    fallbacksAttempted: ConnectionLayer[]
  ): Promise<SOSDispatchResult> {
    const sent = await BridgefyService.sendSOS({
      messageId,
      latitude: payload.latitude,
      longitude: payload.longitude,
      accuracy: payload.accuracy || 10,
      severity: payload.severity,
      patientStatus: payload.patientStatus,
      details: payload.details,
      patientName: payload.patientName,
      bloodType: payload.bloodType,
      medicalConditions: payload.medicalConditions,
    });

    if (!sent) {
      throw new Error('Failed to send via Bluetooth mesh');
    }

    // Wait for acknowledgment with timeout
    return new Promise((resolve) => {
      const timeout = setTimeout(() => {
        this.pendingAcks.delete(messageId);
        // Even without ack, message was broadcast
        resolve({
          success: true,
          layer: 'bluetooth',
          messageId,
          fallbacksAttempted,
          acknowledgmentPending: true,
        });
      }, MESH_ACK_TIMEOUT);

      this.pendingAcks.set(messageId, { resolve, timeout, fallbacksAttempted });
    });
  }

  private async handleNoConnectivity(
    payload: SOSPayload,
    messageId: string
  ): Promise<SOSDispatchResult> {
    // Store for later retry
    const pendingPayload: PendingSOS = {
      ...payload,
      messageId,
      createdAt: Date.now(),
      retryCount: 0,
    };
    await addPendingSOS(pendingPayload);

    // Request background sync
    await requestSOSSync();

    // Try Bluetooth even without confirmed connectivity
    // (there might be nearby devices)
    if (BridgefyService.isRunning()) {
      try {
        const btResult = await this.sendViaBluetooth(payload, messageId, ['bluetooth']);
        return btResult;
      } catch {
        // Bluetooth also failed
      }
    }

    return {
      success: false,
      layer: 'none',
      messageId,
      fallbacksAttempted: ['bluetooth'],
      error: 'No connectivity. SOS stored for retry when connection available.',
    };
  }

  private handleAcknowledgment(ack: BridgefyAckMessage): void {
    const pending = this.pendingAcks.get(ack.originalMessageId);
    if (!pending) {
      return;
    }

    console.log(`[SOSDispatcher] Received ACK for: ${ack.originalMessageId}`);

    clearTimeout(pending.timeout);
    pending.resolve({
      success: true,
      layer: 'bluetooth',
      messageId: ack.originalMessageId,
      sosId: ack.sosId,
      fallbacksAttempted: pending.fallbacksAttempted,
      acknowledgmentPending: false,
    });

    this.pendingAcks.delete(ack.originalMessageId);
  }
}

// ─── Export Singleton ────────────────────────────────────────────

export const SOSDispatcher = new SOSDispatcherImpl();
