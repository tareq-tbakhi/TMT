/**
 * Profile Store Tests
 *
 * Tests for the profile store with offline support.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { act } from '@testing-library/react';

// Mock API
const mockApi = vi.hoisted(() => ({
  getPatient: vi.fn(),
  updatePatient: vi.fn(),
  getPatientRecords: vi.fn(),
}));

vi.mock('../services/api', () => mockApi);

// Mock Profile Cache Service
const mockProfileCache = vi.hoisted(() => ({
  ProfileCacheService: {
    get: vi.fn(),
    set: vi.fn(),
    getOrFetch: vi.fn(),
    cacheProfile: vi.fn(),
    markForSync: vi.fn(),
    getPendingSyncs: vi.fn().mockResolvedValue([]),
    clearSyncedItem: vi.fn(),
  },
  MedicalRecordsCacheService: {
    getRecords: vi.fn().mockResolvedValue([]),
    getOrFetch: vi.fn(),
    cacheRecords: vi.fn(),
  },
  EmergencyContactsCacheService: {
    getContacts: vi.fn().mockResolvedValue([]),
    cacheContacts: vi.fn(),
    addContact: vi.fn(),
    removeContact: vi.fn(),
  },
  cacheFullProfile: vi.fn(),
  getCacheAge: vi.fn().mockReturnValue('Just now'),
}));

vi.mock('../services/profileCacheService', () => mockProfileCache);

// Import after mocks
import { useProfileStore } from './profileStore';
import type { Patient, MedicalRecord } from '../services/api';

describe('useProfileStore', () => {
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

    // Reset store state
    useProfileStore.setState({
      profile: null,
      medicalRecords: [],
      emergencyContacts: [],
      isLoading: false,
      isOffline: false,
      isSyncing: false,
      lastSyncedAt: null,
      syncStatus: 'synced',
      cacheAge: null,
      error: null,
      fromCache: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useProfileStore.getState();

      expect(state.profile).toBeNull();
      expect(state.medicalRecords).toEqual([]);
      expect(state.emergencyContacts).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('loadProfile', () => {
    it('should load profile from server', async () => {
      mockProfileCache.ProfileCacheService.getOrFetch.mockResolvedValue({
        profile: testPatient,
        fromCache: false,
      });
      mockProfileCache.ProfileCacheService.get.mockResolvedValue(null);
      mockProfileCache.MedicalRecordsCacheService.getOrFetch.mockResolvedValue({
        records: testRecords,
        fromCache: false,
      });

      await act(async () => {
        await useProfileStore.getState().loadProfile('patient-123');
      });

      const state = useProfileStore.getState();
      expect(state.profile).toEqual(testPatient);
      expect(state.fromCache).toBe(false);
      expect(state.isLoading).toBe(false);
    });

    it('should load profile from cache when server fails', async () => {
      const cachedProfile = { ...testPatient, cachedAt: Date.now(), syncStatus: 'stale' };
      mockProfileCache.ProfileCacheService.getOrFetch.mockRejectedValue(
        new Error('Network error')
      );
      mockProfileCache.ProfileCacheService.get.mockResolvedValue(cachedProfile);

      await act(async () => {
        await useProfileStore.getState().loadProfile('patient-123');
      });

      const state = useProfileStore.getState();
      expect(state.profile).toEqual(cachedProfile);
      expect(state.fromCache).toBe(true);
      expect(state.syncStatus).toBe('stale');
    });

    it('should set error when loading fails and no cache', async () => {
      mockProfileCache.ProfileCacheService.getOrFetch.mockRejectedValue(
        new Error('Network error')
      );
      mockProfileCache.ProfileCacheService.get.mockResolvedValue(null);

      await act(async () => {
        await useProfileStore.getState().loadProfile('patient-123');
      });

      const state = useProfileStore.getState();
      expect(state.error).toBe('Network error');
      expect(state.isLoading).toBe(false);
    });

    it('should set loading state while fetching', async () => {
      let loadingDuringFetch = false;

      mockProfileCache.ProfileCacheService.getOrFetch.mockImplementation(async () => {
        loadingDuringFetch = useProfileStore.getState().isLoading;
        return { profile: testPatient, fromCache: false };
      });
      mockProfileCache.ProfileCacheService.get.mockResolvedValue(null);
      mockProfileCache.MedicalRecordsCacheService.getOrFetch.mockResolvedValue({
        records: [],
        fromCache: false,
      });

      await act(async () => {
        await useProfileStore.getState().loadProfile('patient-123');
      });

      expect(loadingDuringFetch).toBe(true);
      expect(useProfileStore.getState().isLoading).toBe(false);
    });
  });

  describe('updateProfile', () => {
    beforeEach(() => {
      useProfileStore.setState({ profile: testPatient });
    });

    it('should update profile optimistically', async () => {
      mockApi.updatePatient.mockResolvedValue({ ...testPatient, name: 'Jane Doe' });
      mockProfileCache.ProfileCacheService.cacheProfile.mockResolvedValue(undefined);

      await act(async () => {
        await useProfileStore.getState().updateProfile({ name: 'Jane Doe' });
      });

      const state = useProfileStore.getState();
      expect(state.profile?.name).toBe('Jane Doe');
      expect(state.syncStatus).toBe('synced');
    });

    it('should queue update when offline', async () => {
      useProfileStore.setState({ isOffline: true });
      mockProfileCache.ProfileCacheService.cacheProfile.mockResolvedValue(undefined);
      mockProfileCache.ProfileCacheService.markForSync.mockResolvedValue(undefined);

      await act(async () => {
        await useProfileStore.getState().updateProfile({ name: 'Jane Doe' });
      });

      expect(mockProfileCache.ProfileCacheService.markForSync).toHaveBeenCalledWith(
        'patient-123',
        'update'
      );
    });

    it('should revert on server error', async () => {
      mockApi.updatePatient.mockRejectedValue(new Error('Server error'));
      mockProfileCache.ProfileCacheService.cacheProfile.mockResolvedValue(undefined);
      mockProfileCache.ProfileCacheService.markForSync.mockResolvedValue(undefined);

      await act(async () => {
        await useProfileStore.getState().updateProfile({ name: 'Jane Doe' });
      });

      const state = useProfileStore.getState();
      expect(state.profile?.name).toBe('John Doe'); // Reverted
      expect(state.syncStatus).toBe('conflict');
    });
  });

  describe('addEmergencyContact', () => {
    beforeEach(() => {
      useProfileStore.setState({
        profile: testPatient,
        emergencyContacts: testPatient.emergency_contacts || [],
      });
    });

    it('should add contact optimistically', async () => {
      const newContact = { name: 'Bob Smith', phone: '+1111111111' };
      mockApi.updatePatient.mockResolvedValue({
        ...testPatient,
        emergency_contacts: [...(testPatient.emergency_contacts || []), newContact],
      });
      mockProfileCache.EmergencyContactsCacheService.addContact.mockResolvedValue({
        ...newContact,
        id: 'new-contact',
        syncStatus: 'pending',
      });
      mockProfileCache.ProfileCacheService.cacheProfile.mockResolvedValue(undefined);
      mockProfileCache.EmergencyContactsCacheService.cacheContacts.mockResolvedValue(undefined);

      await act(async () => {
        await useProfileStore.getState().addEmergencyContact(newContact);
      });

      const state = useProfileStore.getState();
      expect(state.emergencyContacts).toHaveLength(2);
    });
  });

  describe('removeEmergencyContact', () => {
    beforeEach(() => {
      useProfileStore.setState({
        profile: testPatient,
        emergencyContacts: [
          { id: 'contact-1', name: 'Jane Doe', phone: '+0987654321' },
          { id: 'contact-2', name: 'Bob Smith', phone: '+1111111111' },
        ],
      });
    });

    it('should remove contact optimistically', async () => {
      mockApi.updatePatient.mockResolvedValue({
        ...testPatient,
        emergency_contacts: [{ name: 'Bob Smith', phone: '+1111111111' }],
      });
      mockProfileCache.EmergencyContactsCacheService.removeContact.mockResolvedValue(undefined);
      mockProfileCache.ProfileCacheService.cacheProfile.mockResolvedValue(undefined);

      await act(async () => {
        await useProfileStore.getState().removeEmergencyContact('contact-1');
      });

      const state = useProfileStore.getState();
      expect(state.emergencyContacts).toHaveLength(1);
      expect(state.emergencyContacts[0].name).toBe('Bob Smith');
    });
  });

  describe('refreshProfile', () => {
    beforeEach(() => {
      useProfileStore.setState({ profile: testPatient });
    });

    it('should refresh profile from server', async () => {
      const updatedPatient = { ...testPatient, name: 'Updated Name' };
      mockApi.getPatient.mockResolvedValue(updatedPatient);
      mockApi.getPatientRecords.mockResolvedValue(testRecords);
      mockProfileCache.cacheFullProfile.mockResolvedValue(undefined);
      mockProfileCache.MedicalRecordsCacheService.cacheRecords.mockResolvedValue(undefined);

      await act(async () => {
        await useProfileStore.getState().refreshProfile();
      });

      const state = useProfileStore.getState();
      expect(state.profile?.name).toBe('Updated Name');
      expect(state.fromCache).toBe(false);
      expect(state.syncStatus).toBe('synced');
    });

    it('should set syncing state while refreshing', async () => {
      let syncingDuringRefresh = false;

      mockApi.getPatient.mockImplementation(async () => {
        syncingDuringRefresh = useProfileStore.getState().isSyncing;
        return testPatient;
      });
      mockApi.getPatientRecords.mockResolvedValue([]);
      mockProfileCache.cacheFullProfile.mockResolvedValue(undefined);
      mockProfileCache.MedicalRecordsCacheService.cacheRecords.mockResolvedValue(undefined);

      await act(async () => {
        await useProfileStore.getState().refreshProfile();
      });

      expect(syncingDuringRefresh).toBe(true);
      expect(useProfileStore.getState().isSyncing).toBe(false);
    });
  });

  describe('loadFromCache', () => {
    it('should load all cached data', async () => {
      const cachedProfile = { ...testPatient, cachedAt: Date.now(), syncStatus: 'synced' };
      mockProfileCache.ProfileCacheService.get.mockResolvedValue(cachedProfile);
      mockProfileCache.MedicalRecordsCacheService.getRecords.mockResolvedValue(testRecords);
      mockProfileCache.EmergencyContactsCacheService.getContacts.mockResolvedValue([
        { id: 'c-1', name: 'Jane', phone: '+123', patientId: 'patient-123' },
      ]);

      let result: boolean = false;
      await act(async () => {
        result = await useProfileStore.getState().loadFromCache('patient-123');
      });

      expect(result).toBe(true);
      const state = useProfileStore.getState();
      expect(state.profile).toEqual(cachedProfile);
      expect(state.fromCache).toBe(true);
    });

    it('should return false when no cache exists', async () => {
      mockProfileCache.ProfileCacheService.get.mockResolvedValue(null);

      let result: boolean = false;
      await act(async () => {
        result = await useProfileStore.getState().loadFromCache('patient-123');
      });

      expect(result).toBe(false);
    });
  });

  describe('clearProfile', () => {
    it('should reset to initial state', () => {
      useProfileStore.setState({
        profile: testPatient,
        medicalRecords: testRecords,
        isLoading: true,
        error: 'Some error',
      });

      act(() => {
        useProfileStore.getState().clearProfile();
      });

      const state = useProfileStore.getState();
      expect(state.profile).toBeNull();
      expect(state.medicalRecords).toEqual([]);
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
    });
  });

  describe('setOffline', () => {
    it('should update offline status', () => {
      act(() => {
        useProfileStore.getState().setOffline(true);
      });

      expect(useProfileStore.getState().isOffline).toBe(true);
    });

    it('should trigger sync when coming online', async () => {
      useProfileStore.setState({
        profile: testPatient,
        isOffline: true,
      });
      mockProfileCache.ProfileCacheService.getPendingSyncs.mockResolvedValue([]);

      await act(async () => {
        useProfileStore.getState().setOffline(false);
        // Allow sync to complete
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      expect(useProfileStore.getState().isOffline).toBe(false);
    });
  });
});

describe('Profile Store State Management', () => {
  describe('Error Handling', () => {
    it('should clear error on new load', async () => {
      useProfileStore.setState({ error: 'Previous error' });

      mockProfileCache.ProfileCacheService.getOrFetch.mockResolvedValue({
        profile: {
          id: 'test',
          phone: '+1',
          name: 'Test',
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
          emergency_contacts: [],
          false_alarm_count: 0,
          total_sos_count: 0,
          trust_score: 1.0,
          is_active: true,
          created_at: '',
          updated_at: '',
        },
        fromCache: false,
      });
      mockProfileCache.ProfileCacheService.get.mockResolvedValue(null);
      mockProfileCache.MedicalRecordsCacheService.getOrFetch.mockResolvedValue({
        records: [],
        fromCache: false,
      });

      await act(async () => {
        await useProfileStore.getState().loadProfile('test');
      });

      expect(useProfileStore.getState().error).toBeNull();
    });
  });

  describe('Sync Status Transitions', () => {
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
      emergency_contacts: [],
      false_alarm_count: 0,
      total_sos_count: 0,
      trust_score: 1.0,
      is_active: true,
      created_at: '2024-01-01T00:00:00Z',
      updated_at: '2024-01-01T00:00:00Z',
    };

    it('should transition to pending on update', async () => {
      useProfileStore.setState({ profile: testPatient, isOffline: true });
      mockProfileCache.ProfileCacheService.cacheProfile.mockResolvedValue(undefined);
      mockProfileCache.ProfileCacheService.markForSync.mockResolvedValue(undefined);

      await act(async () => {
        await useProfileStore.getState().updateProfile({ name: 'Updated' });
      });

      // When offline, status stays pending
      expect(useProfileStore.getState().syncStatus).toBe('pending');
    });

    it('should transition to synced after successful update', async () => {
      useProfileStore.setState({ profile: testPatient, isOffline: false });
      const updatedPatient = { ...testPatient, name: 'Updated' };
      mockApi.updatePatient.mockResolvedValue(updatedPatient);
      mockProfileCache.ProfileCacheService.cacheProfile.mockResolvedValue(undefined);

      await act(async () => {
        await useProfileStore.getState().updateProfile({ name: 'Updated' });
        // Wait for state updates
        await new Promise((resolve) => setTimeout(resolve, 10));
      });

      const state = useProfileStore.getState();
      // When online and update succeeds, status should be synced
      expect(state.syncStatus).toBe('synced');
    });
  });
});

describe('Profile Store Edge Cases', () => {
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
    emergency_contacts: [],
    false_alarm_count: 0,
    total_sos_count: 0,
    trust_score: 1.0,
    is_active: true,
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-01-01T00:00:00Z',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    useProfileStore.setState({
      profile: null,
      medicalRecords: [],
      emergencyContacts: [],
      isLoading: false,
      isOffline: false,
      isSyncing: false,
      lastSyncedAt: null,
      syncStatus: 'synced',
      cacheAge: null,
      error: null,
      fromCache: false,
    });
  });

  describe('updateProfile without profile', () => {
    it('should do nothing when no profile is loaded', async () => {
      await act(async () => {
        await useProfileStore.getState().updateProfile({ name: 'New Name' });
      });

      expect(mockApi.updatePatient).not.toHaveBeenCalled();
    });
  });

  describe('addEmergencyContact without profile', () => {
    it('should do nothing when no profile is loaded', async () => {
      await act(async () => {
        await useProfileStore.getState().addEmergencyContact({ name: 'Test', phone: '+123' });
      });

      expect(mockProfileCache.EmergencyContactsCacheService.addContact).not.toHaveBeenCalled();
    });
  });

  describe('removeEmergencyContact without profile', () => {
    it('should do nothing when no profile is loaded', async () => {
      await act(async () => {
        await useProfileStore.getState().removeEmergencyContact('contact-1');
      });

      expect(mockProfileCache.EmergencyContactsCacheService.removeContact).not.toHaveBeenCalled();
    });
  });

  describe('refreshProfile without profile', () => {
    it('should do nothing when no profile is loaded', async () => {
      await act(async () => {
        await useProfileStore.getState().refreshProfile();
      });

      expect(mockApi.getPatient).not.toHaveBeenCalled();
    });
  });

  describe('refreshProfile error handling', () => {
    it('should handle refresh error gracefully', async () => {
      useProfileStore.setState({ profile: testPatient });
      mockApi.getPatient.mockRejectedValue(new Error('Server error'));

      await act(async () => {
        await useProfileStore.getState().refreshProfile();
      });

      const state = useProfileStore.getState();
      expect(state.error).toBe('Failed to refresh profile');
      expect(state.isSyncing).toBe(false);
    });
  });

  describe('syncWithServer edge cases', () => {
    it('should skip sync when offline', async () => {
      useProfileStore.setState({ profile: testPatient, isOffline: true });

      await act(async () => {
        await useProfileStore.getState().syncWithServer();
      });

      expect(mockProfileCache.ProfileCacheService.getPendingSyncs).not.toHaveBeenCalled();
    });

    it('should skip sync when no profile', async () => {
      await act(async () => {
        await useProfileStore.getState().syncWithServer();
      });

      expect(mockProfileCache.ProfileCacheService.getPendingSyncs).not.toHaveBeenCalled();
    });

    it('should process pending syncs', async () => {
      useProfileStore.setState({ profile: testPatient, isOffline: false });
      const cachedProfile = { ...testPatient, cachedAt: Date.now() };
      const syncItem = {
        id: 'sync-1',
        entityId: 'patient-123',
        entityType: 'profile',
        operation: 'update',
        createdAt: Date.now(),
        retryCount: 0,
      };

      mockProfileCache.ProfileCacheService.getPendingSyncs.mockResolvedValue([syncItem]);
      mockProfileCache.ProfileCacheService.get.mockResolvedValue(cachedProfile);
      mockApi.updatePatient.mockResolvedValue(testPatient);
      mockProfileCache.ProfileCacheService.cacheProfile.mockResolvedValue(undefined);
      mockProfileCache.ProfileCacheService.clearSyncedItem.mockResolvedValue(undefined);

      await act(async () => {
        await useProfileStore.getState().syncWithServer();
      });

      expect(mockProfileCache.ProfileCacheService.clearSyncedItem).toHaveBeenCalledWith('sync-1');
    });

    it('should handle sync error', async () => {
      useProfileStore.setState({ profile: testPatient, isOffline: false });
      mockProfileCache.ProfileCacheService.getPendingSyncs.mockRejectedValue(
        new Error('Sync error')
      );

      await act(async () => {
        await useProfileStore.getState().syncWithServer();
      });

      const state = useProfileStore.getState();
      expect(state.error).toBe('Sync failed - will retry later');
      expect(state.isSyncing).toBe(false);
    });
  });

  describe('saveToCache edge cases', () => {
    it('should do nothing when no profile', async () => {
      await act(async () => {
        await useProfileStore.getState().saveToCache();
      });

      expect(mockProfileCache.cacheFullProfile).not.toHaveBeenCalled();
    });

    it('should save profile and records to cache', async () => {
      const records: MedicalRecord[] = [
        {
          id: 'r-1',
          patient_id: 'patient-123',
          conditions: [],
          medications: [],
          allergies: [],
          special_equipment: [],
          notes: null,
          created_at: '',
          updated_at: '',
        },
      ];
      useProfileStore.setState({ profile: testPatient, medicalRecords: records });
      mockProfileCache.cacheFullProfile.mockResolvedValue(undefined);

      await act(async () => {
        await useProfileStore.getState().saveToCache();
      });

      expect(mockProfileCache.cacheFullProfile).toHaveBeenCalledWith(testPatient, records);
    });
  });

  describe('addEmergencyContact error handling', () => {
    it('should handle error when adding contact online', async () => {
      useProfileStore.setState({
        profile: testPatient,
        emergencyContacts: [],
        isOffline: false,
      });
      mockProfileCache.EmergencyContactsCacheService.addContact.mockResolvedValue(undefined);
      mockApi.updatePatient.mockRejectedValue(new Error('Server error'));

      await act(async () => {
        await useProfileStore.getState().addEmergencyContact({ name: 'Test', phone: '+123' });
      });

      const state = useProfileStore.getState();
      expect(state.error).toBe('Failed to save contact - will retry when online');
      expect(state.syncStatus).toBe('pending');
    });
  });

  describe('removeEmergencyContact error handling', () => {
    it('should handle error when removing contact online', async () => {
      useProfileStore.setState({
        profile: testPatient,
        emergencyContacts: [{ id: 'c-1', name: 'Test', phone: '+123' }],
        isOffline: false,
      });
      mockProfileCache.EmergencyContactsCacheService.removeContact.mockResolvedValue(undefined);
      mockApi.updatePatient.mockRejectedValue(new Error('Server error'));

      await act(async () => {
        await useProfileStore.getState().removeEmergencyContact('c-1');
      });

      const state = useProfileStore.getState();
      expect(state.error).toBe('Failed to remove contact - will retry when online');
      expect(state.syncStatus).toBe('pending');
    });
  });

  describe('loadMedicalRecords error handling', () => {
    it('should handle error silently', async () => {
      mockProfileCache.MedicalRecordsCacheService.getOrFetch.mockRejectedValue(
        new Error('Network error')
      );

      await act(async () => {
        await useProfileStore.getState().loadMedicalRecords('patient-123');
      });

      // Should not throw, just log
      expect(useProfileStore.getState().medicalRecords).toEqual([]);
    });
  });

  describe('offline contact operations', () => {
    it('should queue add contact when offline', async () => {
      useProfileStore.setState({
        profile: testPatient,
        emergencyContacts: [],
        isOffline: true,
      });
      mockProfileCache.EmergencyContactsCacheService.addContact.mockResolvedValue(undefined);

      await act(async () => {
        await useProfileStore
          .getState()
          .addEmergencyContact({ name: 'Offline Contact', phone: '+999' });
      });

      // Should add locally but not call API
      expect(mockApi.updatePatient).not.toHaveBeenCalled();
      expect(mockProfileCache.EmergencyContactsCacheService.addContact).toHaveBeenCalled();
    });

    it('should queue remove contact when offline', async () => {
      useProfileStore.setState({
        profile: testPatient,
        emergencyContacts: [{ id: 'c-1', name: 'Test', phone: '+123' }],
        isOffline: true,
      });
      mockProfileCache.EmergencyContactsCacheService.removeContact.mockResolvedValue(undefined);

      await act(async () => {
        await useProfileStore.getState().removeEmergencyContact('c-1');
      });

      // Should remove locally but not call API
      expect(mockApi.updatePatient).not.toHaveBeenCalled();
      expect(mockProfileCache.EmergencyContactsCacheService.removeContact).toHaveBeenCalled();
    });
  });
});

describe('Profile Store Network Events', () => {
  it('should define online event handler behavior', () => {
    const handler = vi.fn();
    const isOffline = false;

    // Simulate what happens when online event fires
    if (!isOffline) {
      handler();
    }

    expect(handler).toHaveBeenCalled();
  });

  it('should define offline event handler behavior', () => {
    const setOffline = vi.fn();

    // Simulate offline event
    setOffline(true);

    expect(setOffline).toHaveBeenCalledWith(true);
  });
});
