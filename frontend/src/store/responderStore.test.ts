/**
 * Tests for responderStore
 * Tests state management for field responders
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useResponderStore } from './responderStore';

// Mock useDataMode to always return dummy mode in tests
vi.mock('../hooks/useDataMode', () => ({
  isDummyMode: () => true,
  isApiMode: () => false,
  useDummyData: () => true,
  useDataMode: () => 'dummy',
}));

describe('responderStore', () => {
  beforeEach(() => {
    // Reset store state before each test
    useResponderStore.setState({
      currentLocation: null,
      activeCase: null,
      completedCases: [],
      isOnDuty: true,
      isConnected: true,
    });
  });

  describe('Initial State', () => {
    it('should have null activeCase initially', () => {
      const state = useResponderStore.getState();
      expect(state.activeCase).toBeNull();
    });

    it('should be on duty by default', () => {
      const state = useResponderStore.getState();
      expect(state.isOnDuty).toBe(true);
    });

    it('should be connected by default', () => {
      const state = useResponderStore.getState();
      expect(state.isConnected).toBe(true);
    });
  });

  describe('loadDemoCase', () => {
    it('should load ambulance demo case correctly', () => {
      const { loadDemoCase } = useResponderStore.getState();
      loadDemoCase('ambulance');

      const state = useResponderStore.getState();
      expect(state.activeCase).not.toBeNull();
      expect(state.activeCase?.responderType).toBe('ambulance');
      expect(state.activeCase?.type).toBe('medical');
      expect(state.activeCase?.priority).toBe('critical');
    });

    it('should load police demo case correctly', () => {
      const { loadDemoCase } = useResponderStore.getState();
      loadDemoCase('police');

      const state = useResponderStore.getState();
      expect(state.activeCase).not.toBeNull();
      expect(state.activeCase?.responderType).toBe('police');
      expect(state.activeCase?.type).toBe('security');
    });

    it('should load civil defense demo case correctly', () => {
      const { loadDemoCase } = useResponderStore.getState();
      loadDemoCase('civil_defense');

      const state = useResponderStore.getState();
      expect(state.activeCase).not.toBeNull();
      expect(state.activeCase?.responderType).toBe('civil_defense');
      expect(state.activeCase?.type).toBe('rescue');
      expect(state.activeCase?.requiredEquipment).toBeDefined();
      expect(state.activeCase?.requiredEquipment?.length).toBeGreaterThan(0);
    });

    it('should load firefighter demo case correctly', () => {
      const { loadDemoCase } = useResponderStore.getState();
      loadDemoCase('firefighter');

      const state = useResponderStore.getState();
      expect(state.activeCase).not.toBeNull();
      expect(state.activeCase?.responderType).toBe('firefighter');
      expect(state.activeCase?.type).toBe('fire');
      expect(state.activeCase?.requiredEquipment).toBeDefined();
    });
  });

  describe('updateCaseStatus', () => {
    beforeEach(() => {
      const { loadDemoCase } = useResponderStore.getState();
      loadDemoCase('ambulance');
    });

    it('should update status from pending to accepted', () => {
      const { updateCaseStatus } = useResponderStore.getState();
      updateCaseStatus('accepted');

      const state = useResponderStore.getState();
      expect(state.activeCase?.status).toBe('accepted');
      expect(state.activeCase?.acceptedAt).toBeDefined();
    });

    it('should update status to on_scene and set arrivedAt', () => {
      const { updateCaseStatus } = useResponderStore.getState();
      updateCaseStatus('on_scene');

      const state = useResponderStore.getState();
      expect(state.activeCase?.status).toBe('on_scene');
      expect(state.activeCase?.arrivedAt).toBeDefined();
    });

    it('should update status to completed and set completedAt', () => {
      const { updateCaseStatus } = useResponderStore.getState();
      updateCaseStatus('completed');

      const state = useResponderStore.getState();
      expect(state.activeCase?.status).toBe('completed');
      expect(state.activeCase?.completedAt).toBeDefined();
    });

    it('should not update if no active case', () => {
      useResponderStore.setState({ activeCase: null });
      const { updateCaseStatus } = useResponderStore.getState();
      updateCaseStatus('accepted');

      const state = useResponderStore.getState();
      expect(state.activeCase).toBeNull();
    });
  });

  describe('completeCase', () => {
    beforeEach(() => {
      const { loadDemoCase } = useResponderStore.getState();
      loadDemoCase('ambulance');
    });

    it('should move active case to completed cases', () => {
      const { completeCase } = useResponderStore.getState();
      const activeCase = useResponderStore.getState().activeCase;

      completeCase();

      const state = useResponderStore.getState();
      expect(state.activeCase).toBeNull();
      expect(state.completedCases.length).toBeGreaterThan(0);
      expect(state.completedCases[0].id).toBe(activeCase?.id);
    });

    it('should calculate duration correctly', () => {
      const { completeCase } = useResponderStore.getState();
      completeCase();

      const state = useResponderStore.getState();
      expect(state.completedCases[0].duration).toBeGreaterThanOrEqual(0);
    });

    it('should not do anything if no active case', () => {
      useResponderStore.setState({ activeCase: null, completedCases: [] });
      const { completeCase } = useResponderStore.getState();
      completeCase();

      const state = useResponderStore.getState();
      expect(state.completedCases.length).toBe(0);
    });
  });

  describe('setCurrentLocation', () => {
    it('should update current location', () => {
      const { setCurrentLocation } = useResponderStore.getState();
      const location = {
        lat: 31.9539,
        lng: 35.9106,
        address: 'Test Address',
      };

      setCurrentLocation(location);

      const state = useResponderStore.getState();
      expect(state.currentLocation).toEqual(location);
    });

    it('should allow setting location to null', () => {
      const { setCurrentLocation } = useResponderStore.getState();
      setCurrentLocation({ lat: 0, lng: 0, address: 'Test' });
      setCurrentLocation(null);

      const state = useResponderStore.getState();
      expect(state.currentLocation).toBeNull();
    });
  });

  describe('setOnDuty', () => {
    it('should toggle on duty status', () => {
      const { setOnDuty } = useResponderStore.getState();

      setOnDuty(false);
      expect(useResponderStore.getState().isOnDuty).toBe(false);

      setOnDuty(true);
      expect(useResponderStore.getState().isOnDuty).toBe(true);
    });
  });

  describe('setConnected', () => {
    it('should toggle connection status', () => {
      const { setConnected } = useResponderStore.getState();

      setConnected(false);
      expect(useResponderStore.getState().isConnected).toBe(false);

      setConnected(true);
      expect(useResponderStore.getState().isConnected).toBe(true);
    });
  });
});
