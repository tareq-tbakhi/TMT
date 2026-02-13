/**
 * Custom hook for detecting low battery status
 */

import { useState, useEffect } from "react";
import { SOS_CONFIG } from "../config/sosConfig";

interface BatteryManager extends EventTarget {
  charging: boolean;
  chargingTime: number;
  dischargingTime: number;
  level: number;
}

declare global {
  interface Navigator {
    getBattery?: () => Promise<BatteryManager>;
  }
}

export function useBatteryStatus() {
  const [isLowBattery, setIsLowBattery] = useState(false);
  const [batteryLevel, setBatteryLevel] = useState<number | null>(null);
  const [isCharging, setIsCharging] = useState<boolean | null>(null);

  useEffect(() => {
    if (!navigator.getBattery) {
      // Battery API not supported
      return;
    }

    let battery: BatteryManager | null = null;

    const updateBatteryStatus = () => {
      if (!battery) return;
      setBatteryLevel(battery.level);
      setIsCharging(battery.charging);
      setIsLowBattery(battery.level < SOS_CONFIG.LOW_BATTERY_THRESHOLD);
    };

    navigator.getBattery().then((b) => {
      battery = b;
      updateBatteryStatus();

      battery.addEventListener("levelchange", updateBatteryStatus);
      battery.addEventListener("chargingchange", updateBatteryStatus);
    });

    return () => {
      if (battery) {
        battery.removeEventListener("levelchange", updateBatteryStatus);
        battery.removeEventListener("chargingchange", updateBatteryStatus);
      }
    };
  }, []);

  return {
    isLowBattery,
    batteryLevel,
    isCharging,
    isSupported: !!navigator.getBattery,
  };
}
