/**
 * Device information service - abstracts native and web device APIs
 */

import { Device, type DeviceInfo as CapacitorDeviceInfo, type BatteryInfo } from '@capacitor/device';
import { isNative } from './platform';

export interface DeviceInfo {
  platform: string;
  model: string;
  osVersion: string;
  isVirtual: boolean;
  batteryLevel: number;
  isCharging: boolean;
}

/**
 * Get comprehensive device information
 */
export async function getDeviceInfo(): Promise<DeviceInfo> {
  if (!isNative) {
    // Web fallback
    let batteryLevel = 100;
    let isCharging = true;

    // Try to get battery info from Web Battery API
    if ('getBattery' in navigator) {
      try {
        const battery = await (navigator as Navigator & { getBattery: () => Promise<{level: number; charging: boolean}> }).getBattery();
        batteryLevel = Math.round(battery.level * 100);
        isCharging = battery.charging;
      } catch {
        // Battery API not available or failed
      }
    }

    return {
      platform: 'web',
      model: navigator.userAgent,
      osVersion: navigator.platform,
      isVirtual: false,
      batteryLevel,
      isCharging
    };
  }

  // Native implementation
  const [info, battery] = await Promise.all([
    Device.getInfo(),
    Device.getBatteryInfo()
  ]);

  return {
    platform: info.platform,
    model: info.model,
    osVersion: info.osVersion,
    isVirtual: info.isVirtual,
    batteryLevel: Math.round((battery.batteryLevel ?? 1) * 100),
    isCharging: battery.isCharging ?? false
  };
}

/**
 * Get device unique identifier
 */
export async function getDeviceId(): Promise<string> {
  if (!isNative) {
    // Use a persistent ID from localStorage for web
    let id = localStorage.getItem('tmt-device-id');
    if (!id) {
      id = crypto.randomUUID();
      localStorage.setItem('tmt-device-id', id);
    }
    return id;
  }

  const { identifier } = await Device.getId();
  return identifier;
}

/**
 * Get battery information only
 */
export async function getBatteryInfo(): Promise<{ level: number; isCharging: boolean }> {
  if (!isNative) {
    if ('getBattery' in navigator) {
      try {
        const battery = await (navigator as Navigator & { getBattery: () => Promise<{level: number; charging: boolean}> }).getBattery();
        return {
          level: Math.round(battery.level * 100),
          isCharging: battery.charging
        };
      } catch {
        return { level: 100, isCharging: true };
      }
    }
    return { level: 100, isCharging: true };
  }

  const battery = await Device.getBatteryInfo();
  return {
    level: Math.round((battery.batteryLevel ?? 1) * 100),
    isCharging: battery.isCharging ?? false
  };
}
