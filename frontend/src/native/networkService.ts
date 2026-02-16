/**
 * Network status service - abstracts native and web network APIs
 */

import { Network, type ConnectionStatus } from '@capacitor/network';
import { isNative } from './platform';

export type NetworkType = 'wifi' | 'cellular' | 'none' | 'unknown';

export interface NetworkState {
  connected: boolean;
  connectionType: NetworkType;
}

/**
 * Get current network status
 */
export async function getNetworkStatus(): Promise<NetworkState> {
  if (!isNative) {
    return {
      connected: navigator.onLine,
      connectionType: navigator.onLine ? 'wifi' : 'none'
    };
  }

  const status = await Network.getStatus();
  return {
    connected: status.connected,
    connectionType: status.connectionType as NetworkType
  };
}

/**
 * Add a listener for network status changes
 * Returns a cleanup function to remove the listener
 */
export function addNetworkListener(
  callback: (status: NetworkState) => void
): () => void {
  if (!isNative) {
    const handleOnline = () => callback({ connected: true, connectionType: 'wifi' });
    const handleOffline = () => callback({ connected: false, connectionType: 'none' });

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }

  // Native listener
  let listenerHandle: { remove: () => Promise<void> } | null = null;

  Network.addListener('networkStatusChange', (status) => {
    callback({
      connected: status.connected,
      connectionType: status.connectionType as NetworkType
    });
  }).then(handle => {
    listenerHandle = handle;
  });

  return () => {
    listenerHandle?.remove();
  };
}

/**
 * Check if device is online
 */
export async function isOnline(): Promise<boolean> {
  const status = await getNetworkStatus();
  return status.connected;
}

/**
 * Check if device is on cellular network (for data usage warnings)
 */
export async function isOnCellular(): Promise<boolean> {
  if (!isNative) {
    return false; // Can't detect on web
  }

  const status = await Network.getStatus();
  return status.connectionType === 'cellular';
}
