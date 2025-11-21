// Decks API utility functions for server-side deck management

import { authenticatedFetch, getToken } from './auth.js';

// Determine API base URL dynamically
function getApiBaseUrl() {
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  
  // In production, use relative paths so nginx can proxy /api/* requests
  const isProduction = import.meta.env.PROD || 
                       import.meta.env.MODE === 'production' ||
                       import.meta.env.VITE_ENVIRONMENT === 'prod';
  
  if (isProduction) {
    // Return empty string to use relative paths (nginx will proxy /api/*)
    return '';
  }
  
  // In development, use localhost:3000
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const port = '3000';
  return `${protocol}//${hostname}:${port}`;
}

const API_BASE_URL = getApiBaseUrl();

/**
 * Make a fetch request with optional authentication
 * Includes auth token if available, but doesn't fail if not authenticated
 * @param {string} endpoint - API endpoint
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>}
 */
async function optionalAuthFetch(endpoint, options = {}) {
  const token = getToken();
  const headers = {
    'Content-Type': 'application/json',
    ...options.headers
  };
  
  // Include auth token if available
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  return fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    credentials: 'include',
    headers
  });
}

/**
 * Get all decks for the current user
 * @returns {Promise<Array>} Array of deck objects
 */
export async function getDecks() {
  console.log('[DecksAPI] Fetching decks from server...');
  const response = await authenticatedFetch('/api/decks');
  
  if (!response.ok) {
    const result = await response.json();
    console.error('[DecksAPI] Failed to fetch decks:', result);
    throw new Error(result.message || result.error || 'Failed to fetch decks');
  }

  const decks = await response.json();
  console.log('[DecksAPI] Successfully fetched decks:', {
    count: decks.length,
    deckNames: decks.map(d => d.name)
  });
  return decks;
}

/**
 * Get a single deck by ID (supports public access for shared decks)
 * @param {string} deckId - Deck UUID
 * @returns {Promise<Object>} Deck object
 */
export async function getDeck(deckId) {
  console.log('[DecksAPI] Fetching deck:', deckId);
  const response = await optionalAuthFetch(`/api/decks/${deckId}`);
  
  if (!response.ok) {
    const result = await response.json();
    console.error('[DecksAPI] Failed to fetch deck:', result);
    throw new Error(result.message || result.error || 'Failed to fetch deck');
  }

  const deck = await response.json();
  console.log('[DecksAPI] Successfully fetched deck:', {
    id: deck.id,
    name: deck.name,
    shared: deck.shared
  });
  return deck;
}

/**
 * Create a new deck
 * @param {Object} deckData - Deck data
 * @param {string} deckData.name - Deck name
 * @param {Object} deckData.cards - Deck cards structure
 * @returns {Promise<Object>} Created deck object
 */
export async function createDeck(deckData) {
  console.log('[DecksAPI] Creating deck:', deckData.name);
  const response = await authenticatedFetch('/api/decks', {
    method: 'POST',
    body: JSON.stringify(deckData)
  });
  
  if (!response.ok) {
    const result = await response.json();
    console.error('[DecksAPI] Failed to create deck:', result);
    throw new Error(result.message || result.error || 'Failed to create deck');
  }

  const deck = await response.json();
  console.log('[DecksAPI] Successfully created deck:', {
    id: deck.id,
    name: deck.name
  });
  return deck;
}

/**
 * Update a deck
 * @param {string} deckId - Deck UUID
 * @param {Object} updates - Partial deck data to update
 * @returns {Promise<Object>} Updated deck object
 */
export async function updateDeck(deckId, updates) {
  console.log('[DecksAPI] Updating deck:', deckId, updates);
  const response = await authenticatedFetch(`/api/decks/${deckId}`, {
    method: 'PATCH',
    body: JSON.stringify(updates)
  });
  
  if (!response.ok) {
    const result = await response.json();
    console.error('[DecksAPI] Failed to update deck:', result);
    throw new Error(result.message || result.error || 'Failed to update deck');
  }

  const deck = await response.json();
  console.log('[DecksAPI] Successfully updated deck:', {
    id: deck.id,
    name: deck.name
  });
  return deck;
}

/**
 * Delete a deck
 * @param {string} deckId - Deck UUID
 * @returns {Promise<void>}
 */
export async function deleteDeck(deckId) {
  console.log('[DecksAPI] Deleting deck:', deckId);
  const response = await authenticatedFetch(`/api/decks/${deckId}`, {
    method: 'DELETE'
  });
  
  if (!response.ok) {
    const result = await response.json();
    console.error('[DecksAPI] Failed to delete deck:', result);
    throw new Error(result.message || result.error || 'Failed to delete deck');
  }

  console.log('[DecksAPI] Successfully deleted deck:', deckId);
}

/**
 * Ensure at least one deck exists (creates "Empty Deck" if none exist)
 * @returns {Promise<Object>} Result object with created flag and deck
 */
export async function ensureOneDeck() {
  console.log('[DecksAPI] Ensuring at least one deck exists...');
  const response = await authenticatedFetch('/api/decks/ensure-one', {
    method: 'POST'
  });
  
  if (!response.ok) {
    const result = await response.json();
    console.error('[DecksAPI] Failed to ensure one deck:', result);
    throw new Error(result.message || result.error || 'Failed to ensure one deck');
  }

  const result = await response.json();
  console.log('[DecksAPI] Ensure one deck result:', result);
  return result;
}

/**
 * Batch import legacy decks from localStorage
 * @param {Array} legacyDecks - Array of legacy deck objects from localStorage
 * @returns {Promise<Object>} Import results with imported, skipped, and errors arrays
 */
export async function batchImportDecks(legacyDecks) {
  console.log('[DecksAPI] Starting batch import of legacy decks:', {
    count: legacyDecks.length,
    deckNames: legacyDecks.map(d => d.name)
  });
  
  const response = await authenticatedFetch('/api/decks/batchimport', {
    method: 'POST',
    body: JSON.stringify({ decks: legacyDecks })
  });
  
  if (!response.ok) {
    const result = await response.json();
    console.error('[DecksAPI] Batch import failed:', result);
    throw new Error(result.message || result.error || 'Failed to batch import decks');
  }

  const result = await response.json();
  console.log('[DecksAPI] Batch import completed:', {
    imported: result.results.imported.length,
    skipped: result.results.skipped.length,
    errors: result.results.errors.length
  });
  return result;
}

/**
 * Toggle sharing status of a deck
 * @param {string} deckId - Deck UUID
 * @param {boolean} shared - Whether the deck should be shared
 * @returns {Promise<Object>} Updated deck object
 */
export async function toggleDeckSharing(deckId, shared) {
  console.log('[DecksAPI] Toggling deck sharing:', deckId, shared);
  const response = await authenticatedFetch(`/api/decks/${deckId}/sharing`, {
    method: 'PATCH',
    body: JSON.stringify({ shared })
  });
  
  if (!response.ok) {
    const result = await response.json();
    console.error('[DecksAPI] Failed to toggle sharing:', result);
    throw new Error(result.message || result.error || 'Failed to toggle sharing');
  }

  const deck = await response.json();
  console.log('[DecksAPI] Successfully toggled sharing:', {
    id: deck.id,
    shared: deck.shared
  });
  return deck;
}

/**
 * Clone a public deck to the authenticated user's account
 * @param {string} deckId - Deck UUID to clone
 * @param {string} name - Optional name for the cloned deck
 * @returns {Promise<Object>} Cloned deck object
 */
export async function cloneDeck(deckId, name = null) {
  console.log('[DecksAPI] Cloning deck:', deckId, name);
  const response = await authenticatedFetch(`/api/decks/${deckId}/clone`, {
    method: 'POST',
    body: JSON.stringify({ name })
  });
  
  if (!response.ok) {
    const result = await response.json();
    console.error('[DecksAPI] Failed to clone deck:', result);
    throw new Error(result.message || result.error || 'Failed to clone deck');
  }

  const deck = await response.json();
  console.log('[DecksAPI] Successfully cloned deck:', {
    id: deck.id,
    name: deck.name
  });
  return deck;
}

