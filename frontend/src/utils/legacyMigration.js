// Legacy deck migration utility
// Detects decks in localStorage and imports them to the server

import { loadDecks as loadDecksLocal, saveDecks as saveDecksLocal } from './deckStorage.js';
import { batchImportDecks, getDecks } from './decksApi.js';

const MIGRATION_FLAG_KEY = 'legacy_decks_migrated';

/**
 * Check if legacy decks migration has already been completed
 * @returns {boolean}
 */
export function hasMigratedLegacyDecks() {
  try {
    const flag = localStorage.getItem(MIGRATION_FLAG_KEY);
    return flag === 'true';
  } catch (error) {
    console.error('[LegacyMigration] Error checking migration flag:', error);
    return false;
  }
}

/**
 * Mark legacy decks migration as completed
 */
export function markMigrationComplete() {
  try {
    localStorage.setItem(MIGRATION_FLAG_KEY, 'true');
    console.log('[LegacyMigration] Marked migration as complete');
  } catch (error) {
    console.error('[LegacyMigration] Error marking migration complete:', error);
  }
}

/**
 * Check if there are legacy decks in localStorage
 * @returns {boolean}
 */
export function hasLegacyDecks() {
  try {
    const legacyDecks = loadDecksLocal();
    const hasDecks = legacyDecks && legacyDecks.length > 0;
    console.log('[LegacyMigration] Checking for legacy decks:', {
      hasDecks,
      count: legacyDecks ? legacyDecks.length : 0
    });
    return hasDecks;
  } catch (error) {
    console.error('[LegacyMigration] Error checking for legacy decks:', error);
    return false;
  }
}

/**
 * Get legacy decks from localStorage
 * @returns {Array} Array of legacy deck objects
 */
export function getLegacyDecks() {
  try {
    const legacyDecks = loadDecksLocal();
    console.log('[LegacyMigration] Loaded legacy decks from localStorage:', {
      count: legacyDecks ? legacyDecks.length : 0,
      deckNames: legacyDecks ? legacyDecks.map(d => d.name) : []
    });
    return legacyDecks || [];
  } catch (error) {
    console.error('[LegacyMigration] Error loading legacy decks:', error);
    return [];
  }
}

/**
 * Migrate legacy decks from localStorage to the server
 * @returns {Promise<Object>} Migration results
 */
export async function migrateLegacyDecks() {
  console.log('[LegacyMigration] Starting legacy deck migration...');
  
  // Check if already migrated
  if (hasMigratedLegacyDecks()) {
    console.log('[LegacyMigration] Migration already completed, skipping');
    return {
      migrated: false,
      reason: 'Already migrated'
    };
  }
  
  // Check if there are legacy decks
  if (!hasLegacyDecks()) {
    console.log('[LegacyMigration] No legacy decks found in localStorage');
    markMigrationComplete(); // Mark as complete even if no decks to migrate
    return {
      migrated: false,
      reason: 'No legacy decks found'
    };
  }
  
  // Get legacy decks
  const legacyDecks = getLegacyDecks();
  
  if (legacyDecks.length === 0) {
    console.log('[LegacyMigration] Legacy decks array is empty');
    markMigrationComplete();
    return {
      migrated: false,
      reason: 'No legacy decks to migrate'
    };
  }
  
  console.log('[LegacyMigration] Found legacy decks to migrate:', {
    count: legacyDecks.length,
    deckNames: legacyDecks.map(d => d.name)
  });
  
  try {
    // Import decks to server
    const result = await batchImportDecks(legacyDecks);
    
    console.log('[LegacyMigration] Migration completed:', {
      imported: result.results.imported.length,
      skipped: result.results.skipped.length,
      errors: result.results.errors.length
    });
    
    // Log detailed results
    if (result.results.imported.length > 0) {
      console.log('[LegacyMigration] Imported decks:', result.results.imported);
    }
    if (result.results.skipped.length > 0) {
      console.log('[LegacyMigration] Skipped decks:', result.results.skipped);
    }
    if (result.results.errors.length > 0) {
      console.error('[LegacyMigration] Errors during migration:', result.results.errors);
    }
    
    // Clean up localStorage: Remove decks that were successfully imported
    try {
      console.log('[LegacyMigration] Checking imported decks and cleaning up localStorage...');
      
      // Get all decks from API to verify they exist
      const apiDecks = await getDecks();
      console.log('[LegacyMigration] Loaded decks from API:', {
        count: apiDecks.length,
        deckNames: apiDecks.map(d => d.name)
      });
      
      // Create a set of legacyUUIDs that exist in the API
      const importedLegacyUUIDs = new Set();
      
      // Check imported decks
      for (const imported of result.results.imported) {
        // Find the deck in API by matching legacyUUID
        const apiDeck = apiDecks.find(d => d.legacyUUID === imported.legacyUUID);
        if (apiDeck) {
          console.log('[LegacyMigration] Verified imported deck exists in API:', {
            legacyUUID: imported.legacyUUID,
            apiDeckId: apiDeck.id,
            name: apiDeck.name
          });
          importedLegacyUUIDs.add(imported.legacyUUID);
        } else {
          console.warn('[LegacyMigration] Imported deck not found in API (may have been skipped):', {
            legacyUUID: imported.legacyUUID,
            name: imported.name
          });
        }
      }
      
      // Also check skipped decks that already exist (they were skipped because they exist)
      for (const skipped of result.results.skipped) {
        if (skipped.reason === 'Deck with this legacyUUID already exists') {
          // Find the deck in API by matching legacyUUID
          const apiDeck = apiDecks.find(d => d.legacyUUID === skipped.legacyUUID);
          if (apiDeck) {
            console.log('[LegacyMigration] Verified skipped deck exists in API:', {
              legacyUUID: skipped.legacyUUID,
              apiDeckId: apiDeck.id,
              name: apiDeck.name
            });
            importedLegacyUUIDs.add(skipped.legacyUUID);
          }
        }
      }
      
      // Remove decks from localStorage that were successfully imported
      const currentLocalDecks = loadDecksLocal();
      const decksToKeep = currentLocalDecks.filter(deck => {
        const shouldKeep = !importedLegacyUUIDs.has(deck.id);
        if (!shouldKeep) {
          console.log('[LegacyMigration] Removing deck from localStorage:', {
            id: deck.id,
            name: deck.name,
            reason: 'Successfully imported to server'
          });
        }
        return shouldKeep;
      });
      
      if (decksToKeep.length < currentLocalDecks.length) {
        const removedCount = currentLocalDecks.length - decksToKeep.length;
        console.log('[LegacyMigration] Cleaning up localStorage:', {
          before: currentLocalDecks.length,
          after: decksToKeep.length,
          removed: removedCount
        });
        
        // Save the cleaned up list
        saveDecksLocal(decksToKeep);
        console.log('[LegacyMigration] localStorage cleaned up successfully');
      } else {
        console.log('[LegacyMigration] No decks to remove from localStorage (all were already removed or failed to import)');
      }
    } catch (cleanupError) {
      console.error('[LegacyMigration] Error during localStorage cleanup:', cleanupError);
      // Don't fail the migration if cleanup fails
    }
    
    // Mark migration as complete
    markMigrationComplete();
    
    return {
      migrated: true,
      results: result.results
    };
  } catch (error) {
    console.error('[LegacyMigration] Migration failed:', error);
    // Don't mark as complete if migration failed - allow retry
    return {
      migrated: false,
      error: error.message
    };
  }
}

