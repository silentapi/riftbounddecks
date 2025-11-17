import express from 'express';
import { body, validationResult, param } from 'express-validator';
import Deck from '../models/Deck.js';
import UserPreferences from '../models/UserPreferences.js';
import { authenticate } from '../middleware/auth.js';
import logger from '../config/logger.js';
import { randomUUID } from 'crypto';

const router = express.Router();

/**
 * GET /api/decks
 * List all decks for the authenticated user
 */
router.get('/', authenticate, async (req, res, next) => {
  try {
    logger.debug('List decks', {
      userId: req.userId
    });

    const decks = await Deck.find({ userId: req.userId })
      .sort({ updatedAt: -1 }); // Most recently updated first

    res.json(decks);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/decks/:id
 * Get a single deck by ID (UUID)
 */
router.get('/:id', [
  authenticate,
  param('id').trim().notEmpty().withMessage('Deck ID is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: errors.array().map(e => e.msg).join(', ')
      });
    }

    const { id } = req.params;

    logger.debug('Get deck', {
      userId: req.userId,
      deckId: id
    });

    const deck = await Deck.findOne({ id, userId: req.userId });

    if (!deck) {
      logger.warn('Deck not found', {
        userId: req.userId,
        deckId: id
      });
      return res.status(404).json({
        error: 'Not Found',
        message: 'Deck not found'
      });
    }

    res.json(deck);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/decks
 * Create a new deck
 */
router.post('/', [
  authenticate,
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Deck name is required')
    .isLength({ min: 1, max: 64 })
    .withMessage('Deck name must be between 1 and 64 characters'),
  body('cards')
    .optional()
    .isObject()
    .withMessage('Cards must be an object')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Create deck validation failed', {
        userId: req.userId,
        errors: errors.array()
      });
      return res.status(400).json({
        error: 'Validation Error',
        message: errors.array().map(e => e.msg).join(', ')
      });
    }

    const { name, cards } = req.body;

    // Check for duplicate name (case-insensitive) for this user
    const existingDeck = await Deck.findOne({
      userId: req.userId,
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }
    });

    if (existingDeck) {
      logger.warn('Create deck failed: Duplicate name', {
        userId: req.userId,
        name
      });
      return res.status(409).json({
        error: 'Conflict',
        message: 'A deck with this name already exists'
      });
    }

    // Generate UUID for the deck
    const deckId = randomUUID();

    // Default cards structure if not provided
    const defaultCards = {
      mainDeck: [],
      chosenChampion: null,
      sideDeck: [],
      battlefields: [],
      runeACount: 6,
      runeBCount: 6,
      runeAVariantIndex: 0,
      runeBVariantIndex: 0,
      legendCard: null
    };

    const deck = new Deck({
      id: deckId,
      userId: req.userId,
      name: name.trim(),
      cards: cards || defaultCards,
      createdAt: new Date(),
      updatedAt: new Date()
    });

    await deck.save();

    logger.info('Deck created', {
      userId: req.userId,
      deckId: deck.id,
      deckName: deck.name
    });

    res.status(201).json(deck);
  } catch (error) {
    // Handle duplicate key error (case-insensitive index)
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A deck with this name already exists'
      });
    }
    next(error);
  }
});

/**
 * PATCH /api/decks/:id
 * Update a deck (save deck contents)
 */
router.patch('/:id', [
  authenticate,
  param('id').trim().notEmpty().withMessage('Deck ID is required'),
  body('name')
    .optional()
    .trim()
    .isLength({ min: 1, max: 64 })
    .withMessage('Deck name must be between 1 and 64 characters'),
  body('cards')
    .optional()
    .isObject()
    .withMessage('Cards must be an object')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Update deck validation failed', {
        userId: req.userId,
        deckId: req.params.id,
        errors: errors.array()
      });
      return res.status(400).json({
        error: 'Validation Error',
        message: errors.array().map(e => e.msg).join(', ')
      });
    }

    const { id } = req.params;
    const { name, cards } = req.body;

    logger.info('Update deck', {
      userId: req.userId,
      deckId: id,
      hasName: !!name,
      hasCards: !!cards
    });

    // Find deck and verify ownership
    const deck = await Deck.findOne({ id, userId: req.userId });

    if (!deck) {
      logger.warn('Update deck failed: Deck not found', {
        userId: req.userId,
        deckId: id
      });
      return res.status(404).json({
        error: 'Not Found',
        message: 'Deck not found'
      });
    }

    // If name is being updated, check for duplicates
    if (name && name.trim() !== deck.name) {
      const existingDeck = await Deck.findOne({
        userId: req.userId,
        id: { $ne: id }, // Exclude current deck
        name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }
      });

      if (existingDeck) {
        logger.warn('Update deck failed: Duplicate name', {
          userId: req.userId,
          deckId: id,
          name
        });
        return res.status(409).json({
          error: 'Conflict',
          message: 'A deck with this name already exists'
        });
      }

      deck.name = name.trim();
    }

    // Update cards if provided
    if (cards) {
      deck.cards = {
        ...deck.cards,
        ...cards
      };
    }

    deck.updatedAt = new Date();
    await deck.save();

    logger.info('Deck updated', {
      userId: req.userId,
      deckId: deck.id
    });

    res.json(deck);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A deck with this name already exists'
      });
    }
    next(error);
  }
});

/**
 * PATCH /api/decks/:id/rename
 * Rename a deck
 */
router.patch('/:id/rename', [
  authenticate,
  param('id').trim().notEmpty().withMessage('Deck ID is required'),
  body('name')
    .trim()
    .notEmpty()
    .withMessage('Deck name is required')
    .isLength({ min: 1, max: 64 })
    .withMessage('Deck name must be between 1 and 64 characters')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Rename deck validation failed', {
        userId: req.userId,
        deckId: req.params.id,
        errors: errors.array()
      });
      return res.status(400).json({
        error: 'Validation Error',
        message: errors.array().map(e => e.msg).join(', ')
      });
    }

    const { id } = req.params;
    const { name } = req.body;

    logger.info('Rename deck', {
      userId: req.userId,
      deckId: id,
      newName: name
    });

    // Find deck and verify ownership
    const deck = await Deck.findOne({ id, userId: req.userId });

    if (!deck) {
      logger.warn('Rename deck failed: Deck not found', {
        userId: req.userId,
        deckId: id
      });
      return res.status(404).json({
        error: 'Not Found',
        message: 'Deck not found'
      });
    }

    // Check for duplicate name (case-insensitive)
    const existingDeck = await Deck.findOne({
      userId: req.userId,
      id: { $ne: id }, // Exclude current deck
      name: { $regex: new RegExp(`^${name.trim()}$`, 'i') }
    });

    if (existingDeck) {
      logger.warn('Rename deck failed: Duplicate name', {
        userId: req.userId,
        deckId: id,
        name
      });
      return res.status(409).json({
        error: 'Conflict',
        message: 'A deck with this name already exists'
      });
    }

    deck.name = name.trim();
    deck.updatedAt = new Date();
    await deck.save();

    logger.info('Deck renamed', {
      userId: req.userId,
      deckId: deck.id,
      newName: deck.name
    });

    res.json(deck);
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        error: 'Conflict',
        message: 'A deck with this name already exists'
      });
    }
    next(error);
  }
});

/**
 * DELETE /api/decks/:id
 * Delete a deck
 */
router.delete('/:id', [
  authenticate,
  param('id').trim().notEmpty().withMessage('Deck ID is required')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({
        error: 'Validation Error',
        message: errors.array().map(e => e.msg).join(', ')
      });
    }

    const { id } = req.params;

    logger.info('Delete deck', {
      userId: req.userId,
      deckId: id
    });

    // Find deck and verify ownership
    const deck = await Deck.findOne({ id, userId: req.userId });

    if (!deck) {
      logger.warn('Delete deck failed: Deck not found', {
        userId: req.userId,
        deckId: id
      });
      return res.status(404).json({
        error: 'Not Found',
        message: 'Deck not found'
      });
    }

    // Check if this is the last deck
    const deckCount = await Deck.countDocuments({ userId: req.userId });

    if (deckCount === 1) {
      logger.warn('Delete deck failed: Last deck', {
        userId: req.userId,
        deckId: id
      });
      return res.status(400).json({
        error: 'Bad Request',
        message: 'You must always have at least one deck. Deleting the last deck is not allowed.'
      });
    }

    // Check if this deck is the default deck
    const preferences = await UserPreferences.findOne({ userId: req.userId });
    if (preferences && preferences.defaultDeckId === id) {
      // Clear default deck ID
      preferences.defaultDeckId = null;
      await preferences.save();
      logger.debug('Cleared default deck ID', {
        userId: req.userId
      });
    }

    // Check if this deck is the last opened deck
    if (preferences && preferences.lastOpenedDeck && preferences.lastOpenedDeck.toString() === deck._id.toString()) {
      preferences.lastOpenedDeck = null;
      await preferences.save();
      logger.debug('Cleared last opened deck', {
        userId: req.userId
      });
    }

    await Deck.deleteOne({ id, userId: req.userId });

    logger.info('Deck deleted', {
      userId: req.userId,
      deckId: id
    });

    res.json({
      message: 'Deck deleted successfully'
    });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/decks/ensure-one
 * Ensure at least one deck exists for the user (creates "Empty Deck" if none exist)
 */
router.post('/ensure-one', authenticate, async (req, res, next) => {
  try {
    logger.debug('Ensure one deck', {
      userId: req.userId
    });

    const deckCount = await Deck.countDocuments({ userId: req.userId });

    if (deckCount === 0) {
      // Create empty deck
      const deckId = randomUUID();
      const emptyDeck = new Deck({
        id: deckId,
        userId: req.userId,
        name: 'Empty Deck',
        cards: {
          mainDeck: [],
          chosenChampion: null,
          sideDeck: [],
          battlefields: [],
          runeACount: 6,
          runeBCount: 6,
          runeAVariantIndex: 0,
          runeBVariantIndex: 0,
          legendCard: null
        },
        createdAt: new Date(),
        updatedAt: new Date()
      });

      await emptyDeck.save();

      logger.info('Empty deck created', {
        userId: req.userId,
        deckId: emptyDeck.id
      });

      res.status(201).json({
        created: true,
        deck: emptyDeck
      });
    } else {
      res.json({
        created: false,
        message: 'User already has decks'
      });
    }
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/decks/batchimport
 * Batch import decks from localStorage (legacy migration)
 * Takes an array of decks and creates them, skipping if legacyUUID already exists
 */
router.post('/batchimport', [
  authenticate,
  body('decks')
    .isArray()
    .withMessage('Decks must be an array')
    .notEmpty()
    .withMessage('Decks array cannot be empty'),
  body('decks.*.id')
    .notEmpty()
    .withMessage('Each deck must have an id (legacyUUID)'),
  body('decks.*.name')
    .trim()
    .notEmpty()
    .withMessage('Each deck must have a name')
    .isLength({ min: 1, max: 64 })
    .withMessage('Deck name must be between 1 and 64 characters'),
  body('decks.*.cards')
    .optional()
    .isObject()
    .withMessage('Cards must be an object')
], async (req, res, next) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      logger.warn('Batch import validation failed', {
        userId: req.userId,
        errors: errors.array()
      });
      return res.status(400).json({
        error: 'Validation Error',
        message: errors.array().map(e => e.msg).join(', ')
      });
    }

    const { decks } = req.body;

    logger.info('Batch import started', {
      userId: req.userId,
      deckCount: decks.length
    });

    const results = {
      imported: [],
      skipped: [],
      errors: []
    };

    // Process each deck
    for (const legacyDeck of decks) {
      const legacyUUID = legacyDeck.id;
      
      logger.debug('Processing legacy deck', {
        userId: req.userId,
        legacyUUID,
        deckName: legacyDeck.name
      });

      try {
        // Check if deck with this legacyUUID already exists
        const existingDeck = await Deck.findOne({
          userId: req.userId,
          legacyUUID: legacyUUID
        });

        if (existingDeck) {
          logger.debug('Skipping deck - legacyUUID already exists', {
            userId: req.userId,
            legacyUUID,
            existingDeckId: existingDeck.id
          });
          results.skipped.push({
            legacyUUID,
            name: legacyDeck.name,
            reason: 'Deck with this legacyUUID already exists',
            existingDeckId: existingDeck.id
          });
          continue;
        }

        // Check for duplicate name (case-insensitive) for this user
        const existingDeckByName = await Deck.findOne({
          userId: req.userId,
          name: { $regex: new RegExp(`^${legacyDeck.name.trim()}$`, 'i') }
        });

        if (existingDeckByName) {
          logger.debug('Skipping deck - name already exists', {
            userId: req.userId,
            legacyUUID,
            name: legacyDeck.name
          });
          results.skipped.push({
            legacyUUID,
            name: legacyDeck.name,
            reason: 'Deck with this name already exists',
            existingDeckId: existingDeckByName.id
          });
          continue;
        }

        // Generate new UUID for the deck
        const deckId = randomUUID();

        // Default cards structure if not provided
        const defaultCards = {
          mainDeck: [],
          chosenChampion: null,
          sideDeck: [],
          battlefields: [],
          runeACount: 6,
          runeBCount: 6,
          runeAVariantIndex: 0,
          runeBVariantIndex: 0,
          legendCard: null
        };

        // Create new deck with legacyUUID
        const deck = new Deck({
          id: deckId,
          userId: req.userId,
          name: legacyDeck.name.trim(),
          cards: legacyDeck.cards || defaultCards,
          legacyUUID: legacyUUID,
          createdAt: legacyDeck.createdAt ? new Date(legacyDeck.createdAt) : new Date(),
          updatedAt: legacyDeck.updatedAt ? new Date(legacyDeck.updatedAt) : new Date()
        });

        await deck.save();

        logger.info('Legacy deck imported', {
          userId: req.userId,
          legacyUUID,
          newDeckId: deck.id,
          deckName: deck.name
        });

        results.imported.push({
          legacyUUID,
          newDeckId: deck.id,
          name: deck.name
        });
      } catch (error) {
        logger.error('Error importing legacy deck', {
          userId: req.userId,
          legacyUUID,
          error: error.message,
          stack: error.stack
        });

        // Handle duplicate key error (case-insensitive index)
        if (error.code === 11000) {
          results.skipped.push({
            legacyUUID,
            name: legacyDeck.name,
            reason: 'Deck name conflict (duplicate key)'
          });
        } else {
          results.errors.push({
            legacyUUID,
            name: legacyDeck.name,
            error: error.message
          });
        }
      }
    }

    logger.info('Batch import completed', {
      userId: req.userId,
      imported: results.imported.length,
      skipped: results.skipped.length,
      errors: results.errors.length
    });

    res.status(200).json({
      message: 'Batch import completed',
      results
    });
  } catch (error) {
    logger.error('Batch import failed', {
      userId: req.userId,
      error: error.message,
      stack: error.stack
    });
    next(error);
  }
});

export default router;

