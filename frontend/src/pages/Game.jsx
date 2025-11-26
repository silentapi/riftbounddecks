import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import LayoutContainer from '../components/LayoutContainer';
import ContextMenu from '../components/ContextMenu';
import { getTheme } from '../utils/deckStorage';
import { getPreferences } from '../utils/preferencesApi';
import { getProfilePictureUrl } from '../utils/profilePicture';
import { getDecks, getDeck } from '../utils/decksApi';
import { getCards } from '../utils/cardsApi';

function Game() {
  // Dark mode state - initialize from localStorage
  const [isDarkMode, setIsDarkMode] = useState(() => getTheme() === 'dark');
  
  // Get game ID from URL
  const [gameId, setGameId] = useState(null);
  
  // User profile picture state
  const [userProfileCardId, setUserProfileCardId] = useState('OGN-155'); // Default
  const [userProfilePictureUrl, setUserProfilePictureUrl] = useState(null);
  const [userProfilePictureLoading, setUserProfilePictureLoading] = useState(true);
  const [userDisplayName, setUserDisplayName] = useState(null);
  
  // Game state - mock opponent
  const opponentName = 'Diego';
  const opponentDisplayName = 'Diego';
  const opponentProfileCardId = 'OGS-010-1';
  const [opponentProfilePictureUrl, setOpponentProfilePictureUrl] = useState(null);
  const [opponentProfilePictureLoading, setOpponentProfilePictureLoading] = useState(true);
  
  const [userScore, setUserScore] = useState(0);
  const [opponentScore, setOpponentScore] = useState(0);
  
  // Chat state
  const [chatMessages, setChatMessages] = useState([]);
  const [chatInput, setChatInput] = useState('');
  
  // Preferred deck state - loaded from preferences
  const [preferredDeck, setPreferredDeck] = useState(null);
  const [cardsData, setCardsData] = useState(null);
  
  // Player hand state
  const [hand, setHand] = useState([]);
  const [hoveredHandCardIndex, setHoveredHandCardIndex] = useState(null);
  const [animatingCardId, setAnimatingCardId] = useState(null); // For draw animation (deck -> hand)
  const [animatingToDeck, setAnimatingToDeck] = useState(null); // For recycle/top animations: { cardId, type: 'recycle' | 'top', handIndex }
  const [animatingToDiscard, setAnimatingToDiscard] = useState(null); // For discard animation: { cardId, handIndex }
  const [isShufflingHand, setIsShufflingHand] = useState(false);
  const [isShufflingDeck, setIsShufflingDeck] = useState(false);
  
  // Discard pile state
  const [discardPile, setDiscardPile] = useState([]); // Array of card IDs, cards added to end
  const [opponentDiscardPile, setOpponentDiscardPile] = useState([]); // Opponent discard pile (for future use)
  const [isDiscardModalOpen, setIsDiscardModalOpen] = useState(false); // Discard modal state
  
  // Rune deck and field state
  const [runeDeck, setRuneDeck] = useState([]); // Array of rune card IDs (up to 12)
  const [runeField, setRuneField] = useState([]); // Array of rune card IDs on field (compact, no nulls, max 12)
  const [exhaustedRunes, setExhaustedRunes] = useState(new Set()); // Set of exhausted rune field indices
  const [animatingRuneId, setAnimatingRuneId] = useState(null); // For channel animation (rune deck -> field)
  const [animatingRuneToDeck, setAnimatingRuneToDeck] = useState(null); // For recycle/top animations: { cardId, type: 'recycle' | 'top', fieldIndex }
  const [legendCardImageUrl, setLegendCardImageUrl] = useState(null);
  const [legendCardLoading, setLegendCardLoading] = useState(false);
  const [legendCardExhausted, setLegendCardExhausted] = useState(false);
  const [chosenChampionImageUrl, setChosenChampionImageUrl] = useState(null);
  const [chosenChampionLoading, setChosenChampionLoading] = useState(false);
  
  // Opponent deck state
  const OPPONENT_DECK_UUID = 'a8309e9a-4e30-413c-ac34-67df09837093';
  const [opponentDeck, setOpponentDeck] = useState(null);
  const [opponentLegendCardImageUrl, setOpponentLegendCardImageUrl] = useState(null);
  const [opponentLegendCardLoading, setOpponentLegendCardLoading] = useState(false);
  const [opponentLegendCardExhausted, setOpponentLegendCardExhausted] = useState(false);
  const [opponentChosenChampionImageUrl, setOpponentChosenChampionImageUrl] = useState(null);
  const [opponentChosenChampionLoading, setOpponentChosenChampionLoading] = useState(false);
  
  // Card back image URL
  const CARD_BACK_URL = 'https://cdn.piltoverarchive.com/Cardback.webp';
  
  // State for the currently hovered/selected card
  const [selectedCard, setSelectedCard] = useState(null);
  
  // Ref to store timeout ID for debounced card selection
  const hoverTimeoutRef = useRef(null);
  
  // Refs to track if decks have been auto-shuffled on load
  const hasShuffledMainDeckRef = useRef(false);
  const hasShuffledRuneDeckRef = useRef(false);
  
  // State to track recently animated card to keep z-index high briefly (prevents flicker)
  const [recentlyAnimatedCardId, setRecentlyAnimatedCardId] = useState(null);
  
  // Helper function to parse card ID with variant index
  const parseCardId = useCallback((cardId) => {
    if (!cardId) return { baseId: null, variantIndex: 0 };
    const match = cardId.match(/^([A-Z]+-\d+)(?:-(\d+))?$/);
    if (match) {
      return {
        baseId: match[1],
        variantIndex: match[2] ? parseInt(match[2], 10) - 1 : 0
      };
    }
    return { baseId: cardId, variantIndex: 0 };
  }, []);
  
  // Helper function to format card ID with variant index
  const formatCardId = useCallback((baseId, variantIndex = 0) => {
    if (!baseId) return null;
    return `${baseId}-${variantIndex + 1}`;
  }, []);
  
  // Helper function to get rune card ID based on color
  const getRuneCardId = useCallback((color) => {
    const colorMap = {
      "Mind": "OGN-089",
      "Order": "OGN-214",
      "Body": "OGN-126",
      "Calm": "OGN-042",
      "Chaos": "OGN-166",
      "Fury": "OGN-007"
    };
    return colorMap[color] || null;
  }, []);
  
  // Helper function to get rune color from rune card ID
  const getRuneColor = useCallback((runeId) => {
    if (!runeId || !cardsData || cardsData.length === 0) return null;
    const { baseId } = parseCardId(runeId);
    const card = cardsData.find(c => c.variantNumber === baseId);
    return card?.colors?.[0] || null;
  }, [cardsData, parseCardId]);
  
  // Helper function to get CSS color for rune color name
  const getRuneColorCSS = useCallback((colorName) => {
    if (!colorName) return "#FFFFFF";
    const colorMap = {
      "Body": "#F39C12",      // Orange
      "Mind": "#3498DB",      // Blue
      "Order": "#F1C40F",     // Yellow
      "Chaos": "#9B59B6",     // Purple
      "Fury": "#E74C3C",       // Red
      "Calm": "#2ECC71"       // Green
    };
    // Case-insensitive lookup
    const normalizedName = Object.keys(colorMap).find(
      key => key.toLowerCase() === colorName.toLowerCase()
    );
    return normalizedName ? colorMap[normalizedName] : "#FFFFFF";
  }, []);
  
  // Helper function to darken a color for exhausted state
  const darkenColor = useCallback((color) => {
    // Convert hex to RGB
    const hex = color.replace('#', '');
    const r = parseInt(hex.substr(0, 2), 16);
    const g = parseInt(hex.substr(2, 2), 16);
    const b = parseInt(hex.substr(4, 2), 16);
    
    // Darken by 60% (multiply by 0.4)
    const darkenedR = Math.floor(r * 0.4);
    const darkenedG = Math.floor(g * 0.4);
    const darkenedB = Math.floor(b * 0.4);
    
    // Convert back to hex
    return `#${darkenedR.toString(16).padStart(2, '0')}${darkenedG.toString(16).padStart(2, '0')}${darkenedB.toString(16).padStart(2, '0')}`;
  }, []);
  
  // Handle rune exhaust/awaken toggle
  const handleRuneExhaustToggle = useCallback((fieldIndex, e) => {
    if (e) {
      e.preventDefault();
      e.stopPropagation();
    }
    console.log('[Game] handleRuneExhaustToggle called for field index:', fieldIndex);
    setExhaustedRunes(prev => {
      const newSet = new Set(prev);
      if (newSet.has(fieldIndex)) {
        newSet.delete(fieldIndex);
        console.log('[Game] Rune awakened at index:', fieldIndex);
      } else {
        newSet.add(fieldIndex);
        console.log('[Game] Rune exhausted at index:', fieldIndex);
      }
      return newSet;
    });
  }, []);
  
  // Get card details from cardsData
  const getCardDetails = useCallback((cardId) => {
    if (!cardId || !cardsData || cardsData.length === 0) return null;
    const { baseId } = parseCardId(cardId);
    return cardsData.find(card => card.variantNumber === baseId);
  }, [cardsData, parseCardId]);
  
  // Debounced function to set selected card (delays selection to prevent accidental changes on quick mouse movements)
  const handleCardHover = useCallback((cardId) => {
    // Clear any pending selection
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
    
    // Only set if there's a card to select
    if (cardId) {
      // Delay selection by 150ms to allow quick mouse movements without changing selection
      hoverTimeoutRef.current = setTimeout(() => {
        setSelectedCard(cardId);
        hoverTimeoutRef.current = null;
      }, 150);
    }
  }, []);
  
  // Cancel pending card selection when mouse leaves
  const handleCardHoverCancel = useCallback(() => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);
  
  // Extract game ID from URL
  useEffect(() => {
    const path = window.location.pathname;
    const match = path.match(/^\/game\/(.+)$/);
    if (match) {
      setGameId(match[1]);
    }
  }, []);
  
  // Load preferences (for theme, profile picture, and display name)
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        const prefs = await getPreferences();
        if (prefs) {
          if (prefs.theme) {
            setIsDarkMode(prefs.theme === 'dark');
          }
          if (prefs.profilePictureCardId) {
            setUserProfileCardId(prefs.profilePictureCardId);
          }
          if (prefs.displayName) {
            setUserDisplayName(prefs.displayName);
          }
        }
      } catch (error) {
        console.error('Failed to load preferences:', error);
      }
    };
    
    loadPreferences();
  }, []);
  
  // Load preferred deck on page load
  useEffect(() => {
    const loadPreferredDeck = async () => {
      try {
        // Load preferences to get defaultDeckId
        const prefs = await getPreferences();
        const defaultDeckId = prefs?.defaultDeckId;
        
        if (!defaultDeckId) {
          console.log('[Game] No default deck ID in preferences');
          return;
        }
        
        // Load all decks
        const decks = await getDecks();
        
        // Find the preferred deck
        const preferred = decks.find(d => d.id === defaultDeckId);
        
        if (preferred) {
          console.log('[Game] Loaded preferred deck:', preferred.name, preferred.id);
          // Store the entire deck as a JSON object in memory
          setPreferredDeck(preferred);
        } else {
          console.log('[Game] Preferred deck not found:', defaultDeckId);
        }
      } catch (error) {
        console.error('[Game] Failed to load preferred deck:', error);
      }
    };
    
    loadPreferredDeck();
  }, []);
  
  // Populate rune deck when rune-related deck fields or cards data changes
  // Only depends on rune-specific fields, not mainDeck, so main deck operations don't affect rune deck
  useEffect(() => {
    if (!preferredDeck || !cardsData || cardsData.length === 0) {
      setRuneDeck([]);
      return;
    }
    
    const legendCardId = preferredDeck.cards?.legendCard;
    if (!legendCardId) {
      setRuneDeck([]);
      return;
    }
    
    const { baseId: legendBaseId } = parseCardId(legendCardId);
    const legendData = getCardDetails(legendBaseId);
    const colors = legendData?.colors || [];
    
    if (colors.length < 2) {
      setRuneDeck([]);
      return;
    }
    
    const runeACount = preferredDeck.cards?.runeACount || 0;
    const runeBCount = preferredDeck.cards?.runeBCount || 0;
    const runeAVariantIndex = preferredDeck.cards?.runeAVariantIndex || 0;
    const runeBVariantIndex = preferredDeck.cards?.runeBVariantIndex || 0;
    
    const runeABaseId = getRuneCardId(colors[0]);
    const runeBBaseId = getRuneCardId(colors[1]);
    
    if (!runeABaseId || !runeBBaseId) {
      setRuneDeck([]);
      return;
    }
    
    // Build rune deck: n copies of runeA, m copies of runeB
    const newRuneDeck = [];
    for (let i = 0; i < runeACount; i++) {
      newRuneDeck.push(formatCardId(runeABaseId, runeAVariantIndex));
    }
    for (let i = 0; i < runeBCount; i++) {
      newRuneDeck.push(formatCardId(runeBBaseId, runeBVariantIndex));
    }
    
    console.log('[Game] Populated rune deck:', {
      runeACount,
      runeBCount,
      runeAVariantIndex,
      runeBVariantIndex,
      total: newRuneDeck.length
    });
    
    setRuneDeck(newRuneDeck);
  }, [
    preferredDeck?.cards?.legendCard,
    preferredDeck?.cards?.runeACount,
    preferredDeck?.cards?.runeBCount,
    preferredDeck?.cards?.runeAVariantIndex,
    preferredDeck?.cards?.runeBVariantIndex,
    cardsData,
    parseCardId,
    getCardDetails,
    getRuneCardId,
    formatCardId
  ]);
  
  // Auto-shuffle main deck when it's first loaded (only once)
  useEffect(() => {
    const mainDeckLength = preferredDeck?.cards?.mainDeck?.length || 0;
    if (mainDeckLength > 0 && !hasShuffledMainDeckRef.current) {
      // Shuffle the deck using Fisher-Yates algorithm
      const deckCopy = [...preferredDeck.cards.mainDeck];
      for (let i = deckCopy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [deckCopy[i], deckCopy[j]] = [deckCopy[j], deckCopy[i]];
      }
      
      setPreferredDeck({
        ...preferredDeck,
        cards: {
          ...preferredDeck.cards,
          mainDeck: deckCopy
        }
      });
      
      hasShuffledMainDeckRef.current = true;
      console.log('[Game] Auto-shuffled main deck on load');
    }
  }, [preferredDeck?.cards?.mainDeck?.length]); // Only depend on length to trigger once on initial load
  
  // Auto-shuffle rune deck when it's first populated (only once)
  useEffect(() => {
    if (runeDeck.length > 0 && !hasShuffledRuneDeckRef.current) {
      // Shuffle the rune deck using Fisher-Yates algorithm
      const runeDeckCopy = [...runeDeck];
      for (let i = runeDeckCopy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [runeDeckCopy[i], runeDeckCopy[j]] = [runeDeckCopy[j], runeDeckCopy[i]];
      }
      
      setRuneDeck(runeDeckCopy);
      hasShuffledRuneDeckRef.current = true;
      console.log('[Game] Auto-shuffled rune deck on load');
    }
  }, [runeDeck.length]); // Only depend on length to trigger once when deck is first populated
  
  // Load opponent deck on page load
  useEffect(() => {
    const loadOpponentDeck = async () => {
      try {
        console.log('[Game] Loading opponent deck:', OPPONENT_DECK_UUID);
        const deck = await getDeck(OPPONENT_DECK_UUID);
        console.log('[Game] Loaded opponent deck:', deck.name, deck.id);
        // Store the entire deck as a JSON object in memory
        setOpponentDeck(deck);
      } catch (error) {
        console.error('[Game] Failed to load opponent deck:', error);
      }
    };
    
    loadOpponentDeck();
  }, []);
  
  // Load cards data
  useEffect(() => {
    const loadCardsData = async () => {
      try {
        const cards = await getCards();
        setCardsData(cards);
      } catch (error) {
        console.error('[Game] Failed to load cards data:', error);
      }
    };
    
    loadCardsData();
  }, []);
  
  // Get card image URL from card ID - memoized to prevent unnecessary recalculations
  const getCardImageUrl = useCallback((cardId) => {
    if (!cardId) return 'https://cdn.piltoverarchive.com/Cardback.webp';
    
    if (!cardsData || cardsData.length === 0) {
      // Fallback if cards haven't loaded yet
      return `https://cdn.piltoverarchive.com/cards/${cardId}.webp`;
    }
    
    const { baseId, variantIndex } = parseCardId(cardId);
    const card = cardsData.find(c => c.variantNumber === baseId);
    
    if (!card) {
      // Fallback to original cardId if card not found
      return `https://cdn.piltoverarchive.com/cards/${cardId}.webp`;
    }
    
    // Use variantImages array if available
    if (card.variantImages && card.variantImages.length > variantIndex) {
      const imageUrl = card.variantImages[variantIndex];
      if (imageUrl) {
        return imageUrl;
      }
    }
    
    // Fallback: construct URL from variantNumber
    return `https://cdn.piltoverarchive.com/cards/${card.variantNumber}.webp`;
  }, [cardsData, parseCardId]);
  
  // Memoize hand card image URLs to prevent recalculation on every render
  const handCardImageUrls = useMemo(() => {
    const urlMap = new Map();
    hand.forEach(cardId => {
      if (cardId && !urlMap.has(cardId)) {
        urlMap.set(cardId, getCardImageUrl(cardId));
      }
    });
    return urlMap;
  }, [hand, getCardImageUrl]);
  
  // Memoize discard pile card image URLs to prevent recalculation on every render
  const discardCardImageUrls = useMemo(() => {
    const urlMap = new Map();
    discardPile.forEach(cardId => {
      if (cardId && !urlMap.has(cardId)) {
        urlMap.set(cardId, getCardImageUrl(cardId));
      }
    });
    return urlMap;
  }, [discardPile, getCardImageUrl]);
  
  // Load legend card image when preferred deck or cards data changes
  useEffect(() => {
    const loadLegendCardImage = () => {
      if (!preferredDeck || !cardsData) {
        return;
      }
      
      const legendCardId = preferredDeck.cards?.legendCard;
      if (!legendCardId) {
        setLegendCardImageUrl(null);
        return;
      }
      
      try {
        setLegendCardLoading(true);
        // Get card image URL using cards data
        const { baseId, variantIndex } = parseCardId(legendCardId);
        const card = cardsData.find(c => c.variantNumber === baseId);
        
        let imageUrl;
        if (card && card.variantImages && card.variantImages.length > variantIndex) {
          imageUrl = card.variantImages[variantIndex];
        }
        
        if (!imageUrl) {
          // Fallback: construct URL from variantNumber or cardId
          imageUrl = `https://cdn.piltoverarchive.com/cards/${card?.variantNumber || legendCardId}.webp`;
        }
        
        setLegendCardImageUrl(imageUrl);
      } catch (error) {
        console.error('[Game] Failed to load legend card image:', error);
        setLegendCardImageUrl(null);
      } finally {
        setLegendCardLoading(false);
      }
    };
    
    loadLegendCardImage();
  }, [preferredDeck, cardsData]);
  
  // Load chosen champion image when preferred deck or cards data changes
  useEffect(() => {
    const loadChosenChampionImage = () => {
      if (!preferredDeck || !cardsData) {
        return;
      }
      
      const chosenChampionId = preferredDeck.cards?.chosenChampion;
      if (!chosenChampionId) {
        setChosenChampionImageUrl(null);
        return;
      }
      
      try {
        setChosenChampionLoading(true);
        // Get card image URL using cards data
        const { baseId, variantIndex } = parseCardId(chosenChampionId);
        const card = cardsData.find(c => c.variantNumber === baseId);
        
        let imageUrl;
        if (card && card.variantImages && card.variantImages.length > variantIndex) {
          imageUrl = card.variantImages[variantIndex];
        }
        
        if (!imageUrl) {
          // Fallback: construct URL from variantNumber or cardId
          imageUrl = `https://cdn.piltoverarchive.com/cards/${card?.variantNumber || chosenChampionId}.webp`;
        }
        
        setChosenChampionImageUrl(imageUrl);
      } catch (error) {
        console.error('[Game] Failed to load chosen champion image:', error);
        setChosenChampionImageUrl(null);
      } finally {
        setChosenChampionLoading(false);
      }
    };
    
    loadChosenChampionImage();
  }, [preferredDeck, cardsData]);
  
  // Load opponent legend card image when opponent deck or cards data changes
  useEffect(() => {
    const loadOpponentLegendCardImage = () => {
      if (!opponentDeck || !cardsData) {
        return;
      }
      
      const legendCardId = opponentDeck.cards?.legendCard;
      if (!legendCardId) {
        setOpponentLegendCardImageUrl(null);
        return;
      }
      
      try {
        setOpponentLegendCardLoading(true);
        // Get card image URL using cards data
        const { baseId, variantIndex } = parseCardId(legendCardId);
        const card = cardsData.find(c => c.variantNumber === baseId);
        
        let imageUrl;
        if (card && card.variantImages && card.variantImages.length > variantIndex) {
          imageUrl = card.variantImages[variantIndex];
        }
        
        if (!imageUrl) {
          // Fallback: construct URL from variantNumber or cardId
          imageUrl = `https://cdn.piltoverarchive.com/cards/${card?.variantNumber || legendCardId}.webp`;
        }
        
        setOpponentLegendCardImageUrl(imageUrl);
      } catch (error) {
        console.error('[Game] Failed to load opponent legend card image:', error);
        setOpponentLegendCardImageUrl(null);
      } finally {
        setOpponentLegendCardLoading(false);
      }
    };
    
    loadOpponentLegendCardImage();
  }, [opponentDeck, cardsData]);
  
  // Load opponent chosen champion image when opponent deck or cards data changes
  useEffect(() => {
    const loadOpponentChosenChampionImage = () => {
      if (!opponentDeck || !cardsData) {
        return;
      }
      
      const chosenChampionId = opponentDeck.cards?.chosenChampion;
      if (!chosenChampionId) {
        setOpponentChosenChampionImageUrl(null);
        return;
      }
      
      try {
        setOpponentChosenChampionLoading(true);
        // Get card image URL using cards data
        const { baseId, variantIndex } = parseCardId(chosenChampionId);
        const card = cardsData.find(c => c.variantNumber === baseId);
        
        let imageUrl;
        if (card && card.variantImages && card.variantImages.length > variantIndex) {
          imageUrl = card.variantImages[variantIndex];
        }
        
        if (!imageUrl) {
          // Fallback: construct URL from variantNumber or cardId
          imageUrl = `https://cdn.piltoverarchive.com/cards/${card?.variantNumber || chosenChampionId}.webp`;
        }
        
        setOpponentChosenChampionImageUrl(imageUrl);
      } catch (error) {
        console.error('[Game] Failed to load opponent chosen champion image:', error);
        setOpponentChosenChampionImageUrl(null);
      } finally {
        setOpponentChosenChampionLoading(false);
      }
    };
    
    loadOpponentChosenChampionImage();
  }, [opponentDeck, cardsData]);
  
  // Load user profile picture
  useEffect(() => {
    const loadUserProfilePicture = async () => {
      try {
        setUserProfilePictureLoading(true);
        const url = await getProfilePictureUrl(userProfileCardId);
        setUserProfilePictureUrl(url);
      } catch (error) {
        console.error('Failed to load user profile picture:', error);
      } finally {
        setUserProfilePictureLoading(false);
      }
    };
    
    if (userProfileCardId) {
      loadUserProfilePicture();
    }
  }, [userProfileCardId]);
  
  // Load opponent profile picture
  useEffect(() => {
    const loadOpponentProfilePicture = async () => {
      try {
        setOpponentProfilePictureLoading(true);
        const url = await getProfilePictureUrl(opponentProfileCardId);
        setOpponentProfilePictureUrl(url);
      } catch (error) {
        console.error('Failed to load opponent profile picture:', error);
      } finally {
        setOpponentProfilePictureLoading(false);
      }
    };
    
    loadOpponentProfilePicture();
  }, [opponentProfileCardId]);
  
  // Handle exit (go back to homepage)
  const handleExit = () => {
    window.location.href = '/';
  };
  
  // Handle score increment
  const handleScoreIncrement = () => {
    setUserScore(prev => prev + 1);
  };
  
  // Handle score decrement
  const handleScoreDecrement = () => {
    setUserScore(prev => Math.max(0, prev - 1));
  };
  
  // Handle chat submit
  const handleChatSubmit = (e) => {
    e.preventDefault();
    if (chatInput.trim()) {
      const newMessage = {
        id: Date.now(),
        sender: 'user',
        displayName: userDisplayName || 'Player',
        message: chatInput.trim(),
        timestamp: new Date()
      };
      setChatMessages(prev => [...prev, newMessage]);
      setChatInput('');
    }
  };
  
  // Handle deck actions
  const handleDraw = () => {
    if (!preferredDeck || !preferredDeck.cards?.mainDeck || preferredDeck.cards.mainDeck.length === 0) {
      console.log('[Game] Cannot draw: deck is empty');
      return;
    }
    
    // Remove first card from deck and add to hand
    const deckCopy = [...preferredDeck.cards.mainDeck];
    const drawnCard = deckCopy.shift();
    
    setPreferredDeck({
      ...preferredDeck,
      cards: {
        ...preferredDeck.cards,
        mainDeck: deckCopy
      }
    });
    
    setAnimatingCardId(drawnCard); // Mark card as animating
    setHand(prev => [...prev, drawnCard]);
    setHoveredHandCardIndex(null); // Reset hover state when hand changes
    
    // Clear animation flag after animation completes, and keep z-index high briefly
    setTimeout(() => {
      setAnimatingCardId(null);
      setRecentlyAnimatedCardId(drawnCard);
      // Clear the state after a brief delay to allow smooth transition
      setTimeout(() => {
        setRecentlyAnimatedCardId(null);
      }, 100);
    }, 300); // Match animation duration
    
    console.log('[Game] Drew card:', drawnCard);
  };
  
  const handleShuffle = () => {
    if (!preferredDeck || !preferredDeck.cards?.mainDeck || preferredDeck.cards.mainDeck.length === 0) {
      console.log('[Game] Cannot shuffle: deck is empty');
      return;
    }
    
    // Start shuffle animation
    setIsShufflingDeck(true);
    
    // Shuffle the deck using Fisher-Yates algorithm
    const deckCopy = [...preferredDeck.cards.mainDeck];
    for (let i = deckCopy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deckCopy[i], deckCopy[j]] = [deckCopy[j], deckCopy[i]];
    }
    
    setPreferredDeck({
      ...preferredDeck,
      cards: {
        ...preferredDeck.cards,
        mainDeck: deckCopy
      }
    });
    
    // Stop animation after duration (300ms shuffle + 200ms exit animation = 500ms total)
    setTimeout(() => {
      setIsShufflingDeck(false);
    }, 300);
    
    console.log('[Game] Shuffled deck');
  };
  
  // Shuffle rune deck using Fisher-Yates algorithm
  const handleShuffleRuneDeck = useCallback(() => {
    if (runeDeck.length === 0) {
      console.log('[Game] Cannot shuffle rune deck: deck is empty');
      return;
    }
    
    // Shuffle the rune deck using Fisher-Yates algorithm
    const runeDeckCopy = [...runeDeck];
    for (let i = runeDeckCopy.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [runeDeckCopy[i], runeDeckCopy[j]] = [runeDeckCopy[j], runeDeckCopy[i]];
    }
    
    setRuneDeck(runeDeckCopy);
    console.log('[Game] Shuffled rune deck');
  }, [runeDeck]);
  
  const handleShuffleHand = () => {
    if (hand.length === 0 || isShufflingHand) {
      console.log('[Game] Cannot shuffle: hand is empty or already shuffling');
      return;
    }
    
    // Start shuffle animation - phase 1: move to center
    setIsShufflingHand(true);
    setHoveredHandCardIndex(null); // Reset hover state
    
    // Animation sequence: move to center (0.15s), shuffle, expand back (0.15s)
    setTimeout(() => {
      // Shuffle the hand using Fisher-Yates algorithm
      const handCopy = [...hand];
      for (let i = handCopy.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [handCopy[i], handCopy[j]] = [handCopy[j], handCopy[i]];
      }
      
      // Update hand - this will trigger re-render with new positions
      setHand(handCopy);
      
      // Phase 2: expand back to new positions
      // Set isShufflingHand to false after a brief delay so cards animate from center to new positions
      setTimeout(() => {
        setIsShufflingHand(false);
        console.log('[Game] Shuffled hand');
      }, 20); // Small delay to ensure hand state update is processed
    }, 150); // Match collapse animation duration (phase 1)
    
    // Total animation duration: 150ms (collapse) + 150ms (expand) = 300ms
    // Button will be re-enabled when isShufflingHand becomes false (after ~170ms)
  };
  
  // Handle hand card actions
  const handleTopOfDeck = (cardId, handIndex) => {
    if (!preferredDeck) {
      console.log('[Game] Cannot move to top: no deck');
      return;
    }
    
    // Remove card from hand immediately
    setHand(prev => {
      const handCopy = [...prev];
      handCopy.splice(handIndex, 1);
      return handCopy;
    });
    
    // Add card to top of deck immediately
    setPreferredDeck(prev => {
      const deckCopy = [...prev.cards.mainDeck];
      deckCopy.unshift(cardId);
      return {
        ...prev,
        cards: {
          ...prev.cards,
          mainDeck: deckCopy
        }
      };
    });
    
    // Start animation - card will be rendered separately during animation
    setAnimatingToDeck({ cardId, type: 'top', handIndex });
    setHoveredHandCardIndex(null); // Reset hover state
    
    // Clear animation state after animation completes
    setTimeout(() => {
      setAnimatingToDeck(null);
      console.log('[Game] Moved card to top of deck:', cardId);
    }, 400); // Slightly longer than animation duration
  };
  
  const handleRecycle = (cardId, handIndex) => {
    if (!preferredDeck) {
      console.log('[Game] Cannot recycle: no deck');
      return;
    }
    
    // Remove card from hand immediately
    setHand(prev => {
      const handCopy = [...prev];
      handCopy.splice(handIndex, 1);
      return handCopy;
    });
    
    // Add card to bottom of deck immediately
    setPreferredDeck(prev => {
      const deckCopy = [...prev.cards.mainDeck];
      deckCopy.push(cardId);
      return {
        ...prev,
        cards: {
          ...prev.cards,
          mainDeck: deckCopy
        }
      };
    });
    
    // Start animation - card will be rendered separately during animation
    setAnimatingToDeck({ cardId, type: 'recycle', handIndex });
    setHoveredHandCardIndex(null); // Reset hover state
    
    // Clear animation state after animation completes
    setTimeout(() => {
      setAnimatingToDeck(null);
      console.log('[Game] Recycled card to bottom of deck:', cardId);
    }, 400); // Slightly longer than animation duration
  };
  
  const handleDiscard = (cardId, handIndex) => {
    // Remove card from hand immediately
    setHand(prev => {
      const handCopy = [...prev];
      handCopy.splice(handIndex, 1);
      return handCopy;
    });
    
    // Add card to end of discard pile immediately
    setDiscardPile(prev => [...prev, cardId]);
    setHoveredHandCardIndex(null); // Reset hover state
    
    // Start animation - card will be rendered separately during animation
    setAnimatingToDiscard({ cardId, handIndex });
    
    // Clear animation state after animation completes
    setTimeout(() => {
      setAnimatingToDiscard(null);
      console.log('[Game] Discarded card:', cardId);
    }, 400); // Slightly longer than animation duration
  };
  
  // Handle rune channeling (draw from rune deck to field)
  const handleChannelRune = (channelNumber) => {
    if (runeDeck.length === 0) {
      console.log('[Game] Cannot channel: rune deck is empty');
      return;
    }
    
    // Check if field has space (max 12 runes)
    const availableSlots = 12 - runeField.length;
    if (availableSlots === 0) {
      console.log('[Game] Cannot channel: rune field is full');
      return;
    }
    
    // Channel the requested number of runes (up to available slots)
    const runesToChannel = Math.min(channelNumber, runeDeck.length, availableSlots);
    
    // Remove runes from deck
    const runeDeckCopy = [...runeDeck];
    const channeledRunes = [];
    for (let i = 0; i < runesToChannel; i++) {
      const rune = runeDeckCopy.shift();
      channeledRunes.push(rune);
    }
    
    setRuneDeck(runeDeckCopy);
    
    // Add to end of field immediately (compact array, no nulls)
    setRuneField(prev => {
      const fieldCopy = [...prev, ...channeledRunes];
      return fieldCopy;
    });
    
    // Start animation for the first rune (or handle multiple animations)
    if (channeledRunes.length > 0) {
      // Calculate field index for animation (where the rune will be placed)
      const startIndex = runeField.length;
      setAnimatingRuneId({ runeId: channeledRunes[0], fieldIndex: startIndex });
      
      // If channeling 2, animate the second rune after a short delay
      if (channeledRunes.length > 1) {
        setTimeout(() => {
          setAnimatingRuneId({ runeId: channeledRunes[1], fieldIndex: startIndex + 1 });
          setTimeout(() => {
            setAnimatingRuneId(null);
          }, 400);
        }, 200); // Start second animation 200ms after first
      } else {
        // Clear animation state after animation completes
        setTimeout(() => {
          setAnimatingRuneId(null);
        }, 400);
      }
      
      console.log('[Game] Channeled', runesToChannel, 'rune(s) to field');
    }
  };
  
  // Handle rune field actions (recycle and to top of deck)
  const handleRuneTopOfDeck = (runeId, fieldIndex) => {
    if (runeDeck.length >= 12) {
      console.log('[Game] Cannot move to top: rune deck is full');
      return;
    }
    
    // Remove from field immediately and shift others left (compact array)
    setRuneField(prev => {
      const fieldCopy = [...prev];
      fieldCopy.splice(fieldIndex, 1); // Remove at index and shift left
      return fieldCopy;
    });
    
    // Shift exhausted indices: remove the exhausted state at this index, and decrement all indices > fieldIndex
    setExhaustedRunes(prev => {
      const newSet = new Set();
      prev.forEach(index => {
        if (index < fieldIndex) {
          // Keep indices before the removed one unchanged
          newSet.add(index);
        } else if (index > fieldIndex) {
          // Decrement indices after the removed one
          newSet.add(index - 1);
        }
        // Skip the removed index (don't add it to the new set)
      });
      return newSet;
    });
    
    // Add to top of rune deck immediately
    setRuneDeck(prev => [runeId, ...prev]);
    
    // Start animation
    setAnimatingRuneToDeck({ runeId, type: 'top', fieldIndex });
    
    // Clear animation state after animation completes
    setTimeout(() => {
      setAnimatingRuneToDeck(null);
      console.log('[Game] Moved rune to top of deck:', runeId);
    }, 400);
  };
  
  const handleRuneRecycle = (runeId, fieldIndex) => {
    if (runeDeck.length >= 12) {
      console.log('[Game] Cannot recycle: rune deck is full');
      return;
    }
    
    // Remove from field immediately and shift others left (compact array)
    setRuneField(prev => {
      const fieldCopy = [...prev];
      fieldCopy.splice(fieldIndex, 1); // Remove at index and shift left
      return fieldCopy;
    });
    
    // Shift exhausted indices: remove the exhausted state at this index, and decrement all indices > fieldIndex
    setExhaustedRunes(prev => {
      const newSet = new Set();
      prev.forEach(index => {
        if (index < fieldIndex) {
          // Keep indices before the removed one unchanged
          newSet.add(index);
        } else if (index > fieldIndex) {
          // Decrement indices after the removed one
          newSet.add(index - 1);
        }
        // Skip the removed index (don't add it to the new set)
      });
      return newSet;
    });
    
    // Add to bottom of rune deck immediately
    setRuneDeck(prev => [...prev, runeId]);
    
    // Start animation
    setAnimatingRuneToDeck({ runeId, type: 'recycle', fieldIndex });
    
    // Clear animation state after animation completes
    setTimeout(() => {
      setAnimatingRuneToDeck(null);
      console.log('[Game] Recycled rune to bottom of deck:', runeId);
    }, 400);
  };
  
  // Handle card actions
  const handleViewCard = (cardType) => {
    console.log(`[Game] View ${cardType}`);
    // TODO: Implement view card details logic
  };
  
  // Handle legend card exhaust/awaken
  const handleLegendCardExhaust = () => {
    setLegendCardExhausted(true);
    console.log('[Game] Legend card exhausted');
  };
  
  const handleLegendCardAwaken = () => {
    setLegendCardExhausted(false);
    console.log('[Game] Legend card awakened');
  };
  
  // Handle opponent legend card exhaust/awaken
  const handleOpponentLegendCardExhaust = () => {
    setOpponentLegendCardExhausted(true);
    console.log('[Game] Opponent legend card exhausted');
  };
  
  const handleOpponentLegendCardAwaken = () => {
    setOpponentLegendCardExhausted(false);
    console.log('[Game] Opponent legend card awakened');
  };
  
  return (
    <>
      <LayoutContainer isDarkMode={isDarkMode}>
        {/* Content is sized in pixels based on 1920x1080 reference */}
        <div className={`relative w-[1920px] h-[1080px] flex ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
          {/* Left Sidebar - 20% (384px) */}
          <div className={`relative w-[384px] h-full border-r-2 flex flex-col px-4 py-4 overflow-y-auto z-[2000] ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-blue-50 border-gray-300'}`}>
            {/* Card Image - fixed size to prevent changes */}
            <div className="w-full flex-shrink-0 mb-2" style={{ aspectRatio: '515/719' }}>
              <img 
                src={getCardImageUrl(selectedCard)}
                alt={`Card ${selectedCard}`}
                className="w-full h-full object-contain"
              />
            </div>
            
            {/* Bottom section: text and buttons split 40/60 */}
            <div className="flex-1 flex flex-col gap-2 min-h-0">
              {/* Card Text Box - takes 40%, scrollable */}
              <div className={`flex-[0.4] border-2 rounded p-3 overflow-y-auto min-h-0 ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-400'}`}>
                <div className={`text-[18px] leading-relaxed font-serif ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                  {(() => {
                    if (!selectedCard) {
                      return (
                        <p className="mb-3 text-[16px] text-gray-500 italic">No card selected</p>
                      );
                    }
                    const cardInfo = getCardDetails(selectedCard);
                    if (!cardInfo) {
                      return (
                        <>
                          <p className="mb-2 font-bold">{selectedCard}</p>
                          <p className="mb-3 text-[16px] text-gray-500 italic">Card not found in database</p>
                        </>
                      );
                    }
                    return (
                      <>
                        <p className="mb-2 font-bold">{cardInfo.name}</p>
                        <p className="mb-3 text-[16px]">
                          {cardInfo.type} • Energy: {cardInfo.energy} • Power: {cardInfo.power}
                          {cardInfo.might > 0 && ` • Might: ${cardInfo.might}`}
                        </p>
                        {cardInfo.colors && cardInfo.colors.length > 0 && (
                          <p className="mb-2 text-[16px]">Colors: {cardInfo.colors.join(', ')}</p>
                        )}
                        {cardInfo.tags && cardInfo.tags.length > 0 && (
                          <p className="mb-2 text-[16px]">Tags: {cardInfo.tags.join(', ')}</p>
                        )}
                        {cardInfo.description && (
                          <>
                            <p className="mb-2 text-[16px] font-semibold">Description:</p>
                            <p className="mb-3 text-[16px] whitespace-pre-wrap leading-relaxed">{cardInfo.description}</p>
                          </>
                        )}
                        <p className="mb-2 text-[10px] text-gray-500">ID: {cardInfo.variantNumber}</p>
                      </>
                    );
                  })()}
                </div>
              </div>
              
              {/* Game ID Section */}
              <div className={`p-4 border-2 rounded ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-400'}`}>
                <h3 className={`text-base font-bold mb-3 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Game ID
                </h3>
                <div className={`p-3 rounded border ${isDarkMode ? 'bg-gray-600 border-gray-500' : 'bg-gray-100 border-gray-300'}`}>
                  <p className={`text-sm font-mono break-all ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                    {gameId || 'Loading...'}
                  </p>
                </div>
              </div>
              
              {/* Controls Section */}
              <div className={`p-4 border-2 rounded ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-400'}`}>
                <h3 className={`text-base font-bold mb-3 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Controls
                </h3>
                <div className="flex flex-col gap-2">
                  <button
                    onClick={handleExit}
                    className={`py-2 px-3 rounded text-sm font-medium bg-gray-600 text-white shadow-md hover:bg-gray-700 active:bg-gray-800 transition-colors`}
                  >
                    Exit Game
                  </button>
                </div>
              </div>
            </div>
          </div>
          
          {/* Main Content Area - 60% (1152px) */}
          <div className={`relative flex-1 h-full flex flex-col min-h-0 ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
            {/* Game Board */}
            
            {/* Player Rune Zone - Same width as hand, fits 1/4th card height */}
            {/* Card at 1/4th: 37.5px wide, height = 37.5 * 719/515 ≈ 52.4px */}
            {/* Equal padding on all sides: 5px, so zone height = 52.4 + 10 = 62.4px (round to 62px) */}
            {/* Position: 10px above hand zone (hand is 209.375px, so marginBottom = 209.375px + 10px = 219.375px) */}
            <div className="absolute bottom-4" style={{ left: '176px', width: '800px', marginBottom: '219.375px', zIndex: 200 }}>
              <div 
                className={`relative rounded border-2 ${isDarkMode ? 'border-gray-700 border-dashed' : 'border-gray-400 border-dashed'}`}
                style={{ 
                  width: '100%',
                  height: '62px',
                  backgroundColor: isDarkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(209, 213, 219, 0.2)'
                }}
              >
                {/* Rune deck zone - always visible like rune field zones */}
                <div className="absolute top-1/2 -translate-y-1/2" style={{ left: '5px', width: '37.5px', height: '52.4px', zIndex: 1 }}>
                  <div
                    className={`rounded border border-dashed ${isDarkMode ? 'border-gray-600' : 'border-gray-400'}`}
                    style={{ 
                      width: '37.5px',
                      height: '52.4px',
                      backgroundColor: isDarkMode ? 'rgba(75, 85, 99, 0.1)' : 'rgba(209, 213, 219, 0.1)'
                    }}
                  />
                </div>
                
                {/* Miniature card back on left with equal padding - context menu for channeling */}
                <div className="absolute top-1/2 -translate-y-1/2" style={{ left: '5px', width: '37.5px', zIndex: 9999 }}>
                  <ContextMenu
                    items={runeDeck.length > 0 ? [
                      { label: 'Channel', onClick: () => handleChannelRune(1) }
                    ] : []}
                    isDarkMode={isDarkMode}
                    className="rune-deck-context-menu"
                  >
                      <div 
                        className="relative cursor-pointer" 
                        style={{ width: '37.5px' }}
                        onClick={(e) => {
                          // Only trigger if clicking directly on the deck/bubble, not on context menu button
                          const target = e.target;
                          // Check if click is on a button (context menu items are buttons)
                          if (target.tagName === 'BUTTON' || target.closest('button')) {
                            return; // Don't trigger channel when clicking context menu
                          }
                          if (runeDeck.length > 0) {
                            e.stopPropagation();
                            handleChannelRune(1);
                          }
                        }}
                      >
                        {runeDeck.length > 0 && (
                          <img
                            src={CARD_BACK_URL}
                            alt="Rune Card Back"
                            className="w-full object-cover rounded"
                            style={{ 
                              width: '37.5px',
                              aspectRatio: '515/719',
                              willChange: 'auto',
                              backfaceVisibility: 'hidden'
                            }}
                          />
                        )}
                        {/* Rune deck count bubble - centered over the rune deck */}
                        <div className={`absolute px-2 py-1 rounded-full border-2 flex items-center justify-center ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-400'}`} style={{
                          left: '50%',
                          top: '50%',
                          transform: 'translate(-50%, -50%)',
                          pointerEvents: 'none'
                        }}>
                          <span className={`text-xs font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                            {runeDeck.length}
                          </span>
                        </div>
                      </div>
                    </ContextMenu>
                  </div>
                
                {/* 12 mini card zones for runes on field - between deck and count bubble */}
                {/* Deck is at left: 5px, width: 37.5px, so runes start at 5 + 37.5 + 10 = 50.5px */}
                {/* Count bubble is on right (approx 60px), so available width: 800 - 50.5 - 60 = 689.5px */}
                {/* 12 runes at 37.5px each = 450px, remaining 239.5px for 11 gaps = ~21.8px per gap */}
                {/* Center the runes in the available space */}
                <div className="absolute top-1/2 -translate-y-1/2" style={{ left: '50.5px', right: '60px', display: 'flex', gap: '16px', justifyContent: 'center', alignItems: 'center' }}>
                  {Array.from({ length: 12 }, (_, index) => {
                    const runeId = runeField[index];
                    return (
                      <div
                        key={runeId ? `rune-${runeId}-${index}` : `empty-${index}`}
                        className="relative"
                        style={{ 
                          width: '37.5px', 
                          height: '52.4px',
                          flexShrink: 0,
                          transform: 'translateZ(0)',
                          WebkitTransform: 'translateZ(0)',
                          isolation: 'isolate'
                        }}
                      >
                        {runeId ? (() => {
                          const runeColorName = getRuneColor(runeId);
                          const runeColorCSS = getRuneColorCSS(runeColorName);
                          const isExhausted = exhaustedRunes.has(index);
                          // Border uses darkened color when exhausted, but glow keeps original color so we can see what color it is
                          const borderColor = isExhausted ? darkenColor(runeColorCSS) : runeColorCSS;
                          const glowColor = runeColorCSS; // Always use original color for glow (not darkened, stays colored even when exhausted)
                          const glowIntensity = isExhausted ? '2px' : '3px'; // Slightly dimmed when exhausted but still visible
                          const glowSpread = isExhausted ? '4px' : '6px'; // Slightly dimmed when exhausted but still visible
                          return (
                            <div
                              onClick={(e) => {
                                // Only handle left clicks, not right clicks
                                e.preventDefault();
                                e.stopPropagation();
                                console.log('[Game] Rune wrapper onClick fired for index:', index);
                                handleRuneExhaustToggle(index, e);
                              }}
                              style={{ display: 'contents' }}
                            >
                              <ContextMenu
                                items={[
                                  { label: 'Top of Deck', onClick: () => handleRuneTopOfDeck(runeId, index) },
                                  { label: 'Recycle', onClick: () => handleRuneRecycle(runeId, index) }
                                ]}
                                isDarkMode={isDarkMode}
                                className="rune-field-context-menu"
                              >
                                <div
                                  className="rounded cursor-pointer overflow-hidden"
                                  style={{
                                    width: '37.5px',
                                    height: '52.4px',
                                    borderColor: borderColor,
                                    borderWidth: '1px',
                                    borderStyle: 'solid',
                                    boxShadow: `0 0 ${glowIntensity} ${glowColor}, 0 0 ${glowSpread} ${glowColor}`,
                                    transform: isExhausted ? 'translateZ(0) rotate(10deg)' : 'translateZ(0) rotate(0deg)',
                                    WebkitTransform: isExhausted ? 'translateZ(0) rotate(10deg)' : 'translateZ(0) rotate(0deg)',
                                    transition: 'box-shadow 0.2s ease, border-color 0.2s ease, transform 0.2s ease',
                                    willChange: 'auto',
                                    backfaceVisibility: 'hidden'
                                  }}
                                >
                                  <img
                                    src={getCardImageUrl(runeId)}
                                    alt={`Rune ${runeId}`}
                                    className="object-cover w-full h-full"
                                    style={{ 
                                      filter: isExhausted ? 'grayscale(1)' : 'grayscale(0)',
                                      transition: 'filter 0.2s ease',
                                      willChange: 'auto',
                                      backfaceVisibility: 'hidden',
                                      imageRendering: 'auto',
                                      WebkitFontSmoothing: 'antialiased',
                                      MozOsxFontSmoothing: 'grayscale'
                                    }}
                                    onMouseEnter={() => handleCardHover(runeId)}
                                    onMouseLeave={handleCardHoverCancel}
                                  />
                                </div>
                              </ContextMenu>
                            </div>
                          );
                        })() : (
                          <div
                            className={`rounded border border-dashed ${isDarkMode ? 'border-gray-600' : 'border-gray-400'}`}
                            style={{ 
                              width: '37.5px',
                              height: '52.4px',
                              backgroundColor: isDarkMode ? 'rgba(75, 85, 99, 0.1)' : 'rgba(209, 213, 219, 0.1)'
                            }}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
                
                {/* Rune count bubble on right - shows how many runes are on the field */}
                <div className="absolute right-2 top-1/2 -translate-y-1/2">
                  <ContextMenu
                    items={(() => {
                      if (runeField.length === 0) return [];
                      
                      const items = [];
                      
                      // Count unexhausted and exhausted runes
                      const unexhaustedCount = runeField.length - exhaustedRunes.size;
                      const exhaustedCount = exhaustedRunes.size;
                      
                      // Add Awaken options (highest first) - up to number of tapped runes
                      if (exhaustedCount > 0) {
                        const awakenItems = Array.from({ length: exhaustedCount }, (_, i) => {
                          const awakenCount = exhaustedCount - i; // Highest first (Awaken 5, Awaken 4, etc.)
                          return {
                            label: `Awaken ${awakenCount} ✅`,
                            onClick: () => {
                              // Awaken N exhausted runes starting from the left
                              setExhaustedRunes(prev => {
                                const newSet = new Set(prev);
                                let awakened = 0;
                                
                                // Find exhausted runes from left to right and awaken them
                                for (let index = 0; index < runeField.length && awakened < awakenCount; index++) {
                                  if (newSet.has(index)) {
                                    newSet.delete(index);
                                    awakened++;
                                  }
                                }
                                
                                console.log(`[Game] Awakened ${awakenCount} runes starting from left`);
                                return newSet;
                              });
                            }
                          };
                        });
                        items.push(...awakenItems);
                      }
                      
                      // Add divider between Awaken and Exhaust options if both exist
                      if (exhaustedCount > 0 && unexhaustedCount > 0) {
                        items.push({ divider: true });
                      }
                      
                      // Add Exhaust options (highest first) - up to number of untapped runes
                      if (unexhaustedCount > 0) {
                        const exhaustItems = Array.from({ length: unexhaustedCount }, (_, i) => {
                          const exhaustCount = unexhaustedCount - i; // Highest first (Exhaust 5, Exhaust 4, etc.)
                          return {
                            label: `Exhaust ${exhaustCount} ❌`,
                            onClick: () => {
                              // Exhaust N unexhausted runes starting from the left
                              setExhaustedRunes(prev => {
                                const newSet = new Set(prev);
                                let exhausted = 0;
                                
                                // Find unexhausted runes from left to right and exhaust them
                                for (let index = 0; index < runeField.length && exhausted < exhaustCount; index++) {
                                  if (!newSet.has(index)) {
                                    newSet.add(index);
                                    exhausted++;
                                  }
                                }
                                
                                console.log(`[Game] Exhausted ${exhaustCount} runes starting from left`);
                                return newSet;
                              });
                            }
                          };
                        });
                        items.push(...exhaustItems);
                      }
                      
                      return items;
                    })()}
                    isDarkMode={isDarkMode}
                    className="rune-count-context-menu"
                  >
                    <div className={`px-2 py-1 rounded-full border-2 flex items-center justify-center ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-400'}`}>
                      <span className={`text-sm font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                        {runeField.length - exhaustedRunes.size}/{runeField.length}
                      </span>
                    </div>
                  </ContextMenu>
                </div>
              </div>
            </div>
            
            {/* Animating Rune (channeling from deck to field) */}
            {animatingRuneId && (() => {
              const runeId = animatingRuneId.runeId;
              const fieldIndex = animatingRuneId.fieldIndex;
              const runeImageUrl = getCardImageUrl(runeId);
              const runeWidth = 37.5;
              const runeHeight = runeWidth * (719 / 515);
              
              // Rune deck position (left: 5px, centered vertically in 62px zone)
              const deckLeft = 5;
              const deckBottom = (62 - runeHeight) / 2;
              
              // Field position - calculate based on available space
              // Deck is at left: 5px, width: 37.5px, so runes start at 50.5px
              // Count bubble is on right (approx 60px), so available width is 800 - 50.5 - 60 = 689.5px
              // 12 runes at 37.5px = 450px, remaining 239.5px for 11 gaps = ~21.8px per gap
              // Center the runes: start position = 50.5 + (689.5 - 450) / 2 = 50.5 + 119.75 = 170.25px
              const gapSize = 16; // Gap between runes
              const availableWidth = 800 - 50.5 - 60; // Total width minus deck and bubble space
              const totalRuneWidth = 12 * 37.5;
              const totalGapWidth = 11 * gapSize;
              const startLeft = 50.5 + (availableWidth - totalRuneWidth - totalGapWidth) / 2;
              const fieldLeft = startLeft + fieldIndex * (37.5 + gapSize);
              const fieldBottom = (62 - runeHeight) / 2;
              
              return (
                <div 
                  className="absolute bottom-4 z-25" 
                  style={{ 
                    left: '176px', 
                    width: '800px',
                    height: '62px',
                    marginBottom: '219.375px',
                    pointerEvents: 'none'
                  }}
                >
                  <motion.div
                    className="absolute"
                    style={{
                      left: `${deckLeft}px`,
                      bottom: `${deckBottom}px`,
                      width: `${runeWidth}px`,
                      zIndex: 1
                    }}
                    initial={{
                      left: `${deckLeft}px`,
                      bottom: `${deckBottom}px`,
                      y: 0
                    }}
                    animate={{
                      left: `${fieldLeft}px`,
                      bottom: `${fieldBottom}px`,
                      y: 0
                    }}
                    transition={{
                      duration: 0.3,
                      ease: [0.4, 0, 0.2, 1]
                    }}
                  >
                    <div style={{ perspective: '1000px', width: '100%', height: runeHeight, position: 'relative' }}>
                      <motion.div
                        style={{
                          width: '100%',
                          height: '100%',
                          position: 'relative',
                          transformStyle: 'preserve-3d'
                        }}
                        animate={{
                          rotateY: [0, 180]
                        }}
                        transition={{
                          duration: 0.3,
                          ease: [0.4, 0, 0.2, 1],
                          times: [0, 1]
                        }}
                      >
                        {/* Card back - front face (visible at start) */}
                        <motion.div
                          style={{
                            position: 'absolute',
                            width: '100%',
                            height: '100%',
                            backfaceVisibility: 'hidden',
                            WebkitBackfaceVisibility: 'hidden',
                            transform: 'rotateY(0deg)',
                            top: 0,
                            left: 0
                          }}
                        >
                          <img
                            src={CARD_BACK_URL}
                            alt="Rune Card Back"
                            className="w-full h-full object-cover rounded border"
                            style={{ 
                              aspectRatio: '515/719',
                              borderColor: isDarkMode ? '#4B5563' : '#D1D5DB',
                              borderWidth: '1px'
                            }}
                          />
                        </motion.div>
                        
                        {/* Actual rune - back face (visible at end) */}
                        <motion.div
                          style={{
                            width: '100%',
                            height: '100%',
                            backfaceVisibility: 'hidden',
                            WebkitBackfaceVisibility: 'hidden',
                            transform: 'rotateY(180deg)',
                            position: 'absolute',
                            top: 0,
                            left: 0
                          }}
                        >
                          <img
                            src={runeImageUrl}
                            alt={`Rune ${runeId}`}
                            className="w-full h-full object-cover rounded border"
                            style={{ 
                              aspectRatio: '515/719',
                              borderColor: isDarkMode ? '#4B5563' : '#D1D5DB',
                              borderWidth: '1px'
                            }}
                          />
                        </motion.div>
                      </motion.div>
                    </div>
                  </motion.div>
                </div>
              );
            })()}
            
            {/* Animating Rune (to deck) */}
            {animatingRuneToDeck && (() => {
              const runeId = animatingRuneToDeck.runeId;
              const fieldIndex = animatingRuneToDeck.fieldIndex;
              const runeImageUrl = getCardImageUrl(runeId);
              const runeWidth = 37.5;
              const runeHeight = runeWidth * (719 / 515);
              
              // Field position - calculate based on available space
              // Deck is at left: 5px, width: 37.5px, so runes start at 50.5px
              // Count bubble is on right (approx 60px), so available width is 800 - 50.5 - 60 = 689.5px
              // 12 runes at 37.5px = 450px, remaining 239.5px for 11 gaps = ~21.8px per gap
              // Center the runes: start position = 50.5 + (689.5 - 450) / 2 = 50.5 + 119.75 = 170.25px
              const gapSize = 16; // Gap between runes
              const availableWidth = 800 - 50.5 - 60; // Total width minus deck and bubble space
              const totalRuneWidth = 12 * 37.5;
              const totalGapWidth = 11 * gapSize;
              const startLeft = 50.5 + (availableWidth - totalRuneWidth - totalGapWidth) / 2;
              const fieldLeft = startLeft + fieldIndex * (37.5 + gapSize);
              const fieldBottom = (62 - runeHeight) / 2;
              
              // Rune deck position (left: 5px, centered vertically)
              const deckLeft = 5;
              const deckBottom = (62 - runeHeight) / 2;
              
              const containerZIndex = animatingRuneToDeck.type === 'top' ? 25 : 20;
              
              return (
                <div 
                  className="absolute bottom-4 z-25" 
                  style={{ 
                    left: '176px', 
                    width: '800px',
                    height: '62px',
                    marginBottom: '219.375px',
                    pointerEvents: 'none',
                    zIndex: containerZIndex
                  }}
                >
                  <motion.div
                    className="absolute"
                    style={{
                      left: `${fieldLeft}px`,
                      bottom: `${fieldBottom}px`,
                      width: `${runeWidth}px`,
                      zIndex: 1
                    }}
                    initial={{
                      left: `${fieldLeft}px`,
                      bottom: `${fieldBottom}px`,
                      y: 0
                    }}
                    animate={{
                      left: `${deckLeft}px`,
                      bottom: `${deckBottom}px`,
                      y: 0
                    }}
                    transition={{
                      duration: 0.3,
                      ease: [0.4, 0, 0.2, 1]
                    }}
                  >
                    <div style={{ perspective: '1000px', width: '100%', height: runeHeight, position: 'relative' }}>
                      <motion.div
                        style={{
                          width: '100%',
                          height: '100%',
                          position: 'relative',
                          transformStyle: 'preserve-3d'
                        }}
                        animate={{
                          rotateY: [0, 180]
                        }}
                        transition={{
                          duration: 0.3,
                          ease: [0.4, 0, 0.2, 1],
                          times: [0, 1]
                        }}
                      >
                        {/* Card back - back face (visible at end) */}
                        <motion.div
                          style={{
                            position: 'absolute',
                            width: '100%',
                            height: '100%',
                            backfaceVisibility: 'hidden',
                            WebkitBackfaceVisibility: 'hidden',
                            transform: 'rotateY(180deg)',
                            top: 0,
                            left: 0
                          }}
                        >
                          <img
                            src={CARD_BACK_URL}
                            alt="Rune Card Back"
                            className="w-full h-full object-cover rounded border"
                            style={{ 
                              aspectRatio: '515/719',
                              borderColor: isDarkMode ? '#4B5563' : '#D1D5DB',
                              borderWidth: '1px'
                            }}
                          />
                        </motion.div>
                        
                        {/* Actual rune - front face (visible at start) */}
                        <motion.div
                          style={{
                            width: '100%',
                            height: '100%',
                            backfaceVisibility: 'hidden',
                            WebkitBackfaceVisibility: 'hidden',
                            transform: 'rotateY(0deg)',
                            position: 'absolute',
                            top: 0,
                            left: 0
                          }}
                        >
                          <img
                            src={runeImageUrl}
                            alt={`Rune ${runeId}`}
                            className="w-full h-full object-cover rounded border"
                            style={{ 
                              aspectRatio: '515/719',
                              borderColor: isDarkMode ? '#4B5563' : '#D1D5DB',
                              borderWidth: '1px'
                            }}
                          />
                        </motion.div>
                      </motion.div>
                    </div>
                  </motion.div>
                </div>
              );
            })()}
            
            {/* Player Hand Zone - Between champion and deck, bottom */}
            {/* Equal padding: champion (150px) + 10px padding + hand zone + 10px padding + deck (150px) = 1120px */}
            {/* handWidth = 1120 - 300 - 20 = 800px, left = 16 + 150 + 10 = 176px */}
            <div className="absolute bottom-4 z-5" style={{ left: '176px', width: '800px' }}>
              <div 
                className={`rounded border-2 ${isDarkMode ? 'border-gray-700 border-dashed' : 'border-gray-400 border-dashed'}`}
                style={{ 
                  width: '100%',
                  height: '209.375px',
                  backgroundColor: isDarkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(209, 213, 219, 0.2)'
                }}
              ></div>
            </div>
            
            {/* Player Hand Cards - Centered with dynamic overlap */}
            {hand.length > 0 && (
              <div 
                className="absolute bottom-4" 
                style={{ 
                  left: '176px', 
                  width: '800px',
                  height: '209.375px',
                  zIndex: 300 // Above rune zone (z-200) so context menus appear on top
                }}
              >
                {(() => {
                  const cardWidth = 140; // Same as deck cards
                  const handZoneWidth = 800;
                  const minOverlap = 10; // Minimum overlap in pixels
                  const preferredOverlap = cardWidth / 3; // Preferred 1/3 overlap
                  const zonePadding = 8; // Padding on left/right to match spacing
                  
                  // Available width after accounting for padding on both sides
                  const availableWidth = handZoneWidth - (zonePadding * 2);
                  
                  // Calculate total width with preferred overlap
                  let overlap = preferredOverlap;
                  let totalWidth = cardWidth + (hand.length - 1) * (cardWidth - overlap);
                  
                  // If cards would overflow available width, reduce overlap to fit with padding
                  if (totalWidth > availableWidth && hand.length > 1) {
                    // Calculate required overlap to fit: totalWidth = cardWidth + (n-1) * (cardWidth - overlap)
                    // Solving for overlap: overlap = (hand.length * cardWidth - availableWidth) / (hand.length - 1)
                    overlap = Math.max(
                      minOverlap,
                      (hand.length * cardWidth - availableWidth) / (hand.length - 1)
                    );
                    totalWidth = cardWidth + (hand.length - 1) * (cardWidth - overlap);
                  }
                  
                  // Center the group with padding on both sides
                  const startX = zonePadding + (availableWidth - totalWidth) / 2;
                  
                  return hand.map((cardId, index) => {
                    // Use cached image URL to prevent recalculation
                    const cardImageUrl = handCardImageUrls.get(cardId) || getCardImageUrl(cardId);
                    const offset = index * (cardWidth - overlap);
                    // Only consider hovered if index is valid
                    const isHovered = hoveredHandCardIndex !== null && hoveredHandCardIndex === index && hoveredHandCardIndex < hand.length;
                    // Keep z-index at original index so cards behind can still be hovered
                    const zIndex = index;
                    const isAnimating = animatingCardId === cardId && index === hand.length - 1; // Only animate the last card if it's the one being drawn
                    
                    // Calculate positions using left and bottom consistently
                    const cardHeight = cardWidth * (719 / 515); // Calculate card height from aspect ratio
                    const containerHeight = 209.375; // Hand zone container height
                    
                    // Hand position: cards are positioned relative to the hand container
                    // Container is at left: 176px, bottom: 16px, height: 209.375px
                    // Cards should be centered vertically in the container
                    const handLeft = startX + offset;
                    // Center cards vertically: (container height - card height) / 2
                    const handBottom = (containerHeight - cardHeight) / 2;
                    
                    // Center of hand zone for shuffle animation
                    const handZoneCenterX = 400; // Half of 800px hand zone width
                    
                    // Deck position relative to hand container for animation
                    // Both containers are absolutely positioned within the main content area (1152px wide, 60% of 1920px)
                    // Layout: Left sidebar (384px) + Main content (1152px) + Right sidebar (384px) = 1920px
                    // Deck outer container: right: 16px, bottom: 96px, padding: 5px
                    // Deck inner container: width: 140px, height: 195.5px
                    // Hand container: left: 176px, bottom: 16px
                    // Card: width: 140px, height: 195.5px, positioned at left: 5px, top: 5px relative to outer container
                    const mainContentWidth = 1152; // Main content area width (60% of 1920px)
                    
                    // Calculate deck card center position for animation start
                    // Deck outer container right edge: 1152 - 16 = 1136px
                    // Deck outer container width: 140px (inner) + 5px*2 (padding) = 150px
                    // Deck outer container left edge: 1136 - 150 = 986px
                    // Card left edge (absolute within main content): 986 + 5 = 991px
                    // Card center (absolute): 991 + 70 = 1061px (70px is half of 140px card width)
                    // We want animating card's center to align with deck card's center
                    // Animating card's left edge = center - half card width = 1061 - 70 = 991px
                    // Relative to hand container: 991 - 176 = 815px
                    const deckCardCenterAbsolute = (mainContentWidth - 16 - 150) + 5 + 70; // Center of deck card
                    const deckCardLeftRelative = deckCardCenterAbsolute - 70 - 176; // Left edge relative to hand container
                    
                    // Calculate deck card bottom position
                    // Deck outer container bottom: 96px from parent bottom
                    // Card fills inner container (195.5px high) with 5px padding from outer top
                    // Card bottom relative to outer container: 5px (padding) + 195.5px (height) = 200.5px from outer top
                    // Outer container height: 195.5px + 5px*2 = 205.5px
                    // Card bottom from outer bottom: 205.5 - 200.5 = 5px
                    // Card bottom from parent bottom: 96 + 5 = 101px
                    // Relative to hand container (bottom: 16px): 101 - 16 = 85px
                    const deckCardBottomRelative = 96 + 5 - 16;
                    
                    const deckLeftRelative = deckCardLeftRelative;
                    const deckBottomRelative = deckCardBottomRelative;
                    
                    // Determine animation state - keep positions stable, only change transform for hover
                    let animateProps;
                    if (isAnimating) {
                      // Card being drawn from deck
                      animateProps = {
                        left: `${handLeft}px`,
                        bottom: `${handBottom}px`,
                        y: 0,
                      };
                    } else if (isShufflingHand) {
                      // Shuffle animation phase 1: move to center
                      animateProps = {
                        left: `${handZoneCenterX - cardWidth / 2}px`,
                        bottom: `${handBottom}px`,
                        y: 0,
                      };
                    } else {
                      // Normal state: keep position stable, only animate y transform for hover
                      animateProps = {
                        left: `${handLeft}px`,
                        bottom: `${handBottom}px`,
                        y: isHovered ? -10 : 0,
                      };
                    }
                    
                    return (
                      <motion.div
                        key={`${cardId}-${index}`}
                        layout
                        className="absolute"
                        style={{
                          left: `${handLeft}px`,
                          bottom: `${handBottom}px`,
                          width: `${cardWidth}px`,
                          zIndex: (isAnimating || isShufflingHand || recentlyAnimatedCardId === cardId) ? 1000 : zIndex, // Keep original z-index order, high during and briefly after animation
                        }}
                        initial={isAnimating ? {
                          left: `${deckLeftRelative}px`,
                          bottom: `${deckBottomRelative}px`,
                          y: 0,
                        } : false}
                        animate={animateProps}
                        transition={
                          isAnimating ? {
                            duration: 0.3,
                            ease: [0.4, 0, 0.2, 1]
                          } : isShufflingHand ? {
                            duration: 0.15,
                            ease: [0.4, 0, 0.2, 1]
                          } : {
                            duration: 0.2,
                            ease: 'easeOut',
                            // Smoothly animate position changes when hand size changes
                            layout: {
                              duration: 0.2,
                              ease: 'easeOut'
                            }
                          }
                        }
                        onMouseEnter={() => {
                          if (!isShufflingHand) {
                            setHoveredHandCardIndex(index);
                            handleCardHover(cardId);
                          }
                        }}
                        onMouseLeave={() => {
                          setHoveredHandCardIndex(null);
                          handleCardHoverCancel();
                        }}
                      >
                        <ContextMenu
                          items={[
                            { label: 'Top of Deck', onClick: () => handleTopOfDeck(cardId, index) },
                            { label: 'Recycle', onClick: () => handleRecycle(cardId, index) },
                            { label: 'Discard', onClick: () => handleDiscard(cardId, index) }
                          ]}
                          isDarkMode={isDarkMode}
                        >
                          {/* Card flip container - only applies 3D transform during animation */}
                          <div 
                            style={{ 
                              perspective: '1000px',
                              width: '100%',
                              height: cardHeight, // Use explicit height to maintain aspect ratio
                              position: 'relative'
                            }}
                          >
                            <motion.div
                              style={{
                                width: '100%',
                                height: '100%',
                                position: 'relative',
                                transformStyle: 'preserve-3d'
                              }}
                              animate={isAnimating ? {
                                rotateY: [0, 180] // Rotate container from 0 to 180 (flip the card)
                              } : {
                                rotateY: 0
                              }}
                              transition={isAnimating ? {
                                duration: 0.3,
                                ease: [0.4, 0, 0.2, 1],
                                times: [0, 1]
                              } : {
                                duration: 0
                              }}
                            >
                              {/* Card back - positioned on back face (rotateY: 180deg) */}
                              {/* For draw: starts hidden (container at 0deg), becomes visible (container at 180deg) */}
                              {/* For toDeck: starts hidden (container at 0deg), becomes visible (container at 180deg) */}
                              {/* Card back - positioned on front face (0deg) for draw animation */}
                              {isAnimating && (
                                <motion.div
                                  style={{
                                    position: 'absolute',
                                    width: '100%',
                                    height: '100%',
                                    backfaceVisibility: 'hidden',
                                    WebkitBackfaceVisibility: 'hidden',
                                    transform: 'rotateY(0deg)', // Front face (visible at start of draw)
                                    top: 0,
                                    left: 0
                                  }}
                                >
                                  <img
                                    src={CARD_BACK_URL}
                                    alt="Card Back"
                                    className="w-full h-full object-cover rounded border-2"
                                    style={{ 
                                      aspectRatio: '515/719',
                                      borderColor: isDarkMode ? '#4B5563' : '#D1D5DB',
                                      backfaceVisibility: 'hidden',
                                      WebkitBackfaceVisibility: 'hidden'
                                    }}
                                  />
                                </motion.div>
                              )}
                              
                              {/* Actual card - positioned on back face (180deg) for draw animation */}
                              <motion.div
                                style={{
                                  width: '100%',
                                  height: '100%',
                                  backfaceVisibility: 'hidden',
                                  WebkitBackfaceVisibility: 'hidden',
                                  transform: isAnimating ? 'rotateY(180deg)' : 'rotateY(0deg)', // Draw: back face (visible at end), normal: front face
                                  position: isAnimating ? 'absolute' : 'relative',
                                  top: isAnimating ? 0 : 'auto',
                                  left: isAnimating ? 0 : 'auto'
                                }}
                              >
                                <img
                                  key={cardId}
                                  src={cardImageUrl}
                                  alt={`Card ${cardId}`}
                                  className="w-full h-full object-cover rounded border-2"
                                  style={{ 
                                    aspectRatio: '515/719',
                                    borderColor: isDarkMode ? '#4B5563' : '#D1D5DB',
                                    boxShadow: isHovered ? '0 8px 16px rgba(0, 0, 0, 0.3)' : 'none',
                                    transition: 'box-shadow 0.2s ease',
                                    willChange: isHovered ? 'box-shadow' : 'auto',
                                    backfaceVisibility: 'hidden',
                                    WebkitBackfaceVisibility: 'hidden'
                                  }}
                                  loading="lazy"
                                />
                              </motion.div>
                            </motion.div>
                          </div>
                        </ContextMenu>
                      </motion.div>
                    );
                  });
                })()}
              </div>
            )}
            
            {/* Animating Card (to deck) - Rendered separately since it's removed from hand array */}
            {animatingToDeck && (() => {
              const cardId = animatingToDeck.cardId;
              const cardImageUrl = handCardImageUrls.get(cardId) || getCardImageUrl(cardId);
              const cardWidth = 140;
              const cardHeight = cardWidth * (719 / 515);
              const containerHeight = 209.375;
              const mainContentWidth = 1152;
              
              // Calculate original hand position (before removal)
              const handZoneWidth = 800;
              const zonePadding = 8;
              const availableWidth = handZoneWidth - (zonePadding * 2);
              const preferredOverlap = cardWidth / 3;
              const handLengthBeforeRemoval = hand.length + 1; // Add 1 for the card being removed
              let overlap = preferredOverlap;
              let totalWidth = cardWidth + (handLengthBeforeRemoval - 1) * (cardWidth - overlap);
              
              if (totalWidth > availableWidth && handLengthBeforeRemoval > 1) {
                overlap = Math.max(
                  10,
                  (handLengthBeforeRemoval * cardWidth - availableWidth) / (handLengthBeforeRemoval - 1)
                );
                totalWidth = cardWidth + (handLengthBeforeRemoval - 1) * (cardWidth - overlap);
              }
              
              const startX = zonePadding + (availableWidth - totalWidth) / 2;
              const offset = animatingToDeck.handIndex * (cardWidth - overlap);
              const handLeft = startX + offset;
              const handBottom = (containerHeight - cardHeight) / 2;
              
              // Deck position
              const deckCardCenterAbsolute = (mainContentWidth - 16 - 150) + 5 + 70;
              const deckCardLeftRelative = deckCardCenterAbsolute - 70 - 176;
              const deckCardBottomRelative = 96 + 5 - 16;
              
              const animatingToDeckType = animatingToDeck.type;
              
              // Use different container z-index based on animation type
              // Recycle needs to be in a lower z-index container to appear behind deck (z-10)
              // Top needs to be in a higher z-index container to appear above deck
              const containerZIndex = animatingToDeckType === 'top' ? 15 : 8; // Top: above deck (z-10), Recycle: below deck
              
              return (
                <div 
                  className="absolute bottom-4" 
                  style={{ 
                    left: '176px', 
                    width: '800px',
                    height: '209.375px',
                    pointerEvents: 'none', // Don't block interactions
                    zIndex: containerZIndex
                  }}
                >
                  <motion.div
                    className="absolute"
                    style={{
                      left: `${handLeft}px`,
                      bottom: `${handBottom}px`,
                      width: `${cardWidth}px`,
                      zIndex: 1, // Relative to container
                    }}
                    initial={{
                      left: `${handLeft}px`,
                      bottom: `${handBottom}px`,
                      y: 0,
                    }}
                    animate={{
                      left: `${deckCardLeftRelative}px`,
                      bottom: `${deckCardBottomRelative}px`,
                      y: 0,
                    }}
                    transition={{
                      duration: 0.3,
                      ease: [0.4, 0, 0.2, 1]
                    }}
                  >
                    {/* Card flip container */}
                    <div 
                      style={{ 
                        perspective: '1000px',
                        width: '100%',
                        height: cardHeight,
                        position: 'relative'
                      }}
                    >
                      <motion.div
                        style={{
                          width: '100%',
                          height: '100%',
                          position: 'relative',
                          transformStyle: 'preserve-3d'
                        }}
                        animate={{
                          rotateY: [0, 180] // Flip from actual card to card back
                        }}
                        transition={{
                          duration: 0.3,
                          ease: [0.4, 0, 0.2, 1],
                          times: [0, 1]
                        }}
                      >
                        {/* Card back - back face (rotateY: 180deg) - visible at end */}
                        <motion.div
                          style={{
                            position: 'absolute',
                            width: '100%',
                            height: '100%',
                            backfaceVisibility: 'hidden',
                            WebkitBackfaceVisibility: 'hidden',
                            transform: 'rotateY(180deg)',
                            top: 0,
                            left: 0
                          }}
                        >
                          <img
                            src={CARD_BACK_URL}
                            alt="Card Back"
                            className="w-full h-full object-cover rounded border-2"
                            style={{ 
                              aspectRatio: '515/719',
                              borderColor: isDarkMode ? '#4B5563' : '#D1D5DB',
                              backfaceVisibility: 'hidden',
                              WebkitBackfaceVisibility: 'hidden'
                            }}
                          />
                        </motion.div>
                        
                        {/* Actual card - front face (rotateY: 0deg) - visible at start */}
                        <motion.div
                          style={{
                            width: '100%',
                            height: '100%',
                            backfaceVisibility: 'hidden',
                            WebkitBackfaceVisibility: 'hidden',
                            transform: 'rotateY(0deg)',
                            position: 'absolute',
                            top: 0,
                            left: 0
                          }}
                        >
                          <img
                            key={cardId}
                            src={cardImageUrl}
                            alt={`Card ${cardId}`}
                            className="w-full h-full object-cover rounded border-2"
                            style={{ 
                              aspectRatio: '515/719',
                              borderColor: isDarkMode ? '#4B5563' : '#D1D5DB',
                              backfaceVisibility: 'hidden',
                              WebkitBackfaceVisibility: 'hidden'
                            }}
                          />
                        </motion.div>
                      </motion.div>
                    </div>
                  </motion.div>
                </div>
              );
            })()}
            
            {/* Animating Card (to discard) - Rendered separately since it's removed from hand array */}
            {animatingToDiscard && (() => {
              const cardId = animatingToDiscard.cardId;
              const cardImageUrl = handCardImageUrls.get(cardId) || getCardImageUrl(cardId);
              const cardWidth = 140;
              const cardHeight = cardWidth * (719 / 515);
              const containerHeight = 209.375;
              const mainContentWidth = 1152;
              
              // Calculate original hand position (before removal)
              const handZoneWidth = 800;
              const zonePadding = 8;
              const availableWidth = handZoneWidth - (zonePadding * 2);
              const preferredOverlap = cardWidth / 3;
              const handLengthBeforeRemoval = hand.length + 1; // Add 1 for the card being removed
              let overlap = preferredOverlap;
              let totalWidth = cardWidth + (handLengthBeforeRemoval - 1) * (cardWidth - overlap);
              
              if (totalWidth > availableWidth && handLengthBeforeRemoval > 1) {
                overlap = Math.max(
                  10,
                  (handLengthBeforeRemoval * cardWidth - availableWidth) / (handLengthBeforeRemoval - 1)
                );
                totalWidth = cardWidth + (handLengthBeforeRemoval - 1) * (cardWidth - overlap);
              }
              
              const startX = zonePadding + (availableWidth - totalWidth) / 2;
              const offset = animatingToDiscard.handIndex * (cardWidth - overlap);
              const handLeft = startX + offset;
              const handBottom = (containerHeight - cardHeight) / 2;
              
              // Discard pile position
              // Discard zone is at bottom-[315.375px] right-4, with padding 5px
              // Card is centered in the zone (140px wide, 195.5px tall)
              // Relative to hand container (left: 176px, bottom: 16px)
              // Main content width: 1152px
              // Discard zone right edge: 1152 - 16 = 1136px
              // Discard zone width: 150px (140px card + 5px*2 padding)
              // Discard zone left edge: 1136 - 150 = 986px
              // Card left edge (absolute): 986 + 5 = 991px
              // Card center (absolute): 991 + 70 = 1061px
              // Relative to hand container: 1061 - 176 = 885px
              const discardCardCenterAbsolute = (mainContentWidth - 16 - 150) + 5 + 70;
              const discardCardLeftRelative = discardCardCenterAbsolute - 70 - 176;
              
              // Discard card bottom position
              // Discard zone bottom: 315.375px from parent bottom
              // Card fills inner container (195.5px high) with 5px padding from outer top
              // Card bottom relative to outer container: 5px (padding) + 195.5px (height) = 200.5px from outer top
              // Outer container height: 195.5px + 5px*2 = 205.5px
              // Card bottom from outer bottom: 205.5 - 200.5 = 5px
              // Card bottom from parent bottom: 315.375 + 5 = 320.375px
              // Relative to hand container (bottom: 16px): 320.375 - 16 = 304.375px
              const discardCardBottomRelative = 315.375 + 5 - 16;
              
              return (
                <div 
                  className="absolute bottom-4" 
                  style={{ 
                    left: '176px', 
                    width: '800px',
                    height: '209.375px',
                    pointerEvents: 'none', // Don't block interactions
                    zIndex: 350 // Above hand cards (z-300) so animation is visible
                  }}
                >
                  <motion.div
                    className="absolute"
                    style={{
                      left: `${handLeft}px`,
                      bottom: `${handBottom}px`,
                      width: `${cardWidth}px`,
                      zIndex: 1, // Relative to container
                    }}
                    initial={{
                      left: `${handLeft}px`,
                      bottom: `${handBottom}px`,
                      y: 0,
                    }}
                    animate={{
                      left: `${discardCardLeftRelative}px`,
                      bottom: `${discardCardBottomRelative}px`,
                      y: 0,
                    }}
                    transition={{
                      duration: 0.3,
                      ease: [0.4, 0, 0.2, 1]
                    }}
                  >
                    {/* Card image - no flip, discard pile shows card face */}
                    <img
                      key={cardId}
                      src={cardImageUrl}
                      alt={`Card ${cardId}`}
                      className="w-full h-full object-cover rounded border-2"
                      style={{ 
                        width: '100%',
                        height: cardHeight,
                        aspectRatio: '515/719',
                        borderColor: isDarkMode ? '#4B5563' : '#D1D5DB',
                        backfaceVisibility: 'hidden',
                        WebkitBackfaceVisibility: 'hidden'
                      }}
                    />
                  </motion.div>
                </div>
              );
            })()}
            
            {/* Opponent Hand Zone - Between champion and deck, top (Rotated 180 degrees) */}
            <div className="absolute top-4 z-5" style={{ left: '176px', width: '800px' }}>
              <div 
                className={`rounded border-2 ${isDarkMode ? 'border-gray-700 border-dashed' : 'border-gray-400 border-dashed'}`}
                style={{ 
                  width: '100%',
                  height: '209.375px',
                  backgroundColor: isDarkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(209, 213, 219, 0.2)',
                  transform: 'rotate(180deg)'
                }}
              ></div>
            </div>
            
            {/* Opponent Rune Zone - Same width as hand, fits 1/4th card height (Rotated 180 degrees) */}
            {/* Equal padding on all sides: 5px, so zone height = 52.4 + 10 = 62.4px (round to 62px) */}
            {/* Position: 10px below hand zone (hand is 209.375px, so marginTop = 209.375px + 10px = 219.375px) */}
            <div className="absolute top-4 z-5" style={{ left: '176px', width: '800px', marginTop: '219.375px' }}>
              <div 
                className={`relative rounded border-2 ${isDarkMode ? 'border-gray-700 border-dashed' : 'border-gray-400 border-dashed'}`}
                style={{ 
                  width: '100%',
                  height: '62px',
                  backgroundColor: isDarkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(209, 213, 219, 0.2)',
                  transform: 'rotate(180deg)'
                }}
              >
                {/* Miniature card back on left (will appear on right after zone rotation) with equal padding */}
                {/* No rotation needed - inherits zone's 180deg rotation */}
                <div className="absolute top-1/2 -translate-y-1/2" style={{ left: '5px', width: '37.5px' }}>
                  <img
                    src={CARD_BACK_URL}
                    alt="Rune Card Back"
                    className="object-cover rounded"
                    style={{ 
                      width: '37.5px',
                      aspectRatio: '515/719'
                    }}
                  />
                </div>
                
                {/* Rune count bubble on right (will appear on our left after zone rotation, counter-rotated so text is upright) */}
                <div className={`absolute right-2 top-1/2 px-2 py-1 rounded-full border-2 flex items-center justify-center ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-400'}`} style={{ transform: 'translateY(-50%) rotate(180deg)' }}>
                  <span className={`text-sm font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    0/12
                  </span>
                </div>
              </div>
            </div>
            
            {/* Middle Section (Field) - Between rune zones, same width as hand/rune zones, split into 3 horizontal sections */}
            {/* Position: 10px below opponent rune zone bottom (297.375px + 10px = 307.375px from top) */}
            {/* and 10px above player rune zone top (782.625px - 10px = 772.625px from top) */}
            {/* Height: 772.625 - 307.375 = 465.25px */}
            <div className="absolute z-5 flex flex-col" style={{ 
              left: '176px', 
              width: '800px', 
              top: '307.375px',
              height: '465.25px'
            }}>
              <div 
                className={`rounded border-2 ${isDarkMode ? 'border-gray-700 border-dashed' : 'border-gray-400 border-dashed'}`}
                style={{ 
                  width: '100%',
                  height: '100%',
                  backgroundColor: isDarkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(209, 213, 219, 0.2)',
                  display: 'flex',
                  flexDirection: 'column'
                }}
              >
                {/* Top section - 1/3 of height */}
                <div className="flex-1" style={{ 
                  borderBottom: `2px solid ${isDarkMode ? '#374151' : '#9CA3AF'}`,
                  borderStyle: 'dashed'
                }}></div>
                
                {/* Middle section - 1/3 of height, split vertically into 2 columns */}
                <div className="flex-1 flex" style={{ 
                  borderBottom: `2px solid ${isDarkMode ? '#374151' : '#9CA3AF'}`,
                  borderStyle: 'dashed'
                }}>
                  {/* Left column - 1/2 width */}
                  <div className="flex-1" style={{ 
                    borderRight: `2px solid ${isDarkMode ? '#374151' : '#9CA3AF'}`,
                    borderStyle: 'dashed'
                  }}></div>
                  
                  {/* Right column - 1/2 width */}
                  <div className="flex-1"></div>
                </div>
                
                {/* Bottom section - 1/3 of height */}
                <div className="flex-1"></div>
              </div>
            </div>
            
            {/* Player Legend Zone - Above chosen champion, bottom left */}
            {/* Equal padding: legend height (209.375px) + padding (10px) + champion height (209.375px) = 428.75px total */}
            <div className="absolute bottom-[96px] left-4 z-5" style={{ marginBottom: '219.375px' }}>
              <div 
                className={`rounded border-2 ${isDarkMode ? 'border-gray-700 border-dashed' : 'border-gray-400 border-dashed'}`}
                style={{ 
                  width: '150px',
                  height: '209.375px',
                  backgroundColor: isDarkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(209, 213, 219, 0.2)'
                }}
              ></div>
            </div>
            
            {/* Player Legend Card - Above chosen champion, bottom left */}
            {preferredDeck?.cards?.legendCard && (
              <div 
                className="absolute bottom-[96px] left-4 z-50" 
                style={{ marginBottom: '219.375px', padding: '5px' }}
                onMouseEnter={() => handleCardHover(preferredDeck.cards.legendCard)}
                onMouseLeave={handleCardHoverCancel}
              >
                <ContextMenu
                  items={legendCardExhausted ? [
                    { label: 'Awaken', onClick: handleLegendCardAwaken }
                  ] : [
                    { label: 'Exhaust', onClick: handleLegendCardExhaust }
                  ]}
                  isDarkMode={isDarkMode}
                >
                  <div 
                    className="relative" 
                    style={{ width: '140px' }}
                  >
                    {legendCardLoading ? (
                      <div className={`w-full rounded border-2 flex items-center justify-center ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-gray-100 border-gray-300'}`} style={{ aspectRatio: '515/719' }}>
                        <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          Loading...
                        </div>
                      </div>
                    ) : legendCardImageUrl ? (
                      <img
                        src={legendCardImageUrl}
                        alt="Legend Card"
                        className="w-full object-cover rounded border-2"
                        style={{ 
                          aspectRatio: '515/719',
                          borderColor: isDarkMode ? '#4B5563' : '#D1D5DB',
                          transform: legendCardExhausted ? 'rotate(10deg)' : 'rotate(0deg)',
                          filter: legendCardExhausted ? 'grayscale(1)' : 'grayscale(0)',
                          transition: 'transform 0.2s ease, filter 0.2s ease',
                          willChange: 'transform, filter',
                          backfaceVisibility: 'hidden',
                          transformStyle: 'preserve-3d'
                        }}
                      />
                    ) : null}
                  </div>
                </ContextMenu>
              </div>
            )}
            
            {/* Player Chosen Champion Zone - Bottom Left */}
            <div className="absolute bottom-[96px] left-4 z-5">
              <div 
                className={`rounded border-2 ${isDarkMode ? 'border-gray-700 border-dashed' : 'border-gray-400 border-dashed'}`}
                style={{ 
                  width: '150px',
                  height: '209.375px',
                  backgroundColor: isDarkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(209, 213, 219, 0.2)'
                }}
              ></div>
            </div>
            
            {/* Player Chosen Champion - Bottom Left */}
            {preferredDeck?.cards?.chosenChampion && (
              <div 
                className="absolute bottom-[96px] left-4 z-[60]" 
                style={{ padding: '5px' }}
                onMouseEnter={() => handleCardHover(preferredDeck.cards.chosenChampion)}
                onMouseLeave={handleCardHoverCancel}
              >
                <ContextMenu
                  items={[
                    { label: 'View', onClick: () => handleViewCard('Chosen Champion') }
                  ]}
                  isDarkMode={isDarkMode}
                >
                  <div 
                    className="relative" 
                    style={{ width: '140px' }}
                  >
                    {chosenChampionLoading ? (
                      <div className={`w-full rounded border-2 flex items-center justify-center ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-gray-100 border-gray-300'}`} style={{ aspectRatio: '515/719' }}>
                        <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          Loading...
                        </div>
                      </div>
                    ) : chosenChampionImageUrl ? (
                      <img
                        src={chosenChampionImageUrl}
                        alt="Chosen Champion"
                        className="w-full object-cover rounded border-2"
                        style={{ 
                          aspectRatio: '515/719',
                          borderColor: isDarkMode ? '#4B5563' : '#D1D5DB',
                          willChange: 'auto',
                          backfaceVisibility: 'hidden'
                        }}
                      />
                    ) : null}
                  </div>
                </ContextMenu>
              </div>
            )}
            
            {/* Opponent Legend Zone - Above chosen champion, top right (Rotated 180 degrees) */}
            <div className="absolute top-[96px] right-4 z-5" style={{ marginTop: '219.375px' }}>
              <div 
                className={`rounded border-2 ${isDarkMode ? 'border-gray-700 border-dashed' : 'border-gray-400 border-dashed'}`}
                style={{ 
                  width: '150px',
                  height: '209.375px',
                  backgroundColor: isDarkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(209, 213, 219, 0.2)',
                  transform: 'rotate(180deg)'
                }}
              ></div>
            </div>
            
            {/* Opponent Legend Card - Above chosen champion, top right (Rotated 180 degrees) */}
            {opponentDeck?.cards?.legendCard && (
              <div 
                className="absolute top-[96px] right-4 z-30" 
                style={{ marginTop: '219.375px', padding: '5px' }}
                onMouseEnter={() => handleCardHover(opponentDeck.cards.legendCard)}
                onMouseLeave={handleCardHoverCancel}
              >
                <ContextMenu
                  items={opponentLegendCardExhausted ? [
                    { label: 'Awaken', onClick: handleOpponentLegendCardAwaken }
                  ] : [
                    { label: 'Exhaust', onClick: handleOpponentLegendCardExhaust }
                  ]}
                  isDarkMode={isDarkMode}
                >
                  <div 
                    className="relative" 
                    style={{ width: '140px' }}
                  >
                    {opponentLegendCardLoading ? (
                      <div className={`w-full rounded border-2 flex items-center justify-center ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-gray-100 border-gray-300'}`} style={{ aspectRatio: '515/719', transform: 'rotate(180deg)' }}>
                        <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} style={{ transform: 'rotate(180deg)' }}>
                          Loading...
                        </div>
                      </div>
                    ) : opponentLegendCardImageUrl ? (
                      <img
                        src={opponentLegendCardImageUrl}
                        alt="Opponent Legend Card"
                        className="w-full object-cover rounded border-2"
                        style={{ 
                          aspectRatio: '515/719',
                          borderColor: isDarkMode ? '#4B5563' : '#D1D5DB',
                          transform: opponentLegendCardExhausted ? 'rotate(190deg)' : 'rotate(180deg)',
                          filter: opponentLegendCardExhausted ? 'grayscale(1)' : 'grayscale(0)',
                          transition: 'transform 0.2s ease, filter 0.2s ease',
                          willChange: 'transform, filter',
                          backfaceVisibility: 'hidden',
                          transformStyle: 'preserve-3d'
                        }}
                      />
                    ) : null}
                  </div>
                </ContextMenu>
              </div>
            )}
            
            {/* Opponent Chosen Champion Zone - Top Right (Rotated 180 degrees) */}
            <div className="absolute top-[96px] right-4 z-5">
              <div 
                className={`rounded border-2 ${isDarkMode ? 'border-gray-700 border-dashed' : 'border-gray-400 border-dashed'}`}
                style={{ 
                  width: '150px',
                  height: '209.375px',
                  backgroundColor: isDarkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(209, 213, 219, 0.2)',
                  transform: 'rotate(180deg)'
                }}
              ></div>
            </div>
            
            {/* Opponent Chosen Champion - Top Right (Rotated 180 degrees) */}
            {opponentDeck?.cards?.chosenChampion && (
              <div 
                className="absolute top-[96px] right-4 z-10" 
                style={{ padding: '5px' }}
                onMouseEnter={() => handleCardHover(opponentDeck.cards.chosenChampion)}
                onMouseLeave={handleCardHoverCancel}
              >
                <div 
                  className="relative" 
                  style={{ width: '140px' }}
                >
                  {opponentChosenChampionLoading ? (
                    <div className={`w-full rounded border-2 flex items-center justify-center ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-gray-100 border-gray-300'}`} style={{ aspectRatio: '515/719', transform: 'rotate(180deg)' }}>
                      <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`} style={{ transform: 'rotate(180deg)' }}>
                        Loading...
                      </div>
                    </div>
                  ) : opponentChosenChampionImageUrl ? (
                    <img
                      src={opponentChosenChampionImageUrl}
                      alt="Opponent Chosen Champion"
                      className="w-full object-cover rounded border-2"
                      style={{ 
                        aspectRatio: '515/719',
                        borderColor: isDarkMode ? '#4B5563' : '#D1D5DB',
                        transform: 'rotate(180deg)',
                        willChange: 'auto',
                        backfaceVisibility: 'hidden'
                      }}
                    />
                  ) : null}
                </div>
              </div>
            )}
            
            {/* Player Discard Zone - Above deck, bottom right */}
            {/* Deck is at bottom-[96px], deck height is 209.375px, so discard should be at bottom-[315.375px] (96 + 209.375 + 10 gap) */}
            <div 
              className="absolute bottom-[315.375px] right-4 z-5 cursor-pointer"
              onClick={() => setIsDiscardModalOpen(true)}
            >
              <div 
                className={`rounded border-2 ${isDarkMode ? 'border-gray-700 border-dashed' : 'border-gray-400 border-dashed'}`}
                style={{ 
                  width: '150px',
                  height: '209.375px',
                  backgroundColor: isDarkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(209, 213, 219, 0.2)'
                }}
              ></div>
            </div>
            
            {/* Discard count bubble - centered in discard zone, always visible */}
            <div className="absolute bottom-[315.375px] right-4" style={{ padding: '5px', pointerEvents: 'none', zIndex: 400 }}>
              <div className="relative" style={{ width: '140px', height: '209.375px' }}>
                {/* Count bubble - centered vertically and horizontally */}
                <div 
                  className={`absolute px-3 py-1 rounded-full border-2 flex items-center justify-center cursor-pointer ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-400'}`} 
                  style={{
                    left: '70px',
                    top: '104.6875px', // Center of 209.375px height
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'auto'
                  }}
                  onClick={() => setIsDiscardModalOpen(true)}
                >
                  <span className={`text-lg font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    {discardPile.length}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Top card of discard pile - below bubble, above zone */}
            {/* Only show card if: no animation OR (animation exists AND there's a previous card to show) */}
            {discardPile.length > 0 && (!animatingToDiscard || discardPile.length > 1) && (() => {
              // During animation, show the previous card (second to last), otherwise show the last card
              // Only show previous card if there are at least 2 cards (so we have a previous card to show)
              const cardIndex = (animatingToDiscard && discardPile.length > 1) ? discardPile.length - 2 : discardPile.length - 1;
              const topCardId = discardPile[cardIndex]; // Card to display (previous during animation, current otherwise)
              const topCardImageUrl = getCardImageUrl(topCardId);
              return (
                <div 
                  className="absolute bottom-[315.375px] right-4 z-15 cursor-pointer" 
                  style={{ padding: '5px' }}
                  onMouseEnter={() => handleCardHover(topCardId)}
                  onMouseLeave={handleCardHoverCancel}
                  onClick={() => setIsDiscardModalOpen(true)}
                >
                  <div className="relative" style={{ width: '140px' }}>
                    <img
                      src={topCardImageUrl}
                      alt="Top of Discard Pile"
                      className="w-full object-cover rounded border-2"
                      style={{ 
                        aspectRatio: '515/719',
                        borderColor: isDarkMode ? '#4B5563' : '#D1D5DB',
                        willChange: 'auto',
                        backfaceVisibility: 'hidden'
                      }}
                    />
                  </div>
                </div>
              );
            })()}
            
            {/* Player Deck Zone - Bottom Right */}
            <div className="absolute bottom-[96px] right-4 z-5">
              <div 
                className={`rounded border-2 ${isDarkMode ? 'border-gray-700 border-dashed' : 'border-gray-400 border-dashed'}`}
                style={{ 
                  width: '150px',
                  height: '209.375px',
                  backgroundColor: isDarkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(209, 213, 219, 0.2)'
                }}
              ></div>
            </div>
            
            {/* Quantity bubble container - separate high z-index container to appear above all animations */}
            {preferredDeck && (
              <div className="absolute bottom-[96px] right-4 z-20" style={{ padding: '5px', pointerEvents: 'none' }}>
                <div className="relative" style={{ width: '140px', height: '195.5px' }}>
                  {/* Quantity bubble - centered on card image */}
                  <div className={`absolute px-3 py-1 rounded-full border-2 flex items-center justify-center ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-400'}`} style={{
                    // Card is 140px wide, center is at 70px
                    // Card height is 140 * 719/515 ≈ 195.5px, center is at ~97.75px
                    left: '70px',
                    top: '97.75px',
                    transform: 'translate(-50%, -50%)',
                    pointerEvents: 'auto' // Re-enable pointer events for the bubble
                  }}>
                    <span className={`text-lg font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                      {preferredDeck.cards?.mainDeck?.length || 0}
                    </span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Player Deck - Bottom Right (mirrored from chosen champion) */}
            {preferredDeck && (
              <div className="absolute bottom-[96px] right-4 z-10" style={{ padding: '5px' }}>
                <ContextMenu
                  items={[
                    { label: 'Shuffle', onClick: handleShuffle },
                    { label: 'Draw', onClick: handleDraw }
                  ]}
                  isDarkMode={isDarkMode}
                >
                  <div className="relative" style={{ width: '140px', height: '195.5px' }}>
                    {/* Shuffle animation cards - riffle shuffle effect with cards sliding horizontally */}
                    <AnimatePresence>
                      {isShufflingDeck && preferredDeck.cards?.mainDeck?.length > 0 && (
                        <>
                          <motion.img
                            key="shuffle-1"
                            src={CARD_BACK_URL}
                            alt="Deck Shuffle 1"
                            className="absolute object-cover rounded"
                            style={{ 
                              width: '140px',
                              aspectRatio: '515/719',
                              zIndex: 1
                            }}
                            initial={{ x: 0, y: 0 }}
                            animate={{
                              x: [-10, 10, -10, 10, 0],
                              y: [0, -2, 2, -1, 0]
                            }}
                            exit={{ 
                              x: 0, 
                              y: 0,
                              transition: {
                                duration: 0.2,
                                ease: "easeOut"
                              }
                            }}
                            transition={{
                              duration: 0.6,
                              repeat: Infinity,
                              ease: "easeInOut",
                              delay: 0.1,
                              times: [0, 0.25, 0.5, 0.75, 1]
                            }}
                          />
                          <motion.img
                            key="shuffle-2"
                            src={CARD_BACK_URL}
                            alt="Deck Shuffle 2"
                            className="absolute object-cover rounded"
                            style={{ 
                              width: '140px',
                              aspectRatio: '515/719',
                              zIndex: 2
                            }}
                            initial={{ x: 0, y: 0 }}
                            animate={{
                              x: [10, -10, 10, -10, 0],
                              y: [0, 1, -2, 1, 0]
                            }}
                            exit={{ 
                              x: 0, 
                              y: 0,
                              transition: {
                                duration: 0.2,
                                ease: "easeOut"
                              }
                            }}
                            transition={{
                              duration: 0.6,
                              repeat: Infinity,
                              ease: "easeInOut",
                              delay: 0.15,
                              times: [0, 0.25, 0.5, 0.75, 1]
                            }}
                          />
                        </>
                      )}
                    </AnimatePresence>
                    
                    {/* Main card back - moves first during shuffle - only show if deck has cards */}
                    {preferredDeck.cards?.mainDeck?.length > 0 && (
                      <motion.img
                        src={CARD_BACK_URL}
                        alt="Deck"
                        className="object-cover rounded"
                        style={{ 
                          width: '140px',
                          aspectRatio: '515/719',
                          position: 'relative',
                          zIndex: 3
                        }}
                        initial={{ x: 0, y: 0 }}
                        animate={isShufflingDeck ? {
                          x: [0, 8, -8, 6, -6, 0],
                          y: [0, -1, 1, -1, 1, 0]
                        } : { x: 0, y: 0 }}
                        transition={isShufflingDeck ? {
                          duration: 0.6,
                          repeat: Infinity,
                          ease: "easeInOut",
                          delay: 0,
                          times: [0, 0.2, 0.4, 0.6, 0.8, 1]
                        } : {
                          duration: 0.2,
                          ease: "easeOut"
                        }}
                      />
                    )}
                    
                  </div>
                </ContextMenu>
              </div>
            )}
            
            {/* Shuffle Hand Button - Directly below deck, centered vertically between deck bottom and main section bottom, horizontally between hand zone right and sidebar left */}
            {/* Vertical: deck bottom (96px container + 5px padding = 101px) to main section bottom (0px), center = 50.5px */}
            {/* Horizontal: hand zone right (176px + 800px = 976px) to sidebar left (1152px), center = 1064px */}
            <div className="absolute z-10" style={{ left: '1064px', bottom: '50.5px', width: '120px', transform: 'translate(-50%, 50%)' }}>
              <button
                onClick={handleShuffleHand}
                disabled={hand.length === 0 || isShufflingHand}
                className={`w-full py-2 px-3 rounded text-sm font-medium border-2 transition-colors ${
                  hand.length === 0 || isShufflingHand
                    ? isDarkMode
                      ? 'bg-gray-700 border-gray-600 text-gray-500 cursor-not-allowed'
                      : 'bg-gray-200 border-gray-300 text-gray-400 cursor-not-allowed'
                    : isDarkMode
                      ? 'bg-gray-700 border-gray-600 text-gray-100 hover:bg-gray-600 active:bg-gray-800'
                      : 'bg-white border-gray-400 text-gray-900 hover:bg-gray-100 active:bg-gray-200'
                }`}
              >
                Shuffle Hand
              </button>
            </div>
            
            {/* Opponent Deck Zone - Top Left (Rotated 180 degrees) */}
            <div className="absolute top-[96px] left-4 z-5">
              <div 
                className={`rounded border-2 ${isDarkMode ? 'border-gray-700 border-dashed' : 'border-gray-400 border-dashed'}`}
                style={{ 
                  width: '150px',
                  height: '209.375px',
                  backgroundColor: isDarkMode ? 'rgba(75, 85, 99, 0.2)' : 'rgba(209, 213, 219, 0.2)',
                  transform: 'rotate(180deg)'
                }}
              ></div>
            </div>
            
            {/* Opponent Deck - Top Left (mirrored from chosen champion, rotated 180 degrees) */}
            {opponentDeck && (
              <div className="absolute top-[96px] left-4 z-10" style={{ padding: '5px' }}>
                <div className="relative" style={{ width: '140px', height: '195.5px' }}>
                  {/* Single card back - rotated 180 degrees */}
                  <img
                    src={CARD_BACK_URL}
                    alt="Opponent Deck"
                    className="object-cover rounded"
                    style={{ 
                      width: '140px',
                      aspectRatio: '515/719',
                      transform: 'rotate(180deg)'
                    }}
                  />
                  
                  {/* Quantity bubble - centered on card image, text not rotated */}
                  <div className={`absolute z-30 px-3 py-1 rounded-full border-2 flex items-center justify-center ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-400'}`} style={{ 
                    // Card is 140px wide, center is at 70px
                    // Card height is 140 * 719/515 ≈ 195.5px, center is at ~97.75px
                    left: '70px',
                    top: '97.75px',
                    transform: 'translate(-50%, -50%) rotate(180deg)' 
                  }}>
                    <span className={`text-lg font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`} style={{ transform: 'rotate(180deg)' }}>
                      {opponentDeck.cards?.mainDeck?.length || 0}
                    </span>
                  </div>
                </div>
              </div>
            )}
            
            {/* Discard Modal - Bounded by opponent deck (top-left) to player discard (top-right) */}
            {isDiscardModalOpen && (
              <div 
                className="absolute"
                style={{
                  // Opponent deck zone: top-[96px] left-4 (16px), width: 150px, height: 209.375px
                  // Top-left of opponent deck: left: 16px, top: 96px
                  // Player discard zone: bottom-[315.375px] right-4 (16px), width: 150px, height: 209.375px
                  // Top of discard zone: 1080 - 315.375 - 209.375 = 555.25px
                  // Right side of discard zone: 1152 - 16 = 1136px (right edge of main content minus padding)
                  // Modal bottom-right should align with right side of discard zone
                  left: '16px', // Top-left of opponent deck
                  top: '96px', // Top-left of opponent deck
                  width: '1120px', // 1136 - 16 = 1120px (to right side of discard zone)
                  height: '459.25px', // 555.25 - 96 = 459.25px
                  zIndex: 1500, // Below sidebars (2000) but above game board
                  pointerEvents: 'auto'
                }}
                onClick={() => setIsDiscardModalOpen(false)}
              >
                {/* Semi-transparent backdrop - see-through */}
                <div 
                  className="absolute inset-0 rounded-lg"
                  style={{ 
                    backgroundColor: isDarkMode ? 'rgba(17, 24, 39, 0.3)' : 'rgba(255, 255, 255, 0.3)'
                  }}
                />
                
                {/* Modal Content - Floating window */}
                <div 
                  className={`absolute inset-0 flex flex-col rounded-lg border-2 shadow-2xl ${isDarkMode ? 'bg-gray-800/50 border-gray-600/50' : 'bg-white/50 border-gray-400/50'}`}
                  style={{ 
                    backdropFilter: 'blur(2px)'
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  {/* Header */}
                  <div 
                    className={`px-6 py-4 border-b flex items-center justify-between flex-shrink-0 rounded-t-lg ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-300'}`}
                    style={{ zIndex: 1, position: 'relative', pointerEvents: 'none' }}
                  >
                    <h2 className={`text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`} style={{ pointerEvents: 'none' }}>
                      Discard Pile ({discardPile.length})
                    </h2>
                    <button
                      onClick={() => setIsDiscardModalOpen(false)}
                      className={`px-3 py-1 rounded transition-colors ${
                        isDarkMode
                          ? 'bg-gray-700/80 hover:bg-gray-600/80 text-gray-100'
                          : 'bg-gray-200/80 hover:bg-gray-300/80 text-gray-900'
                      }`}
                      style={{ pointerEvents: 'auto' }}
                    >
                      ✕
                    </button>
                  </div>
                  
                  {/* Body - Scrollable 8-wide grid with smaller cards */}
                  {/* 
                    IMPORTANT: Image Rendering Pattern for Preventing Flicker
                    ============================================================
                    To prevent image flickering in React, always follow this COMPLETE pattern:
                    
                    1. Memoize image URLs using useMemo with a Map (see discardCardImageUrls above)
                       - Use cached URL from Map: discardCardImageUrls.get(cardId) || getCardImageUrl(cardId)
                    
                    2. Container div (outer wrapper) MUST have:
                       - transform: 'translateZ(0)' (forces hardware acceleration)
                       - WebkitTransform: 'translateZ(0)' (WebKit prefix)
                       - isolation: 'isolate' (creates new stacking context)
                       - position: 'relative' (for proper positioning context)
                    
                    3. Inner card container div MUST have:
                       - transform: 'translateZ(0)' (or 'translateZ(0) rotate(...)' if rotating)
                       - WebkitTransform: 'translateZ(0)' (WebKit prefix)
                       - backfaceVisibility: 'hidden'
                       - willChange: 'auto' (or specific property)
                       - transition: '...' (if animating properties)
                    
                    4. img element MUST have:
                       - backfaceVisibility: 'hidden'
                       - WebkitBackfaceVisibility: 'hidden'
                       - willChange: 'auto' (or specific property)
                       - imageRendering: 'auto'
                       - WebkitFontSmoothing: 'antialiased'
                       - MozOsxFontSmoothing: 'grayscale'
                    
                    CRITICAL: Missing translateZ(0) or isolation: 'isolate' on containers will cause flickering!
                    This pattern is used for hand cards, runes, and discard pile cards.
                    Apply ALL of these to any new image rendering to prevent flickering issues.
                  */}
                  <div className="flex-1 overflow-y-auto p-4" style={{ position: 'relative', zIndex: 2, overflowX: 'visible' }}>
                    <div className="grid grid-cols-8 gap-3 justify-items-center" style={{ position: 'relative' }}>
                      {discardPile.map((cardId, index) => {
                        // Use cached image URL to prevent recalculation on every render
                        const cardImageUrl = discardCardImageUrls.get(cardId) || getCardImageUrl(cardId);
                        return (
                          <div 
                            key={`${cardId}-${index}`} 
                            style={{ 
                              position: 'relative', 
                              zIndex: 10000,
                              transform: 'translateZ(0)',
                              WebkitTransform: 'translateZ(0)',
                              isolation: 'isolate'
                            }}
                          >
                          <ContextMenu
                            items={[
                              { label: 'To Hand', onClick: () => {
                                // TODO: Implement move to hand functionality
                                console.log('Move to hand:', cardId);
                              }},
                              { label: 'Recycle', onClick: () => {
                                // TODO: Implement recycle functionality
                                console.log('Recycle:', cardId);
                              }}
                            ]}
                            isDarkMode={isDarkMode}
                          >
                            <div
                              className={`rounded border-2 flex items-center justify-center overflow-hidden cursor-pointer transition-colors select-none relative ${
                                isDarkMode 
                                  ? 'bg-gray-700 border-gray-600 hover:border-blue-400' 
                                  : 'bg-gray-200 border-gray-300 hover:border-blue-500'
                              }`}
                              style={{ 
                                width: '100px',
                                aspectRatio: '515/719',
                                transform: 'translateZ(0)',
                                WebkitTransform: 'translateZ(0)',
                                backfaceVisibility: 'hidden',
                                willChange: 'auto'
                              }}
                              onMouseEnter={() => handleCardHover(cardId)}
                              onMouseLeave={handleCardHoverCancel}
                            >
                              <img
                                src={cardImageUrl}
                                alt={`Discard card ${index + 1}`}
                                className="w-full h-full object-cover"
                                style={{
                                  backfaceVisibility: 'hidden',
                                  WebkitBackfaceVisibility: 'hidden',
                                  willChange: 'auto',
                                  imageRendering: 'auto',
                                  WebkitFontSmoothing: 'antialiased',
                                  MozOsxFontSmoothing: 'grayscale'
                                }}
                              />
                            </div>
                          </ContextMenu>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
          
          {/* Right Sidebar - 20% (384px) */}
          <div className={`relative w-[384px] h-full border-l-2 flex flex-col min-h-0 z-[2000] ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-blue-50 border-gray-300'}`}>
            {/* Top Section - Opponent Player */}
            <div className={`relative flex-shrink-0 h-[240px] border-b-2 ${isDarkMode ? 'border-gray-700' : 'border-gray-300'}`}>
              {/* Vertical divider on left */}
              <div className={`absolute left-0 top-0 bottom-0 w-[2px] ${isDarkMode ? 'bg-gray-700' : 'bg-gray-300'}`}></div>
              
              {/* Score counter - top left of section */}
              <div className="absolute left-4 top-4 z-10">
                <div className={`px-4 py-2 rounded-lg border-2 font-bold text-2xl ${isDarkMode ? 'bg-gray-800 border-gray-600 text-gray-100' : 'bg-white border-gray-400 text-gray-900'}`}>
                  {opponentScore}
                </div>
              </div>
              
              {/* Profile picture - centered */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                <div className="relative">
                  {opponentProfilePictureLoading ? (
                    <div className={`w-[151px] h-[151px] rounded-full border-4 flex items-center justify-center ${isDarkMode ? 'bg-gray-600 border-gray-500' : 'bg-gray-200 border-gray-300'}`}>
                      <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        Loading...
                      </div>
                    </div>
                  ) : opponentProfilePictureUrl ? (
                    <img
                      src={opponentProfilePictureUrl}
                      alt={`${opponentName}'s Profile`}
                      className="w-[151px] h-[151px] rounded-full border-4 object-cover"
                      style={{ borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' }}
                    />
                  ) : (
                    <div className={`w-[151px] h-[151px] rounded-full border-4 flex items-center justify-center ${isDarkMode ? 'bg-gray-600 border-gray-500' : 'bg-gray-200 border-gray-300'}`}>
                      <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        ?
                      </div>
                    </div>
                  )}
                </div>
                {/* Display name bubble */}
                <div className={`mt-2 px-3 py-1 rounded-full border-2 ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-400'}`}>
                  <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    {opponentDisplayName}
                  </span>
                </div>
              </div>
            </div>
            
            {/* Middle Section - Split into left 1/5th and right 4/5th */}
            <div className={`relative flex-1 flex flex-col min-h-0 border-b-2 ${isDarkMode ? 'border-gray-700' : 'border-gray-300'}`}>
              {/* Vertical divider on left */}
              <div className={`absolute left-0 top-0 bottom-0 w-[2px] ${isDarkMode ? 'bg-gray-700' : 'bg-gray-300'}`}></div>
              
              {/* Top area - Chat log */}
              <div className="flex-1 flex min-h-0">
                {/* Left section - 1/5th (for future use) */}
                <div className={`w-1/5 relative ${isDarkMode ? 'bg-gray-800' : 'bg-blue-50'}`}>
                  {/* Vertical divider on right */}
                  <div className={`absolute right-0 top-0 bottom-0 w-[2px] ${isDarkMode ? 'bg-gray-700' : 'bg-gray-300'}`}></div>
                </div>
                
                {/* Right section - 4/5th (Chat Log) */}
                <div className={`w-4/5 overflow-y-auto px-3 py-2 ${isDarkMode ? 'bg-gray-800' : 'bg-blue-50'}`}>
                  {chatMessages.length === 0 ? (
                    <div className={`text-center text-sm mt-4 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      No messages yet. Start chatting!
                    </div>
                  ) : (
                    <div className="space-y-2">
                      {chatMessages.map((msg) => (
                        <div key={msg.id} className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                          <span className={`font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                            {msg.displayName}:
                          </span>{' '}
                          {msg.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              {/* Horizontal divider - spans full width */}
              <div className={`flex-shrink-0 border-t-2 ${isDarkMode ? 'border-gray-700' : 'border-gray-300'}`}></div>
              
              {/* Bottom area - Chat entry */}
              <div className="flex-shrink-0 flex">
                {/* Left section - 1/5th (for chain emoji) */}
                <div className={`w-1/5 relative flex items-center justify-center px-3 py-2 ${isDarkMode ? 'bg-gray-800' : 'bg-blue-50'}`}>
                  {/* Vertical divider on right */}
                  <div className={`absolute right-0 top-0 bottom-0 w-[2px] ${isDarkMode ? 'bg-gray-700' : 'bg-gray-300'}`}></div>
                  <div className={`px-3 py-2 rounded-full border-2 ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-400'}`}>
                    <span className="text-lg">🔗</span>
                  </div>
                </div>
                
                {/* Right section - 4/5th (Chat Entry) */}
                <div className={`w-4/5 flex items-center px-3 py-2 ${isDarkMode ? 'bg-gray-800' : 'bg-blue-50'}`}>
                  <form onSubmit={handleChatSubmit} className="flex items-center gap-2 w-full">
                    <input
                      type="text"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      placeholder="Type a message..."
                      className={`flex-1 px-3 py-2 rounded border text-sm ${
                        isDarkMode 
                          ? 'bg-gray-700 border-gray-600 text-gray-100 placeholder-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                          : 'bg-white border-gray-300 text-gray-800 placeholder-gray-500 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                      }`}
                    />
                    <button
                      type="submit"
                      className={`flex-shrink-0 w-8 h-8 rounded flex items-center justify-center text-lg transition-colors ${
                        isDarkMode
                          ? 'bg-gray-700 border border-gray-600 text-gray-200 hover:bg-gray-600'
                          : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      ➤
                    </button>
                  </form>
                </div>
              </div>
            </div>
            
            {/* Bottom Section - User Player */}
            <div className={`relative flex-shrink-0 h-[240px] ${isDarkMode ? 'bg-gray-800' : 'bg-blue-50'}`}>
              {/* Vertical divider on left */}
              <div className={`absolute left-0 top-0 bottom-0 w-[2px] ${isDarkMode ? 'bg-gray-700' : 'bg-gray-300'}`}></div>
              
              {/* Score counter - top left of section */}
              <div className="absolute left-4 top-4 z-10">
                <div className={`px-4 py-2 rounded-lg border-2 font-bold text-2xl ${isDarkMode ? 'bg-gray-800 border-gray-600 text-gray-100' : 'bg-white border-gray-400 text-gray-900'}`}>
                  {userScore}
                </div>
              </div>
              
              {/* Score buttons - left side */}
              <div className="absolute left-4 bottom-4 flex flex-col gap-2 z-10">
                <button
                  onClick={handleScoreIncrement}
                  className={`px-4 py-2 rounded-lg border-2 font-bold text-xl transition-colors ${
                    isDarkMode
                      ? 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                      : 'bg-white border-gray-400 hover:bg-gray-100'
                  }`}
                >
                  <span style={{ color: '#22c55e' }}>➕</span>
                </button>
                <button
                  onClick={handleScoreDecrement}
                  className={`px-4 py-2 rounded-lg border-2 font-bold text-xl transition-colors ${
                    isDarkMode
                      ? 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                      : 'bg-white border-gray-400 hover:bg-gray-100'
                  }`}
                >
                  <span style={{ color: '#ef4444' }}>➖</span>
                </button>
              </div>
              
              {/* Profile picture - centered */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex flex-col items-center">
                <div className="relative">
                  {userProfilePictureLoading ? (
                    <div className={`w-[151px] h-[151px] rounded-full border-4 flex items-center justify-center ${isDarkMode ? 'bg-gray-600 border-gray-500' : 'bg-gray-200 border-gray-300'}`}>
                      <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        Loading...
                      </div>
                    </div>
                  ) : userProfilePictureUrl ? (
                    <img
                      src={userProfilePictureUrl}
                      alt="Your Profile"
                      className="w-[151px] h-[151px] rounded-full border-4 object-cover"
                      style={{ borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' }}
                    />
                  ) : (
                    <div className={`w-[151px] h-[151px] rounded-full border-4 flex items-center justify-center ${isDarkMode ? 'bg-gray-600 border-gray-500' : 'bg-gray-200 border-gray-300'}`}>
                      <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                        ?
                      </div>
                    </div>
                  )}
                </div>
                {/* Display name bubble */}
                <div className={`mt-2 px-3 py-1 rounded-full border-2 ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-400'}`}>
                  <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                    {userDisplayName || 'Player'}
                  </span>
                </div>
              </div>
              
              {/* Emoji buttons - bottom right */}
              <div className="absolute right-4 bottom-4 flex flex-col gap-2 z-10">
                <button
                  className={`px-4 py-2 rounded-lg border-2 font-bold text-xl transition-colors ${
                    isDarkMode
                      ? 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                      : 'bg-white border-gray-400 hover:bg-gray-100'
                  }`}
                >
                  🤔
                </button>
                <button
                  className={`px-4 py-2 rounded-lg border-2 font-bold text-xl transition-colors ${
                    isDarkMode
                      ? 'bg-gray-700 border-gray-600 hover:bg-gray-600'
                      : 'bg-white border-gray-400 hover:bg-gray-100'
                  }`}
                >
                  <span style={{ color: '#22c55e' }}>👍</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </LayoutContainer>
    </>
  );
}

export default Game;

