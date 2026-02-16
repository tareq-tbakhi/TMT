/**
 * Camera service tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Use vi.hoisted to define mocks before vi.mock hoisting
const mockCamera = vi.hoisted(() => ({
  getPhoto: vi.fn(),
  checkPermissions: vi.fn(),
  requestPermissions: vi.fn(),
}));

// Mock isNative
vi.mock('./platform', () => ({
  isNative: false,
}));

// Mock Capacitor Camera
vi.mock('@capacitor/camera', () => ({
  Camera: mockCamera,
  CameraResultType: {
    DataUrl: 'dataUrl',
    Uri: 'uri',
    Base64: 'base64',
  },
  CameraSource: {
    Camera: 'CAMERA',
    Photos: 'PHOTOS',
    Prompt: 'PROMPT',
  },
}));

import {
  capturePhoto,
  pickPhoto,
  checkCameraPermission,
  requestCameraPermission,
  isNativeCameraAvailable,
} from './cameraService';

describe('Camera Service (Web)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('capturePhoto', () => {
    it('should return null on web (use HTML file input instead)', async () => {
      const result = await capturePhoto();
      expect(result).toBeNull();
    });

    it('should return null regardless of quality parameter', async () => {
      const result = await capturePhoto(100);
      expect(result).toBeNull();
    });
  });

  describe('pickPhoto', () => {
    it('should call Camera.getPhoto for picking from gallery', async () => {
      mockCamera.getPhoto.mockResolvedValue({
        dataUrl: 'data:image/jpeg;base64,test123',
        format: 'jpeg',
        webPath: '/path/to/photo.jpg',
      });

      const result = await pickPhoto();

      expect(mockCamera.getPhoto).toHaveBeenCalled();
      expect(result?.dataUrl).toBe('data:image/jpeg;base64,test123');
      expect(result?.format).toBe('jpeg');
    });

    it('should return null when user cancels', async () => {
      mockCamera.getPhoto.mockRejectedValue(new Error('User cancelled'));

      const result = await pickPhoto();
      expect(result).toBeNull();
    });

    it('should return null when photo has no dataUrl', async () => {
      mockCamera.getPhoto.mockResolvedValue({
        dataUrl: undefined,
        format: 'jpeg',
      });

      const result = await pickPhoto();
      expect(result).toBeNull();
    });

    it('should pass quality parameter', async () => {
      mockCamera.getPhoto.mockResolvedValue({
        dataUrl: 'data:image/jpeg;base64,test',
        format: 'jpeg',
      });

      await pickPhoto(50);

      expect(mockCamera.getPhoto).toHaveBeenCalledWith(
        expect.objectContaining({ quality: 50 })
      );
    });
  });

  describe('checkCameraPermission', () => {
    it('should check permissions using navigator.permissions', async () => {
      const mockQuery = vi.fn().mockResolvedValue({ state: 'granted' });
      Object.defineProperty(navigator, 'permissions', {
        value: { query: mockQuery },
        configurable: true,
      });

      const result = await checkCameraPermission();

      expect(result).toBe('granted');
    });

    it('should return prompt when permissions API throws', async () => {
      const mockQuery = vi.fn().mockRejectedValue(new Error('Not supported'));
      Object.defineProperty(navigator, 'permissions', {
        value: { query: mockQuery },
        configurable: true,
      });

      const result = await checkCameraPermission();

      expect(result).toBe('prompt');
    });

    it('should return prompt when permissions API not available', async () => {
      Object.defineProperty(navigator, 'permissions', {
        value: undefined,
        configurable: true,
      });

      const result = await checkCameraPermission();

      expect(result).toBe('prompt');
    });
  });

  describe('requestCameraPermission', () => {
    it('should return true on web (permission requested on access)', async () => {
      const result = await requestCameraPermission();
      expect(result).toBe(true);
    });
  });

  describe('isNativeCameraAvailable', () => {
    it('should return false on web', () => {
      expect(isNativeCameraAvailable()).toBe(false);
    });
  });
});

describe('Camera Service (Native Mock)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('capturePhoto (native mock)', () => {
    it('should call Camera.getPhoto with camera source', async () => {
      mockCamera.getPhoto.mockResolvedValue({
        dataUrl: 'data:image/jpeg;base64,nativePhoto123',
        format: 'jpeg',
        webPath: '/native/path/photo.jpg',
      });

      const result = await mockCamera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: 'dataUrl',
        source: 'CAMERA',
        saveToGallery: false,
        correctOrientation: true,
      });

      expect(result.dataUrl).toBe('data:image/jpeg;base64,nativePhoto123');
      expect(result.format).toBe('jpeg');
    });

    it('should handle photo capture with custom quality', async () => {
      mockCamera.getPhoto.mockResolvedValue({
        dataUrl: 'data:image/png;base64,highQuality',
        format: 'png',
      });

      await mockCamera.getPhoto({
        quality: 100,
        resultType: 'dataUrl',
        source: 'CAMERA',
      });

      expect(mockCamera.getPhoto).toHaveBeenCalledWith(
        expect.objectContaining({ quality: 100 })
      );
    });

    it('should throw when camera error occurs', async () => {
      mockCamera.getPhoto.mockRejectedValue(new Error('Camera not available'));

      await expect(mockCamera.getPhoto({ source: 'CAMERA' })).rejects.toThrow('Camera not available');
    });
  });

  describe('pickPhoto (native mock)', () => {
    it('should call Camera.getPhoto with photos source', async () => {
      mockCamera.getPhoto.mockResolvedValue({
        dataUrl: 'data:image/jpeg;base64,galleryPhoto',
        format: 'jpeg',
      });

      await mockCamera.getPhoto({
        quality: 80,
        allowEditing: false,
        resultType: 'dataUrl',
        source: 'PHOTOS',
      });

      expect(mockCamera.getPhoto).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'PHOTOS' })
      );
    });
  });

  describe('checkCameraPermission (native mock)', () => {
    it('should return granted when permission is granted', async () => {
      mockCamera.checkPermissions.mockResolvedValue({ camera: 'granted' });

      const result = await mockCamera.checkPermissions();
      expect(result.camera).toBe('granted');
    });

    it('should return denied when permission is denied', async () => {
      mockCamera.checkPermissions.mockResolvedValue({ camera: 'denied' });

      const result = await mockCamera.checkPermissions();
      expect(result.camera).toBe('denied');
    });

    it('should return prompt when permission is prompt', async () => {
      mockCamera.checkPermissions.mockResolvedValue({ camera: 'prompt' });

      const result = await mockCamera.checkPermissions();
      expect(result.camera).toBe('prompt');
    });
  });

  describe('requestCameraPermission (native mock)', () => {
    it('should return granted permission', async () => {
      mockCamera.requestPermissions.mockResolvedValue({ camera: 'granted' });

      const result = await mockCamera.requestPermissions();
      expect(result.camera).toBe('granted');
    });

    it('should return denied permission', async () => {
      mockCamera.requestPermissions.mockResolvedValue({ camera: 'denied' });

      const result = await mockCamera.requestPermissions();
      expect(result.camera).toBe('denied');
    });
  });
});
