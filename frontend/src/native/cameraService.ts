/**
 * Camera service - abstracts native and web camera APIs
 */

import { Camera, CameraResultType, CameraSource, type Photo } from '@capacitor/camera';
import { isNative } from './platform';

export interface CapturedPhoto {
  dataUrl: string;
  format: string;
  webPath?: string;
}

/**
 * Capture a photo using the camera
 * Returns null if cancelled or failed
 */
export async function capturePhoto(quality = 80): Promise<CapturedPhoto | null> {
  if (!isNative) {
    // Web fallback - return null to signal using HTML file input
    return null;
  }

  try {
    const photo = await Camera.getPhoto({
      quality,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Camera,
      saveToGallery: false,
      correctOrientation: true
    });

    if (!photo.dataUrl) {
      return null;
    }

    return {
      dataUrl: photo.dataUrl,
      format: photo.format,
      webPath: photo.webPath
    };
  } catch (error) {
    // User cancelled or camera error
    console.warn('Camera capture failed:', error);
    return null;
  }
}

/**
 * Pick a photo from the gallery
 */
export async function pickPhoto(quality = 80): Promise<CapturedPhoto | null> {
  try {
    const photo = await Camera.getPhoto({
      quality,
      allowEditing: false,
      resultType: CameraResultType.DataUrl,
      source: CameraSource.Photos
    });

    if (!photo.dataUrl) {
      return null;
    }

    return {
      dataUrl: photo.dataUrl,
      format: photo.format,
      webPath: photo.webPath
    };
  } catch (error) {
    console.warn('Photo pick failed:', error);
    return null;
  }
}

/**
 * Check camera permission
 */
export async function checkCameraPermission(): Promise<'granted' | 'denied' | 'prompt'> {
  if (!isNative) {
    // Web permissions API
    if ('permissions' in navigator) {
      try {
        const result = await navigator.permissions.query({ name: 'camera' as PermissionName });
        return result.state;
      } catch {
        return 'prompt';
      }
    }
    return 'prompt';
  }

  const permission = await Camera.checkPermissions();
  return permission.camera as 'granted' | 'denied' | 'prompt';
}

/**
 * Request camera permission
 */
export async function requestCameraPermission(): Promise<boolean> {
  if (!isNative) {
    // On web, permission is requested when accessing camera
    return true;
  }

  const permission = await Camera.requestPermissions();
  return permission.camera === 'granted';
}

/**
 * Check if native camera is available
 */
export function isNativeCameraAvailable(): boolean {
  return isNative;
}
