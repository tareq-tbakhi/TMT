/**
 * Geolocation service - abstracts native and web location APIs
 */

import { Geolocation, type Position } from '@capacitor/geolocation';
import { isNative } from './platform';

export interface GeoPosition {
  latitude: number;
  longitude: number;
  accuracy: number;
  altitude?: number;
  altitudeAccuracy?: number;
  heading?: number;
  speed?: number;
  timestamp: number;
}

/**
 * Get current position
 */
export async function getCurrentPosition(highAccuracy = true): Promise<GeoPosition> {
  if (!isNative) {
    // Web fallback
    return new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve({
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          accuracy: pos.coords.accuracy,
          altitude: pos.coords.altitude ?? undefined,
          altitudeAccuracy: pos.coords.altitudeAccuracy ?? undefined,
          heading: pos.coords.heading ?? undefined,
          speed: pos.coords.speed ?? undefined,
          timestamp: pos.timestamp
        }),
        (error) => reject(new Error(error.message)),
        { enableHighAccuracy: highAccuracy, timeout: 10000, maximumAge: 0 }
      );
    });
  }

  const position = await Geolocation.getCurrentPosition({
    enableHighAccuracy: highAccuracy,
    timeout: 10000
  });

  return {
    latitude: position.coords.latitude,
    longitude: position.coords.longitude,
    accuracy: position.coords.accuracy,
    altitude: position.coords.altitude ?? undefined,
    altitudeAccuracy: position.coords.altitudeAccuracy ?? undefined,
    heading: position.coords.heading ?? undefined,
    speed: position.coords.speed ?? undefined,
    timestamp: position.timestamp
  };
}

/**
 * Watch position changes
 * Returns a cleanup function to stop watching
 */
export function watchPosition(
  callback: (position: GeoPosition) => void,
  errorCallback?: (error: Error) => void,
  highAccuracy = true
): () => void {
  if (!isNative) {
    const watchId = navigator.geolocation.watchPosition(
      (pos) => callback({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
        altitude: pos.coords.altitude ?? undefined,
        altitudeAccuracy: pos.coords.altitudeAccuracy ?? undefined,
        heading: pos.coords.heading ?? undefined,
        speed: pos.coords.speed ?? undefined,
        timestamp: pos.timestamp
      }),
      (error) => errorCallback?.(new Error(error.message)),
      { enableHighAccuracy: highAccuracy }
    );

    return () => navigator.geolocation.clearWatch(watchId);
  }

  // Native watcher
  let watchId: string | undefined;

  Geolocation.watchPosition(
    { enableHighAccuracy: highAccuracy },
    (position, err) => {
      if (err) {
        errorCallback?.(new Error(err.message));
        return;
      }
      if (position) {
        callback({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          accuracy: position.coords.accuracy,
          altitude: position.coords.altitude ?? undefined,
          altitudeAccuracy: position.coords.altitudeAccuracy ?? undefined,
          heading: position.coords.heading ?? undefined,
          speed: position.coords.speed ?? undefined,
          timestamp: position.timestamp
        });
      }
    }
  ).then(id => { watchId = id; });

  return () => {
    if (watchId) {
      Geolocation.clearWatch({ id: watchId });
    }
  };
}

/**
 * Check location permission
 */
export async function checkLocationPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (!isNative) {
    // Web permissions API
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'geolocation' });
        return result.state;
      } catch {
        return 'prompt';
      }
    }
    return 'prompt';
  }

  const permission = await Geolocation.checkPermissions();
  return permission.location as 'granted' | 'denied' | 'prompt';
}

/**
 * Request location permission
 */
export async function requestLocationPermission(): Promise<boolean> {
  if (!isNative) {
    // On web, we request by trying to get position
    try {
      await getCurrentPosition();
      return true;
    } catch {
      return false;
    }
  }

  const permission = await Geolocation.requestPermissions();
  return permission.location === 'granted';
}
