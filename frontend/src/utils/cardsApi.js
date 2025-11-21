// Cards API utility functions for fetching card data from the backend

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
 * Get all cards from the backend
 * This fetches the cards.json file from the backend /api/cards endpoint
 * @returns {Promise<Array>} Array of card objects
 */
export async function getCards() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/cards`, {
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

