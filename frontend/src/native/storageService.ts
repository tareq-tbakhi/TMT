/**
 * Storage service - abstracts native secure storage and web localStorage
 */

import { Preferences } from '@capacitor/preferences';
import { isNative } from './platform';

/**
 * Store a string value
 */
export async function setItem(key: string, value: string): Promise<void> {
  if (!isNative) {
    localStorage.setItem(key, value);
    return;
  }
  await Preferences.set({ key, value });
}

/**
 * Retrieve a string value
 */
export async function getItem(key: string): Promise<string | null> {
  if (!isNative) {
    return localStorage.getItem(key);
  }
  const { value } = await Preferences.get({ key });
  return value;
}

/**
 * Remove a value
 */
export async function removeItem(key: string): Promise<void> {
  if (!isNative) {
    localStorage.removeItem(key);
    return;
  }
  await Preferences.remove({ key });
}

/**
 * Clear all stored values
 */
export async function clear(): Promise<void> {
  if (!isNative) {
    localStorage.clear();
    return;
  }
  await Preferences.clear();
}

/**
 * Store an object (JSON serialized)
 */
export async function setObject<T>(key: string, value: T): Promise<void> {
  await setItem(key, JSON.stringify(value));
}

/**
 * Retrieve an object (JSON parsed)
 */
export async function getObject<T>(key: string): Promise<T | null> {
  const value = await getItem(key);
  if (!value) return null;
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

/**
 * Get all keys
 */
export async function keys(): Promise<string[]> {
  if (!isNative) {
    return Object.keys(localStorage);
  }
  const { keys } = await Preferences.keys();
  return keys;
}

/**
 * Check if a key exists
 */
export async function hasItem(key: string): Promise<boolean> {
  const value = await getItem(key);
  return value !== null;
}
