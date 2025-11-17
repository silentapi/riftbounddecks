// User Preferences API utility functions

import { authenticatedFetch } from './auth.js';
import { setPreferences as setPreferencesLocal } from './auth.js';

/**
 * Get user preferences from the server
 * @returns {Promise<Object>} User preferences object
 */
export async function getPreferences() {
  console.log('[PreferencesAPI] Fetching preferences from server...');
  const response = await authenticatedFetch('/api/user/preferences');
  
  if (!response.ok) {
    const result = await response.json();
    console.error('[PreferencesAPI] Failed to fetch preferences:', result);
    throw new Error(result.message || result.error || 'Failed to fetch preferences');
  }

  const preferences = await response.json();
  console.log('[PreferencesAPI] Successfully fetched preferences:', preferences);
  
  // Update local storage
  setPreferencesLocal(preferences);
  
  return preferences;
}

/**
 * Update user preferences on the server
 * @param {Object} updates - Partial preferences object to update
 * @param {string} [updates.theme] - Theme preference ('light' | 'dark')
 * @param {string} [updates.defaultDeckId] - Default deck UUID
 * @param {string} [updates.screenshotMode] - Screenshot mode ('full' | 'deck')
 * @returns {Promise<Object>} Updated preferences object
 */
export async function updatePreferences(updates) {
  console.log('[PreferencesAPI] Updating preferences:', updates);
  const response = await authenticatedFetch('/api/user/preferences', {
    method: 'POST',
    body: JSON.stringify(updates)
  });
  
  if (!response.ok) {
    const result = await response.json();
    console.error('[PreferencesAPI] Failed to update preferences:', result);
    throw new Error(result.message || result.error || 'Failed to update preferences');
  }

  const preferences = await response.json();
  console.log('[PreferencesAPI] Successfully updated preferences:', preferences);
  
  // Update local storage
  setPreferencesLocal(preferences);
  
  return preferences;
}

/**
 * Get all registration keys for the current user
 * @returns {Promise<Array>} Array of registration key objects
 */
export async function getRegistrationKeys() {
  console.log('[PreferencesAPI] Fetching registration keys from server...');
  const response = await authenticatedFetch('/api/auth/registration-keys');
  
  if (!response.ok) {
    const result = await response.json();
    console.error('[PreferencesAPI] Failed to fetch registration keys:', result);
    throw new Error(result.message || result.error || 'Failed to fetch registration keys');
  }

  const keys = await response.json();
  console.log('[PreferencesAPI] Successfully fetched registration keys:', keys);
  
  return keys;
}

