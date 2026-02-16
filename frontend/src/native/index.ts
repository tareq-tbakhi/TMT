/**
 * Native services - unified API for native and web functionality
 *
 * This module provides a consistent interface for native device features
 * that works on both native (iOS/Android) and web platforms.
 */

// Platform detection
export * from './platform';

// Device information
export * from './deviceService';

// Network status
export * from './networkService';

// Geolocation
export * from './geolocationService';

// Camera
export * from './cameraService';

// Haptic feedback
export * from './hapticService';

// Storage (secure preferences)
export * from './storageService';

// Push notifications
export * from './pushService';

// Local notifications
export * from './localNotificationService';
