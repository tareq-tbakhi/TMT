/**
 * Bridgefy Capacitor Plugin - Main Entry Point
 *
 * Registers the Bridgefy plugin with Capacitor and exports types.
 */

import { registerPlugin } from '@capacitor/core';
import type { BridgefyPlugin } from './definitions';

/**
 * Bridgefy plugin instance
 *
 * On native platforms (iOS/Android), this uses the native implementation.
 * On web, this uses the web fallback (mock/stub for testing).
 */
const Bridgefy = registerPlugin<BridgefyPlugin>('Bridgefy', {
  web: () => import('./web').then((m) => new m.BridgefyWeb()),
});

export * from './definitions';
export { Bridgefy };
