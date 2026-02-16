/**
 * Data Mode Hook
 *
 * Controls whether the app uses dummy data or real backend API.
 * Set VITE_USE_DUMMY_DATA=true in .env for demo mode.
 */

export type DataMode = 'dummy' | 'api';

/**
 * Check if the app should use dummy data
 */
export function useDummyData(): boolean {
  return import.meta.env.VITE_USE_DUMMY_DATA === 'true';
}

/**
 * Get the current data mode
 */
export function useDataMode(): DataMode {
  return import.meta.env.VITE_USE_DUMMY_DATA === 'true' ? 'dummy' : 'api';
}

/**
 * Static check (for use outside React components)
 */
export const isDummyMode = (): boolean => {
  return import.meta.env.VITE_USE_DUMMY_DATA === 'true';
};

export const isApiMode = (): boolean => {
  return import.meta.env.VITE_USE_DUMMY_DATA !== 'true';
};
