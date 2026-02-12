/**
 * GPS location codec for compact SMS encoding.
 * Truncates coordinates to 3 decimal places (~111m precision)
 * which is sufficient for emergency response locating.
 */

/**
 * Encodes latitude and longitude into a compact string.
 * Format: "lat,lon" with 3 decimal places.
 * Example: "31.520,34.440"
 */
export function encodeLocation(latitude: number, longitude: number): string {
  const lat = latitude.toFixed(3);
  const lon = longitude.toFixed(3);
  return `${lat},${lon}`;
}

/**
 * Decodes a compact location string back to lat/lon.
 * Returns { latitude, longitude } or null if invalid.
 */
export function decodeLocation(
  encoded: string
): { latitude: number; longitude: number } | null {
  const parts = encoded.split(",");
  if (parts.length !== 2) return null;

  const latitude = parseFloat(parts[0]);
  const longitude = parseFloat(parts[1]);

  if (isNaN(latitude) || isNaN(longitude)) return null;
  if (latitude < -90 || latitude > 90) return null;
  if (longitude < -180 || longitude > 180) return null;

  return { latitude, longitude };
}

/**
 * Gets the current device position via the Geolocation API.
 * Returns a promise that resolves to { latitude, longitude }.
 */
export function getCurrentPosition(): Promise<{
  latitude: number;
  longitude: number;
}> {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error("Geolocation is not supported by this browser"));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
        });
      },
      (error) => {
        reject(error);
      },
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 30000,
      }
    );
  });
}
