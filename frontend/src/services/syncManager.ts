/**
 * Sync Manager
 *
 * Handles batch upload of offline events when connectivity is restored.
 * Uses exponential backoff with jitter for reliability.
 *
 * Stores events in the encrypted OfflineVault and uploads them in
 * batches of up to 50 to POST /api/v1/sync/batch.
 */

import { OfflineVault } from "./offlineVault";

// ─── Types ───────────────────────────────────────────────────────

export interface SyncEvent {
  event_id: string;
  type: "sos_create" | "sos_update" | "patient_update";
  data: Record<string, unknown>;
  device_time: string; // ISO timestamp
}

interface EventResult {
  event_id: string;
  status: "created" | "duplicate" | "error" | "updated";
  detail?: string;
  sos_id?: string;
}

interface BatchSyncResponse {
  results: EventResult[];
  total: number;
  created: number;
  duplicates: number;
  errors: number;
}

// ─── Constants ───────────────────────────────────────────────────

const BATCH_SIZE = 50;
const MAX_BACKOFF_MS = 60_000; // 60 seconds max
const BASE_DELAY_MS = 1_000; // 1 second initial

// ─── Backoff helper ──────────────────────────────────────────────

function backoffDelay(attempt: number): number {
  const exponential = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_BACKOFF_MS);
  // Add jitter: 50-100% of exponential delay
  const jitter = exponential * (0.5 + Math.random() * 0.5);
  return Math.round(jitter);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── API helper ──────────────────────────────────────────────────

function getAuthToken(): string {
  return localStorage.getItem("auth_token") || "";
}

function getApiBase(): string {
  return import.meta.env.VITE_API_URL || "";
}

async function sendBatch(events: SyncEvent[]): Promise<BatchSyncResponse> {
  const token = getAuthToken();
  const response = await fetch(`${getApiBase()}/api/v1/sync/batch`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify({ events }),
  });

  if (!response.ok) {
    throw new Error(`Sync failed: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

// ─── Service ─────────────────────────────────────────────────────

class SyncManagerImpl {
  private syncing = false;
  private initialized = false;

  /**
   * Initialize the sync manager.
   * Listens for online events to trigger sync.
   */
  initialize(): void {
    if (this.initialized) return;

    if (typeof window !== "undefined") {
      window.addEventListener("online", () => {
        console.log("[SyncManager] Online — starting sync");
        this.syncAll();
      });
    }

    this.initialized = true;
    console.log("[SyncManager] Initialized");
  }

  /**
   * Queue an event for later sync.
   */
  async queueEvent(event: SyncEvent): Promise<void> {
    await OfflineVault.put("pending_sync", event.event_id, event);
    console.log(`[SyncManager] Queued event: ${event.type} (${event.event_id})`);
  }

  /**
   * Queue an SOS creation event.
   */
  async queueSOSCreate(data: Record<string, unknown>): Promise<string> {
    const eventId = crypto.randomUUID();
    await this.queueEvent({
      event_id: eventId,
      type: "sos_create",
      data,
      device_time: new Date().toISOString(),
    });
    return eventId;
  }

  /**
   * Queue an SOS update event.
   */
  async queueSOSUpdate(sosId: string, data: Record<string, unknown>): Promise<string> {
    const eventId = crypto.randomUUID();
    await this.queueEvent({
      event_id: eventId,
      type: "sos_update",
      data: { sos_id: sosId, ...data },
      device_time: new Date().toISOString(),
    });
    return eventId;
  }

  /**
   * Queue a patient profile update.
   */
  async queuePatientUpdate(patientId: string, data: Record<string, unknown>): Promise<string> {
    const eventId = crypto.randomUUID();
    await this.queueEvent({
      event_id: eventId,
      type: "patient_update",
      data: { patient_id: patientId, ...data },
      device_time: new Date().toISOString(),
    });
    return eventId;
  }

  /**
   * Upload all pending sync events to the backend.
   * Uses exponential backoff on failure.
   */
  async syncAll(): Promise<{ succeeded: number; failed: number }> {
    if (this.syncing) {
      console.log("[SyncManager] Already syncing, skipping");
      return { succeeded: 0, failed: 0 };
    }

    this.syncing = true;
    let totalSucceeded = 0;
    let totalFailed = 0;

    try {
      const allEvents = await OfflineVault.getAll<SyncEvent>("pending_sync");

      if (allEvents.length === 0) {
        console.log("[SyncManager] No pending events to sync");
        return { succeeded: 0, failed: 0 };
      }

      console.log(`[SyncManager] Syncing ${allEvents.length} events`);

      // Process in batches
      for (let i = 0; i < allEvents.length; i += BATCH_SIZE) {
        const batch = allEvents.slice(i, i + BATCH_SIZE);
        const events: SyncEvent[] = batch.map((e) => ({
          event_id: e.event_id,
          type: e.type,
          data: e.data,
          device_time: e.device_time,
        }));

        let attempt = 0;
        let success = false;

        while (!success && attempt < 5) {
          try {
            const result = await sendBatch(events);

            // Remove successfully synced events from vault
            for (const eventResult of result.results) {
              if (eventResult.status === "created" || eventResult.status === "updated" || eventResult.status === "duplicate") {
                await OfflineVault.delete("pending_sync", eventResult.event_id);
                totalSucceeded++;
              } else {
                totalFailed++;
              }
            }

            success = true;
          } catch (error) {
            attempt++;
            if (attempt >= 5) {
              console.error(`[SyncManager] Batch failed after ${attempt} attempts:`, error);
              totalFailed += batch.length;
            } else {
              const delay = backoffDelay(attempt);
              console.warn(`[SyncManager] Batch attempt ${attempt} failed, retrying in ${delay}ms`);
              await sleep(delay);
            }
          }
        }
      }

      console.log(`[SyncManager] Sync complete: ${totalSucceeded} succeeded, ${totalFailed} failed`);
    } finally {
      this.syncing = false;
    }

    return { succeeded: totalSucceeded, failed: totalFailed };
  }

  /**
   * Get count of pending sync events.
   */
  async getPendingCount(): Promise<number> {
    return OfflineVault.count("pending_sync");
  }

  /**
   * Check if sync is in progress.
   */
  isSyncing(): boolean {
    return this.syncing;
  }
}

// ─── Export Singleton ────────────────────────────────────────────

export const SyncManager = new SyncManagerImpl();
