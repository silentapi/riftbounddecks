import { buildAssetsUrl } from './assetsConfig';

// Cards API utility functions for fetching card data from the backend

function getApiBaseUrl() {
  const envUrl =
    import.meta.env.VITE_API_BASE_URL ?? import.meta.env.REACT_APP_API_BASE_URL;
  if (envUrl) {
    return envUrl;
  }

  // In production, use relative paths so nginx can proxy /api/* requests
  const runtimeEnv =
    import.meta.env.VITE_ENVIRONMENT ?? import.meta.env.REACT_APP_ENV;
  const isProduction =
    import.meta.env.PROD ||
    import.meta.env.MODE === 'production' ||
    runtimeEnv === 'prod' ||
    runtimeEnv === 'production';

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

function getCardsSourceUrl() {
  const assetsUrl = buildAssetsUrl('cards.json');
  if (assetsUrl) {
    return assetsUrl;
  }
  return `${API_BASE_URL}/api/cards`;
}

const API_BASE_URL = getApiBaseUrl();
const CARDS_SOURCE_URL = getCardsSourceUrl();

/**
 * Get all cards either from the configured CDN asset base or from the backend
 * /api/cards endpoint depending on runtime env vars.
 * @returns {Promise<Array>} Array of card objects
 */
export async function getCards() {
  try {
    const response = await fetch(CARDS_SOURCE_URL, {
      method: 'GET',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch cards: ${response.status} ${response.statusText}`);
    }

    const cards = await response.json();
    return cards;
  } catch (error) {
    console.error('Error fetching cards:', error);
    throw error;
  }
}

