// DeckStorage utility module for localStorage operations

/**
 * @typedef {Object} CardEntry
 * @property {string[]} mainDeck - Array of card IDs (max 40)
 * @property {string|null} chosenChampion - Champion card ID
 * @property {string[]} sideDeck - Array of card IDs (max 8)
 * @property {string[]} battlefields - Array of card IDs (max 3)
 * @property {number} runeACount - Rune A count (0-12)
 * @property {number} runeBCount - Rune B count (0-12)
 * @property {string|null} legendCard - Legend card ID
 */

/**
 * @typedef {Object} Deck
 * @property {string} id - UUID
 * @property {string} name - Unique deck name (case-insensitive)
 * @property {CardEntry} cards - Deck card data
 * @property {string} createdAt - ISO datetime string
 * @property {string} updatedAt - ISO datetime string
 */

const STORAGE_KEYS = {
  DECKS: 'decks',
  LAST_DECK_ID: 'lastDeckId',
  THEME: 'theme',
  SCREENSHOT_MODE: 'screenshotMode'
};

/**
 * Generate a UUID v4 compatible string
 * Falls back to a custom implementation if crypto.randomUUID is not available
 * @returns {string}
 */
function generateUUID() {
  // Use crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  
  // Fallback implementation for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Load decks from localStorage
 * @returns {Deck[]}
 */
export function loadDecks() {
  try {
    const stored = localStorage.getItem(STORAGE_KEYS.DECKS);
    if (!stored) return [];
    
    const decks = JSON.parse(stored);
    if (!Array.isArray(decks)) return [];
    
    return decks;
  } catch (error) {
    console.error('Error loading decks:', error);
    return [];
  }
}

/**
 * Save decks to localStorage
 * @param {Deck[]} decks
 */
export function saveDecks(decks) {
  try {
    localStorage.setItem(STORAGE_KEYS.DECKS, JSON.stringify(decks));
  } catch (error) {
    console.error('Error saving decks:', error);
  }
}

/**
 * Ensure at least one deck exists, creating "Empty Deck" if needed
 * @returns {Deck[]}
 */
export function ensureAtLeastOneDeck() {
  let decks = loadDecks();
  
  if (decks.length === 0) {
    const emptyDeck = createDeck('Empty Deck');
    decks = [emptyDeck];
    saveDecks(decks);
  }
  
  return decks;
}

/**
 * Find a deck by name (case-insensitive)
 * @param {Deck[]} decks
 * @param {string} name
 * @returns {Deck|null}
 */
export function findDeckByNameCI(decks, name) {
  const normalizedName = name.trim().toLowerCase();
  return decks.find(d => d.name.toLowerCase() === normalizedName) || null;
}

/**
 * Create a new empty deck
 * @param {string} name
 * @returns {Deck}
 */
export function createDeck(name) {
  const now = new Date().toISOString();
  return {
    id: generateUUID(),
    name: name.trim(),
    cards: {
      mainDeck: [],
      chosenChampion: null,
      sideDeck: [],
      battlefields: [],
      runeACount: 6,
      runeBCount: 6,
      legendCard: null
    },
    createdAt: now,
    updatedAt: now
  };
}

/**
 * Get last selected deck ID from localStorage
 * @returns {string|null}
 */
export function getLastDeckId() {
  try {
    return localStorage.getItem(STORAGE_KEYS.LAST_DECK_ID);
  } catch (error) {
    console.error('Error loading last deck ID:', error);
    return null;
  }
}

/**
 * Set last selected deck ID in localStorage
 * @param {string|null} id
 */
export function setLastDeckId(id) {
  try {
    if (id === null) {
      localStorage.removeItem(STORAGE_KEYS.LAST_DECK_ID);
    } else {
      localStorage.setItem(STORAGE_KEYS.LAST_DECK_ID, id);
    }
  } catch (error) {
    console.error('Error saving last deck ID:', error);
  }
}

/**
 * Get theme from localStorage
 * @returns {'light' | 'dark'}
 */
export function getTheme() {
  try {
    const theme = localStorage.getItem(STORAGE_KEYS.THEME);
    return theme === 'light' || theme === 'dark' ? theme : 'dark';
  } catch (error) {
    console.error('Error loading theme:', error);
    return 'dark';
  }
}

/**
 * Set theme in localStorage
 * @param {'light' | 'dark'} theme
 */
export function setTheme(theme) {
  try {
    localStorage.setItem(STORAGE_KEYS.THEME, theme);
  } catch (error) {
    console.error('Error saving theme:', error);
  }
}

/**
 * Get screenshot mode from localStorage
 * @returns {'full' | 'deck'}
 */
export function getScreenshotMode() {
  try {
    const mode = localStorage.getItem(STORAGE_KEYS.SCREENSHOT_MODE);
    return mode === 'full' || mode === 'deck' ? mode : 'full';
  } catch (error) {
    console.error('Error loading screenshot mode:', error);
    return 'full';
  }
}

/**
 * Set screenshot mode in localStorage
 * @param {'full' | 'deck'} mode
 */
export function setScreenshotMode(mode) {
  try {
    localStorage.setItem(STORAGE_KEYS.SCREENSHOT_MODE, mode);
  } catch (error) {
    console.error('Error saving screenshot mode:', error);
  }
}

/**
 * Validate and normalize deck name
 * @param {string} name
 * @returns {{valid: boolean, normalized: string, error: string|null}}
 */
export function validateDeckName(name, existingDecks = [], excludeId = null) {
  // Trim and collapse multiple spaces
  const normalized = name.trim().replace(/\s+/g, ' ');
  
  // Check length
  if (normalized.length === 0) {
    return { valid: false, normalized: '', error: 'Deck name cannot be empty' };
  }
  
  if (normalized.length > 64) {
    return { valid: false, normalized, error: 'Deck name must be 64 characters or less' };
  }
  
  // Check uniqueness (case-insensitive, excluding current deck)
  const existing = existingDecks.find(d => 
    d.id !== excludeId && d.name.toLowerCase() === normalized.toLowerCase()
  );
  
  if (existing) {
    return { valid: false, normalized, error: 'A deck with this name already exists' };
  }
  
  return { valid: true, normalized, error: null };
}

