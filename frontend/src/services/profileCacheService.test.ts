/**
 * Profile Cache Service Tests
 *
 * Tests for profile caching operations and offline data management.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock offlineDB
const mockOfflineDB = vi.hoisted(() => ({
  getItem: vi.fn(),
  getAllItems: vi.fn(),
  getItemsByIndex: vi.fn(),
  putItem: vi.fn(),
  putItems: vi.fn(),
  deleteItem: vi.fn(),
  clearStore: vi.fn(),
  addToSyncQueue: vi.fn(),
  getSyncQueue: vi.fn(),
  removeFromSyncQueue: vi.fn(),
  deleteExpiredItems: vi.fn(),
}));

vi.mock('./offlineDB', () => mockOfflineDB);

// Import after mocks
import {
  ProfileCacheService,
  MedicalRecordsCacheService,
  EmergencyContactsCacheService,
  cacheFullProfile,
  getCacheAge,
} from './profileCacheService';
import type { Patient, MedicalRecord } from './api';
import type { CachedProfile, SyncQueueItem } from '../types/cache';
import { CACHE_TTL } from '../types/cache';

describe('ProfileCacheService', () => {
  const testPatient: Patient = {
    id: 'patient-123',
    phone: '+1234567890',
    name: 'John Doe',
    date_of_birth: '1990-01-15',
    gender: 'male',
    national_id: 'ID123456',
    primary_language: 'en',
    latitude: 31.5,
    longitude: 34.4,
    location_name: 'Test Location',
    mobility: 'ambulatory',
    living_situation: 'home',
    blood_type: 'O+',
    height_cm: 180,
    weight_kg: 75,
    chronic_conditions: ['diabetes'],
    allergies: ['penicillin'],
    current_medications: ['metformin'],
    special_equipment: [],
    insurance_info: null,
    notes: null,
    emergency_contacts: [{ name: 'Jane Doe', phone: '+0987654321' }],
    false_alarm_count: 0,
    total_sos_count: 0,
    trust_score: 1.0,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  const now = Date.now();

  const testCachedProfile: CachedProfile = {
    ...testPatient,
    _type: 'profile',
    cachedAt: now,
    expiresAt: now + CACHE_TTL.profile,
    version: now,
    syncStatus: 'synced',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    vi.setSystemTime(now);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('Read Operations', () => {
    describe('get', () => {
      it('should return cached profile', async () => {
        mockOfflineDB.getItem.mockResolvedValue(testCachedProfile);

        const result = await ProfileCacheService.get('patient-123');

        expect(result).toEqual(testCachedProfile);
        expect(mockOfflineDB.getItem).toHaveBeenCalledWith('profiles', 'patient-123');
      });

      it('should return null for non-existent profile', async () => {
        mockOfflineDB.getItem.mockResolvedValue(null);

        const result = await ProfileCacheService.get('non-existent');

        expect(result).toBeNull();
      });

      it('should mark expired profile as stale', async () => {
        const expiredProfile: CachedProfile = {
          ...testCachedProfile,
          expiresAt: now - 1000, // Already expired
        };
        mockOfflineDB.getItem.mockResolvedValue(expiredProfile);

        const result = await ProfileCacheService.get('patient-123');

        expect(result?.syncStatus).toBe('stale');
      });
    });

    describe('getAll', () => {
      it('should return all cached profiles', async () => {
        mockOfflineDB.getAllItems.mockResolvedValue([testCachedProfile]);

        const result = await ProfileCacheService.getAll();

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(testCachedProfile);
      });

      it('should return empty array when no profiles cached', async () => {
        mockOfflineDB.getAllItems.mockResolvedValue([]);

        const result = await ProfileCacheService.getAll();

        expect(result).toEqual([]);
      });
    });

    describe('exists', () => {
      it('should return true for existing profile', async () => {
        mockOfflineDB.getItem.mockResolvedValue(testCachedProfile);

        const result = await ProfileCacheService.exists('patient-123');

        expect(result).toBe(true);
      });

      it('should return false for non-existent profile', async () => {
        mockOfflineDB.getItem.mockResolvedValue(null);

        const result = await ProfileCacheService.exists('non-existent');

        expect(result).toBe(false);
      });
    });
  });

  describe('Write Operations', () => {
    describe('set', () => {
      it('should store cached profile', async () => {
        mockOfflineDB.putItem.mockResolvedValue(undefined);

        await ProfileCacheService.set(testCachedProfile);

        expect(mockOfflineDB.putItem).toHaveBeenCalledWith('profiles', testCachedProfile);
      });
    });

    describe('setMany', () => {
      it('should store multiple profiles', async () => {
        const profiles = [testCachedProfile, { ...testCachedProfile, id: 'patient-456' }];
        mockOfflineDB.putItems.mockResolvedValue(undefined);

        await ProfileCacheService.setMany(profiles);

        expect(mockOfflineDB.putItems).toHaveBeenCalledWith('profiles', profiles);
      });
    });

    describe('remove', () => {
      it('should remove profile from cache', async () => {
        mockOfflineDB.deleteItem.mockResolvedValue(undefined);

        await ProfileCacheService.remove('patient-123');

        expect(mockOfflineDB.deleteItem).toHaveBeenCalledWith('profiles', 'patient-123');
      });
    });

    describe('clear', () => {
      it('should clear all cached profiles', async () => {
        mockOfflineDB.clearStore.mockResolvedValue(undefined);

        await ProfileCacheService.clear();

        expect(mockOfflineDB.clearStore).toHaveBeenCalledWith('profiles');
      });
    });
  });

  describe('Sync Operations', () => {
    describe('markForSync', () => {
      it('should mark profile for sync and add to queue', async () => {
        mockOfflineDB.getItem.mockResolvedValue(testCachedProfile);
        mockOfflineDB.putItem.mockResolvedValue(undefined);
        mockOfflineDB.addToSyncQueue.mockResolvedValue(undefined);

        await ProfileCacheService.markForSync('patient-123', 'update');

        expect(mockOfflineDB.addToSyncQueue).toHaveBeenCalled();
        const syncItem = mockOfflineDB.addToSyncQueue.mock.calls[0][0] as SyncQueueItem;
        expect(syncItem.entityType).toBe('profile');
        expect(syncItem.entityId).toBe('patient-123');
        expect(syncItem.operation).toBe('update');
      });
    });

    describe('getPendingSyncs', () => {
      it('should return only profile syncs', async () => {
        const syncQueue: SyncQueueItem[] = [
          {
            id: 'sync-1',
            entityType: 'profile',
            entityId: 'patient-123',
            operation: 'update',
            createdAt: now,
            retryCount: 0,
          },
          {
            id: 'sync-2',
            entityType: 'medical_record',
            entityId: 'record-456',
            operation: 'create',
            createdAt: now,
            retryCount: 0,
          },
        ];
        mockOfflineDB.getSyncQueue.mockResolvedValue(syncQueue);

        const result = await ProfileCacheService.getPendingSyncs();

        expect(result).toHaveLength(1);
        expect(result[0].entityType).toBe('profile');
      });
    });

    describe('clearSyncedItem', () => {
      it('should remove synced item from queue', async () => {
        mockOfflineDB.removeFromSyncQueue.mockResolvedValue(undefined);

        await ProfileCacheService.clearSyncedItem('sync-123');

        expect(mockOfflineDB.removeFromSyncQueue).toHaveBeenCalledWith('sync-123');
      });
    });

    describe('isExpired', () => {
      it('should return true for expired profile', async () => {
        const expiredProfile: CachedProfile = {
          ...testCachedProfile,
          expiresAt: now - 1000,
        };
        mockOfflineDB.getItem.mockResolvedValue(expiredProfile);

        const result = await ProfileCacheService.isExpired('patient-123');

        expect(result).toBe(true);
      });

      it('should return false for valid profile', async () => {
        mockOfflineDB.getItem.mockResolvedValue(testCachedProfile);

        const result = await ProfileCacheService.isExpired('patient-123');

        expect(result).toBe(false);
      });

      it('should return true for non-existent profile', async () => {
        mockOfflineDB.getItem.mockResolvedValue(null);

        const result = await ProfileCacheService.isExpired('non-existent');

        expect(result).toBe(true);
      });
    });

    describe('invalidate', () => {
      it('should mark profile as stale and expired', async () => {
        mockOfflineDB.getItem.mockResolvedValue(testCachedProfile);
        mockOfflineDB.putItem.mockResolvedValue(undefined);

        await ProfileCacheService.invalidate('patient-123');

        expect(mockOfflineDB.putItem).toHaveBeenCalled();
        const updatedProfile = mockOfflineDB.putItem.mock.calls[0][1] as CachedProfile;
        expect(updatedProfile.syncStatus).toBe('stale');
        expect(updatedProfile.expiresAt).toBe(now);
      });
    });
  });

  describe('cacheProfile', () => {
    it('should cache patient with correct metadata', async () => {
      mockOfflineDB.putItem.mockResolvedValue(undefined);

      await ProfileCacheService.cacheProfile(testPatient);

      expect(mockOfflineDB.putItem).toHaveBeenCalled();
      const cachedProfile = mockOfflineDB.putItem.mock.calls[0][1] as CachedProfile;
      expect(cachedProfile._type).toBe('profile');
      expect(cachedProfile.cachedAt).toBe(now);
      expect(cachedProfile.expiresAt).toBe(now + CACHE_TTL.profile);
      expect(cachedProfile.syncStatus).toBe('synced');
    });
  });

  describe('getOrFetch', () => {
    it('should fetch and cache when successful', async () => {
      const fetchFn = vi.fn().mockResolvedValue(testPatient);
      mockOfflineDB.putItem.mockResolvedValue(undefined);

      const result = await ProfileCacheService.getOrFetch('patient-123', fetchFn);

      expect(result.profile).toEqual(testPatient);
      expect(result.fromCache).toBe(false);
      expect(fetchFn).toHaveBeenCalled();
    });

    it('should return cached data when fetch fails', async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error('Network error'));
      mockOfflineDB.getItem.mockResolvedValue(testCachedProfile);

      const result = await ProfileCacheService.getOrFetch('patient-123', fetchFn);

      expect(result.profile).toEqual(testCachedProfile);
      expect(result.fromCache).toBe(true);
    });

    it('should throw when fetch fails and no cache exists', async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error('Network error'));
      mockOfflineDB.getItem.mockResolvedValue(null);

      await expect(ProfileCacheService.getOrFetch('patient-123', fetchFn)).rejects.toThrow(
        'Network error'
      );
    });
  });

  describe('cleanupExpired', () => {
    it('should delete expired items', async () => {
      mockOfflineDB.deleteExpiredItems.mockResolvedValue(5);

      const result = await ProfileCacheService.cleanupExpired();

      expect(result).toBe(5);
      expect(mockOfflineDB.deleteExpiredItems).toHaveBeenCalledWith('profiles');
    });
  });
});

describe('MedicalRecordsCacheService', () => {
  const testRecords: MedicalRecord[] = [
    {
      id: 'record-1',
      patient_id: 'patient-123',
      conditions: ['diabetes'],
      medications: ['metformin'],
      allergies: ['penicillin'],
      special_equipment: [],
      notes: null,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('cacheRecords', () => {
    it('should cache medical records with metadata', async () => {
      mockOfflineDB.putItems.mockResolvedValue(undefined);

      await MedicalRecordsCacheService.cacheRecords('patient-123', testRecords);

      expect(mockOfflineDB.putItems).toHaveBeenCalled();
      const cachedRecords = mockOfflineDB.putItems.mock.calls[0][1];
      expect(cachedRecords).toHaveLength(1);
      expect(cachedRecords[0]._type).toBe('medical_record');
      expect(cachedRecords[0].patientId).toBe('patient-123');
    });
  });

  describe('getRecords', () => {
    it('should retrieve cached records by patient ID', async () => {
      mockOfflineDB.getItemsByIndex.mockResolvedValue(testRecords);

      const result = await MedicalRecordsCacheService.getRecords('patient-123');

      expect(result).toEqual(testRecords);
      expect(mockOfflineDB.getItemsByIndex).toHaveBeenCalledWith(
        'medical_records',
        'patientId',
        'patient-123'
      );
    });
  });

  describe('getOrFetch', () => {
    it('should fetch and cache when successful', async () => {
      const fetchFn = vi.fn().mockResolvedValue(testRecords);
      mockOfflineDB.putItems.mockResolvedValue(undefined);

      const result = await MedicalRecordsCacheService.getOrFetch('patient-123', fetchFn);

      expect(result.records).toEqual(testRecords);
      expect(result.fromCache).toBe(false);
    });

    it('should return cached data when fetch fails', async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error('Network error'));
      mockOfflineDB.getItemsByIndex.mockResolvedValue(testRecords);

      const result = await MedicalRecordsCacheService.getOrFetch('patient-123', fetchFn);

      expect(result.records).toEqual(testRecords);
      expect(result.fromCache).toBe(true);
    });
  });
});

describe('EmergencyContactsCacheService', () => {
  const testContacts = [{ name: 'Jane Doe', phone: '+0987654321', relationship: 'spouse' }];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('cacheContacts', () => {
    it('should cache emergency contacts', async () => {
      mockOfflineDB.getItemsByIndex.mockResolvedValue([]);
      mockOfflineDB.putItems.mockResolvedValue(undefined);

      await EmergencyContactsCacheService.cacheContacts('patient-123', testContacts);

      expect(mockOfflineDB.putItems).toHaveBeenCalled();
    });
  });

  describe('getContacts', () => {
    it('should retrieve cached contacts by patient ID', async () => {
      mockOfflineDB.getItemsByIndex.mockResolvedValue(testContacts);

      const result = await EmergencyContactsCacheService.getContacts('patient-123');

      expect(result).toEqual(testContacts);
    });
  });

  describe('addContact', () => {
    it('should add contact with pending sync status', async () => {
      mockOfflineDB.putItem.mockResolvedValue(undefined);

      const result = await EmergencyContactsCacheService.addContact('patient-123', testContacts[0]);

      expect(result.syncStatus).toBe('pending');
      expect(result.patientId).toBe('patient-123');
    });
  });
});

describe('MedicalRecordsCacheService Additional Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('clearRecords', () => {
    it('should clear all records for a patient', async () => {
      const cachedRecords = [
        { id: 'record-1', patientId: 'patient-123' },
        { id: 'record-2', patientId: 'patient-123' },
      ];
      mockOfflineDB.getItemsByIndex.mockResolvedValue(cachedRecords);
      mockOfflineDB.deleteItem.mockResolvedValue(undefined);

      await MedicalRecordsCacheService.clearRecords('patient-123');

      expect(mockOfflineDB.deleteItem).toHaveBeenCalledTimes(2);
      expect(mockOfflineDB.deleteItem).toHaveBeenCalledWith('medical_records', 'record-1');
      expect(mockOfflineDB.deleteItem).toHaveBeenCalledWith('medical_records', 'record-2');
    });

    it('should handle empty records gracefully', async () => {
      mockOfflineDB.getItemsByIndex.mockResolvedValue([]);

      await MedicalRecordsCacheService.clearRecords('patient-123');

      expect(mockOfflineDB.deleteItem).not.toHaveBeenCalled();
    });
  });

  describe('getOrFetch error handling', () => {
    it('should throw when fetch fails and no cache exists', async () => {
      const fetchFn = vi.fn().mockRejectedValue(new Error('API Error'));
      mockOfflineDB.getItemsByIndex.mockResolvedValue([]);

      await expect(MedicalRecordsCacheService.getOrFetch('patient-123', fetchFn)).rejects.toThrow(
        'API Error'
      );
    });
  });
});

describe('EmergencyContactsCacheService Additional Tests', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('clearContacts', () => {
    it('should clear all contacts for a patient', async () => {
      const cachedContacts = [
        { id: 'contact-1', patientId: 'patient-123' },
        { id: 'contact-2', patientId: 'patient-123' },
      ];
      mockOfflineDB.getItemsByIndex.mockResolvedValue(cachedContacts);
      mockOfflineDB.deleteItem.mockResolvedValue(undefined);

      await EmergencyContactsCacheService.clearContacts('patient-123');

      expect(mockOfflineDB.deleteItem).toHaveBeenCalledTimes(2);
    });
  });

  describe('removeContact', () => {
    it('should remove a specific contact', async () => {
      mockOfflineDB.deleteItem.mockResolvedValue(undefined);

      await EmergencyContactsCacheService.removeContact('contact-123');

      expect(mockOfflineDB.deleteItem).toHaveBeenCalledWith('emergency_contacts', 'contact-123');
    });
  });

  describe('cacheContacts', () => {
    it('should clear existing contacts before caching new ones', async () => {
      const existingContacts = [{ id: 'old-contact', patientId: 'patient-123' }];
      mockOfflineDB.getItemsByIndex.mockResolvedValue(existingContacts);
      mockOfflineDB.deleteItem.mockResolvedValue(undefined);
      mockOfflineDB.putItems.mockResolvedValue(undefined);

      await EmergencyContactsCacheService.cacheContacts('patient-123', [
        { name: 'New Contact', phone: '+123' },
      ]);

      // Should delete old contact first
      expect(mockOfflineDB.deleteItem).toHaveBeenCalledWith('emergency_contacts', 'old-contact');
      // Then add new contacts
      expect(mockOfflineDB.putItems).toHaveBeenCalled();
    });
  });

  describe('addContact', () => {
    it('should generate unique ID with timestamp', async () => {
      vi.useFakeTimers();
      const now = Date.now();
      vi.setSystemTime(now);
      mockOfflineDB.putItem.mockResolvedValue(undefined);

      const result = await EmergencyContactsCacheService.addContact('patient-123', {
        name: 'Test',
        phone: '+123',
      });

      expect(result.id).toBe(`patient-123-contact-${now}`);
      vi.useRealTimers();
    });
  });
});

describe('ProfileCacheService Edge Cases', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('markForSync edge cases', () => {
    it('should still add to sync queue even if profile not found', async () => {
      mockOfflineDB.getItem.mockResolvedValue(null);
      mockOfflineDB.addToSyncQueue.mockResolvedValue(undefined);

      await ProfileCacheService.markForSync('non-existent', 'delete');

      expect(mockOfflineDB.addToSyncQueue).toHaveBeenCalled();
    });

    it('should handle create operation', async () => {
      mockOfflineDB.getItem.mockResolvedValue(null);
      mockOfflineDB.addToSyncQueue.mockResolvedValue(undefined);

      await ProfileCacheService.markForSync('new-patient', 'create');

      const syncItem = mockOfflineDB.addToSyncQueue.mock.calls[0][0] as SyncQueueItem;
      expect(syncItem.operation).toBe('create');
    });

    it('should handle delete operation', async () => {
      mockOfflineDB.getItem.mockResolvedValue(null);
      mockOfflineDB.addToSyncQueue.mockResolvedValue(undefined);

      await ProfileCacheService.markForSync('patient-123', 'delete');

      const syncItem = mockOfflineDB.addToSyncQueue.mock.calls[0][0] as SyncQueueItem;
      expect(syncItem.operation).toBe('delete');
    });
  });

  describe('invalidate edge cases', () => {
    it('should do nothing for non-existent profile', async () => {
      mockOfflineDB.getItem.mockResolvedValue(null);

      await ProfileCacheService.invalidate('non-existent');

      expect(mockOfflineDB.putItem).not.toHaveBeenCalled();
    });
  });

  describe('concurrent operations', () => {
    it('should handle multiple parallel get operations', async () => {
      const profiles = [
        { id: 'p1', _type: 'profile', cachedAt: Date.now(), expiresAt: Date.now() + 100000 },
        { id: 'p2', _type: 'profile', cachedAt: Date.now(), expiresAt: Date.now() + 100000 },
      ];

      mockOfflineDB.getItem.mockImplementation((_store: string, id: string) => {
        return Promise.resolve(profiles.find((p) => p.id === id) || null);
      });

      const results = await Promise.all([
        ProfileCacheService.get('p1'),
        ProfileCacheService.get('p2'),
        ProfileCacheService.get('p3'),
      ]);

      expect(results[0]?.id).toBe('p1');
      expect(results[1]?.id).toBe('p2');
      expect(results[2]).toBeNull();
    });
  });
});

describe('Cache TTL Configuration', () => {
  it('should have correct TTL values', () => {
    expect(CACHE_TTL.profile).toBe(24 * 60 * 60 * 1000); // 24 hours
    expect(CACHE_TTL.medicalRecords).toBe(7 * 24 * 60 * 60 * 1000); // 7 days
    expect(CACHE_TTL.emergencyContacts).toBe(24 * 60 * 60 * 1000); // 24 hours
    expect(CACHE_TTL.hospitals).toBe(12 * 60 * 60 * 1000); // 12 hours
    expect(CACHE_TTL.alerts).toBe(5 * 60 * 1000); // 5 minutes
  });
});

describe('Utility Functions', () => {
  describe('cacheFullProfile', () => {
    const testPatient: Patient = {
      id: 'patient-123',
      phone: '+1234567890',
      name: 'John Doe',
      date_of_birth: null,
      gender: null,
      national_id: null,
      primary_language: null,
      latitude: null,
      longitude: null,
      location_name: null,
      mobility: 'ambulatory',
      living_situation: 'home',
      blood_type: null,
      height_cm: null,
      weight_kg: null,
      chronic_conditions: [],
      allergies: [],
      current_medications: [],
      special_equipment: [],
      insurance_info: null,
      notes: null,
      emergency_contacts: [{ name: 'Jane', phone: '+123' }],
      false_alarm_count: 0,
      total_sos_count: 0,
      trust_score: 1.0,
      is_active: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    beforeEach(() => {
      vi.clearAllMocks();
      mockOfflineDB.putItem.mockResolvedValue(undefined);
      mockOfflineDB.putItems.mockResolvedValue(undefined);
      mockOfflineDB.getItemsByIndex.mockResolvedValue([]);
    });

    it('should cache profile and emergency contacts', async () => {
      await cacheFullProfile(testPatient);

      expect(mockOfflineDB.putItem).toHaveBeenCalled(); // Profile
      expect(mockOfflineDB.putItems).toHaveBeenCalled(); // Contacts
    });

    it('should cache medical records when provided', async () => {
      const records: MedicalRecord[] = [
        {
          id: 'record-1',
          patient_id: 'patient-123',
          conditions: [],
          medications: [],
          allergies: [],
          special_equipment: [],
          notes: null,
          created_at: '2024-01-01T00:00:00Z',
          updated_at: '2024-01-01T00:00:00Z',
        },
      ];

      await cacheFullProfile(testPatient, records);

      // Should be called for profile, medical records, and contacts
      expect(mockOfflineDB.putItems).toHaveBeenCalledTimes(2);
    });
  });

  describe('getCacheAge', () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it('should return "Just now" for recent cache', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const result = getCacheAge(now - 30000); // 30 seconds ago

      expect(result).toBe('Just now');
    });

    it('should return minutes for cache under an hour', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const result = getCacheAge(now - 5 * 60 * 1000); // 5 minutes ago

      expect(result).toBe('5m ago');
    });

    it('should return hours for cache under a day', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const result = getCacheAge(now - 3 * 60 * 60 * 1000); // 3 hours ago

      expect(result).toBe('3h ago');
    });

    it('should return days for older cache', () => {
      const now = Date.now();
      vi.setSystemTime(now);

      const result = getCacheAge(now - 2 * 24 * 60 * 60 * 1000); // 2 days ago

      expect(result).toBe('2d ago');
    });
  });
});
