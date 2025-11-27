import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';
import logger from '../config/logger.js';

const router = express.Router();

const CDN_BASE_URL = process.env.CDN_BASE_URL?.trim();
const cardsJsonCdnUrl = buildCdnUrl(CDN_BASE_URL, 'cards.json');

function buildCdnUrl(baseUrl, filename) {
  if (!baseUrl) {
    return null;
  }

  const normalizedBase =
    baseUrl.endsWith('/') || baseUrl.endsWith('\\')
      ? baseUrl
      : `${baseUrl}/`;

  try {
    return new URL(filename, normalizedBase).toString();
  } catch (error) {
    logger.error('Invalid CDN_BASE_URL provided', {
      value: baseUrl,
      error: error.message,
      stack: error.stack,
    });
    return null;
  }
}

// Get the directory name for ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * GET /api/cards
 * Serves the cards.json file statically and optionally proxies from the CDN_BASE_URL
 * when provided so cards updates can be managed via the external worker pipeline.
 */
router.get('/', async (req, res) => {
  if (cardsJsonCdnUrl) {
    try {
      const cdnResponse = await fetch(cardsJsonCdnUrl);

      if (!cdnResponse.ok) {
        throw new Error(
          `CDN returned ${cdnResponse.status} for ${cardsJsonCdnUrl}`
        );
      }

      const cards = await cdnResponse.json();

      res.setHeader('Content-Type', 'application/json');
      res.setHeader('Cache-Control', 'public, max-age=300');

      logger.info('Cards data served from CDN', {
        source: 'cdn',
        cardCount: Array.isArray(cards) ? cards.length : 'unknown',
        cdnUrl: cardsJsonCdnUrl,
      });

      return res.json(cards);
    } catch (error) {
      logger.error('Error fetching cards data from CDN', {
        error: error.message,
        stack: error.stack,
        cdnUrl: cardsJsonCdnUrl,
      });
    }
  }

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

