/**
 * Cache Types for TMT Offline Support
 *
 * Type definitions for the offline caching system following SOLID principles.
 *
 * @module types/cache
 */

import type { Patient, MedicalRecord, Hospital } from '../services/api';

// ─── Cache Metadata ──────────────────────────────────────────────

/** Cache entry metadata */
export interface CacheMetadata {
  /** Timestamp when cached */
  cachedAt: number;
  /** Timestamp when cache expires */
  expiresAt: number;
  /** Version number for conflict resolution */
  version: number;
  /** Sync status */
  syncStatus: CacheSyncStatus;
}

/** Possible sync states for cached items */
export type CacheSyncStatus = 'synced' | 'pending' | 'conflict' | 'stale';

// ─── Cached Entity Types ─────────────────────────────────────────

/** Cached patient profile with metadata */
export interface CachedProfile extends Patient, CacheMetadata {
  _type: 'profile';
}

/** Cached medical record with metadata */
export interface CachedMedicalRecord extends MedicalRecord, CacheMetadata {
  _type: 'medical_record';
  patientId: string;
}

/** Cached emergency contact */
export interface CachedEmergencyContact extends CacheMetadata {
  _type: 'emergency_contact';
  id: string;
  patientId: string;
  name: string;
  phone: string;
  relationship?: string;
}

/** Cached hospital with metadata */
export interface CachedHospital extends Hospital, CacheMetadata {
  _type: 'hospital';
}

// ─── Sync Queue Types ────────────────────────────────────────────

/** Operations that can be queued for sync */
export type SyncOperation = 'create' | 'update' | 'delete';

/** Entity types that can be synced */
export type SyncEntityType = 'profile' | 'medical_record' | 'emergency_contact' | 'sos';

/** Item in the sync queue */
export interface SyncQueueItem {
  id: string;
  /** Type of entity being synced */
  entityType: SyncEntityType;
  /** ID of the entity being synced */
  entityId: string;
  /** Operation to perform */
  operation: SyncOperation;
  /** Data to sync (for create/update) */
  data?: Record<string, unknown>;
  /** When the item was queued */
  createdAt: number;
  /** Number of retry attempts */
  retryCount: number;
  /** Last error message if any */
  lastError?: string;
  /** Last attempt timestamp */
  lastAttemptAt?: number;
}

// ─── Pending SOS Type ────────────────────────────────────────────

/** Pending SOS in the offline queue */
export interface PendingSOS {
  messageId: string;
  patientId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  patientStatus: string;
  severity: number;
  details?: string;
  patientName?: string;
  bloodType?: string;
  medicalConditions?: string[];
  triageData?: Record<string, unknown>;
  triage_transcript?: Array<{ role: string; content: string; timestamp: string }>;
  createdAt: number;
  retryCount: number;
  lastAttemptAt?: number;
  lastError?: string;
}

// ─── Cache Service Interfaces (SOLID - ISP) ──────────────────────

/**
 * Read-only cache operations
 * Interface Segregation: Clients only depend on what they need
 */
export interface IReadableCache<T> {
  get(id: string): Promise<T | null>;
  getAll(): Promise<T[]>;
  exists(id: string): Promise<boolean>;
}

/**
 * Write cache operations
 * Interface Segregation: Clients only depend on what they need
 */
export interface IWritableCache<T> {
  set(item: T): Promise<void>;
  setMany(items: T[]): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
}

/**
 * Sync-related cache operations
 * Interface Segregation: Clients only depend on what they need
 */
export interface ISyncableCache {
  markForSync(id: string, operation: SyncOperation): Promise<void>;
  getPendingSyncs(): Promise<SyncQueueItem[]>;
  clearSyncedItem(id: string): Promise<void>;
  isExpired(id: string): Promise<boolean>;
}

/**
 * Full cache service interface
 * Combines read, write, and sync operations
 */
export interface ICacheService<T> extends IReadableCache<T>, IWritableCache<T>, ISyncableCache {
  invalidate(id: string): Promise<void>;
}

// ─── Cache Configuration ─────────────────────────────────────────

/** Cache TTL configuration in milliseconds */
export const CACHE_TTL = {
  /** Profile data: 24 hours */
  profile: 24 * 60 * 60 * 1000,
  /** Medical records: 7 days (rarely changes) */
  medicalRecords: 7 * 24 * 60 * 60 * 1000,
  /** Emergency contacts: 24 hours */
  emergencyContacts: 24 * 60 * 60 * 1000,
  /** Hospital list: 12 hours */
  hospitals: 12 * 60 * 60 * 1000,
  /** Alerts: 5 minutes (frequently updated) */
  alerts: 5 * 60 * 1000,
} as const;

/** IndexedDB store names */
export const DB_STORES = {
  PENDING_SOS: 'pending_sos',
  PROFILES: 'profiles',
  MEDICAL_RECORDS: 'medical_records',
  EMERGENCY_CONTACTS: 'emergency_contacts',
  HOSPITALS: 'hospitals',
  SYNC_QUEUE: 'sync_queue',
} as const;

/** IndexedDB database configuration */
export const DB_CONFIG = {
  name: 'tmt-offline-db',
  version: 2,
} as const;
