/**
 * Platform detection utilities for Capacitor native apps
 */

import { Capacitor } from '@capacitor/core';

/** Whether running in a native app (iOS or Android) */
export const isNative = Capacitor.isNativePlatform();

/** Whether running on iOS */
export const isIOS = Capacitor.getPlatform() === 'ios';

/** Whether running on Android */
export const isAndroid = Capacitor.getPlatform() === 'android';

/** Whether running in web browser */
export const isWeb = Capacitor.getPlatform() === 'web';

/** Get the current platform name */
export type PlatformName = 'ios' | 'android' | 'web';

export function getPlatformName(): PlatformName {
  return Capacitor.getPlatform() as PlatformName;
}

/** Check if a native plugin is available */
export function isPluginAvailable(name: string): boolean {
  return Capacitor.isPluginAvailable(name);
}
