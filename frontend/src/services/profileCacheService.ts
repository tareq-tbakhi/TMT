/**
 * Profile Cache Service
 *
 * Manages caching of patient profile data for offline access.
 * Implements SOLID principles:
 * - SRP: Only handles profile caching
 * - OCP: Extensible TTL configuration
 * - LSP: Implements ICacheService interface
 * - ISP: Segregated read/write/sync interfaces
 * - DIP: Depends on abstract offlineDB interface
 *
 * @module services/profileCacheService
 */

import type { Patient, MedicalRecord } from './api';
import {
  type CachedProfile,
  type CachedMedicalRecord,
  type CachedEmergencyContact,
  type SyncQueueItem,
  type SyncOperation,
  type ICacheService,
  CACHE_TTL,
  DB_STORES,
} from '../types/cache';
import {
  getItem,
  getAllItems,
  getItemsByIndex,
  putItem,
  putItems,
  deleteItem,
  clearStore,
  addToSyncQueue,
  getSyncQueue,
  removeFromSyncQueue,
  deleteExpiredItems,
} from './offlineDB';

// ─── Profile Cache Service ───────────────────────────────────────

class ProfileCacheServiceImpl implements ICacheService<CachedProfile> {
  // ─── Read Operations ─────────────────────────────────────────

  /**
   * Get a cached profile by ID
   */
  async get(id: string): Promise<CachedProfile | null> {
    const profile = await getItem<CachedProfile>(DB_STORES.PROFILES, id);
    if (profile && this.isItemExpired(profile)) {
      // Mark as stale but still return it
      profile.syncStatus = 'stale';
    }
    return profile;
  }

  /**
   * Get all cached profiles
   */
  async getAll(): Promise<CachedProfile[]> {
    return getAllItems<CachedProfile>(DB_STORES.PROFILES);
  }

  /**
   * Check if a profile exists in cache
   */
  async exists(id: string): Promise<boolean> {
    const profile = await getItem<CachedProfile>(DB_STORES.PROFILES, id);
    return profile !== null;
  }

  // ─── Write Operations ────────────────────────────────────────

  /**
   * Cache a profile
   */
  async set(profile: CachedProfile): Promise<void> {
    await putItem(DB_STORES.PROFILES, profile);
  }

  /**
   * Cache multiple profiles
   */
  async setMany(profiles: CachedProfile[]): Promise<void> {
    await putItems(DB_STORES.PROFILES, profiles);
  }

  /**
   * Remove a profile from cache
   */
  async remove(id: string): Promise<void> {
    await deleteItem(DB_STORES.PROFILES, id);
  }

  /**
   * Clear all cached profiles
   */
  async clear(): Promise<void> {
    await clearStore(DB_STORES.PROFILES);
  }

  // ─── Sync Operations ─────────────────────────────────────────

  /**
   * Mark a profile for sync
   */
  async markForSync(id: string, operation: SyncOperation): Promise<void> {
    const profile = await this.get(id);
    if (profile) {
      profile.syncStatus = 'pending';
      await this.set(profile);
    }

    const syncItem: SyncQueueItem = {
      id: `profile-${id}-${Date.now()}`,
      entityType: 'profile',
      entityId: id,
      operation,
      createdAt: Date.now(),
      retryCount: 0,
    };

    await addToSyncQueue(syncItem);
  }

  /**
   * Get all pending syncs for profiles
   */
  async getPendingSyncs(): Promise<SyncQueueItem[]> {
    const allSyncs = await getSyncQueue();
    return allSyncs.filter((item) => item.entityType === 'profile');
  }

  /**
   * Clear a synced item from the queue
   */
  async clearSyncedItem(id: string): Promise<void> {
    await removeFromSyncQueue(id);
  }

  /**
   * Check if a profile cache is expired
   */
  async isExpired(id: string): Promise<boolean> {
    const profile = await getItem<CachedProfile>(DB_STORES.PROFILES, id);
    if (!profile) return true;
    return this.isItemExpired(profile);
  }

  /**
   * Invalidate a cached profile
   */
  async invalidate(id: string): Promise<void> {
    const profile = await this.get(id);
    if (profile) {
      profile.syncStatus = 'stale';
      profile.expiresAt = Date.now(); // Expire immediately
      await this.set(profile);
    }
  }

  // ─── Helper Methods ──────────────────────────────────────────

  /**
   * Check if a cached item is expired
   */
  private isItemExpired(item: { expiresAt: number }): boolean {
    return Date.now() > item.expiresAt;
  }

  /**
   * Cache a patient profile with metadata
   */
  async cacheProfile(patient: Patient): Promise<void> {
    const now = Date.now();
    const cachedProfile: CachedProfile = {
      ...patient,
      _type: 'profile',
      cachedAt: now,
      expiresAt: now + CACHE_TTL.profile,
      version: now, // Use timestamp as version
      syncStatus: 'synced',
    };

    await this.set(cachedProfile);
    console.log(`[ProfileCache] Cached profile: ${patient.id}`);
  }

  /**
   * Get a fresh profile or return cached if offline
   */
  async getOrFetch(
    id: string,
    fetchFn: () => Promise<Patient>
  ): Promise<{ profile: Patient; fromCache: boolean }> {
    // Try to fetch fresh data
    try {
      const profile = await fetchFn();
      await this.cacheProfile(profile);
      return { profile, fromCache: false };
    } catch (error) {
      // Network failed, try cache
      const cached = await this.get(id);
      if (cached) {
        console.log(`[ProfileCache] Serving from cache: ${id}`);
        return { profile: cached, fromCache: true };
      }
      throw error;
    }
  }

  /**
   * Clean up expired profiles
   */
  async cleanupExpired(): Promise<number> {
    return deleteExpiredItems(DB_STORES.PROFILES);
  }
}

// ─── Medical Records Cache Service ───────────────────────────────

class MedicalRecordsCacheServiceImpl {
  /**
   * Cache medical records for a patient
   */
  async cacheRecords(patientId: string, records: MedicalRecord[]): Promise<void> {
    const now = Date.now();
    const cachedRecords: CachedMedicalRecord[] = records.map((record) => ({
      ...record,
      _type: 'medical_record' as const,
      patientId,
      cachedAt: now,
      expiresAt: now + CACHE_TTL.medicalRecords,
      version: now,
      syncStatus: 'synced' as const,
    }));

    await putItems(DB_STORES.MEDICAL_RECORDS, cachedRecords);
    console.log(`[ProfileCache] Cached ${records.length} medical records for: ${patientId}`);
  }

  /**
   * Get cached medical records for a patient
   */
  async getRecords(patientId: string): Promise<CachedMedicalRecord[]> {
    return getItemsByIndex<CachedMedicalRecord>(
      DB_STORES.MEDICAL_RECORDS,
      'patientId',
      patientId
    );
  }

  /**
   * Get records or fetch from API
   */
  async getOrFetch(
    patientId: string,
    fetchFn: () => Promise<MedicalRecord[]>
  ): Promise<{ records: MedicalRecord[]; fromCache: boolean }> {
    try {
      const records = await fetchFn();
      await this.cacheRecords(patientId, records);
      return { records, fromCache: false };
    } catch (error) {
      const cached = await this.getRecords(patientId);
      if (cached.length > 0) {
        console.log(`[ProfileCache] Serving records from cache: ${patientId}`);
        return { records: cached, fromCache: true };
      }
      throw error;
    }
  }

  /**
   * Clear cached records for a patient
   */
  async clearRecords(patientId: string): Promise<void> {
    const records = await this.getRecords(patientId);
    for (const record of records) {
      await deleteItem(DB_STORES.MEDICAL_RECORDS, record.id);
    }
  }
}

// ─── Emergency Contacts Cache Service ────────────────────────────

class EmergencyContactsCacheServiceImpl {
  /**
   * Cache emergency contacts for a patient
   */
  async cacheContacts(
    patientId: string,
    contacts: Array<{ name: string; phone: string; relationship?: string }>
  ): Promise<void> {
    const now = Date.now();
    const cachedContacts: CachedEmergencyContact[] = contacts.map((contact, index) => ({
      ...contact,
      _type: 'emergency_contact' as const,
      id: `${patientId}-contact-${index}`,
      patientId,
      cachedAt: now,
      expiresAt: now + CACHE_TTL.emergencyContacts,
      version: now,
      syncStatus: 'synced' as const,
    }));

    // Clear existing contacts first
    await this.clearContacts(patientId);
    await putItems(DB_STORES.EMERGENCY_CONTACTS, cachedContacts);
    console.log(`[ProfileCache] Cached ${contacts.length} emergency contacts for: ${patientId}`);
  }

  /**
   * Get cached emergency contacts for a patient
   */
  async getContacts(patientId: string): Promise<CachedEmergencyContact[]> {
    return getItemsByIndex<CachedEmergencyContact>(
      DB_STORES.EMERGENCY_CONTACTS,
      'patientId',
      patientId
    );
  }

  /**
   * Clear cached contacts for a patient
   */
  async clearContacts(patientId: string): Promise<void> {
    const contacts = await this.getContacts(patientId);
    for (const contact of contacts) {
      await deleteItem(DB_STORES.EMERGENCY_CONTACTS, contact.id);
    }
  }

  /**
   * Add a contact locally (optimistic update)
   */
  async addContact(
    patientId: string,
    contact: { name: string; phone: string; relationship?: string }
  ): Promise<CachedEmergencyContact> {
    const now = Date.now();
    const cachedContact: CachedEmergencyContact = {
      ...contact,
      _type: 'emergency_contact',
      id: `${patientId}-contact-${now}`,
      patientId,
      cachedAt: now,
      expiresAt: now + CACHE_TTL.emergencyContacts,
      version: now,
      syncStatus: 'pending', // Needs to be synced
    };

    await putItem(DB_STORES.EMERGENCY_CONTACTS, cachedContact);
    return cachedContact;
  }

  /**
   * Remove a contact locally
   */
  async removeContact(contactId: string): Promise<void> {
    await deleteItem(DB_STORES.EMERGENCY_CONTACTS, contactId);
  }
}

// ─── Export Singleton Instances ──────────────────────────────────

export const ProfileCacheService = new ProfileCacheServiceImpl();
export const MedicalRecordsCacheService = new MedicalRecordsCacheServiceImpl();
export const EmergencyContactsCacheService = new EmergencyContactsCacheServiceImpl();

// ─── Utility Functions ───────────────────────────────────────────

/**
 * Cache all profile-related data for a patient
 */
export async function cacheFullProfile(
  patient: Patient,
  medicalRecords?: MedicalRecord[]
): Promise<void> {
  await ProfileCacheService.cacheProfile(patient);

  if (medicalRecords) {
    await MedicalRecordsCacheService.cacheRecords(patient.id, medicalRecords);
  }

  if (patient.emergency_contacts) {
    await EmergencyContactsCacheService.cacheContacts(
      patient.id,
      patient.emergency_contacts
    );
  }
}

/**
 * Get cached profile age in human-readable format
 */
export function getCacheAge(cachedAt: number): string {
  const ageMs = Date.now() - cachedAt;
  const seconds = Math.floor(ageMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (days > 0) return `${days}d ago`;
  if (hours > 0) return `${hours}h ago`;
  if (minutes > 0) return `${minutes}m ago`;
  return 'Just now';
}
