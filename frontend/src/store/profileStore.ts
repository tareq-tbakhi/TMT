/**
 * Profile Store with Offline Support
 *
 * Zustand store for managing patient profile state with:
 * - Offline-first data loading
 * - Optimistic updates
 * - Background sync
 * - Conflict resolution
 *
 * @module store/profileStore
 */

import { create } from 'zustand';
import type { Patient, MedicalRecord } from '../services/api';
import { getPatient, updatePatient, getPatientRecords } from '../services/api';
import {
  ProfileCacheService,
  MedicalRecordsCacheService,
  EmergencyContactsCacheService,
  cacheFullProfile,
  getCacheAge,
} from '../services/profileCacheService';
import type { CacheSyncStatus } from '../types/cache';

// ─── Types ───────────────────────────────────────────────────────

export interface EmergencyContact {
  id?: string;
  name: string;
  phone: string;
  relationship?: string;
}

export interface ProfileState {
  // Data
  profile: Patient | null;
  medicalRecords: MedicalRecord[];
  emergencyContacts: EmergencyContact[];

  // Status
  isLoading: boolean;
  isOffline: boolean;
  isSyncing: boolean;
  lastSyncedAt: number | null;
  syncStatus: CacheSyncStatus;
  cacheAge: string | null;
  error: string | null;

  // Flags
  fromCache: boolean;
}

export interface ProfileActions {
  // Load operations
  loadProfile: (patientId: string) => Promise<void>;
  loadMedicalRecords: (patientId: string) => Promise<void>;
  refreshProfile: () => Promise<void>;

  // Update operations
  updateProfile: (updates: Partial<Patient>) => Promise<void>;
  addEmergencyContact: (contact: EmergencyContact) => Promise<void>;
  removeEmergencyContact: (contactId: string) => Promise<void>;

  // Sync operations
  syncWithServer: () => Promise<void>;
  loadFromCache: (patientId: string) => Promise<boolean>;
  saveToCache: () => Promise<void>;

  // Utility
  clearProfile: () => void;
  setOffline: (isOffline: boolean) => void;
}

type ProfileStore = ProfileState & ProfileActions;

// ─── Initial State ───────────────────────────────────────────────

const initialState: ProfileState = {
  profile: null,
  medicalRecords: [],
  emergencyContacts: [],
  isLoading: false,
  isOffline: !navigator.onLine,
  isSyncing: false,
  lastSyncedAt: null,
  syncStatus: 'synced',
  cacheAge: null,
  error: null,
  fromCache: false,
};

// ─── Store Implementation ────────────────────────────────────────

export const useProfileStore = create<ProfileStore>((set, get) => ({
  ...initialState,

  // ─── Load Profile ────────────────────────────────────────────

  loadProfile: async (patientId: string) => {
    set({ isLoading: true, error: null });

    try {
      // Try offline-first approach
      const result = await ProfileCacheService.getOrFetch(
        patientId,
        () => getPatient(patientId)
      );

      const cachedProfile = await ProfileCacheService.get(patientId);

      set({
        profile: result.profile,
        emergencyContacts: result.profile.emergency_contacts || [],
        isLoading: false,
        fromCache: result.fromCache,
        lastSyncedAt: result.fromCache ? null : Date.now(),
        cacheAge: cachedProfile ? getCacheAge(cachedProfile.cachedAt) : null,
        syncStatus: result.fromCache ? 'stale' : 'synced',
      });

      // Load medical records in background
      get().loadMedicalRecords(patientId);
    } catch (error) {
      console.error('[ProfileStore] Failed to load profile:', error);

      // Try cache as last resort
      const cached = await ProfileCacheService.get(patientId);
      if (cached) {
        set({
          profile: cached,
          emergencyContacts: cached.emergency_contacts || [],
          isLoading: false,
          fromCache: true,
          cacheAge: getCacheAge(cached.cachedAt),
          syncStatus: 'stale',
          error: 'Showing cached data - unable to connect to server',
        });
      } else {
        set({
          isLoading: false,
          error: error instanceof Error ? error.message : 'Failed to load profile',
        });
      }
    }
  },

  // ─── Load Medical Records ────────────────────────────────────

  loadMedicalRecords: async (patientId: string) => {
    try {
      const result = await MedicalRecordsCacheService.getOrFetch(
        patientId,
        () => getPatientRecords(patientId)
      );

      set({ medicalRecords: result.records });
    } catch (error) {
      console.error('[ProfileStore] Failed to load medical records:', error);
      // Non-critical, just log
    }
  },

  // ─── Refresh Profile ─────────────────────────────────────────

  refreshProfile: async () => {
    const { profile } = get();
    if (!profile) return;

    set({ isSyncing: true, error: null });

    try {
      const freshProfile = await getPatient(profile.id);
      await cacheFullProfile(freshProfile);

      const records = await getPatientRecords(profile.id);
      await MedicalRecordsCacheService.cacheRecords(profile.id, records);

      set({
        profile: freshProfile,
        medicalRecords: records,
        emergencyContacts: freshProfile.emergency_contacts || [],
        isSyncing: false,
        fromCache: false,
        lastSyncedAt: Date.now(),
        syncStatus: 'synced',
        cacheAge: 'Just now',
      });
    } catch (error) {
      console.error('[ProfileStore] Failed to refresh:', error);
      set({
        isSyncing: false,
        error: 'Failed to refresh profile',
      });
    }
  },

  // ─── Update Profile ──────────────────────────────────────────

  updateProfile: async (updates: Partial<Patient>) => {
    const { profile, isOffline } = get();
    if (!profile) return;

    // Optimistic update
    const updatedProfile = { ...profile, ...updates };
    set({
      profile: updatedProfile,
      syncStatus: 'pending',
    });

    // Cache the optimistic update
    await ProfileCacheService.cacheProfile(updatedProfile);

    if (isOffline) {
      // Queue for sync when online
      await ProfileCacheService.markForSync(profile.id, 'update');
      console.log('[ProfileStore] Profile update queued for sync');
      return;
    }

    try {
      const serverProfile = await updatePatient(profile.id, updates);
      await ProfileCacheService.cacheProfile(serverProfile);

      set({
        profile: serverProfile,
        syncStatus: 'synced',
        lastSyncedAt: Date.now(),
      });
    } catch (error) {
      console.error('[ProfileStore] Failed to update profile:', error);

      // Revert optimistic update on error
      set({
        profile,
        syncStatus: 'conflict',
        error: 'Failed to save changes - will retry when online',
      });

      // Queue for retry
      await ProfileCacheService.markForSync(profile.id, 'update');
    }
  },

  // ─── Add Emergency Contact ───────────────────────────────────

  addEmergencyContact: async (contact: EmergencyContact) => {
    const { profile, emergencyContacts, isOffline } = get();
    if (!profile) return;

    // Optimistic update
    const newContacts = [...emergencyContacts, contact];
    set({
      emergencyContacts: newContacts,
      syncStatus: 'pending',
    });

    // Cache locally
    await EmergencyContactsCacheService.addContact(profile.id, contact);

    if (isOffline) {
      console.log('[ProfileStore] Contact added locally, queued for sync');
      return;
    }

    try {
      // Update profile with new contacts
      const updatedProfile = await updatePatient(profile.id, {
        emergency_contacts: newContacts.map(({ name, phone, relationship }) => ({
          name,
          phone,
          relationship,
        })),
      });

      await ProfileCacheService.cacheProfile(updatedProfile);
      await EmergencyContactsCacheService.cacheContacts(
        profile.id,
        updatedProfile.emergency_contacts || []
      );

      set({
        profile: updatedProfile,
        emergencyContacts: updatedProfile.emergency_contacts || [],
        syncStatus: 'synced',
      });
    } catch (error) {
      console.error('[ProfileStore] Failed to add contact:', error);
      set({
        error: 'Failed to save contact - will retry when online',
        syncStatus: 'pending',
      });
    }
  },

  // ─── Remove Emergency Contact ────────────────────────────────

  removeEmergencyContact: async (contactId: string) => {
    const { profile, emergencyContacts, isOffline } = get();
    if (!profile) return;

    // Optimistic update
    const filteredContacts = emergencyContacts.filter((c) => c.id !== contactId);
    set({
      emergencyContacts: filteredContacts,
      syncStatus: 'pending',
    });

    // Update local cache
    await EmergencyContactsCacheService.removeContact(contactId);

    if (isOffline) {
      console.log('[ProfileStore] Contact removed locally, queued for sync');
      return;
    }

    try {
      const updatedProfile = await updatePatient(profile.id, {
        emergency_contacts: filteredContacts.map(({ name, phone, relationship }) => ({
          name,
          phone,
          relationship,
        })),
      });

      await ProfileCacheService.cacheProfile(updatedProfile);

      set({
        profile: updatedProfile,
        syncStatus: 'synced',
      });
    } catch (error) {
      console.error('[ProfileStore] Failed to remove contact:', error);
      set({
        error: 'Failed to remove contact - will retry when online',
        syncStatus: 'pending',
      });
    }
  },

  // ─── Sync With Server ────────────────────────────────────────

  syncWithServer: async () => {
    const { profile, isOffline } = get();
    if (!profile || isOffline) return;

    set({ isSyncing: true });

    try {
      const pendingSyncs = await ProfileCacheService.getPendingSyncs();

      for (const syncItem of pendingSyncs) {
        if (syncItem.entityId === profile.id && syncItem.operation === 'update') {
          // Get cached profile with pending changes
          const cachedProfile = await ProfileCacheService.get(profile.id);
          if (cachedProfile) {
            const serverProfile = await updatePatient(profile.id, cachedProfile);
            await ProfileCacheService.cacheProfile(serverProfile);
            await ProfileCacheService.clearSyncedItem(syncItem.id);

            set({ profile: serverProfile });
          }
        }
      }

      set({
        isSyncing: false,
        syncStatus: 'synced',
        lastSyncedAt: Date.now(),
      });
    } catch (error) {
      console.error('[ProfileStore] Sync failed:', error);
      set({
        isSyncing: false,
        error: 'Sync failed - will retry later',
      });
    }
  },

  // ─── Load From Cache ─────────────────────────────────────────

  loadFromCache: async (patientId: string) => {
    const cached = await ProfileCacheService.get(patientId);
    if (!cached) return false;

    const records = await MedicalRecordsCacheService.getRecords(patientId);
    const contacts = await EmergencyContactsCacheService.getContacts(patientId);

    set({
      profile: cached,
      medicalRecords: records,
      emergencyContacts: contacts.map((c) => ({
        id: c.id,
        name: c.name,
        phone: c.phone,
        relationship: c.relationship,
      })),
      fromCache: true,
      cacheAge: getCacheAge(cached.cachedAt),
      syncStatus: cached.syncStatus,
    });

    return true;
  },

  // ─── Save To Cache ───────────────────────────────────────────

  saveToCache: async () => {
    const { profile, medicalRecords } = get();
    if (!profile) return;

    await cacheFullProfile(profile, medicalRecords);
    console.log('[ProfileStore] Profile saved to cache');
  },

  // ─── Clear Profile ───────────────────────────────────────────

  clearProfile: () => {
    set(initialState);
  },

  // ─── Set Offline Status ──────────────────────────────────────

  setOffline: (isOffline: boolean) => {
    set({ isOffline });

    // If coming back online, attempt sync
    if (!isOffline) {
      get().syncWithServer();
    }
  },
}));

// ─── Network Status Listener ─────────────────────────────────────

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    useProfileStore.getState().setOffline(false);
  });

  window.addEventListener('offline', () => {
    useProfileStore.getState().setOffline(true);
  });
}
