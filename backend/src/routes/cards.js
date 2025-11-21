import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import logger from '../config/logger.js';

const router = express.Router();

// Get the directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * GET /api/cards
 * Serves the cards.json file statically
 * This allows updating the cards.json file on the backend to automatically
 * update the card list for all clients on their next page load
 */
router.get('/', (req, res) => {
  try {
    // Path to cards.json in the backend/cards directory
    const cardsPath = path.join(__dirname, '../../cards/cards.json');
    
    // Check if file exists
    if (!fs.existsSync(cardsPath)) {
      logger.error('Cards file not found', { path: cardsPath });
      return res.status(404).json({ 
        error: 'Cards data not found',
        message: 'The cards.json file is missing from the server'
      });
    }
    
    // Read and serve the file
    const cardsData = fs.readFileSync(cardsPath, 'utf8');
    const cards = JSON.parse(cardsData);
    
    // Set appropriate headers for JSON response
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'public, max-age=300'); // Cache for 5 minutes
    
    logger.info('Cards data served', { cardCount: Array.isArray(cards) ? cards.length : 'unknown' });
    res.json(cards);
  } catch (error) {
    logger.error('Error serving cards data', {
      error: error.message,
      stack: error.stack
    });
    res.status(500).json({
      error: 'Failed to load cards data',
      message: error.message
    });
  }
});

export default router;

