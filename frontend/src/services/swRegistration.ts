/**
 * Service Worker Registration Service
 *
 * Manages service worker lifecycle:
 * - Registration
 * - Updates
 * - Background sync triggers
 * - Message handling
 *
 * @module services/swRegistration
 */

// ─── Types ───────────────────────────────────────────────────────

export interface SWStatus {
  isSupported: boolean;
  isRegistered: boolean;
  isActive: boolean;
  registration: ServiceWorkerRegistration | null;
  updateAvailable: boolean;
}

export type SWMessageType =
  | 'SOS_SYNCED'
  | 'PROFILE_SYNCED'
  | 'GET_AUTH_TOKEN'
  | 'SKIP_WAITING'
  | 'GET_CACHE_STATUS'
  | 'CLEAR_CACHE';

export interface SWMessage {
  type: SWMessageType;
  [key: string]: unknown;
}

type SWMessageHandler = (message: SWMessage) => void;

// ─── State ───────────────────────────────────────────────────────

let registration: ServiceWorkerRegistration | null = null;
let updateAvailable = false;
const messageHandlers: Set<SWMessageHandler> = new Set();

// ─── Registration ────────────────────────────────────────────────

/**
 * Register the service worker
 */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!isServiceWorkerSupported()) {
    console.log('[SWRegistration] Service workers not supported');
    return null;
  }

  try {
    registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });

    console.log('[SWRegistration] Service worker registered:', registration.scope);

    // Set up update handler
    registration.addEventListener('updatefound', () => {
      const newWorker = registration?.installing;
      if (!newWorker) return;

      newWorker.addEventListener('statechange', () => {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          updateAvailable = true;
          console.log('[SWRegistration] New version available');
          notifyHandlers({ type: 'UPDATE_AVAILABLE' } as unknown as SWMessage);
        }
      });
    });

    // Set up message handler
    navigator.serviceWorker.addEventListener('message', handleMessage);

    return registration;
  } catch (error) {
    console.error('[SWRegistration] Registration failed:', error);
    return null;
  }
}

/**
 * Unregister the service worker
 */
export async function unregisterServiceWorker(): Promise<boolean> {
  if (!registration) {
    return false;
  }

  try {
    const result = await registration.unregister();
    if (result) {
      registration = null;
      console.log('[SWRegistration] Service worker unregistered');
    }
    return result;
  } catch (error) {
    console.error('[SWRegistration] Unregistration failed:', error);
    return false;
  }
}

// ─── Update Management ───────────────────────────────────────────

/**
 * Check for service worker updates
 */
export async function checkForUpdates(): Promise<void> {
  if (!registration) {
    return;
  }

  try {
    await registration.update();
    console.log('[SWRegistration] Checked for updates');
  } catch (error) {
    console.error('[SWRegistration] Update check failed:', error);
  }
}

/**
 * Apply pending update (skip waiting)
 */
export async function applyUpdate(): Promise<void> {
  if (!registration?.waiting) {
    return;
  }

  registration.waiting.postMessage({ type: 'SKIP_WAITING' });
  updateAvailable = false;

  // Reload to activate new version
  window.location.reload();
}

// ─── Background Sync ─────────────────────────────────────────────

/**
 * Request background sync for SOS
 */
export async function requestSOSSync(): Promise<boolean> {
  if (!registration) {
    console.warn('[SWRegistration] No registration for sync');
    return false;
  }

  if (!('sync' in registration)) {
    console.warn('[SWRegistration] Background sync not supported');
    return false;
  }

  try {
    await registration.sync.register('sync-sos');
    console.log('[SWRegistration] SOS sync requested');
    return true;
  } catch (error) {
    console.error('[SWRegistration] SOS sync request failed:', error);
    return false;
  }
}

/**
 * Request background sync for profile updates
 */
export async function requestProfileSync(): Promise<boolean> {
  if (!registration) {
    console.warn('[SWRegistration] No registration for sync');
    return false;
  }

  if (!('sync' in registration)) {
    console.warn('[SWRegistration] Background sync not supported');
    return false;
  }

  try {
    await registration.sync.register('sync-profile');
    console.log('[SWRegistration] Profile sync requested');
    return true;
  } catch (error) {
    console.error('[SWRegistration] Profile sync request failed:', error);
    return false;
  }
}

// ─── Message Handling ────────────────────────────────────────────

/**
 * Handle messages from service worker
 */
function handleMessage(event: MessageEvent): void {
  const message = event.data as SWMessage;
  console.log('[SWRegistration] Message received:', message);

  // Handle token requests from SW
  if (message.type === 'GET_AUTH_TOKEN') {
    const token = localStorage.getItem('tmt-token');
    event.ports[0]?.postMessage({ token });
    return;
  }

  // Notify registered handlers
  notifyHandlers(message);
}

/**
 * Register a message handler
 */
export function onMessage(handler: SWMessageHandler): () => void {
  messageHandlers.add(handler);
  return () => messageHandlers.delete(handler);
}

/**
 * Notify all registered handlers
 */
function notifyHandlers(message: SWMessage): void {
  messageHandlers.forEach((handler) => {
    try {
      handler(message);
    } catch (error) {
      console.error('[SWRegistration] Handler error:', error);
    }
  });
}

/**
 * Send a message to the service worker
 */
export function sendMessage(message: SWMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    if (!navigator.serviceWorker.controller) {
      reject(new Error('No active service worker'));
      return;
    }

    const channel = new MessageChannel();

    channel.port1.onmessage = (event) => {
      resolve(event.data);
    };

    navigator.serviceWorker.controller.postMessage(message, [channel.port2]);

    // Timeout after 5 seconds
    setTimeout(() => reject(new Error('Message timeout')), 5000);
  });
}

// ─── Cache Management ────────────────────────────────────────────

/**
 * Get cache status from service worker
 */
export async function getCacheStatus(): Promise<{ caches: string[]; version: string } | null> {
  try {
    const response = await sendMessage({ type: 'GET_CACHE_STATUS' });
    return response as { caches: string[]; version: string };
  } catch {
    return null;
  }
}

/**
 * Clear all caches
 */
export async function clearCaches(): Promise<boolean> {
  try {
    const response = await sendMessage({ type: 'CLEAR_CACHE' });
    return (response as { cleared: boolean }).cleared;
  } catch {
    return false;
  }
}

// ─── Status ──────────────────────────────────────────────────────

/**
 * Check if service workers are supported
 */
export function isServiceWorkerSupported(): boolean {
  return 'serviceWorker' in navigator;
}

/**
 * Check if background sync is supported
 */
export function isBackgroundSyncSupported(): boolean {
  return 'serviceWorker' in navigator && 'SyncManager' in window;
}

/**
 * Get current service worker status
 */
export function getStatus(): SWStatus {
  return {
    isSupported: isServiceWorkerSupported(),
    isRegistered: registration !== null,
    isActive: navigator.serviceWorker?.controller !== null,
    registration,
    updateAvailable,
  };
}

/**
 * Get the active service worker
 */
export function getActiveWorker(): ServiceWorker | null {
  return navigator.serviceWorker?.controller || null;
}

// ─── Initialization ──────────────────────────────────────────────

/**
 * Initialize service worker on app start
 */
export async function initServiceWorker(): Promise<void> {
  // Only register in production or when explicitly enabled
  const shouldRegister =
    import.meta.env.PROD || import.meta.env.VITE_ENABLE_SW === 'true';

  if (!shouldRegister) {
    console.log('[SWRegistration] Service worker disabled in development');
    return;
  }

  await registerServiceWorker();

  // Check for updates every 30 minutes
  setInterval(
    () => {
      checkForUpdates();
    },
    30 * 60 * 1000
  );
}

// ─── Type Augmentation ───────────────────────────────────────────

// Add sync property to ServiceWorkerRegistration
declare global {
  interface ServiceWorkerRegistration {
    sync: {
      register(tag: string): Promise<void>;
    };
  }

  interface SyncManager {
    register(tag: string): Promise<void>;
    getTags(): Promise<string[]>;
  }

  interface Window {
    SyncManager: typeof SyncManager;
  }
}
