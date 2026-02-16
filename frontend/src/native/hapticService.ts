/**
 * Haptic feedback service - provides tactile feedback on native platforms
 */

import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { isNative } from './platform';

/**
 * Light impact feedback - subtle tap
 */
export async function impactLight(): Promise<void> {
  if (!isNative) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Light });
  } catch {
    // Haptics not available
  }
}

/**
 * Medium impact feedback - standard tap
 */
export async function impactMedium(): Promise<void> {
  if (!isNative) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Medium });
  } catch {
    // Haptics not available
  }
}

/**
 * Heavy impact feedback - strong tap
 */
export async function impactHeavy(): Promise<void> {
  if (!isNative) return;
  try {
    await Haptics.impact({ style: ImpactStyle.Heavy });
  } catch {
    // Haptics not available
  }
}

/**
 * Success notification feedback
 */
export async function notificationSuccess(): Promise<void> {
  if (!isNative) return;
  try {
    await Haptics.notification({ type: NotificationType.Success });
  } catch {
    // Haptics not available
  }
}

/**
 * Warning notification feedback
 */
export async function notificationWarning(): Promise<void> {
  if (!isNative) return;
  try {
    await Haptics.notification({ type: NotificationType.Warning });
  } catch {
    // Haptics not available
  }
}

/**
 * Error notification feedback
 */
export async function notificationError(): Promise<void> {
  if (!isNative) return;
  try {
    await Haptics.notification({ type: NotificationType.Error });
  } catch {
    // Haptics not available
  }
}

/**
 * Simple vibration
 */
export async function vibrate(duration = 200): Promise<void> {
  if (!isNative) {
    // Web fallback
    if ('vibrate' in navigator) {
      navigator.vibrate(duration);
    }
    return;
  }

  try {
    await Haptics.vibrate({ duration });
  } catch {
    // Haptics not available
  }
}

/**
 * Selection changed feedback - very light tap
 */
export async function selectionChanged(): Promise<void> {
  if (!isNative) return;
  try {
    await Haptics.selectionChanged();
  } catch {
    // Haptics not available
  }
}
