import { useState, useEffect, useRef } from 'react';
import LayoutContainer from './components/LayoutContainer';
import cardsData from './data/cards.json';
import { domToPng } from 'modern-screenshot';
import {
  loadDecks,
  saveDecks,
  ensureAtLeastOneDeck,
  findDeckByNameCI,
  createDeck,
  getLastDeckId,
  setLastDeckId,
  getTheme,
  setTheme,
  getScreenshotMode,
  setScreenshotMode,
  validateDeckName
} from './utils/deckStorage';

function App() {
  // Helper function to parse card ID with variant index
  // Format: "OGN-249" -> { baseId: "OGN-249", variantIndex: 0 } (base card, variants[0])
  // Format: "OGN-249-1" -> { baseId: "OGN-249", variantIndex: 0 } (parsed number 1 - 1 = 0, variants[0])
  // Format: "OGN-249-2" -> { baseId: "OGN-249", variantIndex: 1 } (parsed number 2 - 1 = 1, variants[1])
  // Format: "OGN-249-3" -> { baseId: "OGN-249", variantIndex: 2 } (parsed number 3 - 1 = 2, variants[2])
  // Formula: variantIndex = parsedNumber - 1 (general formula, not hardcoded)
  const parseCardId = (cardId) => {
    if (!cardId) return { baseId: null, variantIndex: 0 };
    const match = cardId.match(/^([A-Z]+-\d+)(?:-(\d+))?$/);
    if (match) {
      // If no suffix, it's the base card (variants[0], index 0)
      // Otherwise, subtract 1 from the parsed number to get the 0-based array index
      return {
        baseId: match[1],
        variantIndex: match[2] ? parseInt(match[2], 10) - 1 : 0  // General formula: parsedNumber - 1
      };
    }
    return { baseId: cardId, variantIndex: 0 };
  };
  
  // Helper function to format card ID with variant index
  // Format: { baseId: "OGN-249", variantIndex: 0 } -> "OGN-249-1" (index 0 + 1 = 1)
  // Format: { baseId: "OGN-249", variantIndex: 1 } -> "OGN-249-2" (index 1 + 1 = 2)
  // Format: { baseId: "OGN-249", variantIndex: 2 } -> "OGN-249-3" (index 2 + 1 = 3)
  // Formula: exportNumber = variantIndex + 1 (general formula, not hardcoded)
  const formatCardId = (baseId, variantIndex = 0) => {
    if (!baseId) return null;
    // Add 1 to the 0-based index to get the 1-based export number
    return `${baseId}-${variantIndex + 1}`;
  };
  
  // Function to get card details by variant number (handles both "OGN-249" and "OGN-249-1" formats)
  const getCardDetails = (cardId) => {
    if (!cardId) return null;
    const { baseId } = parseCardId(cardId);
    return cardsData.find(card => card.variantNumber === baseId);
  };
  
  // Function to get card image URL - uses variantImages array based on variant index
  const getCardImageUrl = (cardId) => {
    if (!cardId) return 'https://cdn.piltoverarchive.com/Cardback.webp';
    
    const { baseId, variantIndex } = parseCardId(cardId);
    const card = cardsData.find(c => c.variantNumber === baseId);
    
    if (!card) {
      // Fallback to original cardId if card not found
      return `https://cdn.piltoverarchive.com/cards/${cardId}.webp`;
    }
    
    // Use variantImages array if available - variantIndex directly indexes into the array
    if (card.variantImages && card.variantImages.length > variantIndex) {
      const imageUrl = card.variantImages[variantIndex];
      if (imageUrl) {
        return imageUrl;
      }
    }
    
    // Fallback: construct URL from variantNumber if variantImages not available or empty
    return `https://cdn.piltoverarchive.com/cards/${card.variantNumber}.webp`;
  };
  
  // Function to check if a release date is in the future (comparing only dates, not time)
  const isFutureRelease = (releaseDate) => {
    if (!releaseDate) return false;
    
    try {
      // Parse the release date (assuming format like "2025-10-31" or ISO format)
      const release = new Date(releaseDate);
      const today = new Date();
      
      // Set both to midnight to compare only dates
      release.setHours(0, 0, 0, 0);
      today.setHours(0, 0, 0, 0);
      
      return release > today;
    } catch (e) {
      return false;
    }
  };
  
  // Helper function to add a card with default variant index 0
  const addCardWithVariant = (baseId, variantIndex = 0) => {
    return formatCardId(baseId, variantIndex);
  };
  
  // Find first champion in the deck to use as chosen champion
  const findFirstChampion = (deck) => {
    for (const cardId of deck) {
      const card = getCardDetails(cardId);
      if (card?.super === "Champion") {
        return cardId;
      }
    }
    return null;
  };
  
  // Try to set a card as chosen champion if it's a champion and chosenChampion is null
  // Returns true if the card was set as champion (and should be removed from mainDeck if adding there)
  const trySetChampionIfNeeded = (cardId) => {
    if (!chosenChampion && cardId) {
      const card = getCardDetails(cardId);
      if (card?.super === "Champion") {
        setChosenChampion(cardId);
        return true;
      }
    }
    return false;
  };
  
  // Separate state for chosen champion and main deck (39 cards)
  const [chosenChampion, setChosenChampion] = useState(null);
  
  const [mainDeck, setMainDeck] = useState([]);
  
  // Array of 8 card IDs for the side deck (initially empty)
  const [sideDeck, setSideDeck] = useState([]);
  
  // Array of 3 battlefield cards
  const [battlefields, setBattlefields] = useState([]);
  
  // Rune counts (A and B, must total 12)
  const [runeACount, setRuneACount] = useState(0);
  const [runeBCount, setRuneBCount] = useState(0);
  // Rune variant indices (0 = base, 1 = 'a', 2 = 'b')
  const [runeAVariantIndex, setRuneAVariantIndex] = useState(0);
  const [runeBVariantIndex, setRuneBVariantIndex] = useState(0);
  
  // State for Legend card (separate from champion)
  const [legendCard, setLegendCard] = useState(null);
  
  // State for the currently hovered/selected card
  const [selectedCard, setSelectedCard] = useState(null);
  
  // Ref to store timeout ID for debounced card selection
  const hoverTimeoutRef = useRef(null);
  
  // Debounced function to set selected card (delays selection to prevent accidental changes on quick mouse movements)
  const handleCardHover = (cardId) => {
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
  };
  
  // Cancel pending card selection when mouse leaves
  const handleCardHoverCancel = () => {
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  };
  
  // Dark mode state - initialize from localStorage
  const [isDarkMode, setIsDarkMode] = useState(() => getTheme() === 'dark');
  
  // Deck management state
  const [decks, setDecks] = useState([]);
  const [currentDeckId, setCurrentDeckId] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  
  // Name input modal state
  const [nameModal, setNameModal] = useState({
    isOpen: false,
    type: 'new', // 'new', 'saveAs', 'rename'
    value: '',
    error: null
  });
  
  // Screenshot modal state
  const [screenshotModal, setScreenshotModal] = useState({
    isOpen: false,
    fullBlobUrl: null,
    deckBlobUrl: null,
    currentView: 'full' // 'full' or 'deck'
  });
  
  // Screenshot mode preference - initialize from localStorage
  const [screenshotMode, setScreenshotModeState] = useState(() => getScreenshotMode());
  
  // Search Panel state
  const [searchFilters, setSearchFilters] = useState({
    cardName: '',
    cardText: '',
    cardType: '',
    cardColor: '',
    energyMin: '',
    energyMax: '',
    powerMin: '',
    powerMax: '',
    mightMin: '',
    mightMax: ''
  });
  const [searchResults, setSearchResults] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [isPageTransitioning, setIsPageTransitioning] = useState(false);
  const [loadedSearchImages, setLoadedSearchImages] = useState(new Set());
  const [isDraggingFromSearch, setIsDraggingFromSearch] = useState(false);
  const [sortOrder, setSortOrder] = useState('A-Z');
  const [sortDescending, setSortDescending] = useState(false);
  
  // Drag and drop state
  const [draggedCard, setDraggedCard] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [isDraggingFromChampion, setIsDraggingFromChampion] = useState(false);
  const [isDraggingFromLegend, setIsDraggingFromLegend] = useState(false);
  const [isDraggingFromSideDeck, setIsDraggingFromSideDeck] = useState(false);
  const [isDraggingFromBattlefield, setIsDraggingFromBattlefield] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  
  // Deck validation state
  const [deckValidation, setDeckValidation] = useState({
    isValid: false,
    messages: []
  });
  
  // Modal state
  const [modal, setModal] = useState({
    isOpen: false,
    type: 'notification', // 'notification' or 'confirmation'
    title: '',
    message: '',
    onConfirm: null,
    onCancel: null
  });
  
  // Export deck modal state
  const [exportModal, setExportModal] = useState({
    isOpen: false,
    deckCode: ''
  });
  
  // Variant selection modal state
  const [variantModal, setVariantModal] = useState({
    isOpen: false,
    cardId: null,
    baseId: null,
    source: null, // 'mainDeck', 'legend', 'battlefield', 'sideDeck', 'champion'
    sourceIndex: null, // index in the source array (if applicable)
    variants: [],
    variantImages: []
  });
  
  // Toast notifications state
  const [toasts, setToasts] = useState([]);
  
  // Add a toast notification
  const addToast = (content, duration = 1800) => {
    const id = Date.now() + Math.random();
    const newToast = { id, content, dismissing: false };
    
    setToasts(prev => [...prev, newToast]);
    
    // Auto-dismiss after duration
    setTimeout(() => {
      // Mark as dismissing to trigger slide-out animation
      setToasts(prev => prev.map(toast => 
        toast.id === id ? { ...toast, dismissing: true } : toast
      ));
      
      // Remove after animation completes (300ms)
      setTimeout(() => {
        setToasts(prev => prev.filter(toast => toast.id !== id));
      }, 300);
    }, duration);
    
    return id;
  };
  
  // Remove a toast by ID
  const removeToast = (id) => {
    // Mark as dismissing to trigger slide-out animation
    setToasts(prev => prev.map(toast => 
      toast.id === id ? { ...toast, dismissing: true } : toast
    ));
    
    // Remove after animation completes (300ms)
    setTimeout(() => {
      setToasts(prev => prev.filter(toast => toast.id !== id));
    }, 300);
  };
  
  // Show max copies toast notification
  const showMaxCopiesToast = (cardId) => {
    const card = getCardDetails(cardId);
    const cardName = card?.name || 'Unknown Card';
    addToast(
      <>Maximum copies reached for <strong>{cardName}</strong></>,
      1800
    );
  };
  
  // Show no space available toast notification
  const showNoSpaceToast = (areaName) => {
    addToast(
      <>No space available for <strong>{areaName}</strong></>,
      1800
    );
  };
  
  // Show notification modal (OK button only)
  const showNotification = (title, message) => {
    return new Promise((resolve) => {
      setModal({
        isOpen: true,
        type: 'notification',
        title,
        message,
        onConfirm: () => {
          setModal({ isOpen: false, type: 'notification', title: '', message: '', onConfirm: null, onCancel: null });
          resolve(true);
        },
        onCancel: null
      });
    });
  };
  
  // Show confirmation modal (Confirm/Cancel buttons)
  const showConfirmation = (title, message) => {
    return new Promise((resolve) => {
      setModal({
        isOpen: true,
        type: 'confirmation',
        title,
        message,
        onConfirm: () => {
          setModal({ isOpen: false, type: 'confirmation', title: '', message: '', onConfirm: null, onCancel: null });
          resolve(true);
        },
        onCancel: () => {
          setModal({ isOpen: false, type: 'confirmation', title: '', message: '', onConfirm: null, onCancel: null });
          resolve(false);
        }
      });
    });
  };
  
  // Handle backdrop click (outside modal)
  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      if (modal.type === 'notification') {
        // Clicking outside notification = OK
        modal.onConfirm?.();
      } else {
        // Clicking outside confirmation = Cancel
        modal.onCancel?.();
      }
    }
  };
  
  // Validate deck based on rules
  const validateDeck = () => {
    const messages = [];
    let isValid = true;
    
    // Rule 1: Legend is 1/1
    if (!legendCard) {
      messages.push("Legend is missing (must be 1/1)");
      isValid = false;
    } else {
      messages.push("✓ Legend is 1/1");
    }
    
    // Rule 2: Battlefields are 3/3
    if (battlefields.length !== 3) {
      messages.push(`Battlefields are ${battlefields.length}/3 (must be exactly 3)`);
      isValid = false;
    } else {
      messages.push("✓ Battlefields are 3/3");
    }
    
    // Rule 3: Main deck is 40/40
    const mainDeckCount = mainDeck.filter(c => c).length + (chosenChampion ? 1 : 0);
    if (mainDeckCount !== 40) {
      messages.push(`Main deck is ${mainDeckCount}/40 (must be exactly 40)`);
      isValid = false;
    } else {
      messages.push("✓ Main deck is 40/40");
    }
    
    // Rule 4: Main and side deck cards' colors must be subset of legend's colors
    const legendData = getCardDetails(legendCard);
    const legendColors = legendData?.colors || [];
    
    if (legendCard && legendColors.length > 0) {
      const allDeckCards = [...mainDeck.filter(c => c), ...sideDeck.filter(c => c)];
      if (chosenChampion) {
        allDeckCards.push(chosenChampion);
      }
      
      let invalidColorCards = [];
      for (const cardId of allDeckCards) {
        const cardData = getCardDetails(cardId);
        if (cardData && cardData.colors && cardData.colors.length > 0) {
          // Check if any color in the card is not in legend's colors
          const hasInvalidColor = cardData.colors.some(color => !legendColors.includes(color));
          if (hasInvalidColor) {
            invalidColorCards.push(cardData.name || cardId);
          }
        }
      }
      
      if (invalidColorCards.length > 0) {
        messages.push(`Cards with invalid colors: ${invalidColorCards.slice(0, 5).join(", ")}${invalidColorCards.length > 5 ? "..." : ""}`);
        isValid = false;
      } else {
        messages.push("✓ All cards' colors are valid (subset of legend's colors)");
      }
    } else if (!legendCard) {
      messages.push("Cannot validate colors: Legend is missing");
      isValid = false;
    } else {
      messages.push("✓ Legend has no colors to validate");
    }
    
    // Rule 5: Chosen champion and legend share a Tag
    if (chosenChampion && legendCard) {
      const championData = getCardDetails(chosenChampion);
      const championTags = championData?.tags || [];
      const legendTags = legendData?.tags || [];
      
      const sharedTags = championTags.filter(tag => legendTags.includes(tag));
      
      if (sharedTags.length === 0) {
        messages.push(`Champion and Legend do not share any tags`);
        isValid = false;
      } else {
        messages.push(`✓ Champion and Legend share tag(s): ${sharedTags.join(", ")}`);
      }
    } else {
      if (!chosenChampion) {
        messages.push("Cannot validate tag sharing: Champion is missing");
      }
      if (!legendCard) {
        messages.push("Cannot validate tag sharing: Legend is missing");
      }
      if (!chosenChampion || !legendCard) {
        isValid = false;
      }
    }
    
    // Rule 6: No more than 3 copies of any individual card across main and side
    const cardCounts = {};
    const allCards = [...mainDeck.filter(c => c), ...sideDeck.filter(c => c)];
    if (chosenChampion) {
      allCards.push(chosenChampion);
    }
    
    for (const cardId of allCards) {
      cardCounts[cardId] = (cardCounts[cardId] || 0) + 1;
    }
    
    const exceedingCards = Object.entries(cardCounts)
      .filter(([cardId, count]) => count > 3)
      .map(([cardId]) => {
        const cardData = getCardDetails(cardId);
        return cardData?.name || cardId;
      });
    
    if (exceedingCards.length > 0) {
      messages.push(`Cards exceeding 3 copies: ${exceedingCards.slice(0, 5).join(", ")}${exceedingCards.length > 5 ? "..." : ""}`);
      isValid = false;
    } else {
      messages.push("✓ No card exceeds 3 copies");
    }
    
    // Rule 7: Chosen champion exists
    if (!chosenChampion) {
      messages.push("Chosen champion is missing");
      isValid = false;
    } else {
      messages.push("✓ Chosen champion exists");
    }
    
    // Rule 8: Side deck must be exactly 0 or exactly 8 cards
    const sideDeckCount = sideDeck.filter(c => c).length;
    if (sideDeckCount !== 0 && sideDeckCount !== 8) {
      messages.push(`Side deck is ${sideDeckCount}/8 (must be exactly 0 or exactly 8)`);
      isValid = false;
    } else {
      messages.push(`✓ Side deck is ${sideDeckCount}/8`);
    }
    
    // Rule 9: Signature cards must match a tag with the legend
    if (legendCard) {
      const legendTags = legendData?.tags || [];
      const allDeckCardsForSignature = [...mainDeck.filter(c => c), ...sideDeck.filter(c => c)];
      if (chosenChampion) {
        allDeckCardsForSignature.push(chosenChampion);
      }
      
      let invalidSignatureCards = [];
      for (const cardId of allDeckCardsForSignature) {
        const cardData = getCardDetails(cardId);
        if (cardData && cardData.super === "Signature") {
          const cardTags = cardData.tags || [];
          // Check if at least one tag matches a legend tag
          const hasMatchingTag = cardTags.some(tag => legendTags.includes(tag));
          if (!hasMatchingTag) {
            invalidSignatureCards.push(cardData.name || cardId);
          }
        }
      }
      
      if (invalidSignatureCards.length > 0) {
        messages.push(`Signature cards without matching legend tag: ${invalidSignatureCards.slice(0, 5).join(", ")}${invalidSignatureCards.length > 5 ? "..." : ""}`);
        isValid = false;
      } else {
        messages.push("✓ All Signature cards match legend tags");
      }
    } else {
      // Can't validate signature cards without a legend, but this is already caught by Rule 1
      // So we'll skip this validation if legend is missing
    }
    
    setDeckValidation({ isValid, messages });
  };
  
  // Update validation whenever deck changes
  useEffect(() => {
    validateDeck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legendCard, battlefields, mainDeck, sideDeck, chosenChampion]);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
      }
    };
  }, []);
  
  const [containerScale, setContainerScale] = useState(1);
  
  // Toggle dark mode with persistence
  const toggleDarkMode = () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    setTheme(newMode ? 'dark' : 'light');
  };
  
  // Convert editor state to CardEntry format
  const getCurrentDeckCards = () => {
    return {
      mainDeck: [...mainDeck],
      chosenChampion: chosenChampion,
      sideDeck: [...sideDeck.filter(c => c)],
      battlefields: [...battlefields.filter(c => c)],
      runeACount: runeACount,
      runeBCount: runeBCount,
      runeAVariantIndex: runeAVariantIndex,
      runeBVariantIndex: runeBVariantIndex,
      legendCard: legendCard
    };
  };
  
  // Load deck cards into editor state
  const loadDeckCards = (cards) => {
    setMainDeck(cards.mainDeck || []);
    setChosenChampion(cards.chosenChampion || null);
    setSideDeck(compactSideDeck(cards.sideDeck || []));
    setBattlefields(cards.battlefields || []);
    setLegendCard(cards.legendCard || null);
    
    // Normalize rune counts: if they don't total 12, set to 6-6
    const runeA = cards.runeACount || 0;
    const runeB = cards.runeBCount || 0;
    if (runeA + runeB !== 12) {
      setRuneACount(6);
      setRuneBCount(6);
    } else {
      setRuneACount(runeA);
      setRuneBCount(runeB);
    }
    
    // Load rune variant indices (default to 0 if not present or invalid)
    const runeAVariant = cards.runeAVariantIndex ?? 0;
    const runeBVariant = cards.runeBVariantIndex ?? 0;
    
    // Get rune base IDs from legend card (need to do this after legend is set)
    // We'll use a helper function to get rune base IDs directly
    let runeABaseId = null;
    let runeBBaseId = null;
    if (cards.legendCard) {
      const legendCardData = getCardDetails(cards.legendCard);
      const colors = legendCardData?.colors || [];
      const color1 = colors[0] || null;
      const color2 = colors[1] || null;
      
      const colorMap = {
        "Mind": "OGN-089",
        "Order": "OGN-214",
        "Body": "OGN-126",
        "Calm": "OGN-042",
        "Chaos": "OGN-166",
        "Fury": "OGN-007"
      };
      runeABaseId = color1 ? colorMap[color1] : null;
      runeBBaseId = color2 ? colorMap[color2] : null;
    }
    
    // Validate variant indices exist for the runes
    if (runeABaseId) {
      const runeACard = getCardDetails(runeABaseId);
      const maxVariantIndex = runeACard?.variants ? runeACard.variants.length - 1 : 0;
      setRuneAVariantIndex(Math.min(Math.max(0, runeAVariant), maxVariantIndex));
    } else {
      setRuneAVariantIndex(0);
    }
    
    if (runeBBaseId) {
      const runeBCard = getCardDetails(runeBBaseId);
      const maxVariantIndex = runeBCard?.variants ? runeBCard.variants.length - 1 : 0;
      setRuneBVariantIndex(Math.min(Math.max(0, runeBVariant), maxVariantIndex));
    } else {
      setRuneBVariantIndex(0);
    }
  };
  
  // Bootstrap: Initialize decks and load last selected deck
  useEffect(() => {
    try {
      // Ensure at least one deck exists
      let initialDecks = ensureAtLeastOneDeck();
      setDecks(initialDecks);
      
      // Try to load last selected deck
      const lastId = getLastDeckId();
      let selectedDeck = null;
      
      if (lastId) {
        selectedDeck = initialDecks.find(d => d.id === lastId);
      }
      
      // If no last deck or not found, use first deck
      if (!selectedDeck && initialDecks.length > 0) {
        selectedDeck = initialDecks[0];
      }
      
      if (selectedDeck) {
        setCurrentDeckId(selectedDeck.id);
        loadDeckCards(selectedDeck.cards);
        setLastDeckId(selectedDeck.id);
        // Set selected card to the legend of the loaded deck (or null if empty)
        setSelectedCard(selectedDeck.cards.legendCard || null);
      }
    } catch (error) {
      console.error('Error initializing decks:', error);
      // Reset to single empty deck on error
      try {
        const emptyDeck = createDeck('Empty Deck');
        setDecks([emptyDeck]);
        setCurrentDeckId(emptyDeck.id);
        loadDeckCards(emptyDeck.cards);
        setLastDeckId(emptyDeck.id);
        // Set selected card to null for empty deck
        setSelectedCard(null);
        // Show notification asynchronously to avoid blocking initialization
        setTimeout(() => {
          showNotification('Deck Data Reset', 'There was an error loading your decks. A new empty deck has been created.').catch(console.error);
        }, 100);
      } catch (fallbackError) {
        console.error('Critical error during deck initialization:', fallbackError);
      }
    }
  }, []); // Run only on mount
  
  // Validate rune variant indices when legend card changes
  useEffect(() => {
    const { runeABaseId, runeBBaseId } = getRuneCards();
    
    // Validate rune A variant index
    if (runeABaseId) {
      const runeACard = getCardDetails(runeABaseId);
      const maxVariantIndex = runeACard?.variants ? runeACard.variants.length - 1 : 0;
      if (runeAVariantIndex > maxVariantIndex) {
        setRuneAVariantIndex(0);
      }
    } else {
      setRuneAVariantIndex(0);
    }
    
    // Validate rune B variant index
    if (runeBBaseId) {
      const runeBCard = getCardDetails(runeBBaseId);
      const maxVariantIndex = runeBCard?.variants ? runeBCard.variants.length - 1 : 0;
      if (runeBVariantIndex > maxVariantIndex) {
        setRuneBVariantIndex(0);
      }
    } else {
      setRuneBVariantIndex(0);
    }
  }, [legendCard]); // Re-validate when legend card changes
  
  // Apply theme on mount
  useEffect(() => {
    const theme = getTheme();
    setIsDarkMode(theme === 'dark');
    // Apply theme class to document
    if (theme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, []);
  
  // Update theme class when isDarkMode changes
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);
  
  // Select a deck
  const handleSelectDeck = (deckId) => {
    const deck = decks.find(d => d.id === deckId);
    if (deck) {
      setCurrentDeckId(deckId);
      loadDeckCards(deck.cards);
      setLastDeckId(deckId);
      // Set selected card to the legend of the newly loaded deck (or null if empty)
      setSelectedCard(deck.cards.legendCard || null);
    }
  };
  
  // Open name modal
  const openNameModal = (type, initialValue = '') => {
    setNameModal({
      isOpen: true,
      type,
      value: initialValue,
      error: null
    });
  };
  
  // Close name modal
  const closeNameModal = () => {
    setNameModal({
      isOpen: false,
      type: 'new',
      value: '',
      error: null
    });
  };
  
  // Handle name modal input change
  const handleNameModalChange = (value) => {
    setNameModal(prev => ({ ...prev, value, error: null }));
  };
  
  // Handle name modal confirm
  const handleNameModalConfirm = () => {
    const trimmed = nameModal.value.trim();
    const validation = validateDeckName(trimmed, decks, nameModal.type === 'rename' ? currentDeckId : null);
    
    if (!validation.valid) {
      setNameModal(prev => ({ ...prev, error: validation.error }));
      return;
    }
    
    if (nameModal.type === 'new') {
      handleNewDeck(validation.normalized);
    } else if (nameModal.type === 'saveAs') {
      handleSaveAs(validation.normalized);
    } else if (nameModal.type === 'rename') {
      handleRenameDeck(validation.normalized);
    }
    
    closeNameModal();
  };
  
  // New Deck handler
  const handleNewDeck = (name) => {
    const newDeck = createDeck(name);
    const updatedDecks = [...decks, newDeck];
    setDecks(updatedDecks);
    saveDecks(updatedDecks);
    setCurrentDeckId(newDeck.id);
    loadDeckCards(newDeck.cards);
    setLastDeckId(newDeck.id);
    // Set selected card to null for empty deck
    setSelectedCard(null);
    showNotification('Deck Created', `Deck "${name}" has been created.`);
  };
  
  // Save Deck handler
  const handleSaveDeck = async () => {
    if (!currentDeckId) return;
    
    setIsSaving(true);
    try {
      const updatedDecks = decks.map(deck => {
        if (deck.id === currentDeckId) {
          return {
            ...deck,
            cards: getCurrentDeckCards(),
            updatedAt: new Date().toISOString()
          };
        }
        return deck;
      });
      
      setDecks(updatedDecks);
      saveDecks(updatedDecks);
      await showNotification('Deck Saved', 'Deck saved successfully.');
    } catch (error) {
      console.error('Error saving deck:', error);
      await showNotification('Error', 'Failed to save deck.');
    } finally {
      setIsSaving(false);
    }
  };
  
  // Save As handler
  const handleSaveAs = (name) => {
    if (!currentDeckId) return;
    
    const currentDeck = decks.find(d => d.id === currentDeckId);
    if (!currentDeck) return;
    
    const newDeck = {
      ...createDeck(name),
      cards: getCurrentDeckCards()
    };
    
    const updatedDecks = [...decks, newDeck];
    setDecks(updatedDecks);
    saveDecks(updatedDecks);
    setCurrentDeckId(newDeck.id);
    setLastDeckId(newDeck.id);
    // Set selected card to the legend of the newly saved deck (or null if empty)
    setSelectedCard(newDeck.cards.legendCard || null);
    showNotification('Deck Saved As', `Deck saved as "${name}".`);
  };
  
  // Rename Deck handler
  const handleRenameDeck = (name) => {
    if (!currentDeckId) return;
    
    const updatedDecks = decks.map(deck => {
      if (deck.id === currentDeckId) {
        return {
          ...deck,
          name,
          updatedAt: new Date().toISOString()
        };
      }
      return deck;
    });
    
    setDecks(updatedDecks);
    saveDecks(updatedDecks);
    showNotification('Deck Renamed', `Deck renamed to "${name}".`);
  };
  
  // Delete Deck handler
  const handleDeleteDeck = async () => {
    if (!currentDeckId) return;
    
    // Check if only one deck exists
    if (decks.length === 1) {
      await showNotification(
        'Cannot Delete Deck',
        'You must always have at least one deck. Deleting the last deck is not allowed.'
      );
      return;
    }
    
    const currentDeck = decks.find(d => d.id === currentDeckId);
    if (!currentDeck) return;
    
    const confirmed = await showConfirmation(
      'Delete Deck',
      `Delete "${currentDeck.name}"?`
    );
    
    if (!confirmed) return;
    
    // Find next deck to select
    const currentIndex = decks.findIndex(d => d.id === currentDeckId);
    let nextDeck = null;
    
    if (currentIndex < decks.length - 1) {
      // Select next deck
      nextDeck = decks[currentIndex + 1];
    } else if (currentIndex > 0) {
      // Select previous deck
      nextDeck = decks[currentIndex - 1];
    }
    
    // Remove deck
    const updatedDecks = decks.filter(d => d.id !== currentDeckId);
    setDecks(updatedDecks);
    saveDecks(updatedDecks);
    
    // Select next deck
    if (nextDeck) {
      setCurrentDeckId(nextDeck.id);
      loadDeckCards(nextDeck.cards);
      setLastDeckId(nextDeck.id);
      // Set selected card to the legend of the newly loaded deck (or null if empty)
      setSelectedCard(nextDeck.cards.legendCard || null);
    }
    
    showNotification('Deck Deleted', `Deck "${currentDeck.name}" has been deleted.`);
  };
  
  // Handle mouse down from champion slot
  const handleChampionMouseDown = (e) => {
    if (e.button === 0 && chosenChampion) {
      e.preventDefault();
      setMousePosition({ x: e.clientX, y: e.clientY });
      
      // Clear champion slot immediately (will be restored if dropped back)
      setChosenChampion(null);
      
      setIsDragging(true);
      setDraggedCard(chosenChampion);
      setIsDraggingFromChampion(true);
      setDragIndex(-1); // Special index for champion
    }
  };
  
  // Handle mouse down from legend slot
  const handleLegendMouseDown = (e) => {
    if (e.button === 0 && legendCard) {
      e.preventDefault();
      setMousePosition({ x: e.clientX, y: e.clientY });
      
      // Clear legend slot immediately (will be restored if dropped back)
      setLegendCard(null);
      
      setIsDragging(true);
      setDraggedCard(legendCard);
      setIsDraggingFromLegend(true);
      setDragIndex(-2); // Special index for legend
    }
  };
  
  // Handle mouse down: start dragging from main deck
  const handleMouseDown = (e, index) => {
    if (e.button === 0 && mainDeck[index]) { // Left mouse button
      if (e.shiftKey) {
        // Shift + left-click: Move to side deck if there's room
        e.preventDefault();
        const cardId = mainDeck[index];
        const currentSideDeckCount = sideDeck.filter(c => c).length;
        
        // Count copies excluding the one we're moving from main deck
        const mainDeckCopies = mainDeck.filter(id => id === cardId).length - 1; // Exclude the one we're moving
        const championCopies = (chosenChampion === cardId) ? 1 : 0;
        const sideDeckCopies = sideDeck.filter(id => id === cardId).length;
        const totalCopyCountAfterMove = mainDeckCopies + championCopies + sideDeckCopies + 1; // +1 for the new position in side deck
        
        if (currentSideDeckCount < 8 && totalCopyCountAfterMove <= 3) {
          // Remove from main deck
          const newMainDeck = mainDeck.filter((_, i) => i !== index);
          setMainDeck(newMainDeck);
          
          // Add to side deck
          const newSideDeck = [...sideDeck];
          const emptyIndex = newSideDeck.findIndex(c => !c);
          if (emptyIndex !== -1) {
            newSideDeck[emptyIndex] = cardId;
          } else {
            newSideDeck.push(cardId);
          }
          setSideDeck(compactSideDeck(newSideDeck));
        }
        return; // Don't start dragging
      }
      
      e.preventDefault(); // Prevent text selection and default drag behavior
      
      // Use viewport coordinates - this is what position: fixed uses
      setMousePosition({ 
        x: e.clientX, 
        y: e.clientY 
      });
      
      // Remove card from deck immediately when picked up
      const newDeck = mainDeck.filter((_, i) => i !== index);
      setMainDeck(newDeck);
      
      setIsDragging(true);
      setDraggedCard(mainDeck[index]);
      setDragIndex(index);
    }
  };
  
  // Handle mouse down: start dragging from side deck
  const handleSideDeckMouseDown = (e, index) => {
    if (e.button === 0 && sideDeck[index]) { // Left mouse button
      if (e.shiftKey) {
        // Shift + left-click: Move to main deck if there's room
        e.preventDefault();
        const cardId = sideDeck[index];
        const totalCards = mainDeck.length + (chosenChampion ? 1 : 0);
        
        // Count copies excluding the one we're moving from side deck
        const mainDeckCopies = mainDeck.filter(id => id === cardId).length;
        const championCopies = (chosenChampion === cardId) ? 1 : 0;
        const sideDeckCopies = sideDeck.filter(id => id === cardId).length - 1; // Exclude the one we're moving
        const totalCopyCountAfterMove = mainDeckCopies + championCopies + sideDeckCopies + 1; // +1 for the new position in main deck
        
        if (totalCards < 40 && totalCopyCountAfterMove <= 3) {
          // Remove from side deck
          const newSideDeck = sideDeck.filter((_, i) => i !== index);
          setSideDeck(compactSideDeck(newSideDeck));
          
          // Try to set as champion if it's a champion and chosenChampion is null
          const wasSetAsChampion = trySetChampionIfNeeded(cardId);
          // Only add to main deck if it wasn't set as champion
          if (!wasSetAsChampion) {
            setMainDeck(prev => [...prev, cardId]);
          }
        }
        return; // Don't start dragging
      }
      
      e.preventDefault(); // Prevent text selection and default drag behavior
      
      setMousePosition({ 
        x: e.clientX, 
        y: e.clientY 
      });
      
      // Store the card being dragged and its position
      const cardBeingDragged = sideDeck[index];
      
      // Remove card from side deck immediately when picked up (shift cards down)
      const newSideDeck = sideDeck.filter((_, i) => i !== index);
      // Compact and pad to 8 with nulls
      setSideDeck(compactSideDeck(newSideDeck));
      
      setIsDragging(true);
      setDraggedCard(cardBeingDragged);
      setDragIndex(index);
      setIsDraggingFromSideDeck(true);
    }
  };
  
  // Handle mouse down: start dragging from battlefields
  const handleBattlefieldMouseDown = (e, index) => {
    if (e.button === 0 && battlefields[index]) { // Left mouse button
      e.preventDefault(); // Prevent text selection and default drag behavior
      
      setMousePosition({ 
        x: e.clientX, 
        y: e.clientY 
      });
      
      // Remove card from battlefields immediately when picked up
      const newBattlefields = battlefields.filter((_, i) => i !== index);
      setBattlefields(newBattlefields);
      
      setIsDragging(true);
      setDraggedCard(battlefields[index]);
      setDragIndex(index);
      setIsDraggingFromBattlefield(true);
    }
  };
  
  // Handle mouse down: start dragging from search results
  const handleSearchResultMouseDown = (e, cardId) => {
    if (e.button === 0 && cardId) { // Left mouse button
      e.preventDefault();
      
      setMousePosition({ 
        x: e.clientX, 
        y: e.clientY 
      });
      
      setIsDragging(true);
      setDraggedCard(cardId);
      setDragIndex(null);
      setIsDraggingFromSearch(true);
    } else if (e.shiftKey) {
      // Prevent text selection when shift is held
      e.preventDefault();
      e.stopPropagation();
    }
  };
  
  // Handle search result context menu (right-click)
  const handleSearchResultContext = (e, cardId) => {
    e.preventDefault();
    e.stopPropagation();
    
    const cardData = getCardDetails(cardId);
    const cardType = cardData?.type;
    
    // Legends and Battlefields can't go to main/side deck, so shift+right-click does nothing
    if (e.shiftKey) {
      if (cardType === 'Legend' || cardType === 'Battlefield') {
        return; // Do nothing for legends/battlefields on shift+right-click
      }
      // Shift + right-click: Add to side deck (for non-Legend/Battlefield cards)
      const currentSideDeckCount = sideDeck.filter(c => c).length;
      const totalCopyCount = countTotalCardCopies(cardId);
      if (cardId && currentSideDeckCount < 8 && totalCopyCount < 3) {
        // Try to set as champion if it's a champion and chosenChampion is null
        trySetChampionIfNeeded(cardId);
        
        const newSideDeck = [...sideDeck];
        // Find first empty slot or add to end
        const emptyIndex = newSideDeck.findIndex(c => !c);
        if (emptyIndex !== -1) {
          newSideDeck[emptyIndex] = cardId;
        } else {
          newSideDeck.push(cardId);
        }
        setSideDeck(compactSideDeck(newSideDeck));
      } else if (cardId && totalCopyCount >= 3) {
        // Too many copies
        showMaxCopiesToast(cardId);
      } else if (cardId && currentSideDeckCount >= 8) {
        // Side deck is full
        showNoSpaceToast('Side Deck');
      }
    } else {
      // Right-click handling
      if (cardType === 'Legend') {
        // Right-click on Legend: Add to legend slot if empty
        if (!legendCard) {
          setLegendCard(cardId);
        } else {
          // Legend slot is full
          showNoSpaceToast('Legend');
        }
      } else if (cardType === 'Battlefield') {
        // Right-click on Battlefield: Add to battlefield slot if there's room (max 3) and not already present
        if (battlefields.length < 3 && !battlefields.includes(cardId)) {
          setBattlefields([...battlefields, cardId]);
        } else if (battlefields.length >= 3) {
          // Battlefields are full
          showNoSpaceToast('Battlefields');
        }
      } else {
        // Right-click: Add to main deck (for non-Legend/Battlefield cards)
        const totalCards = mainDeck.length + (chosenChampion ? 1 : 0);
        const totalCopyCount = countTotalCardCopies(cardId);
        if (cardId && totalCards < 40 && totalCopyCount < 3) {
          // Try to set as champion if it's a champion and chosenChampion is null
          const wasSetAsChampion = trySetChampionIfNeeded(cardId);
          // Only add to main deck if it wasn't set as champion
          if (!wasSetAsChampion) {
            setMainDeck(prev => [...prev, cardId]);
          }
        } else if (cardId && totalCopyCount >= 3) {
          // Too many copies
          showMaxCopiesToast(cardId);
        } else if (cardId && totalCards >= 40) {
          // Main deck is full
          showNoSpaceToast('Main Deck');
        }
      }
    }
  };
  
  // Helper function to get color square emoji
  const getColorCircle = (color) => {
    const colorMap = {
      "Calm": "🟩",
      "Body": "🟧",
      "Mind": "🟦",
      "Fury": "🟥",
      "Order": "🟨",
      "Chaos": "🟪"
    };
    return colorMap[color] || "";
  };

  // Helper function to get legend colors display
  const getLegendColorsDisplay = () => {
    if (!legendCard) {
      return "Legend Colors";
    }
    const legendData = getCardDetails(legendCard);
    const colors = legendData?.colors || [];
    const circles = colors.map(color => getColorCircle(color)).join("");
    return `Legend Colors ${circles}`;
  };

  // Helper function to convert wildcard pattern to regex
  const wildcardToRegex = (pattern) => {
    const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regexStr = escaped.replace(/\*/g, '.*');
    return new RegExp(regexStr, 'i');
  };

  // Handle search function
  const handleSearch = () => {
    // Filter cards based on search criteria
    const filtered = cardsData.filter(card => {
      // Exclude Rune cards from all search results
      if (card.type === 'Rune') {
        return false;
      }
      
      // Exclude Token cards (cards with super === "Token")
      if (card.super === 'Token') {
        return false;
      }
      
      // Exclude Legends and Battlefields if Energy or Power filters have values
      if ((searchFilters.energyMin || searchFilters.energyMax || searchFilters.powerMin || searchFilters.powerMax) && 
          (card.type === 'Legend' || card.type === 'Battlefield')) {
        return false;
      }
      
      // Exclude Legends, Battlefields, Gears, and Spells if Might filters have values
      if ((searchFilters.mightMin || searchFilters.mightMax) && 
          (card.type === 'Legend' || card.type === 'Battlefield' || card.type === 'Gear' || card.type === 'Spell')) {
        return false;
      }
      
      // Card Name filter with wildcard support
      if (searchFilters.cardName) {
        const namePattern = wildcardToRegex(searchFilters.cardName);
        if (!namePattern.test(card.name || '')) {
          return false;
        }
      }
      
      // Card Text filter (description) with wildcard support
      if (searchFilters.cardText) {
        const textPattern = wildcardToRegex(searchFilters.cardText);
        if (!textPattern.test(card.description || '')) {
          return false;
        }
      }
      
      // Card Type filter
      if (searchFilters.cardType) {
        if (searchFilters.cardType === 'Champion') {
          // Champion filter: must be Unit type with super === "Champion"
          if (card.type !== 'Unit' || card.super !== 'Champion') {
            return false;
          }
        } else if (searchFilters.cardType === 'Equipment') {
          // Equipment filter: must have "Equipment" in tags
          if (!(card.tags && card.tags.includes('Equipment'))) {
            return false;
          }
        } else {
          // Other types: match type exactly
          if (card.type !== searchFilters.cardType) {
            return false;
          }
        }
      }
      
      // Card Color filter (skip if Battlefield)
      if (searchFilters.cardColor && searchFilters.cardType !== 'Battlefield') {
        if (searchFilters.cardColor === "Legend Colors") {
          // Get legend colors from current legend in deck
          const legendData = getCardDetails(legendCard);
          const legendColors = legendData?.colors || [];
          
          // Match if card's colors are a subset of legend's colors (no colors outside legend)
          if (!card.colors || card.colors.length === 0) {
            return false;
          }
          // Check that every color in the card is in the legend's colors
          if (!card.colors.every(color => legendColors.includes(color))) {
            return false;
          }
        } else {
          // Regular color filter
          if (!card.colors || !card.colors.includes(searchFilters.cardColor)) {
            return false;
          }
        }
      }
      
      // Energy range filter (skip if Legend or Battlefield)
      if (searchFilters.cardType !== 'Legend' && searchFilters.cardType !== 'Battlefield') {
        const energy = card.energy || 0;
        if (searchFilters.energyMin && energy < parseInt(searchFilters.energyMin)) {
          return false;
        }
        if (searchFilters.energyMax && energy > parseInt(searchFilters.energyMax)) {
          return false;
        }
      }
      
      // Power range filter (skip if Legend or Battlefield)
      if (searchFilters.cardType !== 'Legend' && searchFilters.cardType !== 'Battlefield') {
        const power = card.power || 0;
        if (searchFilters.powerMin && power < parseInt(searchFilters.powerMin)) {
          return false;
        }
        if (searchFilters.powerMax && power > parseInt(searchFilters.powerMax)) {
          return false;
        }
      }
      
      // Might range filter (skip if Gear, Equipment, Spell, Legend, or Battlefield)
      if (searchFilters.cardType !== 'Gear' && searchFilters.cardType !== 'Equipment' && searchFilters.cardType !== 'Spell' && searchFilters.cardType !== 'Legend' && searchFilters.cardType !== 'Battlefield') {
        const might = card.might || 0;
        if (searchFilters.mightMin && might < parseInt(searchFilters.mightMin)) {
          return false;
        }
        if (searchFilters.mightMax && might > parseInt(searchFilters.mightMax)) {
          return false;
        }
      }
      
      return true;
    });
    
    // Sort filtered cards based on sort order
    const sorted = [...filtered].sort((a, b) => {
      // Helper function to get color sort value (alphabetical order of first color)
      const getColorSortValue = (card) => {
        const colors = card.colors || [];
        if (colors.length === 0) return 'ZZZ'; // No color cards go to end
        if (colors.length > 1) return 'ZZY'; // Multiple color cards go to end (after no colors)
        return colors.sort()[0]; // Single color cards sorted alphabetically
      };
      
      // Primary sort: based on selected sort order
      let primaryDiff = 0;
      switch (sortOrder) {
        case 'Energy':
          primaryDiff = (a.energy || 0) - (b.energy || 0);
          break;
        case 'Power':
          primaryDiff = (a.power || 0) - (b.power || 0);
          break;
        case 'Might':
          primaryDiff = (a.might || 0) - (b.might || 0);
          break;
        case 'Color':
          primaryDiff = getColorSortValue(a).localeCompare(getColorSortValue(b));
          break;
        case 'A-Z':
          primaryDiff = (a.name || '').localeCompare(b.name || '');
          break;
        default:
          primaryDiff = 0;
      }
      
      if (primaryDiff !== 0) return sortDescending ? -primaryDiff : primaryDiff;
      
      // Secondary sort: Energy -> Power -> Alphabetical
      const energyDiff = (a.energy || 0) - (b.energy || 0);
      if (energyDiff !== 0) return sortDescending ? -energyDiff : energyDiff;
      
      const powerDiff = (a.power || 0) - (b.power || 0);
      if (powerDiff !== 0) return sortDescending ? -powerDiff : powerDiff;
      
      // Tertiary sort: Alphabetical
      const nameDiff = (a.name || '').localeCompare(b.name || '');
      return sortDescending ? -nameDiff : nameDiff;
    });
    
    // Expand cards into variants: each card becomes multiple results (base + all variants)
    const expandedResults = [];
    for (const card of sorted) {
      // Add base card (variant index 0)
      expandedResults.push({
        ...card,
        variantIndex: 0,
        displayCardId: formatCardId(card.variantNumber, 0)
      });
      
      // Add all variants immediately after the base card
      if (card.variants && card.variants.length > 1) {
        for (let i = 1; i < card.variants.length; i++) {
          expandedResults.push({
            ...card,
            variantIndex: i,
            displayCardId: formatCardId(card.variantNumber, i)
          });
        }
      }
    }
    
    // Store expanded results (each variant is a separate entry) for pagination
    setSearchResults(expandedResults);
    setCurrentPage(1);
    setTotalPages(Math.ceil(expandedResults.length / 24)); // 24 cards per page (4x6)
    setIsPageTransitioning(false); // Reset transition state
    setLoadedSearchImages(new Set()); // Reset loaded images on new search
  };
  
  // Handle pagination
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages && newPage !== currentPage) {
      // Clear current page first (flash empty)
      setIsPageTransitioning(true);
      setLoadedSearchImages(new Set()); // Reset loaded images
      
      // After a brief delay, load the new page
      setTimeout(() => {
        setCurrentPage(newPage);
        setIsPageTransitioning(false);
      }, 100); // 100ms delay to show empty state
    }
  };
  
  // Handle image load for search results
  const handleSearchImageLoad = (cardId) => {
    setLoadedSearchImages(prev => {
      // Only update if not already in the set to prevent unnecessary re-renders
      if (prev.has(cardId)) {
        return prev; // Return same reference to prevent re-render
      }
      const newSet = new Set(prev);
      newSet.add(cardId);
      return newSet;
    });
  };
  
  // Check if all images on current page are loaded
  const areAllSearchImagesLoaded = () => {
    const currentResults = getCurrentPageResults();
    const cardIds = currentResults.map(r => r?.displayCardId).filter(Boolean);
    if (cardIds.length === 0) return true; // No cards to load
    return cardIds.every(cardId => loadedSearchImages.has(cardId));
  };
  
  // Get current page results
  const getCurrentPageResults = () => {
    // Return empty array during page transition to show empty state
    if (isPageTransitioning) {
      return [];
    }
    const startIndex = (currentPage - 1) * 24;
    const endIndex = startIndex + 24;
    return searchResults.slice(startIndex, endIndex);
  };
  
  // Handle mouse move: update drag position
  const handleMouseMove = (e) => {
    if (isDragging) {
      e.preventDefault(); // Prevent text selection during drag
      
      // Use viewport coordinates - this is what position: fixed uses
      setMousePosition({ 
        x: e.clientX, 
        y: e.clientY 
      });
    }
  };
  
  // Count how many copies of a card are in the main deck (compares by baseId, not variant index)
  const countCardCopies = (cardId) => {
    if (!cardId) return 0;
    const { baseId } = parseCardId(cardId);
    return mainDeck.filter(id => {
      const { baseId: otherBaseId } = parseCardId(id);
      return otherBaseId === baseId;
    }).length;
  };
  
  // Helper function to compact side deck (remove nulls from middle, pad to 8 at end)
  const compactSideDeck = (deck) => {
    const nonNulls = deck.filter(c => c !== null);
    while (nonNulls.length < 8) {
      nonNulls.push(null);
    }
    return nonNulls;
  };

  // Count total copies of a card across main deck (including champion) and side deck (compares by baseId)
  const countTotalCardCopies = (cardId) => {
    if (!cardId) return 0;
    const { baseId } = parseCardId(cardId);
    const mainDeckCopies = mainDeck.filter(id => {
      const { baseId: otherBaseId } = parseCardId(id);
      return otherBaseId === baseId;
    }).length;
    const championCopies = chosenChampion ? (() => {
      const { baseId: championBaseId } = parseCardId(chosenChampion);
      return championBaseId === baseId ? 1 : 0;
    })() : 0;
    const sideDeckCopies = sideDeck.filter(id => {
      const { baseId: otherBaseId } = parseCardId(id);
      return otherBaseId === baseId;
    }).length;
    return mainDeckCopies + championCopies + sideDeckCopies;
  };
  
  // Mobile detection - check if device is mobile/touch device
  const [isMobile, setIsMobile] = useState(false);
  
  useEffect(() => {
    const checkMobile = () => {
      // Check for touch capability and screen width
      const hasTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;
      const isSmallScreen = window.innerWidth <= 768;
      setIsMobile(hasTouch && isSmallScreen);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);
  
  // Double-tap handler state - track last tap time and card
  const [lastTap, setLastTap] = useState({ time: 0, cardId: null });
  const tapTimeoutRef = useRef(null);
  
  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (tapTimeoutRef.current) {
        clearTimeout(tapTimeoutRef.current);
      }
    };
  }, []);
  
  // Handle double-tap to move card between decks (mobile only)
  const handleDoubleTap = (cardId, source) => {
    // Only work on mobile
    if (!isMobile) return;
    
    // Don't allow Legends or Battlefields to go to side deck
    const cardDetails = getCardDetails(cardId);
    if (cardDetails?.type === 'Legend' || cardDetails?.type === 'Battlefield') {
      return;
    }
    
    const currentTime = Date.now();
    const tapDelay = 300; // 300ms window for double-tap
    
    // Clear any existing timeout
    if (tapTimeoutRef.current) {
      clearTimeout(tapTimeoutRef.current);
      tapTimeoutRef.current = null;
    }
    
    // Check if this is a double-tap on the same card
    if (currentTime - lastTap.time < tapDelay && lastTap.cardId === cardId) {
      // Double-tap detected
      
      if (source === 'sideDeck') {
        // Double-tap in side deck: move to main deck if space allows
        const totalCards = mainDeck.length + (chosenChampion ? 1 : 0);
        
        // Count current copies (excluding the one we're moving from side deck)
        const mainDeckCopies = mainDeck.filter(id => id === cardId).length;
        const sideDeckCopies = sideDeck.filter(id => id === cardId).length - 1; // Exclude the one we're moving
        const championCopies = (chosenChampion === cardId) ? 1 : 0;
        const totalCopyCountAfterMove = mainDeckCopies + championCopies + sideDeckCopies + 1; // +1 for the new position in main deck
        
        // Check if main deck has space and copy limit allows
        if (totalCards < 40 && totalCopyCountAfterMove <= 3) {
          // Remove from side deck
          const cardIndex = sideDeck.findIndex(id => id === cardId);
          if (cardIndex !== -1) {
            const newSideDeck = sideDeck.filter((_, i) => i !== cardIndex);
            setSideDeck(compactSideDeck(newSideDeck));
            
            // Try to set as champion if it's a champion and chosenChampion is null
            const wasSetAsChampion = trySetChampionIfNeeded(cardId);
            // Only add to main deck if it wasn't set as champion
            if (!wasSetAsChampion) {
              setMainDeck(prev => [...prev, cardId]);
            }
          }
          
          // Reset tap tracking
          setLastTap({ time: 0, cardId: null });
        } else {
          // Conditions not met, show appropriate toast
          if (totalCopyCountAfterMove > 3) {
            showMaxCopiesToast(cardId);
          } else if (totalCards >= 40) {
            showNoSpaceToast('Main Deck');
          }
          // Reset tap tracking
          setLastTap({ time: 0, cardId: null });
        }
      } else {
        // Double-tap in main deck or search results: add to side deck if space allows
        const currentSideDeckCount = sideDeck.filter(c => c).length;
        
        // Count current copies
        let mainDeckCopies = mainDeck.filter(id => id === cardId).length;
        let sideDeckCopies = sideDeck.filter(id => id === cardId).length;
        const championCopies = (chosenChampion === cardId) ? 1 : 0;
        
        // If source is main deck, exclude one copy (we're moving it)
        if (source === 'mainDeck') {
          mainDeckCopies = Math.max(0, mainDeckCopies - 1);
        }
        // For searchResults, don't exclude any copies - it's a new card being added
        
        // Calculate total copies after move
        const totalCopyCountAfterMove = mainDeckCopies + championCopies + sideDeckCopies + 1; // +1 for the new position in side deck
        
        // Check if side deck has space and copy limit allows (strictly <= 3)
        if (currentSideDeckCount < 8 && totalCopyCountAfterMove <= 3) {
          // Remove from source if needed (not for search results - those are new cards)
          if (source === 'mainDeck') {
            // Find and remove one instance from main deck
            const cardIndex = mainDeck.findIndex(id => id === cardId);
            if (cardIndex !== -1) {
              const newMainDeck = mainDeck.filter((_, i) => i !== cardIndex);
              setMainDeck(newMainDeck);
            }
          }
          // For searchResults, we don't remove from anywhere - just add a new copy
          
          // Add to side deck
          const newSideDeck = [...sideDeck];
          const emptyIndex = newSideDeck.findIndex(c => !c);
          if (emptyIndex !== -1) {
            newSideDeck[emptyIndex] = cardId;
          } else {
            newSideDeck.push(cardId);
          }
          setSideDeck(compactSideDeck(newSideDeck));
          
          // Try to set as champion if it's a champion and chosenChampion is null
          trySetChampionIfNeeded(cardId);
          
          // Reset tap tracking
          setLastTap({ time: 0, cardId: null });
        } else {
          // Conditions not met, show appropriate toast
          if (totalCopyCountAfterMove > 3) {
            showMaxCopiesToast(cardId);
          } else if (currentSideDeckCount >= 8) {
            showNoSpaceToast('Side Deck');
          }
          // Reset tap tracking
          setLastTap({ time: 0, cardId: null });
        }
      }
    } else {
      // First tap or different card - record it and set timeout to reset
      setLastTap({ time: currentTime, cardId });
      tapTimeoutRef.current = setTimeout(() => {
        setLastTap({ time: 0, cardId: null });
        tapTimeoutRef.current = null;
      }, tapDelay);
    }
  };
  
  // Auto-fill champion slot with next available champion from deck
  const autoFillChampion = () => {
    const nextChampion = findFirstChampion(mainDeck);
    if (nextChampion) {
      setChosenChampion(nextChampion);
      // Remove only the first instance of this champion
      setMainDeck(prev => {
        const index = prev.findIndex(id => id === nextChampion);
        if (index !== -1) {
          const newDeck = [...prev];
          newDeck.splice(index, 1);
          return newDeck;
        }
        return prev;
      });
    } else {
      setChosenChampion(null);
    }
  };
  
  // Handle mouse up: drop the card
  const handleMouseUp = (e) => {
    if (isDragging && draggedCard !== null) {
      e.preventDefault();
      
      const elementBelow = document.elementFromPoint(e.clientX, e.clientY);
      const cardElement = elementBelow?.closest('[data-card-index]');
      const sideDeckSlot = elementBelow?.closest('[data-side-deck-index]');
      const championSlot = elementBelow?.closest('[data-champion-slot]');
      const legendSlot = elementBelow?.closest('[data-legend-slot]');
      const battlefieldSlot = elementBelow?.closest('[data-battlefield-index]');
      
      // Handle dropping onto battlefield slot
      if (battlefieldSlot) {
        const droppedCard = getCardDetails(draggedCard);
        const cardType = droppedCard?.type;
        
          // Only Battlefields can go in battlefield slot - do nothing for other types
        if (cardType !== "Battlefield") {
          // Restore card if it was dragged from somewhere
          if (isDraggingFromSearch) {
            // From search, do nothing (already handled)
          } else if (isDraggingFromLegend) {
            setLegendCard(draggedCard);
          } else if (isDraggingFromSideDeck) {
            setSideDeck(prev => {
              const newSideDeck = [...prev];
              newSideDeck.splice(dragIndex, 0, draggedCard);
              return compactSideDeck(newSideDeck);
            });
          } else if (isDraggingFromChampion) {
            setChosenChampion(draggedCard);
          } else if (dragIndex !== null && dragIndex !== undefined) {
            // Restore to main deck
            const newMainDeck = [...mainDeck];
            newMainDeck.splice(dragIndex, 0, draggedCard);
            setMainDeck(newMainDeck);
          }
          // Clear drag state
          setIsDragging(false);
          setDraggedCard(null);
          setDragIndex(null);
          setIsDraggingFromChampion(false);
          setIsDraggingFromLegend(false);
          setIsDraggingFromSideDeck(false);
          setIsDraggingFromBattlefield(false);
          setIsDraggingFromSearch(false);
          setSelectedCard(null);
          return; // Do nothing, card type can't go here
        }
        
        const dropIndex = parseInt(battlefieldSlot.getAttribute('data-battlefield-index'));
        const newBattlefields = [...battlefields];
        
        if (isDraggingFromSearch) {
          // Dragged from search results - only add if under 3 battlefields and not already present
          if (battlefields.length < 3 && !battlefields.includes(draggedCard)) {
            newBattlefields.splice(dropIndex, 0, draggedCard);
            setBattlefields(newBattlefields);
          } else if (battlefields.length >= 3) {
            // Battlefields are full
            showNoSpaceToast('Battlefields');
          }
          // If already at 3 or already present, do nothing
        } else if (isDraggingFromBattlefield) {
          // Dropping within battlefield section - reorder (always allowed, max stays 3)
          newBattlefields.splice(dropIndex, 0, draggedCard);
          setBattlefields(newBattlefields);
        } else {
          // Dropping from another section - only add if under 3 battlefields and not already present
          if (battlefields.length < 3 && !battlefields.includes(draggedCard)) {
            newBattlefields.splice(dropIndex, 0, draggedCard);
            setBattlefields(newBattlefields);
          } else {
            // If already at 3 or already present, restore card to original location
            if (isDraggingFromLegend) {
              setLegendCard(draggedCard);
            } else if (isDraggingFromSideDeck) {
              setSideDeck(prev => {
                const newSideDeck = [...prev];
                newSideDeck.splice(dragIndex, 0, draggedCard);
                return compactSideDeck(newSideDeck);
              });
            } else if (isDraggingFromChampion) {
              setChosenChampion(draggedCard);
            } else if (dragIndex !== null && dragIndex !== undefined) {
              const newMainDeck = [...mainDeck];
              newMainDeck.splice(dragIndex, 0, draggedCard);
              setMainDeck(newMainDeck);
            }
          }
        }
      }
      // Handle dropping onto side deck slot
      else if (sideDeckSlot) {
        const droppedCard = getCardDetails(draggedCard);
        const cardType = droppedCard?.type;
        
        // Legends and Battlefields can't go to side deck - do nothing
        if (cardType === 'Legend' || cardType === 'Battlefield') {
          // Restore card if it was dragged from somewhere
          if (isDraggingFromLegend) {
            setLegendCard(draggedCard);
          } else if (isDraggingFromBattlefield && dragIndex !== null && dragIndex !== undefined) {
            setBattlefields(prev => {
              const newBattlefields = [...prev];
              newBattlefields.splice(dragIndex, 0, draggedCard);
              return newBattlefields;
            });
          } else if (isDraggingFromChampion) {
            setChosenChampion(draggedCard);
          } else if (!isDraggingFromSearch && dragIndex !== null && dragIndex !== undefined) {
            // Restore to main deck
            const newMainDeck = [...mainDeck];
            newMainDeck.splice(dragIndex, 0, draggedCard);
            setMainDeck(newMainDeck);
          }
          // Clear drag state
          setIsDragging(false);
          setDraggedCard(null);
          setDragIndex(null);
          setIsDraggingFromChampion(false);
          setIsDraggingFromLegend(false);
          setIsDraggingFromSideDeck(false);
          setIsDraggingFromBattlefield(false);
          setIsDraggingFromSearch(false);
          setSelectedCard(null);
          return; // Do nothing, card type can't go here
        }
        
        const dropIndex = parseInt(sideDeckSlot.getAttribute('data-side-deck-index'));
        const newSideDeck = [...sideDeck];
        
        // Count non-null cards in side deck
        const currentSideDeckCount = sideDeck.filter(c => c).length;
        
        if (isDraggingFromSearch) {
          // Dragged from search results into side deck
          // Only add if side deck has space and under copy limit - don't swap if full
          if (currentSideDeckCount < 8) {
            const totalCopyCount = countTotalCardCopies(draggedCard);
            if (totalCopyCount < 3) {
              // Try to set as champion if it's a champion and chosenChampion is null
              trySetChampionIfNeeded(draggedCard);
              
              newSideDeck.splice(dropIndex, 0, draggedCard);
              setSideDeck(compactSideDeck(newSideDeck));
            } else {
              // Too many copies
              showMaxCopiesToast(draggedCard);
            }
          } else {
            // Side deck is full
            showNoSpaceToast('Side Deck');
          }
          // If side deck is full or too many copies, do nothing (don't add/swaps)
        } else if (isDraggingFromSideDeck) {
          // Dropping within side deck - reorder (always allowed)
          // Card is already removed from sideDeck, so newSideDeck has it removed
          // dropIndex is already the correct position in the shifted array
          // Insert at dropIndex (which inserts before the element at that position)
          newSideDeck.splice(dropIndex, 0, draggedCard);
          setSideDeck(compactSideDeck(newSideDeck));
        } else {
          // Dropping from main deck or other source into side deck
          if (currentSideDeckCount >= 8) {
            // Side deck is full, swap with the card at this position
            // First check if the card being added would exceed the copy limit
            const totalCopyCount = countTotalCardCopies(draggedCard);
            if (totalCopyCount < 3) {
              const oldCard = newSideDeck[dropIndex];
              newSideDeck[dropIndex] = draggedCard;
              setSideDeck(compactSideDeck(newSideDeck));
              
              // Put the old side deck card back to where it came from
              if (!isDraggingFromSideDeck && !isDraggingFromLegend && !isDraggingFromBattlefield && !isDraggingFromChampion) {
                // Coming from main deck
                if (dragIndex !== null && dragIndex !== undefined) {
                  const newMainDeck = [...mainDeck];
                  newMainDeck.splice(dragIndex, 0, oldCard);
                  setMainDeck(newMainDeck);
                } else {
                  // No dragIndex, add to end
                  setMainDeck([...mainDeck, oldCard]);
                }
              } else if (isDraggingFromChampion) {
                // Moving champion to side deck - restore old card to main deck and auto-fill champion
                setMainDeck([...mainDeck, oldCard]);
                // Auto-fill champion slot with next available champion from deck
                autoFillChampion();
              }
            } else {
              // Too many copies
              showMaxCopiesToast(draggedCard);
            }
            // If too many copies, don't swap
          } else {
            // Side deck has space, check copy limit before adding
            const totalCopyCount = countTotalCardCopies(draggedCard);
            if (totalCopyCount < 3) {
              // If moving champion to side deck, auto-fill champion slot
              if (isDraggingFromChampion) {
                autoFillChampion();
              } else {
                // Try to set as champion if it's a champion and chosenChampion is null
                trySetChampionIfNeeded(draggedCard);
              }
              
              newSideDeck.splice(dropIndex, 0, draggedCard);
              setSideDeck(compactSideDeck(newSideDeck));
            } else {
              // Too many copies
              showMaxCopiesToast(draggedCard);
            }
            // If too many copies, card just doesn't get added
          }
        }
      }
      // Handle dropping onto legend slot
      else if (legendSlot) {
        const droppedCard = getCardDetails(draggedCard);
        const cardType = droppedCard?.type;
        
        // Only Legends can go in legend slot - do nothing for other types
        if (cardType !== "Legend") {
          // Restore card if it was dragged from somewhere
          if (isDraggingFromSearch) {
            // From search, do nothing (already handled)
          } else if (isDraggingFromBattlefield && dragIndex !== null && dragIndex !== undefined) {
            setBattlefields(prev => {
              const newBattlefields = [...prev];
              newBattlefields.splice(dragIndex, 0, draggedCard);
              return newBattlefields;
            });
          } else if (isDraggingFromSideDeck) {
            setSideDeck(prev => {
              const newSideDeck = [...prev];
              newSideDeck.splice(dragIndex, 0, draggedCard);
              return compactSideDeck(newSideDeck);
            });
          } else if (isDraggingFromChampion) {
            setChosenChampion(draggedCard);
          } else if (dragIndex !== null && dragIndex !== undefined) {
            // Restore to main deck
            const newMainDeck = [...mainDeck];
            newMainDeck.splice(dragIndex, 0, draggedCard);
            setMainDeck(newMainDeck);
          }
          // Clear drag state
          setIsDragging(false);
          setDraggedCard(null);
          setDragIndex(null);
          setIsDraggingFromChampion(false);
          setIsDraggingFromLegend(false);
          setIsDraggingFromSideDeck(false);
          setIsDraggingFromBattlefield(false);
          setIsDraggingFromSearch(false);
          setSelectedCard(null);
          return; // Do nothing, card type can't go here
        }
        
        if (isDraggingFromSearch) {
          // Dragged from search results - check if legend slot is already full
          if (legendCard) {
            // Legend slot is full
            showNoSpaceToast('Legend');
          } else {
            setLegendCard(draggedCard);
          }
        } else if (isDraggingFromLegend) {
          // Dropping the legend back onto itself, just restore it
          setLegendCard(draggedCard);
        } else {
          // Swapping legends - dragging a legend from deck onto legend slot
          const oldLegend = legendCard;
          setLegendCard(draggedCard);
          
          // Add old legend to deck only if it doesn't already have 3 total copies
          if (oldLegend) {
            const legendCopyCount = countTotalCardCopies(oldLegend);
            if (legendCopyCount < 3) {
              setMainDeck(prev => [...prev, oldLegend]);
            }
          }
        }
      }
      // Handle dropping onto champion slot (index 0)
      else if (championSlot) {
        const droppedCard = getCardDetails(draggedCard);
        
        if (droppedCard?.super === "Champion") {
          if (isDraggingFromSearch) {
            // Dragged from search results - swap champions
            const oldChampion = chosenChampion;
            setChosenChampion(draggedCard);
            
            // Add old champion to deck if there's space and under copy limit
            // Count copies AFTER removing from slot (the old champion is no longer in slot)
            if (oldChampion) {
              const mainDeckCopies = mainDeck.filter(id => id === oldChampion).length;
              const sideDeckCopies = sideDeck.filter(id => id === oldChampion).length;
              const totalOldChampionCopies = mainDeckCopies + sideDeckCopies; // No longer in slot
            
              const totalCards = mainDeck.length + 1; // +1 for the new champion that's now in slot
              if (totalCards < 40 && totalOldChampionCopies < 3) {
                setMainDeck(prev => [...prev, oldChampion]);
              }
            }
          } else if (isDraggingFromChampion) {
            // Dropping the champion back onto itself, just restore it
            setChosenChampion(draggedCard);
          } else {
            // Swapping champions - dragging a champion from deck onto champion slot
            const oldChampion = chosenChampion;
            setChosenChampion(draggedCard);
            
            // Add old champion to deck if there's space and under copy limit
            // Count copies AFTER removing from slot (the old champion is no longer in slot)
            if (oldChampion) {
              const mainDeckCopies = mainDeck.filter(id => id === oldChampion).length;
              const sideDeckCopies = sideDeck.filter(id => id === oldChampion).length;
              const totalOldChampionCopies = mainDeckCopies + sideDeckCopies; // No longer in slot
            
              const totalCards = mainDeck.length + 1; // +1 for the new champion that's now in slot
              if (totalCards < 40 && totalOldChampionCopies < 3) {
                setMainDeck(prev => [...prev, oldChampion]);
              }
            }
          }
        }
      } else if (cardElement) {
        // Dropped on a card slot in main deck
        const droppedCard = getCardDetails(draggedCard);
        const cardType = droppedCard?.type;
        
        // Legends and Battlefields can't go to main deck - do nothing
        if (cardType === 'Legend' || cardType === 'Battlefield') {
          // Restore card if it was dragged from somewhere
          if (isDraggingFromLegend) {
            setLegendCard(draggedCard);
          } else if (isDraggingFromBattlefield && dragIndex !== null && dragIndex !== undefined) {
            setBattlefields(prev => {
              const newBattlefields = [...prev];
              newBattlefields.splice(dragIndex, 0, draggedCard);
              return newBattlefields;
            });
          } else if (isDraggingFromSideDeck) {
            setSideDeck(prev => {
              const newSideDeck = [...prev];
              newSideDeck.splice(dragIndex, 0, draggedCard);
              return compactSideDeck(newSideDeck);
            });
          } else if (isDraggingFromChampion) {
            setChosenChampion(draggedCard);
          }
          // Clear drag state
          setIsDragging(false);
          setDraggedCard(null);
          setDragIndex(null);
          setIsDraggingFromChampion(false);
          setIsDraggingFromLegend(false);
          setIsDraggingFromSideDeck(false);
          setIsDraggingFromBattlefield(false);
          setIsDraggingFromSearch(false);
          setSelectedCard(null);
          return; // Do nothing, card type can't go here
        }
        
        const dropIndex = parseInt(cardElement.getAttribute('data-card-index'));
        const newDeck = [...mainDeck];
        
        if (isDraggingFromSearch) {
          // Dragged from search results - check copy limit and deck size
          const totalCards = newDeck.length + (chosenChampion ? 1 : 0);
          const totalCopyCount = countTotalCardCopies(draggedCard);
          
          // Only add if deck has space and under copy limit - don't swap if full
          if (totalCards < 40 && totalCopyCount < 3) {
            // Try to set as champion if it's a champion and chosenChampion is null
            const wasSetAsChampion = trySetChampionIfNeeded(draggedCard);
            // Only add to main deck if it wasn't set as champion
            if (!wasSetAsChampion) {
              newDeck.splice(dropIndex, 0, draggedCard);
              setMainDeck(newDeck);
            }
          } else if (totalCopyCount >= 3) {
            // Too many copies
            showMaxCopiesToast(draggedCard);
          } else if (totalCards >= 40) {
            // Main deck is full
            showNoSpaceToast('Main Deck');
          }
          // If deck is full or too many copies, do nothing (don't add/swaps)
        } else if (isDraggingFromSideDeck) {
          // Dragged from side deck - check if it would exceed 40 cards
          const totalCards = newDeck.length + (chosenChampion ? 1 : 0);
          if (totalCards >= 40) {
            // Main deck is full (40 with champion), swap instead
            const oldCard = newDeck[dropIndex];
            newDeck[dropIndex] = draggedCard;
            setMainDeck(newDeck);
            
            // Put the old main deck card back to the side deck at the original position
            if (dragIndex !== null && dragIndex < 8) {
              setSideDeck(prevSideDeck => {
                const newSideDeck = [...prevSideDeck];
                // Insert at the original position, adjusting for the fact that card was already removed
                const insertIndex = dragIndex;
                // Remove any null at that position if there is one, then insert
                newSideDeck.splice(insertIndex, 0, oldCard);
                return compactSideDeck(newSideDeck);
              });
            }
          } else {
            // Main deck has space, check if we can add (max 3 copies total)
            const totalCopyCount = countTotalCardCopies(draggedCard);
            if (totalCopyCount < 3) {
              // Try to set as champion if it's a champion and chosenChampion is null
              const wasSetAsChampion = trySetChampionIfNeeded(draggedCard);
              // Only add to main deck if it wasn't set as champion
              if (!wasSetAsChampion) {
                newDeck.splice(dropIndex, 0, draggedCard);
                setMainDeck(newDeck);
              }
              
              // Successfully added to main deck (or set as champion), so clean up the null placeholder and shift the array
              setSideDeck(prevSideDeck => {
                const newSideDeck = [];
                for (let i = 0; i < prevSideDeck.length; i++) {
                  if (i !== dragIndex) {
                    newSideDeck.push(prevSideDeck[i]);
                  }
                }
                return compactSideDeck(newSideDeck);
              });
            } else {
              // Too many copies, restore card to side deck
              showMaxCopiesToast(draggedCard);
              if (dragIndex !== null && dragIndex < 8) {
                setSideDeck(prevSideDeck => {
                  const newSideDeck = [...prevSideDeck];
                  // Insert at the original position
                  newSideDeck.splice(dragIndex, 0, draggedCard);
                  return compactSideDeck(newSideDeck);
                });
              }
            }
          }
        } else if (isDraggingFromLegend) {
          // Dragged from legend slot - legends can't go to main deck, restore to legend slot
          setLegendCard(draggedCard);
        } else if (isDraggingFromChampion) {
          // Dragged from champion slot
          // Check if champion already has 3 copies total (main + side + champion)
          const totalCopyCount = countTotalCardCopies(draggedCard);
          if (totalCopyCount < 3) {
            newDeck.splice(dropIndex, 0, draggedCard);
            setMainDeck(newDeck);
            
            // Auto-fill champion slot
            autoFillChampion();
          }
        } else {
          // Normal deck card - check copy limit
          const totalCopyCount = countTotalCardCopies(draggedCard);
          if (totalCopyCount < 3) {
            newDeck.splice(dropIndex, 0, draggedCard);
            setMainDeck(newDeck);
          }
        }
      } else {
        // Check if dropped in the grid area
        const gridElement = elementBelow?.closest('[data-is-grid]');
        if (gridElement) {
          if (isDraggingFromSearch) {
            // Add to end of deck, but check copy limit and deck size
            const totalCards = mainDeck.length + (chosenChampion ? 1 : 0);
            const totalCopyCount = countTotalCardCopies(draggedCard);
            if (totalCards < 40 && totalCopyCount < 3) {
              // Try to set as champion if it's a champion and chosenChampion is null
              const wasSetAsChampion = trySetChampionIfNeeded(draggedCard);
              // Only add to main deck if it wasn't set as champion
              if (!wasSetAsChampion) {
                setMainDeck([...mainDeck, draggedCard]);
              }
            } else if (totalCopyCount >= 3) {
              // Too many copies
              showMaxCopiesToast(draggedCard);
            } else if (totalCards >= 40) {
              // Main deck is full
              showNoSpaceToast('Main Deck');
            }
          } else if (isDraggingFromSideDeck) {
            // Add to end of deck, but check copy limit and deck size
            const totalCards = mainDeck.length + (chosenChampion ? 1 : 0);
            const totalCopyCount = countTotalCardCopies(draggedCard);
            if (totalCards < 40 && totalCopyCount < 3) {
              // Try to set as champion if it's a champion and chosenChampion is null
              const wasSetAsChampion = trySetChampionIfNeeded(draggedCard);
              // Only add to main deck if it wasn't set as champion
              if (!wasSetAsChampion) {
                setMainDeck([...mainDeck, draggedCard]);
              }
              
              // Clean up side deck
              setSideDeck(prevSideDeck => {
                const newSideDeck = [];
                for (let i = 0; i < prevSideDeck.length; i++) {
                  if (i !== dragIndex) {
                    newSideDeck.push(prevSideDeck[i]);
                  }
                }
                return compactSideDeck(newSideDeck);
              });
            } else {
              // Either deck full or too many copies, restore card to side deck
              if (totalCopyCount >= 3) {
                showMaxCopiesToast(draggedCard);
              } else if (totalCards >= 40) {
                // Main deck is full
                showNoSpaceToast('Main Deck');
              }
              if (dragIndex !== null && dragIndex < 8) {
                setSideDeck(prevSideDeck => {
                  const newSideDeck = [...prevSideDeck];
                  // Insert at the original position
                  newSideDeck.splice(dragIndex, 0, draggedCard);
                  return compactSideDeck(newSideDeck);
                });
              }
            }
          } else if (isDraggingFromLegend) {
            // Legends can't go to main deck - restore to legend slot
            setLegendCard(draggedCard);
          } else if (isDraggingFromChampion) {
            // Add to end of deck - check copy limit
            const totalCopyCount = countTotalCardCopies(draggedCard);
            if (totalCopyCount < 3) {
              setMainDeck([...mainDeck, draggedCard]);
              // Auto-fill champion slot
              autoFillChampion();
            } else {
              // Too many copies
              showMaxCopiesToast(draggedCard);
            }
          } else {
            // Dropped in grid but not on a card - add to end, check copy limit
            const totalCopyCount = countTotalCardCopies(draggedCard);
            if (totalCopyCount < 3) {
              setMainDeck([...mainDeck, draggedCard]);
            } else {
              // Too many copies
              showMaxCopiesToast(draggedCard);
            }
          }
        } else {
          // Dropped outside the grid area
          if (isDraggingFromSideDeck) {
            // If dragging from side deck outside, restore card to side deck
            if (dragIndex !== null && dragIndex < 8) {
              setSideDeck(prevSideDeck => {
                const newSideDeck = [...prevSideDeck];
                // Insert at the original position
                newSideDeck.splice(dragIndex, 0, draggedCard);
                return compactSideDeck(newSideDeck);
              });
            }
          } else if (isDraggingFromLegend) {
            // Legends can't go to main deck - restore to legend slot
            setLegendCard(draggedCard);
          } else if (isDraggingFromChampion) {
            // If dragging champion outside, add to end of deck - check copy limit
            const totalCopyCount = countTotalCardCopies(draggedCard);
            if (totalCopyCount < 3) {
              setMainDeck([...mainDeck, draggedCard]);
              autoFillChampion();
            }
          }
          // If dragging a main deck card outside, it's already removed and lost
        }
      }
      
      setIsDragging(false);
      setDraggedCard(null);
      setDragIndex(null);
      setIsDraggingFromChampion(false);
      setIsDraggingFromLegend(false);
      setIsDraggingFromSideDeck(false);
      setIsDraggingFromBattlefield(false);
      setIsDraggingFromSearch(false);
    }
  };
  
  // Calculate container scale for proper dragged card sizing
  useEffect(() => {
    const updateScale = () => {
      const scaledContainer = document.querySelector('[style*="transform: scale"]');
      if (scaledContainer) {
        const rect = scaledContainer.getBoundingClientRect();
        const scale = rect.width / 1920; // Reference width is 1920
        setContainerScale(scale);
      }
    };

    // Initial scale calculation
    updateScale();

    // Update scale on window resize
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  // Auto-disable/reset filters based on card type
  useEffect(() => {
    if (searchFilters.cardType === 'Legend' || searchFilters.cardType === 'Battlefield') {
      // Disable and reset Energy and Power filters for Legend/Battlefield
      setSearchFilters(prev => ({
        ...prev,
        energyMin: '',
        energyMax: '',
        powerMin: '',
        powerMax: ''
      }));
    }
  }, [searchFilters.cardType]);

  useEffect(() => {
    if (searchFilters.cardType === 'Gear' || searchFilters.cardType === 'Equipment' || searchFilters.cardType === 'Spell' || searchFilters.cardType === 'Legend' || searchFilters.cardType === 'Battlefield') {
      // Disable and reset Might filter for Gear/Equipment/Spell/Legend/Battlefield
      setSearchFilters(prev => ({
        ...prev,
        mightMin: '',
        mightMax: ''
      }));
    }
  }, [searchFilters.cardType]);

  useEffect(() => {
    if (searchFilters.cardType === 'Battlefield') {
      // Disable and reset Color filter for Battlefield
      setSearchFilters(prev => ({
        ...prev,
        cardColor: ''
      }));
    }
  }, [searchFilters.cardType]);

  // Check if search result images are already loaded (for cached images)
  useEffect(() => {
    if (!isPageTransitioning) {
      // Small delay to ensure images are rendered
      const timeoutId = setTimeout(() => {
        const currentResults = getCurrentPageResults();
        const cardIds = currentResults.map(r => r?.displayCardId).filter(Boolean);
        
        // Check each image to see if it's already loaded
        // Only check images that aren't already marked as loaded
        cardIds.forEach(cardId => {
          // Use a closure to capture the current state
          setLoadedSearchImages(prev => {
            if (prev.has(cardId)) {
              return prev; // Already loaded, no update needed
            }
            const img = document.querySelector(`img[alt="Search Result ${cardId}"]`);
            if (img && img.complete && img.naturalHeight !== 0) {
              // Image is already loaded, add it to the set
              const newSet = new Set(prev);
              newSet.add(cardId);
              return newSet;
            }
            return prev; // Not loaded yet, keep current state
          });
        });
      }, 50);
      
      return () => clearTimeout(timeoutId);
    }
  }, [currentPage, searchResults, isPageTransitioning]);

  // Global mouse event listeners for dragging
  useEffect(() => {
    if (isDragging) {
      // Prevent text selection during drag
      document.body.style.userSelect = 'none';
      document.body.style.cursor = 'grabbing';
      
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      return () => {
        document.body.style.userSelect = '';
        document.body.style.cursor = '';
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging, draggedCard, isDraggingFromChampion, isDraggingFromLegend, isDraggingFromSideDeck, isDraggingFromBattlefield, isDraggingFromSearch, chosenChampion, mainDeck]);
  
  // Handle right-click: remove card or add card (with Shift)
  const handleCardContext = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.shiftKey) {
      // Shift + right-click: Add a copy of the card at this position
      const cardId = mainDeck[index];
      const currentTotalCount = countTotalCardCopies(cardId);
      const totalCards = mainDeck.length + (chosenChampion ? 1 : 0);
      if (cardId && totalCards < 40 && currentTotalCount < 3) {
        const newDeck = [...mainDeck];
        newDeck.splice(index, 0, cardId);
        setMainDeck(newDeck);
      } else if (cardId && currentTotalCount >= 3) {
        // Too many copies
        showMaxCopiesToast(cardId);
      } else if (cardId && totalCards >= 40) {
        // Main deck is full
        showNoSpaceToast('Main Deck');
      }
    } else {
      // Right-click: Remove the card
      const newDeck = mainDeck.filter((_, i) => i !== index);
      setMainDeck(newDeck);
    }
  };
  
  // Handle right-click: remove card or add card (with Shift) for side deck
  const handleSideDeckContext = (e, index) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (e.shiftKey) {
      // Shift + right-click: Add a copy of the card at this position
      const cardId = sideDeck[index];
      const currentTotalCount = countTotalCardCopies(cardId);
      const currentSideDeckCount = sideDeck.filter(c => c).length;
      if (cardId && currentSideDeckCount < 8 && currentTotalCount < 3) {
        const newSideDeck = [...sideDeck];
        newSideDeck.splice(index, 0, cardId);
        setSideDeck(compactSideDeck(newSideDeck));
      } else if (cardId && currentTotalCount >= 3) {
        // Too many copies
        showMaxCopiesToast(cardId);
      } else if (cardId && currentSideDeckCount >= 8) {
        // Side deck is full
        showNoSpaceToast('Side Deck');
      }
    } else {
      // Right-click: Remove the card
      const newSideDeck = sideDeck.filter((_, i) => i !== index);
      setSideDeck(compactSideDeck(newSideDeck));
    }
  };
  
  // Handle champion context menu (right-click)
  const handleChampionContext = (e) => {
    e.preventDefault();
    if (chosenChampion) {
      if (e.shiftKey) {
        // Shift + right-click: Add a copy to the main deck
        const totalCards = mainDeck.length + (chosenChampion ? 1 : 0);
        const totalCopyCount = countTotalCardCopies(chosenChampion);
        if (totalCards < 40 && totalCopyCount < 3) {
          setMainDeck(prev => [...prev, chosenChampion]);
        } else if (totalCopyCount >= 3) {
          // Too many copies
          showMaxCopiesToast(chosenChampion);
        } else if (totalCards >= 40) {
          // Main deck is full
          showNoSpaceToast('Main Deck');
        }
      } else {
        // Right-click: Remove champion and auto-fill
        autoFillChampion();
      }
    }
  };
  
  // Handle middle-click: open variant selection modal
  const handleMiddleClick = (e, cardId, source, sourceIndex = null) => {
    if (e.button === 1 && cardId) { // Middle button
      e.preventDefault();
      e.stopPropagation();
      
      const { baseId } = parseCardId(cardId);
      const card = getCardDetails(baseId);
      
      if (card && card.variants && card.variants.length > 1) {
        // Open variant selection modal
        setVariantModal({
          isOpen: true,
          cardId: cardId,
          baseId: baseId,
          source: source,
          sourceIndex: sourceIndex,
          variants: card.variants || [],
          variantImages: card.variantImages || []
        });
      } else {
        // Show toast notification for no variants
        const cardName = card?.name || 'Unknown Card';
        addToast(
          <>No variants available for <strong>{cardName}</strong></>,
          1800
        );
      }
    }
  };
  
  // Handle variant selection from modal
  const handleVariantSelect = (variantIndex) => {
    const { baseId } = variantModal;
    const newCardId = formatCardId(baseId, variantIndex);
    
    // Update the card based on source
    switch (variantModal.source) {
      case 'mainDeck':
        if (variantModal.sourceIndex !== null) {
          const newMainDeck = [...mainDeck];
          newMainDeck[variantModal.sourceIndex] = newCardId;
          setMainDeck(newMainDeck);
        }
        break;
      case 'sideDeck':
        if (variantModal.sourceIndex !== null) {
          const newSideDeck = [...sideDeck];
          newSideDeck[variantModal.sourceIndex] = newCardId;
          setSideDeck(compactSideDeck(newSideDeck));
        }
        break;
      case 'battlefield':
        if (variantModal.sourceIndex !== null) {
          const newBattlefields = [...battlefields];
          newBattlefields[variantModal.sourceIndex] = newCardId;
          setBattlefields(newBattlefields);
        }
        break;
      case 'legend':
        setLegendCard(newCardId);
        break;
      case 'champion':
        setChosenChampion(newCardId);
        break;
      case 'runeA':
        setRuneAVariantIndex(variantIndex);
        break;
      case 'runeB':
        setRuneBVariantIndex(variantIndex);
        break;
    }
    
    // Close modal
    setVariantModal({
      isOpen: false,
      cardId: null,
      baseId: null,
      source: null,
      sourceIndex: null,
      variants: [],
      variantImages: []
    });
  };
  
  // Handle variant modal cancel
  const handleVariantModalCancel = () => {
    setVariantModal({
      isOpen: false,
      cardId: null,
      baseId: null,
      source: null,
      sourceIndex: null,
      variants: [],
      variantImages: []
    });
  };
  
  // Handle legend context menu (right-click)
  const handleLegendContext = (e) => {
    e.preventDefault();
    if (legendCard) {
      // Remove legend from slot - just clear it, don't add to deck
      setLegendCard(null);
    }
  };
  
  // Handle battlefield context menu (right-click)
  const handleBattlefieldContext = (e, index) => {
    e.preventDefault();
    if (battlefields[index]) {
      // Remove the card
      const newBattlefields = battlefields.filter((_, i) => i !== index);
      setBattlefields(newBattlefields);
    }
  };
  
  // Handle sort A-Z: sort by card name, then by ID if same name
  const handleSortAZ = () => {
    const sortCompare = (a, b) => {
      const cardA = getCardDetails(a);
      const cardB = getCardDetails(b);
      
      // If cards not found, compare by ID
      if (!cardA || !cardB) {
        return (a || '').localeCompare(b || '');
      }
      
      // Compare by name first
      const nameCompare = cardA.name.localeCompare(cardB.name);
      if (nameCompare !== 0) {
        return nameCompare;
      }
      
      // If names are the same, compare by variant number
      return cardA.variantNumber.localeCompare(cardB.variantNumber);
    };
    
    const sortedMainDeck = [...mainDeck].sort(sortCompare);
    // Filter out nulls, sort, then pad to 8 with nulls at the end
    const sortedSideDeck = [...sideDeck]
      .filter(c => c !== null)
      .sort(sortCompare);
    
    setMainDeck(sortedMainDeck);
    setSideDeck(compactSideDeck(sortedSideDeck));
  };
  
  // Handle sort by cost: sort by energy cost, then A-Z if same cost
  const handleSortByCost = () => {
    const sortCompare = (a, b) => {
      const cardA = getCardDetails(a);
      const cardB = getCardDetails(b);
      
      // If cards not found, compare by ID
      if (!cardA || !cardB) {
        return (a || '').localeCompare(b || '');
      }
      
      // Compare by energy cost first
      const costCompare = cardA.energy - cardB.energy;
      if (costCompare !== 0) {
        return costCompare;
      }
      
      // If costs are the same, sort by name A-Z
      return cardA.name.localeCompare(cardB.name);
    };
    
    const sortedMainDeck = [...mainDeck].sort(sortCompare);
    // Filter out nulls, sort, then pad to 8 with nulls at the end
    const sortedSideDeck = [...sideDeck]
      .filter(c => c !== null)
      .sort(sortCompare);
    
    setMainDeck(sortedMainDeck);
    setSideDeck(compactSideDeck(sortedSideDeck));
  };
  
  // Handle randomize: shuffle the array
  const handleRandomize = () => {
    const shuffled = [...mainDeck];
    
    // Fisher-Yates shuffle algorithm
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    
    setMainDeck(shuffled);
  };
  
  // Convert data URL to blob
  const dataURLtoBlob = (dataURL) => {
    const arr = dataURL.split(',');
    const mime = arr[0].match(/:(.*?);/)[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
  };
  
  // Handle screenshot: capture the 16:9 container
  const handleScreenshot = async () => {
    try {
      // Find the outer visible container (the one with border and aspect-ratio)
      const outerContainer = document.querySelector('[data-visible-container]');
      if (!outerContainer) {
        console.error('Visible container not found');
        return;
      }
      
      // Find the middle panel (deck area)
      const middlePanel = outerContainer.querySelector('[data-deck-panel]');
      
      // Find the scaled container (the one with transform scale) that wraps the content
      const scaledContainer = outerContainer.querySelector('[style*="transform: scale"]');
      
      // Get the actual visible dimensions of the middle panel
      let deckRect = null;
      let scaledContainerRect = null;
      if (middlePanel && scaledContainer) {
        deckRect = middlePanel.getBoundingClientRect();
        scaledContainerRect = scaledContainer.getBoundingClientRect();
      }
      
      // Ensure form elements display their current values before capturing
      const inputs = outerContainer.querySelectorAll('input, select, textarea');
      inputs.forEach(element => {
        if (element.tagName === 'INPUT' || element.tagName === 'TEXTAREA') {
          // Set the value attribute to match the current value
          element.setAttribute('value', element.value);
        } else if (element.tagName === 'SELECT') {
          // For select elements, ensure the selected option has the selected attribute
          const selectedIndex = element.selectedIndex;
          // Remove selected from all options
          Array.from(element.options).forEach(option => {
            option.removeAttribute('selected');
          });
          // Set selected on the currently selected option
          if (selectedIndex >= 0 && element.options[selectedIndex]) {
            element.options[selectedIndex].setAttribute('selected', 'selected');
          }
          // Force a reflow to ensure the value is rendered
          element.offsetHeight;
        }
      });
      
      // Small delay to ensure form elements are rendered with their values
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Find the deck controls buttons
      const deckControls = outerContainer.querySelector('[data-deck-controls]');
      const deckValidation = outerContainer.querySelector('[data-deck-validation]');
      let originalVisibility = null;
      let originalValidationVisibility = null;
      
      // Capture full screenshot first (with buttons visible)
      const fullDataUrl = await domToPng(outerContainer, {
        quality: 1.0,
        pixelRatio: window.devicePixelRatio || 1,
      });
      
      // Hide buttons and validation for deck-only screenshot (keep space)
      if (deckControls) {
        originalVisibility = window.getComputedStyle(deckControls).visibility;
        deckControls.style.visibility = 'hidden';
      }
      if (deckValidation) {
        originalValidationVisibility = window.getComputedStyle(deckValidation).visibility;
        deckValidation.style.visibility = 'hidden';
      }
      // Small delay to ensure DOM update
      await new Promise(resolve => setTimeout(resolve, 50));
      // Recalculate rects after hiding buttons (in case layout shifted)
      if (middlePanel && scaledContainer) {
        deckRect = middlePanel.getBoundingClientRect();
        scaledContainerRect = scaledContainer.getBoundingClientRect();
      }
      
      // Capture deck-only screenshot (without buttons)
      let deckDataUrl = null;
      if (middlePanel && scaledContainer && deckRect && scaledContainerRect) {
        // Capture the full scaled container first
        const scaledDataUrl = await domToPng(scaledContainer, {
          quality: 1.0,
          pixelRatio: window.devicePixelRatio || 1,
        });
        
        // Calculate crop coordinates relative to the scaled container
        const x = deckRect.left - scaledContainerRect.left;
        const y = deckRect.top - scaledContainerRect.top;
        
        // Create a canvas to crop the image
        const img = new Image();
        img.src = scaledDataUrl;
        await new Promise((resolve) => {
          img.onload = resolve;
        });
        
        const canvas = document.createElement('canvas');
        canvas.width = deckRect.width;
        canvas.height = deckRect.height;
        const ctx = canvas.getContext('2d');
        
        // Draw the cropped portion
        ctx.drawImage(
          img,
          x, y, deckRect.width, deckRect.height,
          0, 0, deckRect.width, deckRect.height
        );
        
        deckDataUrl = canvas.toDataURL('image/png');
      }
      
      // Restore buttons and validation visibility
      if (deckControls && originalVisibility !== null) {
        deckControls.style.visibility = originalVisibility;
      }
      if (deckValidation && originalValidationVisibility !== null) {
        deckValidation.style.visibility = originalValidationVisibility;
      }
      
      // Convert data URLs to blob URLs
      const fullBlob = dataURLtoBlob(fullDataUrl);
      const fullBlobUrl = URL.createObjectURL(fullBlob);
      
      let deckBlobUrl = null;
      if (deckDataUrl) {
        const deckBlob = dataURLtoBlob(deckDataUrl);
        deckBlobUrl = URL.createObjectURL(deckBlob);
      }
      
      // Initialize currentView from preference
      const initialView = screenshotMode;
      
      setScreenshotModal({
        isOpen: true,
        fullBlobUrl,
        deckBlobUrl: deckBlobUrl || fullBlobUrl, // Fallback to full if deck capture failed
        currentView: initialView
      });
    } catch (error) {
      console.error('Error taking screenshot:', error);
    }
  };
  
  // Handle copy screenshot to clipboard
  const handleCopyScreenshot = async () => {
    try {
      const currentBlobUrl = screenshotModal.currentView === 'full' 
        ? screenshotModal.fullBlobUrl 
        : screenshotModal.deckBlobUrl;
      
      if (!currentBlobUrl) return;
      
      // Fetch blob from blob URL
      const response = await fetch(currentBlobUrl);
      const blob = await response.blob();
      
      // Copy to clipboard
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob })
      ]);
      
      // Show notification instead of closing modal
      await showNotification('Image Copied', 'Screenshot has been copied to your clipboard.');
    } catch (error) {
      console.error('Error copying screenshot:', error);
      await showNotification('Copy Failed', 'Failed to copy screenshot to clipboard.');
    }
  };
  
  // Handle download screenshot
  const handleDownloadScreenshot = () => {
    try {
      const currentBlobUrl = screenshotModal.currentView === 'full' 
        ? screenshotModal.fullBlobUrl 
        : screenshotModal.deckBlobUrl;
      
      if (!currentBlobUrl) return;
      
      // Get current deck name and sanitize it
      const currentDeck = decks.find(d => d.id === currentDeckId);
      let deckName = 'deck';
      if (currentDeck && currentDeck.name) {
        // Remove special characters and replace spaces with hyphens
        deckName = currentDeck.name
          .replace(/[^a-zA-Z0-9\s-]/g, '') // Remove special characters
          .replace(/\s+/g, '-') // Replace spaces with hyphens
          .toLowerCase();
      }
      
      // Get date in YYYY-MM-DD format
      const date = new Date().toISOString().slice(0, 10);
      
      // Create a temporary anchor element to trigger download
      const link = document.createElement('a');
      link.download = `screenshot-${deckName}-${date}.png`;
      link.href = currentBlobUrl;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (error) {
      console.error('Error downloading screenshot:', error);
    }
  };
  
  // Handle close screenshot modal
  const handleCloseScreenshotModal = () => {
    // Revoke blob URLs to free memory
    if (screenshotModal.fullBlobUrl) {
      URL.revokeObjectURL(screenshotModal.fullBlobUrl);
    }
    if (screenshotModal.deckBlobUrl && screenshotModal.deckBlobUrl !== screenshotModal.fullBlobUrl) {
      URL.revokeObjectURL(screenshotModal.deckBlobUrl);
    }
    setScreenshotModal({ isOpen: false, fullBlobUrl: null, deckBlobUrl: null, currentView: 'full' });
  };
  
  // Handle toggle screenshot view
  const handleToggleScreenshotView = () => {
    const newView = screenshotModal.currentView === 'full' ? 'deck' : 'full';
    setScreenshotModal(prev => ({ ...prev, currentView: newView }));
    // Save preference
    setScreenshotMode(newView);
    setScreenshotModeState(newView);
  };
  
  // Handle opening screenshot in new tab
  const handleOpenScreenshotInNewTab = () => {
    try {
      const currentBlobUrl = screenshotModal.currentView === 'full' 
        ? screenshotModal.fullBlobUrl 
        : screenshotModal.deckBlobUrl;
      
      if (!currentBlobUrl) return;
      
      // Open blob URL in new tab (no conversion needed since we're already using blob URL)
      window.open(currentBlobUrl, '_blank', 'noopener,noreferrer');
    } catch (error) {
      console.error('Error opening screenshot in new tab:', error);
    }
  };
  
  // Helper function to get rune card ID based on color
  const getRuneCardId = (color) => {
    const colorMap = {
      "Mind": "OGN-089",
      "Order": "OGN-214",
      "Body": "OGN-126",
      "Calm": "OGN-042",
      "Chaos": "OGN-166",
      "Fury": "OGN-007"
    };
    return colorMap[color] || null;
  };
  
  // Helper function to get rune cards from legend (with variant indices)
  const getRuneCards = () => {
    if (!legendCard) return { runeA: null, runeB: null };
    
    const cardData = getCardDetails(legendCard);
    const colors = cardData?.colors || [];
    const color1 = colors[0] || null;
    const color2 = colors[1] || null;
    
    const runeABaseId = color1 ? getRuneCardId(color1) : null;
    const runeBBaseId = color2 ? getRuneCardId(color2) : null;
    
    // Return variant-aware card IDs
    return {
      runeA: runeABaseId ? formatCardId(runeABaseId, runeAVariantIndex) : null,
      runeB: runeBBaseId ? formatCardId(runeBBaseId, runeBVariantIndex) : null,
      runeABaseId: runeABaseId,
      runeBBaseId: runeBBaseId
    };
  };
  
  // Handle rune clicks - clicking a rune takes 1 from the other and adds to itself
  const handleRuneClick = (runeType) => {
    if (runeType === 'A') {
      // Clicking rune A: take 1 from B, add 1 to A
      if (runeBCount > 0 && runeACount < 12) {
        setRuneBCount(runeBCount - 1);
        setRuneACount(runeACount + 1);
      }
    } else {
      // Clicking rune B: take 1 from A, add 1 to B
      if (runeACount > 0 && runeBCount < 12) {
        setRuneACount(runeACount - 1);
        setRuneBCount(runeBCount + 1);
      }
    }
  };
  
  // Handle export deck
  const handleExportDeck = () => {
    const deckCodeParts = [];
    
    // 1. Legend first (if exists)
    if (legendCard) {
      deckCodeParts.push(legendCard);
    }
    
    // 2. Main deck (champion first, then rest of main deck)
    if (chosenChampion) {
      deckCodeParts.push(chosenChampion);
    }
    const mainDeckCards = mainDeck.filter(c => c !== null);
    deckCodeParts.push(...mainDeckCards);
    
    // 3. Battlefields (0-3)
    const battlefieldCards = battlefields.filter(c => c !== null);
    deckCodeParts.push(...battlefieldCards);
    
    // 4. Runes (based on runeACount and runeBCount)
    const { runeA, runeB } = getRuneCards();
    if (runeA) {
      for (let i = 0; i < runeACount; i++) {
        deckCodeParts.push(runeA);
      }
    }
    if (runeB) {
      for (let i = 0; i < runeBCount; i++) {
        deckCodeParts.push(runeB);
      }
    }
    
    // 5. Side deck (0-8)
    const sideDeckCards = sideDeck.filter(c => c !== null);
    deckCodeParts.push(...sideDeckCards);
    
    const deckCode = deckCodeParts.join(' ');
    setExportModal({
      isOpen: true,
      deckCode
    });
  };
  
  // Handle copy deck code
  const handleCopyDeckCode = async () => {
    const deckCode = exportModal.deckCode;
    // Close export modal first
    setExportModal({ isOpen: false, deckCode: '' });
    
    try {
      await navigator.clipboard.writeText(deckCode);
      await showNotification('Copied', 'Deck code copied to clipboard!');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      await showNotification('Copy Failed', 'Failed to copy deck code to clipboard.');
    }
  };
  
  // Handle clear deck
  const handleClearDeck = async () => {
    const confirmed = await showConfirmation(
      'Clear Deck',
      'Are you sure you want to clear the deck? This will remove all cards from the legend, main deck, battlefields, and side deck.'
    );
    
    if (confirmed) {
      setLegendCard(null);
      setChosenChampion(null);
      setMainDeck([]);
      setBattlefields([]);
      setSideDeck(compactSideDeck([]));
      setRuneACount(6);
      setRuneBCount(6);
      setRuneAVariantIndex(0);
      setRuneBVariantIndex(0);
    }
  };
  
  // Handle import deck from clipboard
  const handleImportDeck = async () => {
    try {
      // Read from clipboard
      const clipboardText = await navigator.clipboard.readText();
      
      // Parse the clipboard string
      // Format: "OGN-265-1 OGN-246-2 OGN-103-1 ..."
      // Parse and preserve variant indices
      const cardIds = clipboardText.trim().split(/\s+/);
      
      const parsedCards = [];
      for (const cardStr of cardIds) {
        // Parse format: OGN-265-1 -> { baseId: "OGN-265", variantIndex: 1 }
        // or OGN-265 -> { baseId: "OGN-265", variantIndex: 0 }
        const { baseId, variantIndex } = parseCardId(cardStr);
        if (baseId) {
          // Log when a variant is detected (variantIndex > 0 means it's not the base card)
          if (variantIndex > 0) {
            const card = getCardDetails(baseId);
            const cardName = card?.name || baseId;
            const variantNumber = card?.variants?.[variantIndex] || `variant ${variantIndex}`;
            console.log(`[Import] Variant detected: ${cardStr} -> ${cardName} (${baseId}) using variant index ${variantIndex} (variants[${variantIndex}] = ${variantNumber})`);
          }
          // Format with variant index (0 becomes no suffix, 1+ becomes -1, -2, etc.)
          const formattedId = formatCardId(baseId, variantIndex);
          parsedCards.push(formattedId);
        }
      }
      
      // Check if any valid cards were found
      const foundValidCards = parsedCards.some(cardId => {
        const { baseId } = parseCardId(cardId);
        return getCardDetails(baseId) !== undefined;
      });
      
      if (parsedCards.length === 0 || !foundValidCards) {
        await showNotification('Invalid Deck', 'Invalid deck in clipboard');
        return;
      }
      
      // Clear current deck only if we have valid cards to import
      setChosenChampion(null);
      setMainDeck([]);
      setSideDeck(compactSideDeck([]));
      setBattlefields([null, null, null]);
      setRuneACount(6);
      setRuneBCount(6);
      setRuneAVariantIndex(0);
      setRuneBVariantIndex(0);
      setLegendCard(null);
      
      // Parse deck structure:
      // 1. First card = legend
      // 2. Next N cards = main deck (up to 40, until we hit a battlefield or rune)
      // 3. Then 0-3 battlefields
      // 4. Then 0-12 runes
      // 5. Remaining cards = side deck (up to 8)
      
      let legendCard = null;
      const mainDeckCards = [];
      const battlefieldCards = [];
      const runeCards = [];
      const sideDeckCards = [];
      
      let i = 0;
      
      // 1. First card is the legend
      if (i < parsedCards.length) {
        const cardId = parsedCards[i];
        const { baseId } = parseCardId(cardId);
        const firstCard = getCardDetails(baseId);
        if (firstCard?.type === 'Legend') {
          legendCard = cardId; // Preserve variant index
          i++;
        }
      }
      
      // 2. Main deck - add cards until we hit a battlefield or rune
      while (i < parsedCards.length) {
        const cardId = parsedCards[i];
        const { baseId } = parseCardId(cardId);
        const card = getCardDetails(baseId);
        if (!card) {
          i++;
          continue;
        }
        
        if (card.type === 'Battlefield' || card.type === 'Rune') {
          break;
        }
        
        mainDeckCards.push(cardId); // Preserve variant index
        i++;
      }
      
      // 3. Battlefields (0-3)
      while (i < parsedCards.length && battlefieldCards.length < 3) {
        const cardId = parsedCards[i];
        const { baseId } = parseCardId(cardId);
        const card = getCardDetails(baseId);
        if (!card) {
          i++;
          continue;
        }
        
        if (card.type === 'Battlefield') {
          battlefieldCards.push(cardId); // Preserve variant index
          i++;
        } else if (card.type === 'Rune') {
          break;
        } else {
          break;
        }
      }
      
      // 4. Runes (0-12)
      while (i < parsedCards.length && runeCards.length < 12) {
        const cardId = parsedCards[i];
        const { baseId } = parseCardId(cardId);
        const card = getCardDetails(baseId);
        if (!card) {
          i++;
          continue;
        }
        
        if (card.type === 'Rune') {
          runeCards.push(cardId); // Preserve variant index
          i++;
        } else {
          break;
        }
      }
      
      // 5. Remaining cards go to side deck (up to 8)
      while (i < parsedCards.length && sideDeckCards.length < 8) {
        const cardId = parsedCards[i];
        const { baseId } = parseCardId(cardId);
        const card = getCardDetails(baseId);
        if (!card) {
          i++;
          continue;
        }
        sideDeckCards.push(cardId); // Preserve variant index
        i++;
      }
      
      // Update state
      if (legendCard) {
        setLegendCard(legendCard);
      }
      
      // Handle champion - try to find the first champion in main deck
      const firstChampion = mainDeckCards.find(id => {
        const { baseId } = parseCardId(id);
        const card = getCardDetails(baseId);
        return card?.super === "Champion";
      });
      
      if (firstChampion) {
        setChosenChampion(firstChampion); // Preserve variant index
        // Remove champion from main deck
        const championIndex = mainDeckCards.indexOf(firstChampion);
        const newMainDeck = mainDeckCards.filter((_, idx) => idx !== championIndex);
        setMainDeck(newMainDeck.slice(0, 39));
      } else {
        setMainDeck(mainDeckCards.slice(0, 39)); // Main deck is 39 cards (40 total with champion)
      }
      
      setBattlefields([...battlefieldCards, null, null, null].slice(0, 3));
      
      // Parse runes to determine counts for A and B, and extract variant indices
      if (legendCard) {
        const { baseId: legendBaseId } = parseCardId(legendCard);
        const legendData = getCardDetails(legendBaseId);
        const colors = legendData?.colors || [];
        
        // Separate runes by color and extract variant indices
        const runeACards = runeCards.filter(id => {
          const { baseId } = parseCardId(id);
          const card = getCardDetails(baseId);
          return card?.colors?.[0] === colors[0];
        });
        
        const runeBCards = runeCards.filter(id => {
          const { baseId } = parseCardId(id);
          const card = getCardDetails(baseId);
          return card?.colors?.[0] === colors[1];
        });
        
        const newRuneACount = runeACards.length;
        const newRuneBCount = runeBCards.length;
        
        // Extract variant indices from first rune of each color
        if (runeACards.length > 0) {
          const firstRuneA = runeACards[0];
          const { variantIndex } = parseCardId(firstRuneA);
          const runeABaseId = getRuneCardId(colors[0]);
          if (runeABaseId) {
            const runeACard = getCardDetails(runeABaseId);
            const maxVariantIndex = runeACard?.variants ? runeACard.variants.length - 1 : 0;
            setRuneAVariantIndex(Math.min(Math.max(0, variantIndex), maxVariantIndex));
          } else {
            setRuneAVariantIndex(0);
          }
        } else {
          setRuneAVariantIndex(0);
        }
        
        if (runeBCards.length > 0) {
          const firstRuneB = runeBCards[0];
          const { variantIndex } = parseCardId(firstRuneB);
          const runeBBaseId = getRuneCardId(colors[1]);
          if (runeBBaseId) {
            const runeBCard = getCardDetails(runeBBaseId);
            const maxVariantIndex = runeBCard?.variants ? runeBCard.variants.length - 1 : 0;
            setRuneBVariantIndex(Math.min(Math.max(0, variantIndex), maxVariantIndex));
          } else {
            setRuneBVariantIndex(0);
          }
        } else {
          setRuneBVariantIndex(0);
        }
        
        // If total doesn't equal 12, normalize to 6-6
        if (newRuneACount + newRuneBCount !== 12) {
          setRuneACount(6);
          setRuneBCount(6);
        } else {
          setRuneACount(Math.min(newRuneACount, 12));
          setRuneBCount(Math.min(newRuneBCount, 12));
        }
      } else {
        // No legend card, ensure runes are 6-6 and reset variant indices
        setRuneACount(6);
        setRuneBCount(6);
        setRuneAVariantIndex(0);
        setRuneBVariantIndex(0);
      }
      
      // Side deck - up to 8 cards
      setSideDeck(compactSideDeck(sideDeckCards.slice(0, 8)));
      
      await showNotification(
        'Deck Imported',
        `Deck imported successfully!\nLegend: ${legendCard ? 'Yes' : 'No'}\nMain: ${mainDeckCards.length}\nBattlefields: ${battlefieldCards.length}\nRunes: ${runeCards.length}\nSide: ${sideDeckCards.length}`
      );
      
    } catch (error) {
      console.error('Error importing deck:', error);
      await showNotification('Import Failed', 'Failed to import deck. Please ensure clipboard contains valid deck format.');
    }
  };
  
  return (
    <>
      <LayoutContainer isDarkMode={isDarkMode}>
        {/* Content is sized in pixels based on 1920x1080 reference */}
        <div className={`w-[1920px] h-[1080px] flex ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`} data-screenshot-container>
        {/* Left Panel - 20% (384px) */}
        <div className={`w-[384px] h-full border-r-2 flex flex-col px-4 py-4 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-blue-50 border-gray-300'}`}>
          {/* Card Image - auto height */}
          <div className="w-full flex-shrink-0 mb-2">
            <img 
              src={getCardImageUrl(selectedCard)}
              alt={`Card ${selectedCard}`}
              className="w-full object-contain"
              style={{ aspectRatio: '515/719' }}
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

            {/* Deck Management Buttons - takes 60% */}
            <div className={`flex-[0.6] border-2 rounded p-3 flex flex-col min-h-0 ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-400'}`}>
              <div className="grid grid-cols-2 gap-1.5 flex-1">
                {/* Row 1 */}
                <button 
                  onClick={handleImportDeck}
                  className="py-1 px-2 rounded text-[11px] font-medium bg-blue-600 text-white shadow-md hover:bg-blue-700 active:bg-blue-800 transition-colors">
                  Import Deck
                </button>
                <button 
                  onClick={handleExportDeck}
                  className="py-1 px-2 rounded text-[11px] font-medium bg-blue-600 text-white shadow-md hover:bg-blue-700 active:bg-blue-800 transition-colors">
                  Export Deck
                </button>

                {/* Row 2 */}
                <button 
                  onClick={handleDeleteDeck}
                  disabled={isSaving}
                  className={`py-1 px-2 rounded text-[11px] font-medium bg-red-600 text-white shadow-md hover:bg-red-700 active:bg-red-800 transition-colors ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  Delete Deck
                </button>
                <button 
                  onClick={handleClearDeck}
                  className="py-1 px-2 rounded text-[11px] font-medium bg-red-600 text-white shadow-md hover:bg-red-700 active:bg-red-800 transition-colors">
                  Clear Deck
                </button>

                {/* Deck Dropdown - spans 2 columns */}
                <select
                  value={currentDeckId || ''}
                  onChange={(e) => handleSelectDeck(e.target.value)}
                  className={`col-span-2 py-1 px-2 rounded text-[11px] font-medium border shadow-sm cursor-pointer transition-colors ${
                    isDarkMode 
                      ? 'bg-gray-600 border-gray-500 text-gray-100 hover:bg-gray-500' 
                      : 'bg-gray-100 border-gray-300 text-gray-800 hover:bg-gray-200'
                  }`}
                >
                  {decks.map(deck => (
                    <option key={deck.id} value={deck.id}>
                      {deck.name}
                    </option>
                  ))}
                </select>

                {/* Row 3 */}
                <button 
                  onClick={() => openNameModal('new')}
                  className="py-1 px-2 rounded text-[11px] font-medium bg-blue-600 text-white shadow-md hover:bg-blue-700 active:bg-blue-800 transition-colors">
                  New Deck
                </button>
                <button 
                  onClick={() => {
                    const currentDeck = decks.find(d => d.id === currentDeckId);
                    if (currentDeck) {
                      openNameModal('rename', currentDeck.name);
                    }
                  }}
                  className="py-1 px-2 rounded text-[11px] font-medium bg-blue-600 text-white shadow-md hover:bg-blue-700 active:bg-blue-800 transition-colors">
                  Rename Deck
                </button>

                {/* Row 4 */}
                <button 
                  onClick={() => {
                    const currentDeck = decks.find(d => d.id === currentDeckId);
                    if (currentDeck) {
                      openNameModal('saveAs', `Copy of ${currentDeck.name}`);
                    }
                  }}
                  className="py-1 px-2 rounded text-[11px] font-medium bg-green-600 text-white shadow-md hover:bg-green-700 active:bg-green-800 transition-colors">
                  Save As
                </button>
                <button 
                  onClick={handleSaveDeck}
                  disabled={isSaving}
                  className={`py-1 px-2 rounded text-[11px] font-medium bg-green-600 text-white shadow-md hover:bg-green-700 active:bg-green-800 transition-colors ${isSaving ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  Save Deck
                </button>

                {/* Row 5 */}
                <button className="py-1 px-2 rounded text-[11px] font-medium bg-gray-600 text-white shadow-md hover:bg-gray-700 active:bg-gray-800 transition-colors">
                  Exit
                </button>
                <button 
                  onClick={toggleDarkMode}
                  className={`py-1 px-2 rounded text-[11px] font-medium shadow-md transition-colors ${
                    isDarkMode 
                      ? 'bg-yellow-500 hover:bg-yellow-600 active:bg-yellow-700 text-white' 
                      : 'bg-gray-800 hover:bg-gray-900 active:bg-black text-white'
                  }`}
                >
                  {isDarkMode ? '🌙 Dark' : '☀️ Light'}
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Middle Panel - 60% (1152px) */}
        <div className={`flex-1 h-full px-4 py-2 pb-4 flex flex-col gap-2 ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`} data-deck-panel>
          {/* Main Deck - 60% height */}
          <div className={`flex-[0.6] border-2 rounded p-4 min-h-0 flex flex-col ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-blue-100 border-gray-400'}`}>
            {/* Header row with stats and controls */}
            <div className="mb-4 flex items-center justify-between px-2 relative">
              <div className="flex items-center gap-2">
                <span className={`text-[14px] font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-700'}`}>Main Deck:</span>
                <span className={`text-[14px] ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{mainDeck.filter(c => c).length + (chosenChampion ? 1 : 0)}/40</span>
                {/* Deck Validation Indicator */}
                <div className="relative group" data-deck-validation>
                  <div className="flex items-center gap-2 cursor-help">
                    <span className="text-lg">{deckValidation.isValid ? "✅" : "❌"}</span>
                    <span className={`text-[14px] font-medium ${deckValidation.isValid ? 'text-green-600' : 'text-red-600'}`}>
                      {deckValidation.isValid ? "Valid" : "Invalid"}
                    </span>
                  </div>
                  {/* Tooltip */}
                  <div className={`absolute left-0 top-full mt-2 z-50 w-64 p-3 rounded shadow-lg border-2 ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-400'} opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity`}>
                    <div className="text-sm space-y-1">
                      {deckValidation.messages.map((msg, idx) => (
                        <div key={idx} className={msg.startsWith("✓") ? 'text-green-600' : 'text-red-600'}>
                          {msg.startsWith("✓") ? "• " : "• "}{msg.replace("✓ ", "")}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
              {/* Deck Name - Centered */}
              <div className="absolute left-1/2 transform -translate-x-1/2">
                <span className={`text-[14px] font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-700'}`}>
                  {decks.find(d => d.id === currentDeckId)?.name || 'No Deck Selected'}
                </span>
              </div>
              <div className="flex items-center gap-2" data-deck-controls>
                <button 
                  onClick={handleSortAZ}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium rounded shadow-md transition-colors"
                >
                  Sort A-Z
                </button>
                <button 
                  onClick={handleSortByCost}
                  className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium rounded shadow-md transition-colors"
                >
                  Sort by Cost
                </button>
                <button 
                  onClick={handleRandomize}
                  className="px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-white text-[11px] font-medium rounded shadow-md transition-colors"
                >
                  Randomize
                </button>
                <button 
                  onClick={handleScreenshot}
                  className="px-3 py-1 bg-gray-600 hover:bg-gray-700 text-white text-[11px] font-medium rounded shadow-md transition-colors"
                  title="Take Screenshot"
                >
                  📷
                </button>
              </div>
            </div>
            
            {/* Card grid */}
            <div 
              className="flex-1 grid grid-cols-10 gap-1 min-h-0" 
              data-is-grid
              style={{ gridTemplateRows: 'repeat(4, minmax(0, 1fr))' }}
            >
              {/* Champion slot (index 0) */}
              <div 
                key="champion"
                data-champion-slot
                className={`rounded border-2 flex items-center justify-center overflow-hidden cursor-pointer transition-colors relative ${isDarkMode ? 'bg-gray-700 border-yellow-600 hover:border-yellow-500' : 'bg-yellow-100 border-yellow-600 hover:border-yellow-700'}`}
                style={{ aspectRatio: '515/685' }}
                onMouseDown={(e) => {
                  if (e.button === 1 && chosenChampion) {
                    handleMiddleClick(e, chosenChampion, 'champion');
                  } else if (chosenChampion) {
                    handleChampionMouseDown(e);
                  }
                }}
                onMouseEnter={() => handleCardHover(chosenChampion)}
                onMouseLeave={handleCardHoverCancel}
                onContextMenu={handleChampionContext}
              >
                {chosenChampion ? (
                  <>
                    <img
                      src={getCardImageUrl(chosenChampion)}
                      alt={`Chosen Champion ${chosenChampion}`}
                      className="w-[92%] object-contain pointer-events-none"
                      style={{ aspectRatio: '515/719' }}
                    />
                    {isFutureRelease(getCardDetails(chosenChampion)?.releaseDate) && (
                      <div className="absolute top-1 right-1 bg-black/50 border-4 border-red-500 text-white text-[10px] font-bold px-1 py-0.5 rounded-full shadow-md z-10">
                        Future
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-yellow-600 text-[16px] font-bold">Champion</div>
                )}
              </div>
              
              {/* Main deck slots (39 cards) */}
              {Array.from({ length: 39 }).map((_, index) => {
                const cardId = index < mainDeck.length ? mainDeck[index] : null;
                return (
                  <div 
                    key={index}
                    data-card-index={index}
                    className={`rounded border flex items-center justify-center overflow-hidden cursor-pointer transition-colors select-none relative ${isDarkMode ? 'bg-gray-700 border-gray-600 hover:border-blue-400' : 'bg-gray-200 border-gray-300 hover:border-blue-500'}`}
                    style={{ aspectRatio: '515/685' }}
                    onMouseDown={(e) => {
                      if (e.button === 1 && cardId) {
                        handleMiddleClick(e, cardId, 'mainDeck', index);
                      } else if (cardId) {
                        handleMouseDown(e, index);
                      }
                    }}
                    onMouseEnter={() => handleCardHover(cardId)}
                    onMouseLeave={handleCardHoverCancel}
                    onContextMenu={(e) => cardId && handleCardContext(e, index)}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      if (cardId) {
                        handleDoubleTap(cardId, 'mainDeck');
                      }
                    }}
                  >
                    {cardId ? (
                      <>
                        <img
                          src={getCardImageUrl(cardId)}
                          alt={`Card ${cardId} slot ${index + 1}`}
                          className="w-[92%] object-contain pointer-events-none"
                          style={{ aspectRatio: '515/719' }}
                        />
                        {isFutureRelease(getCardDetails(cardId)?.releaseDate) && (
                          <div className="absolute top-1 right-1 bg-black/50 border-4 border-red-500 text-white text-[10px] font-bold px-1 py-0.5 rounded-full shadow-md z-10">
                            Future
                          </div>
                        )}
                      </>
                    ) : (
                      <div className="text-gray-400 text-[20px]">+</div>
                    )}
                  </div>
                );
              })}
            </div>
            
          </div>

          {/* Bottom Section - 40% height: Legend + Battlefields/Runes + Side Deck */}
          <div className="flex-[0.4] flex gap-4 min-h-0">
            {/* Left: Legend Slot - takes up 2 rows worth of height */}
            <div className={`w-[212px] border-2 rounded p-4 flex flex-col gap-2 min-h-0 ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-purple-100 border-gray-400'}`}>
              <div className={`text-[12px] font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-700'}`}>Legend:</div>
              {/* Legend card slot - same aspect ratio as other cards, full width */}
              <div 
                className={`w-full rounded border flex items-center justify-center overflow-hidden cursor-pointer transition-colors mb-1 relative ${isDarkMode ? 'bg-gray-700 border-gray-600 hover:border-blue-400' : 'bg-gray-200 border-gray-300 hover:border-blue-500'}`}
                data-legend-slot
                onMouseDown={(e) => {
                  if (e.button === 1 && legendCard) {
                    handleMiddleClick(e, legendCard, 'legend');
                  } else if (legendCard) {
                    handleLegendMouseDown(e);
                  }
                }}
                onMouseEnter={() => handleCardHover(legendCard)}
                onMouseLeave={handleCardHoverCancel}
                onContextMenu={handleLegendContext}
                style={{ aspectRatio: '515/719' }}
              >
                {legendCard ? (
                  <>
                    <img
                      src={getCardImageUrl(legendCard)}
                      alt={`Legend ${legendCard}`}
                      className="w-full h-full object-contain pointer-events-none"
                    />
                    {isFutureRelease(getCardDetails(legendCard)?.releaseDate) && (
                      <div className="absolute top-2 right-2 bg-black/50 border-4 border-red-500 text-white text-[13px] font-bold px-1.5 py-1 rounded-full shadow-md z-10">
                        Future
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-gray-400 text-[20px]">+</div>
                )}
              </div>
              
              {/* Color icons row - square SVGs */}
              <div className="flex gap-2 px-2 pb-1">
                {legendCard ? (() => {
                  const cardData = getCardDetails(legendCard);
                  const colors = cardData?.colors || [];
                  const color1 = colors[0] || null;
                  const color2 = colors[1] || null;
                  
                  return (
                    <>
                      <div className="flex-1 flex flex-col items-center gap-1">
                        {color1 ? (
                          <>
                            <img 
                              src={`/icons/${color1.toLowerCase()}.svg`}
                              alt={color1}
                              className="w-[75%] aspect-square object-contain"
                            />
                            <div className={`text-[10px] font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-700'}`}>{color1}</div>
                          </>
                        ) : (
                          <div className={`${isDarkMode ? 'text-gray-500' : 'text-gray-400'} text-[12px]`}>N/A</div>
                        )}
                      </div>
                      <div className="flex-1 flex flex-col items-center gap-1">
                        {color2 ? (
                          <>
                            <img 
                              src={`/icons/${color2.toLowerCase()}.svg`}
                              alt={color2}
                              className="w-[75%] aspect-square object-contain"
                            />
                            <div className={`text-[10px] font-semibold ${isDarkMode ? 'text-gray-100' : 'text-gray-700'}`}>{color2}</div>
                          </>
                          ) : (
                          <div className={`${isDarkMode ? 'text-gray-500' : 'text-gray-400'} text-[12px]`}>N/A</div>
                        )}
                      </div>
                    </>
                  );
                })() : (
                  <>
                    <div className="flex-1 flex items-center justify-center">
                      <div className={`${isDarkMode ? 'text-gray-500' : 'text-gray-400'} text-[12px]`}>N/A</div>
                    </div>
                    <div className="flex-1 flex items-center justify-center">
                      <div className={`${isDarkMode ? 'text-gray-500' : 'text-gray-400'} text-[12px]`}>N/A</div>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* Right: Battlefield/Runes and Side Deck */}
            <div className="flex-1 flex flex-col gap-2">
              {/* Upper Right: Battlefields (left) and Runes (right) side-by-side */}
              <div className="flex-1 flex gap-2 min-h-0">
                {/* Battlefields Section - Left side */}
                <div className={`flex-[0.65] border-2 rounded p-3 min-h-0 ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-teal-100 border-gray-400'}`}>
                  <div className={`text-[12px] font-bold mb-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-700'}`}>Battlefields: <span className="font-normal">{battlefields.filter(c => c).length}/3</span></div>
                  {/* Battlefield grid - 3 cards in 1 row */}
                  <div className="grid grid-cols-3 gap-2 min-h-0">
                    {Array.from({ length: 3 }).map((_, index) => {
                      const cardId = battlefields[index] || null;
                      return (
                        <div 
                          key={index}
                          data-battlefield-index={index}
                          className={`rounded border flex items-center justify-center overflow-hidden cursor-pointer transition-colors relative ${isDarkMode ? 'bg-gray-700 border-gray-600 hover:border-blue-400' : 'bg-gray-200 border-gray-300 hover:border-blue-500'}`}
                          onMouseDown={(e) => {
                            if (e.button === 1 && cardId) {
                              handleMiddleClick(e, cardId, 'battlefield', index);
                            } else if (cardId) {
                              handleBattlefieldMouseDown(e, index);
                            }
                          }}
                          onMouseEnter={() => handleCardHover(cardId)}
                          onMouseLeave={handleCardHoverCancel}
                          onContextMenu={(e) => cardId && handleBattlefieldContext(e, index)}
                          style={{ aspectRatio: '719/515' }}
                        >
                          {cardId ? (
                            <>
                              <img
                                src={getCardImageUrl(cardId)}
                                alt={`Battlefield ${cardId}`}
                                className="w-[116%] h-[116%] object-contain pointer-events-none"
                                style={{ transform: 'rotate(90deg)' }}
                              />
                              {isFutureRelease(getCardDetails(cardId)?.releaseDate) && (
                                <div className="absolute top-1 right-1 bg-black/50 border-4 border-red-500 text-white text-[10px] font-bold px-1 py-0.5 rounded-full shadow-md z-10">
                                  Future
                                </div>
                              )}
                            </>
                          ) : (
                            <div className="text-gray-400 text-[20px] rotate-90">+</div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
                
                {/* Runes Section - Right side */}
                <div className={`flex-[0.35] border-2 rounded p-3 min-h-0 flex flex-col ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-yellow-100 border-gray-400'}`}>
                  <div className={`text-[12px] font-bold mb-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-700'}`}>Runes:</div>
                  <div className="flex items-center justify-center gap-3 flex-1 min-h-0 overflow-hidden">
                    {/* Rune A slot */}
                    <div className="flex items-center justify-center gap-2 flex-1 h-full select-none">
                      <div 
                        className={`rounded border flex items-center justify-center overflow-hidden w-full max-w-[80px] cursor-pointer transition-colors select-none ${isDarkMode ? 'bg-gray-700 border-gray-600 hover:border-blue-400' : 'bg-gray-200 border-gray-300 hover:border-blue-500'}`} 
                        style={{ aspectRatio: '515/719' }}
                        onClick={() => handleRuneClick('A')}
                        onMouseDown={(e) => {
                          if (e.button === 1) {
                            const { runeABaseId } = getRuneCards();
                            if (runeABaseId) {
                              handleMiddleClick(e, formatCardId(runeABaseId, runeAVariantIndex), 'runeA');
                            }
                          } else {
                            e.preventDefault();
                          }
                        }}
                        onMouseEnter={() => {
                          const { runeA } = getRuneCards();
                          if (runeA) setSelectedCard(runeA);
                        }}
                      >
                        {(() => {
                          const { runeA } = getRuneCards();
                          return runeA ? (
                            <img
                              src={getCardImageUrl(runeA)}
                              alt="Rune A"
                              className="w-[92%] object-contain pointer-events-none"
                              style={{ aspectRatio: '515/719', outline: '1px solid black', outlineOffset: '0px' }}
                            />
                          ) : (
                            <div className={`${isDarkMode ? 'text-gray-500' : 'text-gray-400'} text-[8px] text-center`}>Rune A</div>
                          );
                        })()}
                      </div>
                      <div className={`text-[24px] font-bold w-8 text-center select-none ${isDarkMode ? 'text-gray-100' : 'text-gray-700'}`}>{runeACount}</div>
                    </div>
                    
                    {/* Divider */}
                    <div className={`h-12 w-px ${isDarkMode ? 'bg-gray-600' : 'bg-gray-400'}`}></div>
                    
                    {/* Rune B slot */}
                    <div className="flex items-center justify-center gap-2 flex-1 h-full select-none">
                      <div className={`text-[24px] font-bold w-8 text-center select-none ${isDarkMode ? 'text-gray-100' : 'text-gray-700'}`}>{runeBCount}</div>
                      <div 
                        className={`rounded border flex items-center justify-center overflow-hidden w-full max-w-[80px] cursor-pointer transition-colors select-none ${isDarkMode ? 'bg-gray-700 border-gray-600 hover:border-blue-400' : 'bg-gray-200 border-gray-300 hover:border-blue-500'}`} 
                        style={{ aspectRatio: '515/719' }}
                        onClick={() => handleRuneClick('B')}
                        onMouseDown={(e) => {
                          if (e.button === 1) {
                            const { runeBBaseId } = getRuneCards();
                            if (runeBBaseId) {
                              handleMiddleClick(e, formatCardId(runeBBaseId, runeBVariantIndex), 'runeB');
                            }
                          } else {
                            e.preventDefault();
                          }
                        }}
                        onMouseEnter={() => {
                          const { runeB } = getRuneCards();
                          if (runeB) setSelectedCard(runeB);
                        }}
                      >
                        {(() => {
                          const { runeB } = getRuneCards();
                          return runeB ? (
                            <img
                              src={getCardImageUrl(runeB)}
                              alt="Rune B"
                              className="w-[92%] object-contain pointer-events-none"
                              style={{ aspectRatio: '515/719', outline: '1px solid black', outlineOffset: '0px' }}
                            />
                          ) : (
                            <div className={`${isDarkMode ? 'text-gray-500' : 'text-gray-400'} text-[8px] text-center`}>Rune B</div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Lower Right: Side Deck */}
              <div className={`flex-1 border-2 rounded p-4 min-h-0 flex flex-col ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-orange-100 border-gray-400'}`}>
                <div className={`text-[12px] font-bold mb-2 ${isDarkMode ? 'text-gray-100' : 'text-gray-700'}`}>Side Deck: <span className="font-normal">{sideDeck.filter(c => c).length}/8</span></div>
                {/* Side deck grid - 8 cards in 1 row */}
                <div className="flex-1 grid grid-cols-8 gap-1 min-h-0" data-is-side-deck-grid>
                  {Array.from({ length: 8 }).map((_, index) => {
                    const cardId = sideDeck[index] || null;
                    return (
                      <div 
                        key={index}
                        data-side-deck-index={index}
                        className={`rounded border flex items-center justify-center overflow-hidden cursor-pointer transition-colors select-none relative ${isDarkMode ? 'bg-gray-700 border-gray-600 hover:border-blue-400' : 'bg-gray-200 border-gray-300 hover:border-blue-500'}`}
                        onMouseDown={(e) => {
                          if (e.button === 1 && cardId) {
                            handleMiddleClick(e, cardId, 'sideDeck', index);
                          } else if (cardId) {
                            handleSideDeckMouseDown(e, index);
                          }
                        }}
                        onMouseEnter={() => handleCardHover(cardId)}
                        onMouseLeave={handleCardHoverCancel}
                        onContextMenu={(e) => cardId && handleSideDeckContext(e, index)}
                        onTouchEnd={(e) => {
                          e.preventDefault();
                          if (cardId) {
                            handleDoubleTap(cardId, 'sideDeck');
                          }
                        }}
                        style={{ aspectRatio: '515/685' }}
                      >
                        {cardId ? (
                          <>
                            <img
                              src={getCardImageUrl(cardId)}
                              alt={`Side Deck Card ${cardId} slot ${index + 1}`}
                              className="w-[92%] object-contain pointer-events-none"
                              style={{ aspectRatio: '515/685' }}
                            />
                            {isFutureRelease(getCardDetails(cardId)?.releaseDate) && (
                              <div className="absolute top-1 right-1 bg-black/50 border-4 border-red-500 text-white text-[10px] font-bold px-1 py-0.5 rounded-full shadow-md z-10">
                                Future
                              </div>
                            )}
                          </>
                        ) : (
                          <div className={`${isDarkMode ? 'text-gray-500' : 'text-gray-400'} text-[20px]`}>+</div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Right Panel - Search Panel - 20% (384px) */}
        <div className={`w-[384px] h-full border-l-2 flex flex-col px-4 py-4 gap-4 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-purple-50 border-gray-300'}`}>
          {/* Filter Box */}
          <div className={`border-2 rounded p-3 flex flex-col gap-2 ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-400'}`}>
            {/* Card Name */}
            <div className="flex flex-col">
              <label className={`text-[11px] font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Card Name</label>
              <input
                type="text"
                value={searchFilters.cardName}
                onChange={(e) => setSearchFilters({...searchFilters, cardName: e.target.value})}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch();
                  }
                }}
                className={`w-full px-2 py-1 text-[11px] rounded border ${isDarkMode ? 'bg-gray-600 border-gray-500 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}
                placeholder="Search by name..."
              />
            </div>
            
            {/* Card Text */}
            <div className="flex flex-col">
              <label className={`text-[11px] font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Card Text</label>
              <input
                type="text"
                value={searchFilters.cardText}
                onChange={(e) => setSearchFilters({...searchFilters, cardText: e.target.value})}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleSearch();
                  }
                }}
                className={`w-full px-2 py-1 text-[11px] rounded border ${isDarkMode ? 'bg-gray-600 border-gray-500 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}
                placeholder="Search in description..."
              />
            </div>
            
            {/* Card Type and Color - Same line */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col">
                <label className={`text-[11px] font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Card Type</label>
                <select
                  value={searchFilters.cardType}
                  onChange={(e) => setSearchFilters({...searchFilters, cardType: e.target.value})}
                  className={`w-full px-2 py-1 text-[11px] rounded border ${isDarkMode ? 'bg-gray-600 border-gray-500 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}
                >
                  <option value="">All Types</option>
                  <option value="Unit">Unit</option>
                  <option value="Spell">Spell</option>
                  <option value="Legend">Legend</option>
                  <option value="Battlefield">Battlefield</option>
                  <option value="Champion">Champion</option>
                  <option value="Gear">Gear</option>
                  <option value="Equipment">Equipment</option>
                </select>
              </div>
              <div className="flex flex-col">
                <label className={`text-[11px] font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Card Color</label>
                <select
                  value={searchFilters.cardColor}
                  onChange={(e) => setSearchFilters({...searchFilters, cardColor: e.target.value})}
                  disabled={searchFilters.cardType === 'Battlefield'}
                  className={`w-full px-2 py-1 text-[11px] rounded border ${isDarkMode ? 'bg-gray-600 border-gray-500 text-gray-100' : 'bg-white border-gray-300 text-gray-800'} ${searchFilters.cardType === 'Battlefield' ? 'opacity-50 cursor-not-allowed' : ''}`}
                >
                  <option value="">All Colors</option>
                  <option value="Legend Colors">{getLegendColorsDisplay()}</option>
                  <option value="Calm">Calm 🟩</option>
                  <option value="Body">Body 🟧</option>
                  <option value="Mind">Mind 🟦</option>
                  <option value="Fury">Fury 🟥</option>
                  <option value="Order">Order 🟨</option>
                  <option value="Chaos">Chaos 🟪</option>
                </select>
              </div>
            </div>
            
            {/* Energy and Power range filters - Same row */}
            <div className="grid grid-cols-2 gap-2">
              {/* Energy Range */}
              <div className="flex flex-col">
                <label className={`text-[11px] font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Energy</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={searchFilters.energyMin}
                    onChange={(e) => setSearchFilters({...searchFilters, energyMin: e.target.value})}
                    disabled={searchFilters.cardType === 'Legend' || searchFilters.cardType === 'Battlefield'}
                    className={`w-12 px-1 py-1 text-[10px] rounded border ${isDarkMode ? 'bg-gray-600 border-gray-500 text-gray-100' : 'bg-white border-gray-300 text-gray-800'} ${(searchFilters.cardType === 'Legend' || searchFilters.cardType === 'Battlefield') ? 'opacity-50 cursor-not-allowed' : ''}`}
                    placeholder="Min"
                  />
                  <span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>≤</span>
                  <span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Energy</span>
                  <span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>≤</span>
                  <input
                    type="number"
                    value={searchFilters.energyMax}
                    onChange={(e) => setSearchFilters({...searchFilters, energyMax: e.target.value})}
                    disabled={searchFilters.cardType === 'Legend' || searchFilters.cardType === 'Battlefield'}
                    className={`w-12 px-1 py-1 text-[10px] rounded border ${isDarkMode ? 'bg-gray-600 border-gray-500 text-gray-100' : 'bg-white border-gray-300 text-gray-800'} ${(searchFilters.cardType === 'Legend' || searchFilters.cardType === 'Battlefield') ? 'opacity-50 cursor-not-allowed' : ''}`}
                    placeholder="Max"
                  />
                </div>
              </div>
              
              {/* Power Range */}
              <div className="flex flex-col">
                <label className={`text-[11px] font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Power</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={searchFilters.powerMin}
                    onChange={(e) => setSearchFilters({...searchFilters, powerMin: e.target.value})}
                    disabled={searchFilters.cardType === 'Legend' || searchFilters.cardType === 'Battlefield'}
                    className={`w-12 px-1 py-1 text-[10px] rounded border ${isDarkMode ? 'bg-gray-600 border-gray-500 text-gray-100' : 'bg-white border-gray-300 text-gray-800'} ${(searchFilters.cardType === 'Legend' || searchFilters.cardType === 'Battlefield') ? 'opacity-50 cursor-not-allowed' : ''}`}
                    placeholder="Min"
                  />
                  <span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>≤</span>
                  <span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Power</span>
                  <span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>≤</span>
                  <input
                    type="number"
                    value={searchFilters.powerMax}
                    onChange={(e) => setSearchFilters({...searchFilters, powerMax: e.target.value})}
                    disabled={searchFilters.cardType === 'Legend' || searchFilters.cardType === 'Battlefield'}
                    className={`w-12 px-1 py-1 text-[10px] rounded border ${isDarkMode ? 'bg-gray-600 border-gray-500 text-gray-100' : 'bg-white border-gray-300 text-gray-800'} ${(searchFilters.cardType === 'Legend' || searchFilters.cardType === 'Battlefield') ? 'opacity-50 cursor-not-allowed' : ''}`}
                    placeholder="Max"
                  />
                </div>
              </div>
            </div>
            
            {/* Might range and Sort Order - Same line */}
            <div className="flex items-end gap-2">
              <div className="flex flex-col">
                <label className={`text-[11px] font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Might</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={searchFilters.mightMin}
                    onChange={(e) => setSearchFilters({...searchFilters, mightMin: e.target.value})}
                    disabled={searchFilters.cardType === 'Gear' || searchFilters.cardType === 'Equipment' || searchFilters.cardType === 'Spell' || searchFilters.cardType === 'Legend' || searchFilters.cardType === 'Battlefield'}
                    className={`w-12 px-1 py-1 text-[10px] rounded border ${isDarkMode ? 'bg-gray-600 border-gray-500 text-gray-100' : 'bg-white border-gray-300 text-gray-800'} ${(searchFilters.cardType === 'Gear' || searchFilters.cardType === 'Equipment' || searchFilters.cardType === 'Spell' || searchFilters.cardType === 'Legend' || searchFilters.cardType === 'Battlefield') ? 'opacity-50 cursor-not-allowed' : ''}`}
                    placeholder="Min"
                  />
                  <span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>≤</span>
                  <span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Might</span>
                  <span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>≤</span>
                  <input
                    type="number"
                    value={searchFilters.mightMax}
                    onChange={(e) => setSearchFilters({...searchFilters, mightMax: e.target.value})}
                    disabled={searchFilters.cardType === 'Gear' || searchFilters.cardType === 'Equipment' || searchFilters.cardType === 'Spell' || searchFilters.cardType === 'Legend' || searchFilters.cardType === 'Battlefield'}
                    className={`w-12 px-1 py-1 text-[10px] rounded border ${isDarkMode ? 'bg-gray-600 border-gray-500 text-gray-100' : 'bg-white border-gray-300 text-gray-800'} ${(searchFilters.cardType === 'Gear' || searchFilters.cardType === 'Equipment' || searchFilters.cardType === 'Spell' || searchFilters.cardType === 'Legend' || searchFilters.cardType === 'Battlefield') ? 'opacity-50 cursor-not-allowed' : ''}`}
                    placeholder="Max"
                  />
                </div>
              </div>
              <div className="flex flex-col flex-1">
                <label className={`text-[11px] font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Sort Order</label>
                <div className="flex items-center gap-2">
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    className={`flex-1 px-2 py-1 text-[11px] rounded border ${isDarkMode ? 'bg-gray-600 border-gray-500 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}
                  >
                    <option value="A-Z">A-Z</option>
                    <option value="Energy">Energy</option>
                    <option value="Power">Power</option>
                    <option value="Might">Might</option>
                    <option value="Color">Color</option>
                  </select>
                  <div className="flex items-center gap-1">
                    <label htmlFor="sortDesc" className={`text-[10px] ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Desc</label>
                    <input
                      type="checkbox"
                      id="sortDesc"
                      checked={sortDescending}
                      onChange={(e) => setSortDescending(e.target.checked)}
                      className={`w-4 h-4 ${isDarkMode ? 'accent-blue-500' : 'accent-blue-600'}`}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Search button - Full width row */}
            <div className="w-full">
              <button
                onClick={handleSearch}
                className={`w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium rounded shadow-md transition-colors ${isDarkMode ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
              >
                Search
              </button>
            </div>
          </div>
          
          {/* Results Box */}
          <div className={`flex-1 border-2 rounded px-3 py-3 flex flex-col min-h-0 ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-400'}`}>
            {/* Pagination */}
            <div className="flex items-center justify-center gap-2 mb-2">
              <button
                onClick={() => handlePageChange(1)}
                disabled={currentPage === 1}
                className={`px-4 py-1 text-[11px] font-medium rounded ${isDarkMode ? 'bg-gray-600 text-gray-300 disabled:bg-gray-700 disabled:text-gray-600' : 'bg-gray-200 text-gray-700 disabled:bg-gray-100 disabled:text-gray-400'} ${currentPage === 1 ? 'cursor-not-allowed' : 'hover:bg-gray-300'}`}
              >
                &lt;&lt;
              </button>
              <button
                onClick={() => handlePageChange(currentPage - 1)}
                disabled={currentPage === 1}
                className={`px-4 py-1 text-[11px] font-medium rounded ${isDarkMode ? 'bg-gray-600 text-gray-300 disabled:bg-gray-700 disabled:text-gray-600' : 'bg-gray-200 text-gray-700 disabled:bg-gray-100 disabled:text-gray-400'} ${currentPage === 1 ? 'cursor-not-allowed' : 'hover:bg-gray-300'}`}
              >
                &lt;
              </button>
              <span className={`text-[11px] font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                {searchResults.length} Results ({currentPage}/{totalPages || 1})
              </span>
              <button
                onClick={() => handlePageChange(currentPage + 1)}
                disabled={currentPage === totalPages || totalPages === 0}
                className={`px-4 py-1 text-[11px] font-medium rounded ${isDarkMode ? 'bg-gray-600 text-gray-300 disabled:bg-gray-700 disabled:text-gray-600' : 'bg-gray-200 text-gray-700 disabled:bg-gray-100 disabled:text-gray-400'} ${currentPage === totalPages || totalPages === 0 ? 'cursor-not-allowed' : 'hover:bg-gray-300'}`}
              >
                &gt;
              </button>
              <button
                onClick={() => handlePageChange(totalPages)}
                disabled={currentPage === totalPages || totalPages === 0}
                className={`px-4 py-1 text-[11px] font-medium rounded ${isDarkMode ? 'bg-gray-600 text-gray-300 disabled:bg-gray-700 disabled:text-gray-600' : 'bg-gray-200 text-gray-700 disabled:bg-gray-100 disabled:text-gray-400'} ${currentPage === totalPages || totalPages === 0 ? 'cursor-not-allowed' : 'hover:bg-gray-300'}`}
              >
                &gt;&gt;
              </button>
            </div>
            
            {/* Results Grid - 4 columns x 6 rows */}
            <div className="flex-1 grid grid-cols-4 gap-2 min-h-0 relative" data-is-search-grid>
              {Array.from({ length: 24 }).map((_, index) => {
                const currentResults = getCurrentPageResults();
                const result = currentResults[index];
                const cardId = result?.displayCardId || null;
                return (
                  <div
                    key={index}
                    className={`rounded border flex items-center justify-center overflow-hidden cursor-pointer transition-colors select-none relative ${isDarkMode ? 'bg-gray-600 border-gray-500 hover:border-blue-400' : 'bg-gray-200 border-gray-300 hover:border-blue-500'}`}
                    onMouseDown={(e) => cardId && handleSearchResultMouseDown(e, cardId)}
                    onMouseEnter={() => handleCardHover(cardId)}
                    onMouseLeave={handleCardHoverCancel}
                    onContextMenu={(e) => cardId && handleSearchResultContext(e, cardId)}
                    onTouchEnd={(e) => {
                      e.preventDefault();
                      if (cardId) {
                        handleDoubleTap(cardId, 'searchResults');
                      }
                    }}
                    style={{ aspectRatio: '460/650', padding: '2px' }}
                  >
                    {cardId ? (
                      <>
                        <img
                          src={getCardImageUrl(cardId)}
                          alt={`Search Result ${cardId}`}
                          className="w-full h-full object-contain pointer-events-none"
                          style={{ 
                            aspectRatio: '460/650',
                            opacity: areAllSearchImagesLoaded() && !isPageTransitioning ? 1 : 0
                          }}
                          ref={(img) => {
                            // Check if image is already loaded (cached images)
                            // Only check if not already marked as loaded to prevent infinite loops
                            if (img && img.complete && img.naturalHeight !== 0 && !loadedSearchImages.has(cardId)) {
                              // Use setTimeout to defer state update and break the render cycle
                              setTimeout(() => {
                                handleSearchImageLoad(cardId);
                              }, 0);
                            }
                          }}
                          onLoad={() => handleSearchImageLoad(cardId)}
                          onError={() => handleSearchImageLoad(cardId)} // Also mark as "loaded" on error to prevent infinite loading
                        />
                        {isFutureRelease(getCardDetails(cardId)?.releaseDate) && (
                          <div className="absolute top-1 right-1 bg-black/50 border-4 border-red-500 text-white text-[10px] font-bold px-1 py-0.5 rounded-full shadow-md z-10">
                            Future
                          </div>
                        )}
                      </>
                    ) : (
                      <div className={`${isDarkMode ? 'text-gray-500' : 'text-gray-400'} text-[14px]`}>+</div>
                    )}
                  </div>
                );
              })}
              
              {/* Loading Overlay */}
              {!areAllSearchImagesLoaded() && !isPageTransitioning && (
                <div 
                  className={`absolute inset-0 flex items-center justify-center transition-opacity duration-300 ${
                    isDarkMode 
                      ? 'bg-gray-800 bg-opacity-70' 
                      : 'bg-gray-300 bg-opacity-70'
                  }`}
                  style={{ zIndex: 10 }}
                >
                  <div className={`text-lg font-semibold ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                    Loading...
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
        
      </div>
      </LayoutContainer>
      
      {/* Dragged Card Overlay - follows mouse during drag (completely outside LayoutContainer) */}
      {isDragging && draggedCard && (() => {
        const cardDetails = getCardDetails(draggedCard);
        const isBattlefieldCard = isDraggingFromBattlefield || cardDetails?.type === "Battlefield";
        const rotation = isBattlefieldCard ? 'rotate(90deg)' : 'rotate(0deg)';
        const size = isBattlefieldCard ? { width: '142px', height: 'auto', aspectRatio: '719/515' } : { width: '106px', height: 'auto', aspectRatio: '515/719' };
        
        return (
          <div
            style={{
              position: 'fixed',
              left: `${mousePosition.x - (isBattlefieldCard ? 142 : 106) * containerScale / 2}px`,
              top: `${mousePosition.y - (isBattlefieldCard ? 71 : 70) * containerScale}px`,
              pointerEvents: 'none',
              zIndex: 9999,
              opacity: 0.7,
              transform: `scale(${containerScale})`,
              transformOrigin: 'center center',
              transition: 'none',
            }}
            className="relative"
          >
            <img
              src={getCardImageUrl(draggedCard)}
              alt={`Dragging ${draggedCard}`}
              style={{
                ...size,
                objectFit: 'contain',
                filter: 'drop-shadow(0 4px 8px rgba(0,0,0,0.3))',
                transform: rotation
              }}
            />
            {isFutureRelease(cardDetails?.releaseDate) && (
              <div className="absolute top-1 right-1 bg-black/50 border-4 border-red-500 text-white text-[10px] font-bold px-1 py-0.5 rounded-full shadow-md z-10">
                Future
              </div>
            )}
          </div>
        );
      })()}
      
      {/* Modal */}
      {modal.isOpen && (
        <div 
          className="fixed inset-0 z-[10000] flex items-center justify-center"
          onClick={handleBackdropClick}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black bg-opacity-50" />
          
          {/* Modal Content */}
          <div 
            className={`relative z-10 w-96 max-w-[90%] rounded-lg shadow-2xl border-2 ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-400'}`}
            style={{ transform: `scale(${containerScale})`, transformOrigin: 'center center' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`px-6 py-4 border-b ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
              <h2 className={`text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                {modal.title}
              </h2>
            </div>
            
            {/* Body */}
            <div className={`px-6 py-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              <div className="whitespace-pre-wrap">{modal.message}</div>
            </div>
            
            {/* Footer */}
            <div className={`px-6 py-4 border-t flex gap-3 justify-center ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
              {modal.type === 'confirmation' ? (
                <>
                  <button
                    onClick={modal.onCancel}
                    className={`px-4 py-2 rounded font-medium transition-colors ${
                      isDarkMode 
                        ? 'bg-gray-600 text-gray-200 hover:bg-gray-500' 
                        : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                    }`}
                  >
                    Cancel
                  </button>
                  <button
                    onClick={modal.onConfirm}
                    className="px-4 py-2 rounded font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                  >
                    Confirm
                  </button>
                </>
              ) : (
                <button
                  onClick={modal.onConfirm}
                  className="px-4 py-2 rounded font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  Confirm
                </button>
              )}
            </div>
          </div>
        </div>
      )}
      
      {/* Export Deck Modal */}
      {exportModal.isOpen && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              setExportModal({ isOpen: false, deckCode: '' });
            }
          }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black bg-opacity-50" />
          
          {/* Modal Content */}
          <div 
            className={`relative z-10 w-[600px] max-w-[90%] rounded-lg shadow-2xl border-2 ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-400'}`}
            style={{ transform: `scale(${containerScale})`, transformOrigin: 'center center' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`px-6 py-4 border-b ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
              <h2 className={`text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                Export Deck
              </h2>
            </div>
            
            {/* Body */}
            <div className={`px-6 py-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              <textarea
                readOnly
                value={exportModal.deckCode}
                className={`w-full h-48 p-3 rounded border resize-none font-mono text-sm ${isDarkMode ? 'bg-gray-900 border-gray-600 text-gray-200' : 'bg-gray-50 border-gray-300 text-gray-800'}`}
                onClick={(e) => e.target.select()}
              />
            </div>
            
            {/* Footer */}
            <div className={`px-6 py-4 border-t flex gap-3 justify-center ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
              <button
                onClick={() => setExportModal({ isOpen: false, deckCode: '' })}
                className={`px-4 py-2 rounded font-medium transition-colors ${
                  isDarkMode 
                    ? 'bg-gray-600 text-gray-200 hover:bg-gray-500' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Close
              </button>
              <button
                onClick={handleCopyDeckCode}
                className="px-4 py-2 rounded font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Copy
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Variant Selection Modal */}
      {variantModal.isOpen && (() => {
        const variantCount = variantModal.variants.length;
        const cardWidth = 120; // Fixed width for each variant card
        const gap = 16; // gap-4 = 1rem = 16px
        const sidePadding = 24; // px-6 = 1.5rem = 24px per side
        const totalGaps = (variantCount - 1) * gap;
        const totalPadding = sidePadding * 2;
        const calculatedWidth = (variantCount * cardWidth) + totalGaps + totalPadding;
        const minWidth = 300; // Minimum width for the modal
        const maxWidth = Math.min(window.innerWidth * 0.9, calculatedWidth);
        const modalWidth = Math.max(minWidth, maxWidth);
        
        return (
          <div 
            className="fixed inset-0 z-[9999] flex items-center justify-center"
            onClick={(e) => {
              if (e.target === e.currentTarget) {
                handleVariantModalCancel();
              }
            }}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black bg-opacity-50" />
            
            {/* Modal Content */}
            <div 
              className={`relative z-10 rounded-lg shadow-2xl border-2 ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-400'}`}
              style={{ 
                width: `${modalWidth}px`,
                transform: `scale(${containerScale})`, 
                transformOrigin: 'center center' 
              }}
              onClick={(e) => e.stopPropagation()}
            >
              {/* Header */}
              <div className={`px-6 py-4 border-b ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
                <h2 className={`text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Select Variant
                </h2>
              </div>
              
              {/* Body */}
              <div className={`px-6 py-6 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                <div className="flex justify-center gap-4">
                  {variantModal.variants.map((variant, index) => {
                    const variantCardId = formatCardId(variantModal.baseId, index);
                    const imageUrl = variantModal.variantImages[index] || getCardImageUrl(variantCardId);
                    
                    return (
                      <div
                        key={index}
                        className="flex flex-col items-center cursor-pointer group"
                        style={{ width: `${cardWidth}px` }}
                        onClick={() => handleVariantSelect(index)}
                      >
                      <div className={`w-full rounded border-2 transition-all ${
                        variantModal.cardId === variantCardId
                          ? isDarkMode ? 'border-yellow-500 ring-2 ring-yellow-500' : 'border-yellow-600 ring-2 ring-yellow-600'
                          : isDarkMode ? 'border-gray-600 group-hover:border-blue-500' : 'border-gray-300 group-hover:border-blue-500'
                      }`}
                      style={{ aspectRatio: '515/685' }}
                      >
                        <img
                          src={imageUrl}
                          alt={`Variant ${variant}`}
                          className="w-full h-full object-contain"
                        />
                      </div>
                      <div className={`mt-2 text-center text-sm font-medium ${
                        variantModal.cardId === variantCardId
                          ? isDarkMode ? 'text-yellow-400' : 'text-yellow-600'
                          : isDarkMode ? 'text-gray-300' : 'text-gray-700'
                      }`}>
                        {variant}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
            
            {/* Footer */}
            <div className={`px-6 py-4 border-t flex justify-center gap-3 ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
              <button
                onClick={handleVariantModalCancel}
                className={`px-4 py-2 rounded font-medium transition-colors ${
                  isDarkMode 
                    ? 'bg-gray-700 text-gray-200 hover:bg-gray-600' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
        );
      })()}
      
      {/* Name Input Modal */}
      {nameModal.isOpen && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeNameModal();
            }
          }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black bg-opacity-50" />
          
          {/* Modal Content */}
          <div 
            className={`relative z-10 w-[400px] max-w-[90%] rounded-lg shadow-2xl border-2 ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-400'}`}
            style={{ transform: `scale(${containerScale})`, transformOrigin: 'center center' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`px-6 py-4 border-b ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
              <h2 className={`text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                {nameModal.type === 'new' ? 'New Deck' : nameModal.type === 'saveAs' ? 'Save As' : 'Rename Deck'}
              </h2>
            </div>
            
            {/* Body */}
            <div className={`px-6 py-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                Deck Name
              </label>
              <input
                type="text"
                value={nameModal.value}
                onChange={(e) => handleNameModalChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleNameModalConfirm();
                  } else if (e.key === 'Escape') {
                    closeNameModal();
                  }
                }}
                autoFocus
                maxLength={64}
                className={`w-full px-3 py-2 rounded border ${
                  isDarkMode 
                    ? 'bg-gray-700 border-gray-600 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                    : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                } ${nameModal.error ? 'border-red-500' : ''}`}
                placeholder="Enter deck name"
              />
              {nameModal.error && (
                <p className="mt-2 text-sm text-red-500">{nameModal.error}</p>
              )}
            </div>
            
            {/* Footer */}
            <div className={`px-6 py-4 border-t flex gap-3 justify-center ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
              <button
                onClick={closeNameModal}
                className={`px-4 py-2 rounded font-medium transition-colors ${
                  isDarkMode 
                    ? 'bg-gray-600 text-gray-200 hover:bg-gray-500' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handleNameModalConfirm}
                className="px-4 py-2 rounded font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Confirm
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Screenshot Modal */}
      {screenshotModal.isOpen && screenshotModal.fullBlobUrl && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCloseScreenshotModal();
            }
          }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black bg-opacity-50" />
          
          {/* Modal Content */}
          <div 
            className={`relative z-10 rounded-lg shadow-2xl border-2 ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-400'}`}
            style={{ transform: `scale(${containerScale})`, transformOrigin: 'center center' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`px-6 py-4 border-b ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
              <h2 className={`text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                Screenshot Preview {screenshotModal.currentView === 'full' ? '(Full)' : '(Deck Only)'}
              </h2>
            </div>
            
            {/* Body - Screenshot Preview */}
            <div className={`px-6 py-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              <div className="flex justify-center items-center max-w-[90vw] max-h-[60vh] overflow-auto">
                <img 
                  src={screenshotModal.currentView === 'full' ? screenshotModal.fullBlobUrl : screenshotModal.deckBlobUrl} 
                  alt="Screenshot preview" 
                  className="max-w-full max-h-full object-contain"
                  style={{ maxWidth: '600px', maxHeight: '338px' }}
                  draggable="false"
                />
              </div>
            </div>
            
            {/* Footer - Buttons */}
            <div className={`px-6 py-4 border-t flex justify-center gap-3 ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
              <button
                onClick={handleCloseScreenshotModal}
                className="px-4 py-2 rounded font-medium bg-gray-600 text-white hover:bg-gray-700 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleToggleScreenshotView}
                className="px-4 py-2 rounded font-medium bg-purple-600 text-white hover:bg-purple-700 transition-colors"
              >
                Toggle View
              </button>
              <button
                onClick={handleCopyScreenshot}
                className="px-4 py-2 rounded font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Copy
              </button>
              <button
                onClick={handleDownloadScreenshot}
                className="px-4 py-2 rounded font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
              >
                Download
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-[10000] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast, index) => (
          <div
            key={toast.id}
            className={`pointer-events-auto rounded-lg shadow-lg border px-4 py-3 min-w-[200px] max-w-[300px] transform transition-all duration-300 ${
              isDarkMode 
                ? 'bg-gray-800 border-gray-600 text-gray-100' 
                : 'bg-white border-gray-300 text-gray-800'
            }`}
            style={{
              animation: toast.dismissing 
                ? 'slideOutRight 0.3s ease-in forwards' 
                : 'slideInRight 0.3s ease-out',
            }}
          >
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium">{toast.content}</span>
            </div>
          </div>
        ))}
      </div>
      
      {/* Toast animation styles */}
      <style>{`
        @keyframes slideInRight {
          from {
            transform: translateX(100%);
            opacity: 0;
          }
          to {
            transform: translateX(0);
            opacity: 1;
          }
        }
        @keyframes slideOutRight {
          from {
            transform: translateX(0);
            opacity: 1;
          }
          to {
            transform: translateX(100%);
            opacity: 0;
          }
        }
      `}</style>
    </>
  );
}

export default App;
