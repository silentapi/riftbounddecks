import { getCardImageUrl } from './cardImageUtils';

/**
 * Utility functions for generating profile pictures from card images
 */

// Cache for cards data to avoid repeated API calls
let cardsDataCache = null;
let cardsDataPromise = null;

async function loadCardsData() {
  if (cardsDataCache) {
    return cardsDataCache;
  }
  
  if (cardsDataPromise) {
    return cardsDataPromise;
  }
  
  cardsDataPromise = (async () => {
    try {
      // Dynamically import to avoid circular dependencies
      const { getCards } = await import('./cardsApi');
      const cards = await getCards();
      cardsDataCache = cards;
      return cards;
    } catch (error) {
      console.error('Error loading cards data for profile picture:', error);
      return [];
    } finally {
      cardsDataPromise = null;
    }
  })();
  
  return cardsDataPromise;
}

async function resolveCardImageUrl(cardId) {
  const cardsData = await loadCardsData();
  return getCardImageUrl(cardId, cardsData);
}
export async function generateProfilePicture(cardId) {
  // Get the image URL (async now)
  const imageUrl = await resolveCardImageUrl(cardId);
  
  return new Promise((resolve, reject) => {
    const img = new Image();
    
    // Set crossOrigin to allow canvas manipulation of external images
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        // Target dimensions for resizing
        const targetWidth = 1030;
        const targetHeight = 1438;
        
        // Crop parameters (from 181,68 to 851,738 = 670x670 square)
        const cropX = 181;
        const cropY = 68;
        const cropWidth = 670;
        const cropHeight = 670;
        
        // Create a canvas for the resized image
        const resizeCanvas = document.createElement('canvas');
        resizeCanvas.width = targetWidth;
        resizeCanvas.height = targetHeight;
        const resizeCtx = resizeCanvas.getContext('2d');
        
        // Resize the image to target dimensions (always resize, even if already correct size)
        // This ensures consistent cropping regardless of source image size
        resizeCtx.drawImage(img, 0, 0, targetWidth, targetHeight);
        
        // Create a canvas for the cropped profile picture (670x670 square)
        const cropCanvas = document.createElement('canvas');
        cropCanvas.width = cropWidth;
        cropCanvas.height = cropHeight;
        const cropCtx = cropCanvas.getContext('2d');
        
        // Crop the 670x670 square from the resized canvas
        // Source: rectangle from (181, 68) to (851, 738) in the resized image
        // Destination: full 670x670 canvas
        cropCtx.drawImage(
          resizeCanvas,
          cropX, cropY, cropWidth, cropHeight,  // Source rectangle: x, y, width, height
          0, 0, cropWidth, cropHeight          // Destination rectangle: x, y, width, height
        );
        
        // Convert to data URL (PNG format for quality)
        const dataUrl = cropCanvas.toDataURL('image/png');
        resolve(dataUrl);
      } catch (error) {
        console.error('Error generating profile picture:', error);
        // If CORS error, the canvas manipulation will fail
        // In that case, we'll reject and the component will show a placeholder
        reject(error);
      }
    };
    
    img.onerror = (error) => {
      console.error('Error loading image for profile picture:', error);
      reject(new Error(`Failed to load image: ${imageUrl}`));
    };
    
    img.src = imageUrl;
  });
}

/**
 * Get profile picture URL for a card ID
 * This function caches the generated profile pictures in memory
 * @param {string} cardId - The card ID to use for the profile picture
 * @returns {Promise<string>} - A data URL of the cropped profile picture
 */
const profilePictureCache = new Map();

export async function getProfilePictureUrl(cardId) {
  // Check cache first
  if (profilePictureCache.has(cardId)) {
    return profilePictureCache.get(cardId);
  }
  
  // Generate and cache the profile picture
  try {
    const dataUrl = await generateProfilePicture(cardId);
    profilePictureCache.set(cardId, dataUrl);
    return dataUrl;
  } catch (error) {
    console.error('Error getting profile picture:', error);
    // Return a placeholder or default image
    return null;
  }
}

