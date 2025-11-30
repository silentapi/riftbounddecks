import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import LayoutContainer from './components/LayoutContainer';
import { domToPng } from 'modern-screenshot';
import html2canvas from 'html2canvas';
import jsPDF from 'jspdf';
import { QRCodeSVG } from 'qrcode.react';
import {
  findDeckByNameCI,
  createDeck,
  getTheme,
  setTheme as setThemeLocal,
  getScreenshotMode,
  setScreenshotMode as setScreenshotModeLocal,
  validateDeckName,
  getEditingDeckUUID,
  setEditingDeckUUID,
  loadDecks as loadDecksLocal,
  saveDecks as saveDecksLocal,
  ensureAtLeastOneDeck,
  getDefaultDeckId,
  setDefaultDeckId
} from './utils/deckStorage';
import { validateDeck as validateDeckRules } from './utils/deckValidation';
import { getDecks, ensureOneDeck, updateDeck, createDeck as createDeckApi, getDeck, deleteDeck as deleteDeckApi, toggleDeckSharing, cloneDeck, incrementDeckViews, toggleDeckLike } from './utils/decksApi';
import { getPreferences, updatePreferences } from './utils/preferencesApi';
import { migrateLegacyDecks } from './utils/legacyMigration';
import { isLoggedIn } from './utils/auth';
import { getCards } from './utils/cardsApi';
import { getCardImageUrl, parseCardId } from './utils/cardImageUtils';

function App() {
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
    if (!cardId || !cardsData || cardsData.length === 0) return null;
    const { baseId } = parseCardId(cardId);
    return cardsData.find(card => card.variantNumber === baseId);
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
  
  // Loading state for deck images and runes
  const [isDeckLoading, setIsDeckLoading] = useState(false);
  const [loadingProgress, setLoadingProgress] = useState({ loaded: 0, expected: 0 });
  const loadedImagesRef = useRef(new Set());
  const expectedImagesRef = useRef(new Set());
  const pendingImageLogRef = useRef(0);
  const pdfPreviewContainerRef = useRef(null);
  const pdfPreviewContentRef = useRef(null);
  const [pdfPreviewScale, setPdfPreviewScale] = useState(0.45);
  const PENDING_IMAGE_LOG_INTERVAL = 5000;
  
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
  const [defaultDeckId, setDefaultDeckIdState] = useState(null);
  const [loadingDecks, setLoadingDecks] = useState(true);
  const hasMigratedRef = useRef(false);
  
  // Cards data state - loaded from backend API
  const [cardsData, setCardsData] = useState([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  
  // Read-only mode state (when viewing someone else's deck)
  const [isReadOnly, setIsReadOnly] = useState(false);
  const [currentDeckMetadata, setCurrentDeckMetadata] = useState({
    isOwner: true,
    isShared: false,
    deckId: null,
    deckName: null, // Store deck name for shared decks
    ownerDisplayName: null // Store owner's displayname for non-owned decks
  });
  
  // Deck stats state (views, likes, isLiked)
  const [deckStats, setDeckStats] = useState({
    views: 0,
    likes: 0,
    isLiked: false
  });
  
  // Liked decks list from preferences
  const [likedDecks, setLikedDecks] = useState([]);
  
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
  const DEFAULT_SEARCH_FILTERS = {
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
  };
  const [searchFilters, setSearchFilters] = useState(() => ({ ...DEFAULT_SEARCH_FILTERS }));
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
    deckCode: '',
    runLengthCode: '',
    deckId: null,
    isShared: false, // Keep for backward compatibility with API
    sharingStatus: 'private', // 'private', 'shared', or 'public'
    isOwner: true
  });
  
  // Variant selection modal state
  const [variantModal, setVariantModal] = useState({
    isOpen: false,
    cardId: null,
    baseId: null,
    source: null, // 'mainDeck', 'legend', 'battlefield', 'sideDeck', 'champion'
    sourceIndex: null, // index in the source array (if applicable)
    variants: []
  });
  
  // Notes modal state
  const [notesModal, setNotesModal] = useState({
    isOpen: false,
    notes: '',
    isReadOnly: false
  });
  
  // PDF export modal state
  const [pdfExportModal, setPdfExportModal] = useState({
    isOpen: false,
    firstName: '',
    lastName: '',
    riotId: '',
    eventDate: '',
    eventName: ''
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
    const deckCards = {
      legendCard,
      battlefields,
      mainDeck,
      sideDeck,
      chosenChampion
    };
    const validation = validateDeckRules(deckCards, getCardDetails);
    setDeckValidation(validation);
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
  
  // Load cards from backend API on mount
  useEffect(() => {
    const loadCards = async () => {
      try {
        console.log('[App] Loading cards from API...');
        setCardsLoading(true);
        const cards = await getCards();
        setCardsData(cards);
        console.log('[App] Loaded cards:', cards.length, 'cards');
      } catch (error) {
        console.error('[App] Error loading cards:', error);
        // Set empty array on error to prevent crashes
        setCardsData([]);
      } finally {
        setCardsLoading(false);
      }
    };
    
    loadCards();
  }, []);
  
  const [containerScale, setContainerScale] = useState(1);
  
  // Toggle dark mode with persistence
  const toggleDarkMode = async () => {
    const newMode = !isDarkMode;
    setIsDarkMode(newMode);
    const themeValue = newMode ? 'dark' : 'light';
    setThemeLocal(themeValue);
    
    // Update preferences on server
    try {
      console.log('[DeckBuilder] Updating theme preference:', themeValue);
      await updatePreferences({ theme: themeValue });
    } catch (error) {
      console.error('[DeckBuilder] Error updating theme preference:', error);
    }
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
    console.log('[loadDeckCards] START - Loading deck cards', {
      timestamp: new Date().toISOString(),
      receivedData: {
        runeAVariantIndex: cards.runeAVariantIndex,
        runeBVariantIndex: cards.runeBVariantIndex,
        legendCard: cards.legendCard,
        runeACount: cards.runeACount,
        runeBCount: cards.runeBCount
      }
    });
    
    // Reset loading state and start tracking
    setIsDeckLoading(true);
    loadedImagesRef.current.clear();
    expectedImagesRef.current.clear();
    setLoadingProgress({ loaded: 0, expected: 0 });
    
    // Calculate all expected images
    const expected = new Set();
    
    // Main deck cards
    (cards.mainDeck || []).forEach(cardId => {
      if (cardId) expected.add(cardId);
    });
    
    // Champion
    if (cards.chosenChampion) {
      expected.add(cards.chosenChampion);
    }
    
    // Side deck
    (cards.sideDeck || []).forEach(cardId => {
      if (cardId) expected.add(cardId);
    });
    
    // Battlefields
    (cards.battlefields || []).forEach(cardId => {
      if (cardId) expected.add(cardId);
    });
    
    // Legend
    if (cards.legendCard) {
      expected.add(cards.legendCard);
    }
    
    // Runes will be added after legend card is set and colors are available
    expectedImagesRef.current = expected;
    setLoadingProgress({ loaded: 0, expected: expected.size });
    
    setMainDeck(cards.mainDeck || []);
    setChosenChampion(cards.chosenChampion || null);
    setSideDeck(compactSideDeck(cards.sideDeck || []));
    setBattlefields(cards.battlefields || []);
    
    // Normalize rune counts: if they don't total 12, set to 6-6
    const runeA = cards.runeACount || 0;
    const runeB = cards.runeBCount || 0;
    if (runeA + runeB !== 12) {
      console.log('[loadDeckCards] Setting rune counts to 6-6 (invalid total)');
      setRuneACount(6);
      setRuneBCount(6);
    } else {
      console.log('[loadDeckCards] Setting rune counts:', { runeA, runeB });
      setRuneACount(runeA);
      setRuneBCount(runeB);
    }
    
    // Load rune variant indices (default to 0 if not present or invalid)
    // IMPORTANT: Set variant indices BEFORE setting legendCard to prevent
    // the useEffect from resetting them when legendCard changes
    const runeAVariant = cards.runeAVariantIndex ?? 0;
    const runeBVariant = cards.runeBVariantIndex ?? 0;
    console.log('[loadDeckCards] Extracted variant indices from deck:', {
      runeAVariant,
      runeBVariant
    });
    
    // Store variant indices to apply after legend card is set and colors are available
    // This is necessary because getCardDetails might not have colors loaded yet
    pendingRuneVariantsRef.current = {
      runeAVariant: runeAVariant,
      runeBVariant: runeBVariant,
      legendCard: cards.legendCard
    };
    console.log('[loadDeckCards] Stored pending variant indices:', pendingRuneVariantsRef.current);
    
    // Set legend card first - this will trigger useEffect to apply variant indices
    console.log('[loadDeckCards] Setting legendCard (this will trigger useEffect):', cards.legendCard);
    setLegendCard(cards.legendCard || null);
    
    // Try to get rune base IDs immediately if colors are available
    // If not, the useEffect will handle it after legend card is set
    let runeABaseId = null;
    let runeBBaseId = null;
    if (cards.legendCard) {
      console.log('[loadDeckCards] Attempting to get card details for legend:', cards.legendCard);
      const legendCardData = getCardDetails(cards.legendCard);
      console.log('[loadDeckCards] Card details result:', {
        found: !!legendCardData,
        hasColors: !!legendCardData?.colors,
        colors: legendCardData?.colors,
        colorsType: typeof legendCardData?.colors,
        colorsIsArray: Array.isArray(legendCardData?.colors),
        cardKeys: legendCardData ? Object.keys(legendCardData).slice(0, 10) : null
      });
      
      const colors = legendCardData?.colors || [];
      const color1 = colors[0] || null;
      const color2 = colors[1] || null;
      
      console.log('[loadDeckCards] Legend card colors:', { color1, color2, legendCard: cards.legendCard, colorsArray: colors, colorsLength: colors.length });
      
      if (color1 && color2) {
        // Colors are available, we can set variant indices now
        const getRuneCardIdLocal = (color) => {
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
        
        runeABaseId = getRuneCardIdLocal(color1);
        runeBBaseId = getRuneCardIdLocal(color2);
        console.log('[loadDeckCards] Colors available, mapped to rune base IDs:', { runeABaseId, runeBBaseId });
        
        // Set variant indices immediately since we have the colors
        if (runeABaseId) {
          const runeACard = getCardDetails(runeABaseId);
          const maxVariantIndex = runeACard?.variants ? runeACard.variants.length - 1 : 0;
          const finalVariantA = Math.min(Math.max(0, runeAVariant), maxVariantIndex);
          console.log('[loadDeckCards] Setting runeAVariantIndex immediately:', {
            requested: runeAVariant,
            maxAllowed: maxVariantIndex,
            finalValue: finalVariantA,
            runeABaseId
          });
          setRuneAVariantIndex(finalVariantA);
          pendingRuneVariantsRef.current.runeAVariant = null; // Clear pending since we set it
        }
        
        if (runeBBaseId) {
          const runeBCard = getCardDetails(runeBBaseId);
          const maxVariantIndex = runeBCard?.variants ? runeBCard.variants.length - 1 : 0;
          const finalVariantB = Math.min(Math.max(0, runeBVariant), maxVariantIndex);
          console.log('[loadDeckCards] Setting runeBVariantIndex immediately:', {
            requested: runeBVariant,
            maxAllowed: maxVariantIndex,
            finalValue: finalVariantB,
            runeBBaseId
          });
          setRuneBVariantIndex(finalVariantB);
          pendingRuneVariantsRef.current.runeBVariant = null; // Clear pending since we set it
        }
      } else {
        console.log('[loadDeckCards] Colors not available yet, will be set by useEffect after legend card loads');
      }
    } else {
      console.log('[loadDeckCards] No legend card in deck data');
      pendingRuneVariantsRef.current = { runeAVariant: null, runeBVariant: null, legendCard: null };
    }
    
    console.log('[loadDeckCards] END - All state updates queued');
  };
  
  // Ref to track if we've loaded from URL to prevent re-initialization
  const hasLoadedFromUrlRef = useRef(false);
  // Ref to track if editingDeckUUID was set when we loaded the page
  const hadEditingDeckUUIDOnLoadRef = useRef(false);
  // Ref to store pending rune variant indices that need to be set after legend card loads
  const pendingRuneVariantsRef = useRef({ runeAVariant: null, runeBVariant: null });
  
  // Helper function to check if a string is a valid UUID
  const isValidUUID = (str) => {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
  };
  
  // Bootstrap: Initialize decks and load last selected deck
  useEffect(() => {
    const initializeData = async () => {
    // Skip if we've already loaded from URL (prevents re-initialization)
    if (hasLoadedFromUrlRef.current) {
      return;
    }
    
      try {
        const loggedIn = isLoggedIn();
        const path = window.location.pathname;
        const deckMatch = path.match(/^\/deck\/(.+)$/);
        
        // If not logged in and we have a deck URL, try to load it directly
        if (!loggedIn && deckMatch) {
          console.log('[DeckBuilder] Not logged in, loading deck from URL directly...');
          const encodedCode = deckMatch[1];
          hasLoadedFromUrlRef.current = true;
          const decodedCode = decodeURIComponent(encodedCode);
          
          // Set default theme (dark mode)
          setIsDarkMode(true);
          setThemeLocal('dark');
          document.documentElement.classList.add('dark');
          setLoadingDecks(false);
          
          // Only support UUID - must be a valid deck UUID
          if (!isValidUUID(decodedCode)) {
            console.error('[DeckBuilder] Invalid UUID format in URL:', decodedCode);
            await showNotification('Invalid Deck URL', 'The deck URL must be a valid deck UUID.');
            setLoadingDecks(false);
            window.location.href = '/';
            return;
          }
          
          try {
            const deck = await getDeck(decodedCode);
            console.log('[DeckBuilder] Loaded public deck from API:', deck.name, deck.id, 'shared:', deck.shared);
            setCurrentDeckId(null); // Set to null for shared decks
            loadDeckCards(deck.cards);
            setSelectedCard(deck.cards.legendCard || null);
            setIsReadOnly(true);
            setCurrentDeckMetadata({
              isOwner: false,
              isShared: deck.shared || false,
              deckId: deck.id,
              deckName: deck.name,
              ownerDisplayName: deck.ownerDisplayName || null
            });
            updateDeckStats(deck);
            // Increment views for read-only deck
            try {
              await incrementDeckViews(deck.id);
              // Reload deck to get updated views
              const updatedDeck = await getDeck(deck.id);
              updateDeckStats(updatedDeck);
            } catch (error) {
              console.error('[DeckBuilder] Error incrementing views:', error);
            }
            return; // Exit early
          } catch (apiError) {
            console.error('[DeckBuilder] Failed to load deck:', apiError);
            await showNotification('Deck Not Public', 'This deck is not shared and cannot be viewed.');
            setLoadingDecks(false);
            // Redirect to home screen
            window.location.href = '/';
            return;
          }
        }
        
        // If logged in, proceed with normal initialization
        if (!loggedIn) {
          console.log('[DeckBuilder] Not logged in and no deck URL, cannot initialize');
          setLoadingDecks(false);
          return;
        }
        
        console.log('[DeckBuilder] Initializing decks and preferences from API...');
        
        // Step 1: Migrate legacy decks if needed (only once)
        if (!hasMigratedRef.current) {
          console.log('[DeckBuilder] Checking for legacy decks to migrate...');
          hasMigratedRef.current = true;
          await migrateLegacyDecks();
        }
        
        // Step 2: Load preferences from API
        console.log('[DeckBuilder] Loading preferences from API...');
        const preferences = await getPreferences();
        console.log('[DeckBuilder] Loaded preferences:', preferences);
        
        // Load liked decks from preferences
        if (preferences?.likedDecks) {
          setLikedDecks(preferences.likedDecks);
        }
        
        // Apply theme from preferences
        const theme = preferences?.theme || 'dark';
        setIsDarkMode(theme === 'dark');
        setThemeLocal(theme);
        if (theme === 'dark') {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        
        // Apply screenshot mode from preferences
        const mode = preferences?.screenshotMode || 'full';
        setScreenshotModeState(mode);
        setScreenshotModeLocal(mode);
        
        // Step 3: Ensure at least one deck exists
        console.log('[DeckBuilder] Ensuring at least one deck exists...');
        await ensureOneDeck();
        
        // Step 4: Load decks from API
        console.log('[DeckBuilder] Loading decks from API...');
        const initialDecks = await getDecks();
        console.log('[DeckBuilder] Loaded decks:', initialDecks.map(d => ({ id: d.id, name: d.name })));
        setDecks(initialDecks);
        setLoadingDecks(false);
        
        // Step 5: Check if we're loading a deck from URL
        if (deckMatch) {
          // If it's a deck URL, load the deck from URL and skip normal initialization
          const encodedCode = deckMatch[1];
          console.log('[DeckBuilder] Loading deck from URL:', encodedCode);
          
          // Mark that we're loading from URL FIRST to prevent any re-initialization
          hasLoadedFromUrlRef.current = true;
          
          // Decode URL-encoded code
          const decodedCode = decodeURIComponent(encodedCode);
        
        // Check if the code is a valid UUID
        if (isValidUUID(decodedCode)) {
          console.log('[DeckBuilder] Detected UUID in URL:', decodedCode);
          
          // Check if editingDeckUUID was set (from homepage Edit button)
          const editingDeckUUID = getEditingDeckUUID();
          console.log('[DeckBuilder] editingDeckUUID on load:', editingDeckUUID);
          
          if (editingDeckUUID) {
            // Remember that it was set so we can restore it on Exit
            hadEditingDeckUUIDOnLoadRef.current = true;
            console.log('[DeckBuilder] Remembering that editingDeckUUID was set on load');
            // Clear it now
            setEditingDeckUUID(null);
            console.log('[DeckBuilder] Cleared editingDeckUUID');
          }
          
          // Check if this UUID exists in the user's decks
          const deckById = initialDecks.find(d => d.id === decodedCode);
          
          if (deckById) {
            console.log('[DeckBuilder] Found deck by UUID:', deckById.name, deckById.id);
            // It's a valid UUID that exists in decks - load it normally (editable)
            setCurrentDeckId(deckById.id);
            loadDeckCards(deckById.cards);
            setSelectedCard(deckById.cards.legendCard || null);
            setIsReadOnly(false);
            setCurrentDeckMetadata({
              isOwner: true,
              isShared: deckById.shared || false,
              deckId: deckById.id
            });
            updateDeckStats(deckById);
            return; // Exit early
          } else {
            console.log('[DeckBuilder] UUID not found in decks, trying to load from API...');
            try {
              // Try to load the deck from API (might be a shared deck or deck we don't own)
              const deck = await getDeck(decodedCode);
              console.log('[DeckBuilder] Loaded deck from API:', deck.name, deck.id, 'shared:', deck.shared);
              
              // Check if user owns this deck
              const isOwner = initialDecks.some(d => d.id === deck.id);
              
              // If not owner, check if it's in the updated decks list
              let updatedDecks = initialDecks;
              if (!isOwner) {
                try {
                  updatedDecks = await getDecks();
                  setDecks(updatedDecks);
                  const stillNotOwner = !updatedDecks.some(d => d.id === deck.id);
                  
                  if (stillNotOwner) {
                    // This is someone else's deck - read-only mode
                    console.log('[DeckBuilder] Loading deck in read-only mode (not owned)');
                    setCurrentDeckId(null); // Set to null for shared decks
                    loadDeckCards(deck.cards);
                    setSelectedCard(deck.cards.legendCard || null);
                    setIsReadOnly(true);
                    setCurrentDeckMetadata({
                      isOwner: false,
                      isShared: deck.shared || false,
                      deckId: deck.id,
                      deckName: deck.name,
                      ownerDisplayName: deck.ownerDisplayName || null
                    });
                    updateDeckStats(deck);
                    // Increment views for read-only deck
                    try {
                      await incrementDeckViews(deck.id);
                      // Reload deck to get updated views
                      const updatedDeck = await getDeck(deck.id);
                      updateDeckStats(updatedDeck);
                    } catch (error) {
                      console.error('[DeckBuilder] Error incrementing views:', error);
                    }
                    return; // Exit early
                  }
                } catch (err) {
                  console.error('[DeckBuilder] Error fetching decks:', err);
                  // If we can't fetch decks, assume read-only if deck is shared
                  if (deck.shared) {
                    setCurrentDeckId(null); // Set to null for shared decks
                    loadDeckCards(deck.cards);
                    setSelectedCard(deck.cards.legendCard || null);
                    setIsReadOnly(true);
                    setCurrentDeckMetadata({
                      isOwner: false,
                      isShared: true,
                      deckId: deck.id,
                      deckName: deck.name,
                      ownerDisplayName: deck.ownerDisplayName || null
                    });
                    return;
                  }
                }
              }
              
              // User owns the deck - load normally
              setCurrentDeckId(deck.id);
              loadDeckCards(deck.cards);
              setSelectedCard(deck.cards.legendCard || null);
              setIsReadOnly(false);
              setCurrentDeckMetadata({
                isOwner: true,
                isShared: deck.shared || false,
                deckId: deck.id,
                deckName: deck.name
              });
              updateDeckStats(deck);
              return; // Exit early
            } catch (apiError) {
              console.log('[DeckBuilder] Deck not found in API:', apiError.message);
              // Show error message and redirect to home
              await showNotification('Deck Not Public', 'This deck is not shared and cannot be viewed.');
              // Redirect to home screen
              window.location.href = '/';
              return;
            }
          }
        } else {
          // Not a valid UUID - show error and redirect
          console.error('[DeckBuilder] Invalid UUID format in URL:', decodedCode);
          await showNotification('Invalid Deck URL', 'The deck URL must be a valid deck UUID.');
          window.location.href = '/';
          return;
        }
        }
      
        // Normal initialization: Load default deck from preferences
        const defaultId = preferences?.defaultDeckId || null;
        console.log('[DeckBuilder] Default deck ID from preferences:', defaultId);
      let selectedDeck = null;
      
      if (defaultId) {
        selectedDeck = initialDecks.find(d => d.id === defaultId);
      }
      
      // If no default deck or not found, use first deck (empty deck)
      if (!selectedDeck && initialDecks.length > 0) {
        selectedDeck = initialDecks[0];
        // Set first deck as default if none is selected
          await updatePreferences({ defaultDeckId: selectedDeck.id });
        setDefaultDeckIdState(selectedDeck.id);
      } else if (defaultId) {
        // Update state with the default deck ID
        setDefaultDeckIdState(defaultId);
      }
      
      if (selectedDeck) {
        setCurrentDeckId(selectedDeck.id);
        loadDeckCards(selectedDeck.cards);
        // Set selected card to the legend of the loaded deck (or null if empty)
        setSelectedCard(selectedDeck.cards.legendCard || null);
      }
    } catch (error) {
        console.error('[DeckBuilder] Error initializing decks:', error);
        setLoadingDecks(false);
        // Fallback to localStorage if API fails
        try {
          const initialDecks = ensureAtLeastOneDeck();
          setDecks(initialDecks);
          const defaultId = getDefaultDeckId();
          let selectedDeck = null;
          
          if (defaultId) {
            selectedDeck = initialDecks.find(d => d.id === defaultId);
          }
          
          if (!selectedDeck && initialDecks.length > 0) {
            selectedDeck = initialDecks[0];
            setDefaultDeckId(selectedDeck.id);
            setDefaultDeckIdState(selectedDeck.id);
          } else if (defaultId) {
            setDefaultDeckIdState(defaultId);
          }
          
          if (selectedDeck) {
            setCurrentDeckId(selectedDeck.id);
            loadDeckCards(selectedDeck.cards);
            setSelectedCard(selectedDeck.cards.legendCard || null);
          }
        } catch (fallbackError) {
          console.error('[DeckBuilder] Critical error during deck initialization:', fallbackError);
          // Last resort: create empty deck
        const emptyDeck = createDeck('Empty Deck');
        setDecks([emptyDeck]);
        setCurrentDeckId(emptyDeck.id);
        loadDeckCards(emptyDeck.cards);
        setDefaultDeckIdState(emptyDeck.id);
        setSelectedCard(null);
        }
      }
    };
    
    initializeData();
  }, []); // Run only on mount
  
  // Sort decks alphabetically by name for display
  const sortedDecks = useMemo(() => {
    return [...decks].sort((a, b) => {
      const nameA = a.name.toLowerCase();
      const nameB = b.name.toLowerCase();
      if (nameA < nameB) return -1;
      if (nameA > nameB) return 1;
      return 0;
    });
  }, [decks]);
  
  // Validate rune variant indices when legend card changes
  // Also applies pending variant indices from loadDeckCards if colors are now available
  useEffect(() => {
    console.log('[useEffect:legendCard] START - Legend card changed', {
      timestamp: new Date().toISOString(),
      legendCard,
      currentRuneAVariantIndex: runeAVariantIndex,
      currentRuneBVariantIndex: runeBVariantIndex,
      pendingVariants: pendingRuneVariantsRef.current
    });
    
    // Only validate if legend card is actually set (not during initial load)
    if (!legendCard) {
      console.log('[useEffect:legendCard] No legend card, resetting variant indices to 0');
      setRuneAVariantIndex(0);
      setRuneBVariantIndex(0);
      pendingRuneVariantsRef.current = { runeAVariant: null, runeBVariant: null, legendCard: null };
      console.log('[useEffect:legendCard] END - Reset complete');
      return;
    }
    
    const { runeABaseId, runeBBaseId } = getRuneCards;
    console.log('[useEffect:legendCard] Got rune base IDs:', { runeABaseId, runeBBaseId });
    
    // Check if we have pending variant indices to apply (from loadDeckCards)
    const pending = pendingRuneVariantsRef.current;
    const shouldApplyPending = pending.legendCard === legendCard && 
                              (pending.runeAVariant !== null || pending.runeBVariant !== null);
    
    if (shouldApplyPending && runeABaseId && runeBBaseId) {
      console.log('[useEffect:legendCard] Applying pending variant indices:', pending);
      
      // Apply pending rune A variant
      if (pending.runeAVariant !== null && runeABaseId) {
        const runeACard = getCardDetails(runeABaseId);
        const maxVariantIndex = runeACard?.variants ? runeACard.variants.length - 1 : 0;
        const finalVariantA = Math.min(Math.max(0, pending.runeAVariant), maxVariantIndex);
        console.log('[useEffect:legendCard] Applying pending runeAVariantIndex:', {
          pending: pending.runeAVariant,
          maxAllowed: maxVariantIndex,
          finalValue: finalVariantA
        });
        setRuneAVariantIndex(finalVariantA);
        pending.runeAVariant = null; // Clear pending
      }
      
      // Apply pending rune B variant
      if (pending.runeBVariant !== null && runeBBaseId) {
        const runeBCard = getCardDetails(runeBBaseId);
        const maxVariantIndex = runeBCard?.variants ? runeBCard.variants.length - 1 : 0;
        const finalVariantB = Math.min(Math.max(0, pending.runeBVariant), maxVariantIndex);
        console.log('[useEffect:legendCard] Applying pending runeBVariantIndex:', {
          pending: pending.runeBVariant,
          maxAllowed: maxVariantIndex,
          finalValue: finalVariantB
        });
        setRuneBVariantIndex(finalVariantB);
        pending.runeBVariant = null; // Clear pending
      }
    } else if (shouldApplyPending) {
      console.log('[useEffect:legendCard] Pending variants exist but rune base IDs not available yet, will retry on next render');
    }
    
    // Validate rune A variant index - clamp to max instead of resetting to 0
    if (runeABaseId) {
      const runeACard = getCardDetails(runeABaseId);
      const maxVariantIndex = runeACard?.variants ? runeACard.variants.length - 1 : 0;
      console.log('[useEffect:legendCard] Validating runeA:', {
        runeABaseId,
        maxVariantIndex,
        currentValue: runeAVariantIndex
      });
      // Use functional update to get current value and only update if needed
      setRuneAVariantIndex(current => {
        console.log('[useEffect:legendCard] runeAVariantIndex functional update - current value:', current);
        if (current > maxVariantIndex) {
          const newValue = Math.max(0, maxVariantIndex);
          console.log('[useEffect:legendCard] Clamping runeAVariantIndex:', {
            from: current,
            to: newValue,
            reason: 'exceeds max'
          });
          return newValue;
        }
        console.log('[useEffect:legendCard] Keeping runeAVariantIndex:', current);
        return current; // Keep current value if valid
      });
    } else {
      console.log('[useEffect:legendCard] No runeABaseId, skipping runeA validation');
    }
    // Don't reset to 0 if baseId is null but legendCard exists - might be loading
    
    // Validate rune B variant index - clamp to max instead of resetting to 0
    if (runeBBaseId) {
      const runeBCard = getCardDetails(runeBBaseId);
      const maxVariantIndex = runeBCard?.variants ? runeBCard.variants.length - 1 : 0;
      console.log('[useEffect:legendCard] Validating runeB:', {
        runeBBaseId,
        maxVariantIndex,
        currentValue: runeBVariantIndex
      });
      // Use functional update to get current value and only update if needed
      setRuneBVariantIndex(current => {
        console.log('[useEffect:legendCard] runeBVariantIndex functional update - current value:', current);
        if (current > maxVariantIndex) {
          const newValue = Math.max(0, maxVariantIndex);
          console.log('[useEffect:legendCard] Clamping runeBVariantIndex:', {
            from: current,
            to: newValue,
            reason: 'exceeds max'
          });
          return newValue;
        }
        console.log('[useEffect:legendCard] Keeping runeBVariantIndex:', current);
        return current; // Keep current value if valid
      });
    } else {
      console.log('[useEffect:legendCard] No runeBBaseId, skipping runeB validation');
    }
    // Don't reset to 0 if baseId is null but legendCard exists - might be loading
    
    console.log('[useEffect:legendCard] END - Validation complete');
  }, [legendCard]); // Re-validate only when legend card changes
  
  // Track when rune variant indices actually change in state
  useEffect(() => {
    console.log('[useEffect:runeAVariantIndex] State changed:', {
      timestamp: new Date().toISOString(),
      newValue: runeAVariantIndex,
      legendCard
    });
  }, [runeAVariantIndex]);
  
  useEffect(() => {
    console.log('[useEffect:runeBVariantIndex] State changed:', {
      timestamp: new Date().toISOString(),
      newValue: runeBVariantIndex,
      legendCard
    });
  }, [runeBVariantIndex]);
  
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
    console.log('[handleSelectDeck] START - Selecting deck', {
      timestamp: new Date().toISOString(),
      deckId,
      currentRuneAVariantIndex: runeAVariantIndex,
      currentRuneBVariantIndex: runeBVariantIndex,
      currentLegendCard: legendCard
    });
    
    const deck = decks.find(d => d.id === deckId);
    if (deck) {
      console.log('[handleSelectDeck] Found deck, calling loadDeckCards', {
        deckName: deck.name,
        deckCards: {
          runeAVariantIndex: deck.cards.runeAVariantIndex,
          runeBVariantIndex: deck.cards.runeBVariantIndex,
          legendCard: deck.cards.legendCard
        }
      });
      
      setCurrentDeckId(deckId);
      loadDeckCards(deck.cards);
      // Set selected card to the legend of the newly loaded deck (or null if empty)
      setSelectedCard(deck.cards.legendCard || null);
      // Clear read-only mode when selecting an owned deck
      setIsReadOnly(false);
      setCurrentDeckMetadata({
        isOwner: true,
        isShared: deck.shared || false,
        deckId: deck.id,
        deckName: deck.name
      });
      updateDeckStats(deck);
      
      console.log('[handleSelectDeck] END - Deck selection complete');
    } else {
      console.warn('[handleSelectDeck] Deck not found:', deckId);
    }
  };
  
  // Set current deck as default
  const handleSetAsDefault = async () => {
    if (currentDeckId) {
      try {
        console.log('[DeckBuilder] Setting default deck:', currentDeckId);
        await updatePreferences({ defaultDeckId: currentDeckId });
      setDefaultDeckIdState(currentDeckId);
      // Show notification
        await showNotification('Default Deck Set', `"${decks.find(d => d.id === currentDeckId)?.name || 'Deck'}" is now your default deck.`);
      } catch (error) {
        console.error('[DeckBuilder] Error setting default deck:', error);
        await showNotification('Error', 'Failed to set default deck.');
      }
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
  
  // Open notes modal
  const openNotesModal = async () => {
    // Get current deck's notes
    let currentNotes = '';
    let isReadOnlyMode = isReadOnly;
    
    if (currentDeckId) {
      // Owned deck - get notes from decks array
      const deck = decks.find(d => d.id === currentDeckId);
      if (deck) {
        currentNotes = deck.notes || '';
      }
    } else if (isReadOnly && currentDeckMetadata.deckId) {
      // Read-only deck - fetch it to get notes
      isReadOnlyMode = true;
      try {
        const deck = await getDeck(currentDeckMetadata.deckId);
        currentNotes = deck.notes || '';
      } catch (error) {
        console.error('[DeckBuilder] Error fetching deck for notes:', error);
        currentNotes = '';
      }
    }
    
    setNotesModal({
      isOpen: true,
      notes: currentNotes,
      isReadOnly: isReadOnlyMode
    });
  };
  
  // Close notes modal
  const closeNotesModal = () => {
    setNotesModal({
      isOpen: false,
      notes: '',
      isReadOnly: false
    });
  };
  
  // Handle notes modal input change
  const handleNotesModalChange = (value) => {
    setNotesModal(prev => ({ ...prev, notes: value }));
  };
  
  // Handle notes modal save
  const handleNotesModalSave = async () => {
    if (!currentDeckId || notesModal.isReadOnly) return;
    
    try {
      console.log('[DeckBuilder] Saving notes for deck:', currentDeckId);
      const updatedDeck = await updateDeck(currentDeckId, { notes: notesModal.notes });
      console.log('[DeckBuilder] Notes saved:', updatedDeck);
      
      // Reload decks from API to get updated notes
      const updatedDecks = await getDecks();
      setDecks(updatedDecks);
      
      closeNotesModal();
      await showNotification('Notes Saved', 'Deck notes saved successfully.');
    } catch (error) {
      console.error('[DeckBuilder] Error saving notes:', error);
      await showNotification('Error', 'Failed to save notes.');
    }
  };
  
  // Handle toggle like
  const handleToggleLike = async () => {
    const deckId = currentDeckId || currentDeckMetadata.deckId;
    if (!deckId || !isLoggedIn()) return;
    
    try {
      console.log('[DeckBuilder] Toggling like for deck:', deckId);
      const result = await toggleDeckLike(deckId);
      console.log('[DeckBuilder] Like toggled:', result);
      
      // Update deck stats
      setDeckStats(prev => ({
        ...prev,
        likes: result.likes,
        isLiked: result.isLiked
      }));
      
      // Update liked decks list
      if (result.isLiked) {
        setLikedDecks(prev => [...prev, { deckId, likedAt: new Date() }]);
        addToast(<>❤️ Deck liked</>);
      } else {
        setLikedDecks(prev => prev.filter(liked => liked.deckId !== deckId));
        addToast(<>💔 Deck unliked</>);
      }
      
      // Reload preferences to get updated likedDecks
      try {
        const preferences = await getPreferences();
        if (preferences?.likedDecks) {
          setLikedDecks(preferences.likedDecks);
        }
      } catch (error) {
        console.error('[DeckBuilder] Error reloading preferences:', error);
      }
    } catch (error) {
      console.error('[DeckBuilder] Error toggling like:', error);
      await showNotification('Error', 'Failed to toggle like.');
    }
  };
  
  // Update deck stats when deck changes
  const updateDeckStats = (deck) => {
    if (deck) {
      const isLiked = likedDecks.some(liked => liked.deckId === deck.id);
      setDeckStats({
        views: deck.views || 0,
        likes: deck.likes || 0,
        isLiked
      });
    } else {
      setDeckStats({ views: 0, likes: 0, isLiked: false });
    }
  };
  
  // Update deck stats when likedDecks changes or when current deck changes
  useEffect(() => {
    if (currentDeckId) {
      const deck = decks.find(d => d.id === currentDeckId);
      if (deck) {
        updateDeckStats(deck);
      }
    } else if (currentDeckMetadata.deckId && !isReadOnly) {
      // For read-only decks, stats are updated when the deck is loaded
      // This handles the case when likedDecks is loaded after the deck
      const deck = decks.find(d => d.id === currentDeckMetadata.deckId);
      if (deck) {
        updateDeckStats(deck);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [likedDecks, currentDeckId, decks]);
  
  // New Deck handler
  const handleNewDeck = async (name) => {
    try {
      console.log('[DeckBuilder] Creating new deck:', name);
      const newDeck = await createDeckApi({
        name,
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
        }
      });
      console.log('[DeckBuilder] Created deck:', newDeck);
      // Reload decks from API
      const updatedDecks = await getDecks();
      setDecks(updatedDecks);
      setCurrentDeckId(newDeck.id);
      loadDeckCards(newDeck.cards);
      // Set selected card to null for empty deck
      setSelectedCard(null);
      // Clear read-only mode when creating new deck
      setIsReadOnly(false);
      setCurrentDeckMetadata({
        isOwner: true,
        isShared: false,
        deckId: newDeck.id,
        deckName: newDeck.name
      });
      updateDeckStats(newDeck);
      await showNotification('Deck Created', `Deck "${name}" has been created.`);
    } catch (error) {
      console.error('[DeckBuilder] Error creating deck:', error);
      await showNotification('Error', 'Failed to create deck.');
    }
  };
  
  // Save Deck handler
  const handleSaveDeck = async () => {
    if (!currentDeckId) return;
    
    setIsSaving(true);
    try {
      console.log('[DeckBuilder] Saving deck:', currentDeckId);
      const currentCards = getCurrentDeckCards();
      const updatedDeck = await updateDeck(currentDeckId, { cards: currentCards });
      console.log('[DeckBuilder] Deck saved:', updatedDeck);
      
      // Reload decks from API to get updated timestamps
      const updatedDecks = await getDecks();
      setDecks(updatedDecks);
      
      await showNotification('Deck Saved', 'Deck saved successfully.');
    } catch (error) {
      console.error('[DeckBuilder] Error saving deck:', error);
      await showNotification('Error', 'Failed to save deck.');
    } finally {
      setIsSaving(false);
    }
  };
  
  // Save As handler
  const handleSaveAs = async (name) => {
    try {
      // If in read-only mode with a shared deck, clone it instead
      if (isReadOnly && currentDeckMetadata.deckId && !currentDeckMetadata.isOwner) {
        console.log('[DeckBuilder] Cloning shared deck:', currentDeckMetadata.deckId);
        const clonedDeck = await cloneDeck(currentDeckMetadata.deckId, name);
        console.log('[DeckBuilder] Deck cloned:', clonedDeck);
        
        // Reload decks from API
        const updatedDecks = await getDecks();
        setDecks(updatedDecks);
        setCurrentDeckId(clonedDeck.id);
        loadDeckCards(clonedDeck.cards);
        setSelectedCard(clonedDeck.cards.legendCard || null);
        // Clear read-only mode and update metadata
        setIsReadOnly(false);
        setCurrentDeckMetadata({
          isOwner: true,
          isShared: false,
          deckId: clonedDeck.id,
          deckName: clonedDeck.name
        });
        await showNotification('Deck Cloned', `"${name}" has been saved to your account.`);
        return;
      }
      
      // Save As works even when no deck is selected (saves current editor state)
      console.log('[DeckBuilder] Saving deck as:', name);
      const currentCards = getCurrentDeckCards();
      const newDeck = await createDeckApi({
        name,
        cards: currentCards
      });
      console.log('[DeckBuilder] Deck saved as:', newDeck);
      
      // Reload decks from API
      const updatedDecks = await getDecks();
      setDecks(updatedDecks);
      setCurrentDeckId(newDeck.id);
      loadDeckCards(newDeck.cards);
      // Set selected card to the legend of the newly saved deck (or null if empty)
      setSelectedCard(newDeck.cards.legendCard || null);
      // Clear read-only mode if it was set
      setIsReadOnly(false);
      setCurrentDeckMetadata({
        isOwner: true,
        isShared: false,
        deckId: newDeck.id,
        deckName: newDeck.name
      });
      await showNotification('Deck Saved As', `Deck saved as "${name}".`);
    } catch (error) {
      console.error('[DeckBuilder] Error saving deck as:', error);
      await showNotification('Error', 'Failed to save deck.');
    }
  };
  
  // Rename Deck handler
  const handleRenameDeck = async (name) => {
    if (!currentDeckId) return;
    
    try {
      console.log('[DeckBuilder] Renaming deck:', currentDeckId, 'to', name);
      const updatedDeck = await updateDeck(currentDeckId, { name });
      console.log('[DeckBuilder] Deck renamed:', updatedDeck);
      
      // Reload decks from API
      const updatedDecks = await getDecks();
    setDecks(updatedDecks);
      
      await showNotification('Deck Renamed', `Deck renamed to "${name}".`);
    } catch (error) {
      console.error('[DeckBuilder] Error renaming deck:', error);
      await showNotification('Error', 'Failed to rename deck.');
    }
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
    
    try {
      console.log('[DeckBuilder] Deleting deck:', currentDeckId);
      await deleteDeckApi(currentDeckId);
      console.log('[DeckBuilder] Deck deleted:', currentDeckId);
      
      // Reload decks from API
      const updatedDecks = await getDecks();
      setDecks(updatedDecks);
    
    // Find next deck to select
    const currentIndex = decks.findIndex(d => d.id === currentDeckId);
    let nextDeck = null;
    
    if (currentIndex < decks.length - 1) {
      // Select next deck
        nextDeck = updatedDecks.find(d => d.id === decks[currentIndex + 1]?.id) || updatedDecks[0];
    } else if (currentIndex > 0) {
      // Select previous deck
        nextDeck = updatedDecks.find(d => d.id === decks[currentIndex - 1]?.id) || updatedDecks[0];
      } else if (updatedDecks.length > 0) {
        // Select first deck
        nextDeck = updatedDecks[0];
    }
    
    // Select next deck
    if (nextDeck) {
      setCurrentDeckId(nextDeck.id);
      loadDeckCards(nextDeck.cards);
      setSelectedCard(nextDeck.cards.legendCard || null);
      } else {
        setCurrentDeckId(null);
        setSelectedCard(null);
    }
    
      await showNotification('Deck Deleted', `"${currentDeck.name}" has been deleted.`);
    } catch (error) {
      console.error('[DeckBuilder] Error deleting deck:', error);
      await showNotification('Error', 'Failed to delete deck.');
    }
  };
  
  // Handle mouse down from champion slot
  const handleChampionMouseDown = (e) => {
    if (isReadOnly) return; // Prevent dragging in read-only mode
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
    if (isReadOnly) return; // Prevent dragging in read-only mode
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
    if (isReadOnly) return; // Prevent dragging in read-only mode
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
    if (isReadOnly) return; // Prevent dragging in read-only mode
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
    if (isReadOnly) return; // Prevent dragging in read-only mode
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
      e.preventDefault(); // Always prevent default drag behavior
      if (isReadOnly) return; // Skip modification in read-only mode
      
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
    e.preventDefault(); // Always prevent context menu
    e.stopPropagation();
    if (isReadOnly) return; // Skip modification in read-only mode
    
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
  const handleSearch = (options = {}) => {
    // Filter cards based on search criteria
    if (!cardsData || cardsData.length === 0) {
      setSearchResults([]);
      return;
    }
    const filtersToUse = options.filters || searchFilters;
    const {
      cardName,
      cardText,
      cardType,
      cardColor,
      energyMin,
      energyMax,
      powerMin,
      powerMax,
      mightMin,
      mightMax
    } = filtersToUse;
    const appliedSortOrder = options.sortOrder || sortOrder;
    const appliedSortDescending = options.sortDescending ?? sortDescending;
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
      if ((energyMin || energyMax || powerMin || powerMax) && 
          (card.type === 'Legend' || card.type === 'Battlefield')) {
        return false;
      }
      
      // Exclude Legends, Battlefields, and Spells if Might filters have values (equipment/gear support might now)
      if ((mightMin || mightMax) && 
          (card.type === 'Legend' || card.type === 'Battlefield' || card.type === 'Spell')) {
        return false;
      }
      
      // Card Name filter with wildcard support
      if (cardName) {
        const namePattern = wildcardToRegex(cardName);
        if (!namePattern.test(card.name || '')) {
          return false;
        }
      }
      
      // Card Text filter (description + tags) with wildcard support
      if (cardText) {
        const textPattern = wildcardToRegex(cardText);
        const descriptionMatches = textPattern.test(card.description || '');
        const tagsMatch = (card.tags || []).some(tag => textPattern.test(tag));
        if (!descriptionMatches && !tagsMatch) {
          return false;
        }
      }
      
      // Card Type filter
      if (cardType) {
        if (cardType === 'Champion') {
          // Champion filter: must be Unit type with super === "Champion"
          if (card.type !== 'Unit' || card.super !== 'Champion') {
            return false;
          }
        } else if (cardType === 'Equipment') {
          // Equipment filter: must have "Equipment" in tags
          if (!(card.tags && card.tags.includes('Equipment'))) {
            return false;
          }
        } else {
          // Other types: match type exactly
          if (card.type !== cardType) {
            return false;
          }
        }
      }
      
      // Card Color filter (skip if Battlefield)
      if (cardColor && cardType !== 'Battlefield') {
        if (cardColor === "Legend Colors") {
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
          if (!card.colors || !card.colors.includes(cardColor)) {
            return false;
          }
        }
      }
      
      // Energy range filter (skip if Legend or Battlefield)
      if (cardType !== 'Legend' && cardType !== 'Battlefield') {
        const energy = card.energy || 0;
        if (energyMin && energy < parseInt(energyMin)) {
          return false;
        }
        if (energyMax && energy > parseInt(energyMax)) {
          return false;
        }
      }
      
      // Power range filter (skip if Legend or Battlefield)
      if (cardType !== 'Legend' && cardType !== 'Battlefield') {
        const power = card.power || 0;
        if (powerMin && power < parseInt(powerMin)) {
          return false;
        }
        if (powerMax && power > parseInt(powerMax)) {
          return false;
        }
      }
      
      // Might range filter (skip if Gear, Equipment, Spell, Legend, or Battlefield)
      if (cardType !== 'Gear' && cardType !== 'Spell' && cardType !== 'Legend' && cardType !== 'Battlefield') {
        const might = card.might || 0;
        if (mightMin && might < parseInt(mightMin)) {
          return false;
        }
        if (mightMax && might > parseInt(mightMax)) {
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
      switch (appliedSortOrder) {
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
      
      if (primaryDiff !== 0) return appliedSortDescending ? -primaryDiff : primaryDiff;
      
      // Secondary sort: Energy -> Power -> Alphabetical
      const energyDiff = (a.energy || 0) - (b.energy || 0);
      if (energyDiff !== 0) return appliedSortDescending ? -energyDiff : energyDiff;
      
      const powerDiff = (a.power || 0) - (b.power || 0);
      if (powerDiff !== 0) return appliedSortDescending ? -powerDiff : powerDiff;
      
      // Tertiary sort: Alphabetical
      const nameDiff = (a.name || '').localeCompare(b.name || '');
      return appliedSortDescending ? -nameDiff : nameDiff;
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
    if (isReadOnly) return; // Skip modification in read-only mode
    
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
    if (isReadOnly) {
      // In read-only mode, just clear drag state without making changes
      if (isDragging) {
        // Restore card to original location if it was being dragged
        if (isDraggingFromLegend && draggedCard) {
          setLegendCard(draggedCard);
        } else if (isDraggingFromChampion && draggedCard) {
          setChosenChampion(draggedCard);
        } else if (isDraggingFromSideDeck && draggedCard && dragIndex !== null) {
          setSideDeck(prev => {
            const newSideDeck = [...prev];
            newSideDeck.splice(dragIndex, 0, draggedCard);
            return compactSideDeck(newSideDeck);
          });
        } else if (isDraggingFromBattlefield && draggedCard && dragIndex !== null) {
          setBattlefields(prev => {
            const newBattlefields = [...prev];
            newBattlefields.splice(dragIndex, 0, draggedCard);
            return newBattlefields;
          });
        } else if (draggedCard && dragIndex !== null && dragIndex >= 0) {
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
      }
      return;
    }
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
            // IMPORTANT: The card was already removed from sideDeck when dragging started,
            // so we need to count copies excluding the one being moved
            const { baseId } = parseCardId(draggedCard);
            const mainDeckCopies = mainDeck.filter(id => {
              const { baseId: otherBaseId } = parseCardId(id);
              return otherBaseId === baseId;
            }).length;
            const championCopies = chosenChampion ? (() => {
              const { baseId: championBaseId } = parseCardId(chosenChampion);
              return championBaseId === baseId ? 1 : 0;
            })() : 0;
            // Count side deck copies - the dragged card was already removed when dragging started
            const sideDeckCopies = sideDeck.filter(id => {
              const { baseId: otherBaseId } = parseCardId(id);
              return otherBaseId === baseId;
            }).length;
            // Total copies after adding this one: current copies + 1 (the one being added)
            const totalCopyCountAfterAdd = mainDeckCopies + championCopies + sideDeckCopies + 1;
            
            if (totalCopyCountAfterAdd <= 3) {
              // Try to set as champion if it's a champion and chosenChampion is null
              const wasSetAsChampion = trySetChampionIfNeeded(draggedCard);
              // Only add to main deck if it wasn't set as champion
              if (!wasSetAsChampion) {
                newDeck.splice(dropIndex, 0, draggedCard);
                setMainDeck(newDeck);
              }
              
              // Card was already removed from side deck when dragging started, so no cleanup needed
              // The side deck is already in the correct state (compacted)
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
            // IMPORTANT: The card was already removed from sideDeck when dragging started,
            // so we need to count copies excluding the one being moved
            const { baseId } = parseCardId(draggedCard);
            const mainDeckCopies = mainDeck.filter(id => {
              const { baseId: otherBaseId } = parseCardId(id);
              return otherBaseId === baseId;
            }).length;
            const championCopies = chosenChampion ? (() => {
              const { baseId: championBaseId } = parseCardId(chosenChampion);
              return championBaseId === baseId ? 1 : 0;
            })() : 0;
            // Count side deck copies - the dragged card was already removed when dragging started
            const sideDeckCopies = sideDeck.filter(id => {
              const { baseId: otherBaseId } = parseCardId(id);
              return otherBaseId === baseId;
            }).length;
            // Total copies after adding this one: current copies + 1 (the one being added)
            const totalCopyCountAfterAdd = mainDeckCopies + championCopies + sideDeckCopies + 1;
            const totalCards = mainDeck.length + (chosenChampion ? 1 : 0);
            
            if (totalCards < 40 && totalCopyCountAfterAdd <= 3) {
              // Try to set as champion if it's a champion and chosenChampion is null
              const wasSetAsChampion = trySetChampionIfNeeded(draggedCard);
              // Only add to main deck if it wasn't set as champion
              if (!wasSetAsChampion) {
                setMainDeck([...mainDeck, draggedCard]);
              }
              
              // Card was already removed from side deck when dragging started, so no cleanup needed
              // The side deck is already in the correct state (compacted)
            } else {
              // Either deck full or too many copies, restore card to side deck
              if (totalCopyCountAfterAdd > 3) {
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
  
  // Calculate container scale for proper dragged card sizing and modal scaling
  useEffect(() => {
    const updateScale = () => {
      // Use the same method as LayoutContainer - find the container with data-visible-container
      const container = document.querySelector('[data-visible-container]');
      if (container) {
        const innerWidth = container.clientWidth;
        if (innerWidth > 0) {
          const scale = innerWidth / 1920; // Reference width is 1920
          setContainerScale(scale);
        } else {
          setContainerScale(0);
        }
      } else {
        // Fallback: try to find scaled container
        const scaledContainer = document.querySelector('[style*="transform: scale"]');
        if (scaledContainer) {
          const rect = scaledContainer.getBoundingClientRect();
          const scale = rect.width / 1920; // Reference width is 1920
          setContainerScale(scale);
        }
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
    if (searchFilters.cardType === 'Gear' || searchFilters.cardType === 'Spell' || searchFilters.cardType === 'Legend' || searchFilters.cardType === 'Battlefield') {
      // Disable and reset Might filter for Gear/Spell/Legend/Battlefield
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
    e.preventDefault(); // Always prevent context menu
    e.stopPropagation();
    if (isReadOnly) return; // Skip modification in read-only mode
    
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
    e.preventDefault(); // Always prevent context menu
    e.stopPropagation();
    if (isReadOnly) return; // Skip modification in read-only mode
    
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
    e.preventDefault(); // Always prevent context menu
    if (isReadOnly) return; // Skip modification in read-only mode
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
  
  // Core function to open variant selection modal
  const openVariantModal = (cardId, source, sourceIndex = null) => {
    if (!cardId) return;
    
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
        variants: card.variants || []
      });
    } else {
      // Show toast notification for no variants
      const cardName = card?.name || 'Unknown Card';
      addToast(
        <>No variants available for <strong>{cardName}</strong></>,
        1800
      );
    }
  };

  // Track triple-click for mobile (using refs to track per card)
  const tripleClickTimers = useRef({});
  const tripleClickCounts = useRef({});

  // Handle triple-click detection for mobile
  const handleTripleClick = (cardId, source, sourceIndex = null) => {
    if (!cardId) return;
    if (isReadOnly) return; // Skip modification in read-only mode
    
    const key = `${source}-${sourceIndex !== null ? sourceIndex : 'none'}`;
    const now = Date.now();
    const lastClick = tripleClickTimers.current[key] || 0;
    const count = tripleClickCounts.current[key] || 0;
    
    // Reset if more than 500ms since last click
    if (now - lastClick > 500) {
      tripleClickCounts.current[key] = 1;
    } else {
      tripleClickCounts.current[key] = count + 1;
    }
    
    tripleClickTimers.current[key] = now;
    
    // If we've reached 3 clicks within 500ms, open modal
    if (tripleClickCounts.current[key] >= 3) {
      tripleClickCounts.current[key] = 0;
      tripleClickTimers.current[key] = 0;
      openVariantModal(cardId, source, sourceIndex);
    }
  };

  // Handle middle-click, Ctrl/Command+click: open variant selection modal
  const handleMiddleClick = (e, cardId, source, sourceIndex = null) => {
    // Check for middle button OR Ctrl/Command + left click
    const isMiddleClick = e.button === 1;
    const isCtrlClick = (e.ctrlKey || e.metaKey) && e.button === 0;
    
    if ((isMiddleClick || isCtrlClick) && cardId) {
      e.preventDefault(); // Always prevent default behavior
      e.stopPropagation();
      if (isReadOnly) return; // Skip modification in read-only mode
    }
    
    console.log('[Variant Modal] handleMiddleClick called:', {
      cardId,
      source,
      sourceIndex,
      button: e.button,
      ctrlKey: e.ctrlKey,
      metaKey: e.metaKey,
      shiftKey: e.shiftKey,
      altKey: e.altKey,
      type: e.type,
      isMiddleClick,
      isCtrlClick,
      willTrigger: (isMiddleClick || isCtrlClick) && cardId
    });
    
    if ((isMiddleClick || isCtrlClick) && cardId && !isReadOnly) {
      console.log('[Variant Modal] Opening variant modal for:', { cardId, source, sourceIndex });
      openVariantModal(cardId, source, sourceIndex);
    } else {
      console.log('[Variant Modal] Not triggering - conditions not met');
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
      variants: []
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
      variants: []
    });
  };
  
  // Handle legend context menu (right-click)
  const handleLegendContext = (e) => {
    e.preventDefault(); // Always prevent context menu
    if (isReadOnly) return; // Skip modification in read-only mode
    if (legendCard) {
      // Remove legend from slot - just clear it, don't add to deck
      setLegendCard(null);
    }
  };
  
  // Handle battlefield context menu (right-click)
  const handleBattlefieldContext = (e, index) => {
    e.preventDefault(); // Always prevent context menu
    if (isReadOnly) return; // Skip modification in read-only mode
    if (battlefields[index]) {
      // Remove the card
      const newBattlefields = battlefields.filter((_, i) => i !== index);
      setBattlefields(newBattlefields);
    }
  };
  
  // Handle sort A-Z: sort by card name, then by ID if same name
  const handleSortAZ = () => {
    if (isReadOnly) return; // Prevent modification in read-only mode
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
    if (isReadOnly) return; // Prevent modification in read-only mode
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
    if (isReadOnly) return; // Prevent modification in read-only mode
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
  const handleToggleScreenshotView = async () => {
    const newView = screenshotModal.currentView === 'full' ? 'deck' : 'full';
    setScreenshotModal(prev => ({ ...prev, currentView: newView }));
    // Save preference
    setScreenshotModeState(newView);
    setScreenshotModeLocal(newView);
    
    // Update preferences on server
    try {
      console.log('[DeckBuilder] Updating screenshot mode preference:', newView);
      await updatePreferences({ screenshotMode: newView });
    } catch (error) {
      console.error('[DeckBuilder] Error updating screenshot mode preference:', error);
    }
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
  // Memoized to prevent infinite re-renders - only recalculates when dependencies change
  const getRuneCards = useMemo(() => {
    if (!legendCard) {
      return { runeA: null, runeB: null, runeABaseId: null, runeBBaseId: null };
    }
    
    const cardData = getCardDetails(legendCard);
    const colors = cardData?.colors || [];
    const color1 = colors[0] || null;
    const color2 = colors[1] || null;
    
    const runeABaseId = color1 ? getRuneCardId(color1) : null;
    const runeBBaseId = color2 ? getRuneCardId(color2) : null;
    
    const result = {
      runeA: runeABaseId ? formatCardId(runeABaseId, runeAVariantIndex) : null,
      runeB: runeBBaseId ? formatCardId(runeBBaseId, runeBVariantIndex) : null,
      runeABaseId: runeABaseId,
      runeBBaseId: runeBBaseId
    };
    
    // Add rune images to expected images if loading (using ref to avoid re-renders)
    if (isDeckLoading && result.runeA && result.runeB) {
      expectedImagesRef.current.add(result.runeA);
      expectedImagesRef.current.add(result.runeB);
    }
    
    return result;
  }, [legendCard, runeAVariantIndex, runeBVariantIndex, isDeckLoading]);

  const runeRefs = useRef({ runeA: null, runeB: null });

  useEffect(() => {
    const { runeA, runeB } = getRuneCards;
    const prevRunes = runeRefs.current;
    const newRunes = [runeA, runeB].filter(Boolean);
    const prevSet = new Set([prevRunes.runeA, prevRunes.runeB].filter(Boolean));
    const nextSet = new Set(newRunes);

    // Remove expectations for runes that were replaced
    prevSet.forEach((id) => {
      if (!nextSet.has(id)) {
        expectedImagesRef.current.delete(id);
      }
    });

    // Ensure new rune ids are expected unless already loaded
    newRunes.forEach((id) => {
      if (id && !loadedImagesRef.current.has(id)) {
        expectedImagesRef.current.add(id);
      }
    });

    runeRefs.current = { runeA, runeB };
  }, [getRuneCards]);
  
  
  // Handle image load - only update if not already loaded to prevent infinite loops
  const logPendingImages = useCallback(() => {
    if (!isDeckLoading) return;
    const now = Date.now();
    if (now - pendingImageLogRef.current < PENDING_IMAGE_LOG_INTERVAL) {
      return;
    }

    const pendingIds = Array.from(expectedImagesRef.current).filter(
      id => !loadedImagesRef.current.has(id)
    );
    if (!pendingIds.length) {
      return;
    }

    pendingImageLogRef.current = now;
    console.log('[Loading] still waiting for images', { pendingIds });
  }, [isDeckLoading]);

  const handleImageLoad = useCallback((cardId) => {
    if (!cardId || !isDeckLoading) return;
    
    // Only process if not already loaded
    if (loadedImagesRef.current.has(cardId)) return;
    
    loadedImagesRef.current.add(cardId);
    
    // Update progress display
    setLoadingProgress({
      loaded: loadedImagesRef.current.size,
      expected: expectedImagesRef.current.size
    });
    
    logPendingImages();
    // Check if all images are loaded
    const allLoaded = Array.from(expectedImagesRef.current).every(id => loadedImagesRef.current.has(id));
    const { runeA, runeB } = getRuneCards;
    
    // Check if runes are loaded (either no legend card, or both rune images loaded)
    const runesLoaded = !legendCard || 
                       (runeA && runeB && 
                        runeAVariantIndex !== undefined && runeBVariantIndex !== undefined &&
                        loadedImagesRef.current.has(runeA) && loadedImagesRef.current.has(runeB));
    
    if (allLoaded && runesLoaded) {
      console.log('[Loading] All images and runes loaded, hiding loading modal');
      setIsDeckLoading(false);
    }
  }, [isDeckLoading, legendCard, runeAVariantIndex, runeBVariantIndex, getRuneCards]);
  
  // Check completion periodically (using interval to avoid infinite loops)
  useEffect(() => {
    if (!isDeckLoading) return;
    
    const checkCompletion = () => {
      // Update progress display
      setLoadingProgress({
        loaded: loadedImagesRef.current.size,
        expected: expectedImagesRef.current.size
      });
      
      // If no expected images, check if we need to wait for runes
      if (expectedImagesRef.current.size === 0) {
          // No images to load, just check runes
          const runesAreLoaded = !legendCard || 
                                (runeAVariantIndex !== undefined && runeBVariantIndex !== undefined);
          if (runesAreLoaded) {
            console.log('[Loading] No images expected, runes loaded, hiding loading modal');
            setIsDeckLoading(false);
          }
          return;
        }
        
        const allImagesLoaded = Array.from(expectedImagesRef.current).every(id => loadedImagesRef.current.has(id));
        const { runeA, runeB } = getRuneCards;
        
        // Runes are loaded when:
        // 1. No legend card (no runes needed), OR
        // 2. Legend card exists and both rune variant indices are set AND rune images are loaded
        const runesAreLoaded = !legendCard || 
                              (runeA && runeB && 
                               runeAVariantIndex !== undefined && runeBVariantIndex !== undefined &&
                               loadedImagesRef.current.has(runeA) && loadedImagesRef.current.has(runeB));
        
        if (allImagesLoaded && runesAreLoaded) {
          console.log('[Loading] All images and runes loaded, hiding loading modal');
          setIsDeckLoading(false);
        } else {
          logPendingImages();
        }
    };
    
    // Check immediately
    checkCompletion();
    
    // Check periodically (every 100ms) to catch cached images
    const interval = setInterval(checkCompletion, 100);
    
    return () => clearInterval(interval);
  }, [isDeckLoading, legendCard, runeAVariantIndex, runeBVariantIndex, getRuneCards]);
  
  // Handle rune clicks - clicking a rune takes 1 from the other and adds to itself
  const handleRuneClick = (runeType) => {
    if (isReadOnly) return; // Prevent modification in read-only mode
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
  
  // Set code mapping for URL compression
  const SET_CODE_MAP = {
    'OGN': '0',
    'OGS': '1',
    'SFD': '2',
    'ARC': '9'
  };
  
  // Reverse mapping for decoding
  const SET_CODE_REVERSE = {
    '0': 'OGN',
    '1': 'OGS',
    '2': 'SFD',
    '9': 'ARC'
  };
  
  // Encode card ID with set code replacement (compact format)
  // OGN-247 -> 0247 (no dash, no variant suffix for normal variant)
  // OGN-247-1 -> 0247 (variant 1 is normal, so no suffix)
  // OGN-247-2 -> 02472 (variant 2, append variant number)
  // OGN-247-3 -> 02473 (variant 3, append variant number)
  const encodeCardIdWithSetCode = (cardId) => {
    if (!cardId) return '';
    // Match format: SET-NUMBER or SET-NUMBER-VARIANT
    const match = cardId.match(/^([A-Z]+)-(\d+)(?:-(\d+))?$/);
    if (match) {
      const setCode = match[1];
      const number = match[2];
      const variant = match[3] ? parseInt(match[3], 10) : 1; // Default to 1 if no variant
      const encodedSet = SET_CODE_MAP[setCode] || setCode; // Fallback to original if not in map
      
      // Pad number to 3 digits for consistency
      const paddedNumber = number.padStart(3, '0');
      
      // Variant 1 (normal) has no suffix, variant 2+ appends the variant number
      if (variant === 1) {
        return `${encodedSet}${paddedNumber}`;
      } else {
        return `${encodedSet}${paddedNumber}${variant}`;
      }
    }
    return cardId; // Fallback to original if format doesn't match
  };
  
  // Decode card ID with set code replacement (compact format)
  // 0247 -> OGN-247-1 (normal variant)
  // 02472 -> OGN-247-2 (variant 2)
  // 20202 -> SFD-020-2 (variant 2)
  // 9172 -> ARC-172-1 (normal variant)
  const decodeCardIdWithSetCode = (encodedId) => {
    if (!encodedId) return '';
    
    // Try to match: SETCODE(1 digit) + NUMBER(3 digits) + VARIANT(optional 1-2 digits)
    // Set codes can be: 0 (OGN), 1 (OGS), 2 (SFD), or 9 (ARC)
    // The key insight: we always pad numbers to 3 digits when encoding,
    // so we can safely extract exactly 3 digits for the number part
    
    // First, try with variant (5-6 digits total: 1 set + 3 number + 1-2 variant)
    let match = encodedId.match(/^([0-2]|9)(\d{3})(\d{1,2})$/);
    if (match) {
      const encodedSet = match[1];
      const number = match[2]; // Keep as string to preserve leading zeros (e.g., "020")
      const variantStr = match[3];
      const setCode = SET_CODE_REVERSE[encodedSet] || encodedSet;
      const variant = parseInt(variantStr, 10);
      // Preserve leading zeros in number
      return `${setCode}-${number}-${variant}`;
    }
    
    // No variant (exactly 4 digits: 1 set + 3-digit number)
    match = encodedId.match(/^([0-2]|9)(\d{3})$/);
    if (match) {
      const encodedSet = match[1];
      const number = match[2]; // Keep as string to preserve leading zeros
      const setCode = SET_CODE_REVERSE[encodedSet] || encodedSet;
      // Preserve leading zeros in number
      return `${setCode}-${number}-1`;
    }
    
    return encodedId; // Fallback to original if format doesn't match
  };
  
  // Apply run-length encoding to deck code for URL compression
  const encodeRunLength = (cardIds) => {
    if (cardIds.length === 0) return '';
    
    const encoded = [];
    let currentCard = null;
    let count = 0;
    
    for (const cardId of cardIds) {
      // Encode card ID with set code replacement
      const encodedCard = encodeCardIdWithSetCode(cardId);
      
      if (encodedCard === currentCard) {
        count++;
      } else {
        if (currentCard !== null) {
          // Output previous card with count if > 1
          if (count > 1) {
            encoded.push(`${currentCard}x${count}`);
          } else {
            encoded.push(currentCard);
          }
        }
        currentCard = encodedCard;
        count = 1;
      }
    }
    
    // Output last card
    if (currentCard !== null) {
      if (count > 1) {
        encoded.push(`${currentCard}x${count}`);
      } else {
        encoded.push(currentCard);
      }
    }
    
    return encoded.join('-');
  };
  
  // Decode run-length encoded deck code
  // Supports both formats:
  // - Compressed: "2185-20202-0004x3-..." (dash-separated, encoded set codes)
  // - Uncompressed: "SFD-185-1 SFD-020-2 OGN-004-1 ..." (space-separated, full card IDs)
  const decodeRunLength = (encodedString) => {
    if (!encodedString) return [];
    
    const decoded = [];
    
    // Check if this looks like uncompressed format (contains full card IDs like "SFD-185-1")
    // Uncompressed format has letters in the set code part
    const isUncompressedFormat = /[A-Z]+-\d+/.test(encodedString);
    
    if (isUncompressedFormat) {
      // Uncompressed format: split by spaces (or multiple spaces) and use directly
      const parts = encodedString.trim().split(/\s+/);
      for (const part of parts) {
        if (part.trim()) {
          // Already in full format (e.g., "SFD-185-1"), use as-is
          decoded.push(part.trim());
        }
      }
    } else {
      // Compressed format: split by dash, comma, or space and decode
      const parts = encodedString.trim().split(/[-,\s]+/);
      
      for (const part of parts) {
        if (!part.trim()) continue;
        
        // Check for run-length encoding (e.g., "0004x3")
        const runLengthMatch = part.match(/^(.+)x(\d+)$/);
        if (runLengthMatch) {
          const encodedCardId = runLengthMatch[1];
          const count = parseInt(runLengthMatch[2], 10);
          const cardId = decodeCardIdWithSetCode(encodedCardId);
          for (let i = 0; i < count; i++) {
            decoded.push(cardId);
          }
        } else {
          const cardId = decodeCardIdWithSetCode(part);
          decoded.push(cardId);
        }
      }
    }
    
    return decoded;
  };
  
  // Handle export deck
  const handleExportDeck = async () => {
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
    const { runeA, runeB } = getRuneCards;
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
    // Create run-length encoded version for URL
    const runLengthCode = encodeRunLength(deckCodeParts);
    
    // Fetch the latest deck data from the database to get current shared status
    let isShared = currentDeckMetadata.isShared;
    let isOwner = currentDeckMetadata.isOwner;
    let sharingStatus = 'private';
    
    if (currentDeckId) {
      try {
        const deck = await getDeck(currentDeckId);
        isShared = deck.shared || false;
        // Determine sharingStatus from deck properties
        if (deck.shared) {
          sharingStatus = deck.publicListed ? 'public' : 'shared';
        } else {
          sharingStatus = 'private';
        }
        // Update currentDeckMetadata with latest shared status
        setCurrentDeckMetadata({
          ...currentDeckMetadata,
          isShared: isShared
        });
      } catch (error) {
        console.error('[Export] Error fetching deck for shared status:', error);
        // Fall back to currentDeckMetadata if fetch fails
        sharingStatus = isShared ? 'public' : 'private';
      }
    } else {
      sharingStatus = isShared ? 'public' : 'private';
    }
    
    setExportModal({
      isOpen: true,
      deckCode,
      runLengthCode, // Store run-length encoded version for URL
      deckId: currentDeckId,
      isShared: isShared,
      sharingStatus: sharingStatus,
      isOwner: isOwner
    });
  };
  
  // Helper function to copy text to clipboard with fallback for Chrome/Edge compatibility
  const copyToClipboard = async (text) => {
    // Try modern clipboard API first (works in Chrome, Edge, and other modern browsers)
    if (navigator.clipboard && navigator.clipboard.writeText) {
      try {
        await navigator.clipboard.writeText(text);
        return true;
      } catch (error) {
        console.warn('Clipboard API failed, trying fallback:', error);
        // Fall through to fallback method
      }
    }
    
    // Fallback: Create a temporary textarea element (works in all browsers including older Chrome/Edge)
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.left = '-999999px';
    textarea.style.top = '-999999px';
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    
    try {
      const successful = document.execCommand('copy');
      document.body.removeChild(textarea);
      
      if (successful) {
        return true;
      } else {
        throw new Error('execCommand copy failed');
      }
    } catch (err) {
      document.body.removeChild(textarea);
      throw err;
    }
  };
  
  // Handle copy deck code
  const handleCopyDeckCode = async () => {
    const deckCode = exportModal.deckCode;
    
    try {
      await copyToClipboard(deckCode);
      addToast('Deck code copied to clipboard!');
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      addToast('Failed to copy deck code');
    }
  };
  
  // Handle clone deck (Save As for public decks)
  const handleCloneDeck = async () => {
    if (!exportModal.deckId || !currentDeckMetadata.isShared) {
      return;
    }
    
    try {
      const clonedDeck = await cloneDeck(exportModal.deckId);
      
      // Reload decks list
      const updatedDecks = await getDecks();
      setDecks(updatedDecks);
      
      // Load the cloned deck
      setCurrentDeckId(clonedDeck.id);
      loadDeckCards(clonedDeck.cards);
      setSelectedCard(clonedDeck.cards.legendCard || null);
      setIsReadOnly(false);
      setCurrentDeckMetadata({
        isOwner: true,
        isShared: false,
        deckId: clonedDeck.id
      });
      
      // Close export modal
      setExportModal({ ...exportModal, isOpen: false });
      
      await showNotification('Deck Cloned', `"${clonedDeck.name}" has been saved to your account`);
    } catch (error) {
      console.error('Error cloning deck:', error);
      await showNotification('Error', error.message || 'Failed to clone deck');
    }
  };
  
  // Handle copy deck URL
  const handleCopyDeckUrl = async () => {
    if (!exportModal.deckId) {
      addToast('No deck ID available');
      return;
    }
    
    try {
      // Use UUID for the URL
      const deckUrl = `${window.location.origin}/deck/${exportModal.deckId}`;
      await copyToClipboard(deckUrl);
      addToast('Deck URL copied to clipboard!');
    } catch (error) {
      console.error('Error copying URL to clipboard:', error);
      addToast('Failed to copy deck URL');
    }
  };
  
  // Handle sharing status change (Private/Shared/Public)
  const handleSharingStatusChange = async (newStatus) => {
    if (!exportModal.deckId || !exportModal.isOwner || newStatus === exportModal.sharingStatus) {
      return;
    }
    
    try {
      // Use new sharingStatus format
      const updatedDeck = await toggleDeckSharing(exportModal.deckId, newStatus);
      
      // Determine sharingStatus from deck properties
      let updatedStatus = 'private';
      if (updatedDeck.shared) {
        updatedStatus = updatedDeck.publicListed ? 'public' : 'shared';
      }
      
      // Update modal state
      setExportModal({
        ...exportModal,
        isShared: updatedDeck.shared,
        sharingStatus: updatedStatus
      });
      
      // Update current deck metadata
      setCurrentDeckMetadata({
        ...currentDeckMetadata,
        isShared: updatedDeck.shared
      });
      
      // Update decks list if deck is in it
      setDecks(prevDecks => 
        prevDecks.map(d => 
          d.id === exportModal.deckId 
            ? { ...d, shared: updatedDeck.shared, publicListed: updatedDeck.publicListed }
            : d
        )
      );
      
      const statusMessages = {
        'private': 'Deck is now private',
        'shared': 'Deck is now shared',
        'public': 'Deck is now public'
      };
      
      addToast(statusMessages[updatedStatus] || 'Sharing status updated');
    } catch (error) {
      console.error('Error updating sharing status:', error);
      addToast(error.message || 'Failed to update sharing status');
    }
  };
  
  // Calculate PDF preview scale to fit container
  const calculatePdfPreviewScale = useCallback(() => {
    if (!pdfPreviewContainerRef.current) return;
    
    const container = pdfPreviewContainerRef.current;
    const containerWidth = container.clientWidth;
    const containerHeight = container.clientHeight;
    
    // A4 dimensions in mm: 210mm x 297mm
    // Convert to pixels (assuming 96 DPI: 1mm = 3.779527559 pixels)
    const a4WidthPx = 210 * 3.779527559;
    const a4HeightPx = 297 * 3.779527559;
    
    // Calculate scale to fit both width and height
    const scaleX = (containerWidth - 48) / a4WidthPx; // 48px for padding (24px * 2)
    const scaleY = (containerHeight - 48) / a4HeightPx;
    const scale = Math.min(scaleX, scaleY, 1); // Don't scale up, only down
    
    setPdfPreviewScale(Math.max(0.3, scale)); // Minimum scale of 0.3
  }, []);
  
  // Update scale when modal opens or window resizes
  useEffect(() => {
    if (pdfExportModal.isOpen) {
      // Calculate scale after a short delay to ensure DOM is ready
      setTimeout(calculatePdfPreviewScale, 100);
      
      const handleResize = () => {
        calculatePdfPreviewScale();
      };
      
      window.addEventListener('resize', handleResize);
      return () => window.removeEventListener('resize', handleResize);
    }
  }, [pdfExportModal.isOpen, calculatePdfPreviewScale]);
  
  // Get formatted date string (MM/DD/YYYY)
  const getFormattedDate = (date) => {
    if (!date) return '';
    // Parse YYYY-MM-DD format directly to avoid timezone issues
    const parts = date.split('-');
    if (parts.length === 3) {
      const year = parts[0];
      const month = parts[1];
      const day = parts[2];
      return `${month}/${day}/${year}`;
    }
    // Fallback to Date parsing if format is different
    const d = new Date(date);
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const year = d.getFullYear();
    return `${month}/${day}/${year}`;
  };
  
  // Get today's date in YYYY-MM-DD format for date input
  const getTodayDateString = () => {
    const today = new Date();
    const year = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  };
  
  // Get last initial from last name
  const getLastInitial = (lastName) => {
    if (!lastName || lastName.trim().length === 0) return '';
    return lastName.trim()[0].toUpperCase();
  };
  
  // Get main deck cards with quantities (40 lines)
  // Includes chosen champion in the count
  const getMainDeckLines = () => {
    const cardCounts = new Map();
    
    // Count main deck cards
    mainDeck.forEach(cardId => {
      if (!cardId) return;
      const card = getCardDetails(cardId);
      if (card) {
        const cardName = card.name || 'Unknown';
        cardCounts.set(cardName, (cardCounts.get(cardName) || 0) + 1);
      }
    });
    
    // Include chosen champion in the count
    if (chosenChampion) {
      const card = getCardDetails(chosenChampion);
      if (card) {
        const cardName = card.name || 'Unknown';
        cardCounts.set(cardName, (cardCounts.get(cardName) || 0) + 1);
      }
    }
    
    // Convert to array of {quantity, name} and sort alphabetically
    const cards = Array.from(cardCounts.entries())
      .map(([name, count]) => ({ quantity: count, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    // Pad to 40 lines with empty entries
    const lines = [];
    for (let i = 0; i < 40; i++) {
      lines.push(cards[i] || { quantity: '', name: '' });
    }
    
    return lines;
  };
  
  // Get legend card (1 line - no quantity)
  const getLegendLine = () => {
    if (!legendCard) {
      return { name: '' };
    }
    const card = getCardDetails(legendCard);
    return { name: card?.name || 'Unknown' };
  };
  
  // Get chosen champion (1 line - no quantity)
  const getChosenChampionLine = () => {
    if (!chosenChampion) {
      return { name: '' };
    }
    const card = getCardDetails(chosenChampion);
    return { name: card?.name || 'Unknown' };
  };
  
  // Get battlefield cards (3 lines - no quantity)
  const getBattlefieldLines = () => {
    const lines = [];
    for (let i = 0; i < 3; i++) {
      const cardId = battlefields[i];
      if (cardId) {
        const card = getCardDetails(cardId);
        lines.push({ name: card?.name || 'Unknown' });
      } else {
        lines.push({ name: '' });
      }
    }
    return lines;
  };
  
  // Get rune cards (2 lines - one for each rune type)
  const getRuneLines = () => {
    const lines = [];
    const { runeABaseId, runeBBaseId } = getRuneCards;
    
    // Rune A line
    if (runeACount > 0 && runeABaseId) {
      const card = getCardDetails(runeABaseId);
      lines.push({ quantity: runeACount, name: card?.name || 'Unknown' });
    } else {
      lines.push({ quantity: '', name: '' });
    }
    
    // Rune B line
    if (runeBCount > 0 && runeBBaseId) {
      const card = getCardDetails(runeBBaseId);
      lines.push({ quantity: runeBCount, name: card?.name || 'Unknown' });
    } else {
      lines.push({ quantity: '', name: '' });
    }
    
    return lines;
  };
  
  // Get side deck cards (8 lines)
  const getSideDeckLines = () => {
    const cardCounts = new Map();
    
    // Count side deck cards
    sideDeck.forEach(cardId => {
      if (!cardId) return;
      const card = getCardDetails(cardId);
      if (card) {
        const cardName = card.name || 'Unknown';
        cardCounts.set(cardName, (cardCounts.get(cardName) || 0) + 1);
      }
    });
    
    // Convert to array of {quantity, name} and sort alphabetically
    const cards = Array.from(cardCounts.entries())
      .map(([name, count]) => ({ quantity: count, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
    
    // Pad to 8 lines with empty entries
    const lines = [];
    for (let i = 0; i < 8; i++) {
      lines.push(cards[i] || { quantity: '', name: '' });
    }
    
    return lines;
  };
  
  // Check if the deck contains any future cards
  const hasFutureCards = () => {
    const allCards = [
      legendCard,
      ...(battlefields || []).filter(c => c),
      ...(mainDeck || []).filter(c => c),
      ...(sideDeck || []).filter(c => c),
      chosenChampion
    ].filter(c => c);
    
    return allCards.some(cardId => {
      const cardData = getCardDetails(cardId);
      return isFutureRelease(cardData?.releaseDate);
    });
  };
  
  // Open PDF export modal
  const handleOpenPdfExport = () => {
    const todayDate = getTodayDateString();
    setPdfExportModal({
      isOpen: true,
      firstName: '',
      lastName: '',
      riotId: '',
      eventDate: todayDate,
      eventName: ''
    });
    // Close the export modal
    setExportModal({ ...exportModal, isOpen: false });
  };
  
  // Close PDF export modal
  const handleClosePdfExport = () => {
    setPdfExportModal({ ...pdfExportModal, isOpen: false });
  };
  
  // Update PDF export form field
  const handlePdfExportFieldChange = (field, value) => {
    setPdfExportModal({ ...pdfExportModal, [field]: value });
  };
  
  // Generate PDF document by capturing the preview element exactly (using same method as screenshots)
  const generatePdf = async () => {
    if (!pdfPreviewContentRef.current) {
      throw new Error('Preview element not found');
    }
    
    // Create a hidden clone at full size for PDF generation
    const previewElement = pdfPreviewContentRef.current;
    const clone = previewElement.cloneNode(true);
    
    // Remove any transforms from the clone and set exact dimensions
    clone.style.position = 'absolute';
    clone.style.left = '0';
    clone.style.top = '0';
    clone.style.transform = 'none';
    clone.style.width = '210mm';
    clone.style.height = '297mm';
    clone.style.padding = '6.35mm';
    clone.style.boxSizing = 'border-box';
    clone.style.margin = '0';
    clone.style.visibility = 'visible';
    clone.style.opacity = '1';
    clone.style.zIndex = '-1';
    clone.style.display = 'block';
    
    // Also update all child elements to remove transforms
    const allChildren = clone.querySelectorAll('*');
    allChildren.forEach(child => {
      if (child.style) {
        child.style.transform = 'none';
      }
    });
    
    // Create a container to hold the clone with exact A4 dimensions
    const container = document.createElement('div');
    container.style.position = 'fixed';
    container.style.left = '0';
    container.style.top = '0';
    container.style.width = '210mm';
    container.style.height = '297mm';
    container.style.overflow = 'visible';
    container.style.backgroundColor = '#ffffff';
    container.style.margin = '0';
    container.style.padding = '0';
    container.appendChild(clone);
    document.body.appendChild(container);
    
    try {
      // Wait for clone to render and layout (same timing as screenshots)
      await new Promise(resolve => setTimeout(resolve, 50));
      
      // Force a reflow to ensure the value is rendered (same as screenshots)
      clone.offsetHeight;
      
      // Use domToPng (same as screenshots) instead of html2canvas
      // Ensure borders are captured by using higher pixel ratio
      const dataUrl = await domToPng(clone, {
        quality: 1.0,
        pixelRatio: Math.max(window.devicePixelRatio || 1, 2), // Use at least 2x for better border rendering
      });
      
      // Remove container and clone
      document.body.removeChild(container);
      
      // Create PDF with A4 dimensions
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'mm',
        format: 'a4'
      });
      
      // A4 dimensions in mm
      const pageWidth = 210;
      const pageHeight = 297;
      
      // Add image at exact page size (no scaling, no offset)
      pdf.addImage(dataUrl, 'PNG', 0, 0, pageWidth, pageHeight, undefined, 'FAST');
      
      return pdf;
    } catch (error) {
      // Clean up on error
      if (document.body.contains(container)) {
        document.body.removeChild(container);
      }
      throw error;
    }
  };
  
  // Handle PDF download
  const handleDownloadPdf = async () => {
    try {
      const pdf = await generatePdf();
      const fileName = `riftbound-decklist-${Date.now()}.pdf`;
      pdf.save(fileName);
      addToast('PDF downloaded successfully!');
    } catch (error) {
      console.error('Error generating PDF:', error);
      addToast('Failed to generate PDF');
    }
  };
  
  // Handle PDF print
  const handlePrintPdf = async () => {
    try {
      const pdf = await generatePdf();
      pdf.autoPrint();
      // Open in new window for printing
      const pdfBlob = pdf.output('blob');
      const pdfUrl = URL.createObjectURL(pdfBlob);
      const printWindow = window.open(pdfUrl, '_blank');
      if (printWindow) {
        printWindow.onload = () => {
          printWindow.print();
        };
      }
    } catch (error) {
      console.error('Error generating PDF:', error);
      addToast('Failed to generate PDF');
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
  
  // Parse deck code string and load into editor (reusable function)
  const parseAndLoadDeckCode = (deckCodeString, showNotifications = true) => {
    console.log('[Import] Starting deck import, raw input:', deckCodeString);
    console.log('[Import] Input length:', deckCodeString?.length || 0);
    
    // Parse the deck string - support both formats:
    // Regular format: "OGN-265-1 OGN-246-2 OGN-103-1 ..." (space-separated)
    // Compressed format: "0004x3-20202-0172-..." (dash-separated, no dashes in card codes, no -1 for normal variants)
    // First decode run-length encoding and set codes if present
    const cardIds = decodeRunLength(deckCodeString);
    console.log('[Import] After decodeRunLength, cardIds:', cardIds);
    console.log('[Import] Decoded card count:', cardIds.length);
    
    const parsedCards = [];
    const invalidCards = [];
    
    for (const cardStr of cardIds) {
      // Parse format: OGN-265-1 -> { baseId: "OGN-265", variantIndex: 1 }
      // or OGN-265 -> { baseId: "OGN-265", variantIndex: 0 }
      const { baseId, variantIndex } = parseCardId(cardStr);
      if (baseId) {
        // Check if card exists in database
        const cardDetails = getCardDetails(baseId);
        if (!cardDetails) {
          invalidCards.push({ original: cardStr, baseId, reason: 'Card not found in database' });
          console.warn(`[Import] Card not found: ${cardStr} (baseId: ${baseId})`);
        }
        
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
      } else {
        invalidCards.push({ original: cardStr, baseId: null, reason: 'Failed to parse card ID format' });
        console.warn(`[Import] Failed to parse card ID: ${cardStr}`);
      }
    }
    
    console.log('[Import] Parsed cards count:', parsedCards.length);
    console.log('[Import] Invalid cards:', invalidCards);
    
    // Check if any valid cards were found
    const foundValidCards = parsedCards.some(cardId => {
      const { baseId } = parseCardId(cardId);
      return getCardDetails(baseId) !== undefined;
    });
    
    console.log('[Import] Found valid cards:', foundValidCards);
    
    if (parsedCards.length === 0 || !foundValidCards) {
      console.error('[Import] Validation failed:', {
        parsedCardsLength: parsedCards.length,
        foundValidCards,
        invalidCards,
        sampleParsedCards: parsedCards.slice(0, 5),
        sampleCardIds: cardIds.slice(0, 5)
      });
      return { success: false, error: 'Invalid deck format' };
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
      console.log('[Import] Checking first card for legend:', {
        cardId,
        baseId,
        cardType: firstCard?.type,
        cardName: firstCard?.name,
        isLegend: firstCard?.type === 'Legend'
      });
      if (firstCard?.type === 'Legend') {
        legendCard = cardId; // Preserve variant index
        console.log('[Import] Legend found:', legendCard);
        i++;
      } else {
        console.warn('[Import] First card is not a Legend:', {
          cardId,
          baseId,
          type: firstCard?.type,
          name: firstCard?.name
        });
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
    
    const result = {
      success: true,
      legendCard,
      mainDeckCount: mainDeckCards.length,
      battlefieldCount: battlefieldCards.length,
      runeCount: runeCards.length,
      sideDeckCount: sideDeckCards.length
    };
    
    // Console log the details
    console.log('[Deck Load] Deck loaded from code:', {
      legend: legendCard ? 'Yes' : 'No',
      main: mainDeckCards.length,
      battlefields: battlefieldCards.length,
      runes: runeCards.length,
      side: sideDeckCards.length
    });
    
    return result;
  };
  
  // Load deck from URL
  const loadDeckFromUrl = async (encodedCode) => {
    try {
      const loggedIn = isLoggedIn();
      // Decode URL-encoded code
      const decodedCode = decodeURIComponent(encodedCode);
      
      // Check if the code is a valid UUID
      if (isValidUUID(decodedCode)) {
        console.log('[DeckBuilder] loadDeckFromUrl - Detected UUID:', decodedCode);
        
        // Check if editingDeckUUID was set (from homepage Edit button)
        const editingDeckUUID = getEditingDeckUUID();
        console.log('[DeckBuilder] loadDeckFromUrl - editingDeckUUID:', editingDeckUUID);
        
        if (editingDeckUUID) {
          // Remember that it was set so we can restore it on Exit
          hadEditingDeckUUIDOnLoadRef.current = true;
          console.log('[DeckBuilder] loadDeckFromUrl - Remembering that editingDeckUUID was set on load');
          // Clear it now
          setEditingDeckUUID(null);
          console.log('[DeckBuilder] loadDeckFromUrl - Cleared editingDeckUUID');
        }
        
        // If logged in, check if this UUID exists in the user's decks
        if (loggedIn) {
          const deckById = decks.find(d => d.id === decodedCode);
          
          if (deckById) {
            console.log('[DeckBuilder] loadDeckFromUrl - Found deck:', deckById.name, deckById.id);
            // It's a valid UUID that exists in decks - load it normally
            setCurrentDeckId(deckById.id);
            loadDeckCards(deckById.cards);
            // Set selected card to the legend of the loaded deck (or null if empty)
            setSelectedCard(deckById.cards.legendCard || null);
            setIsReadOnly(false);
            setCurrentDeckMetadata({
              isOwner: true,
              isShared: deckById.shared || false,
              deckId: deckById.id,
              deckName: deckById.name
            });
            updateDeckStats(deckById);
            // Mark that we've loaded from URL to prevent re-initialization
            hasLoadedFromUrlRef.current = true;
            return;
          }
        }
        
        // Not in user's decks (or not logged in) - try to load from API as public deck
        console.log('[DeckBuilder] loadDeckFromUrl - UUID not found in decks, trying to load from API...');
        try {
          const deck = await getDeck(decodedCode);
          console.log('[DeckBuilder] loadDeckFromUrl - Loaded deck from API:', deck.name, deck.id, 'shared:', deck.shared);
          
          if (loggedIn) {
            // Check if user owns this deck
            const isOwner = decks.some(d => d.id === deck.id);
            setCurrentDeckId(isOwner ? deck.id : null);
            setIsReadOnly(!isOwner);
            setCurrentDeckMetadata({
              isOwner: isOwner,
              isShared: deck.shared || false,
              deckId: deck.id,
              deckName: deck.name,
              ownerDisplayName: isOwner ? null : (deck.ownerDisplayName || null)
            });
          } else {
            // Not logged in - always read-only
            setCurrentDeckId(null);
            setIsReadOnly(true);
            setCurrentDeckMetadata({
              isOwner: false,
              isShared: deck.shared || false,
              deckId: deck.id,
              deckName: deck.name,
              ownerDisplayName: deck.ownerDisplayName || null
            });
          }
          
          loadDeckCards(deck.cards);
          setSelectedCard(deck.cards.legendCard || null);
          updateDeckStats(deck);
          
          // Increment views for read-only deck
          const isReadOnlyDeck = !loggedIn || (loggedIn && !decks.some(d => d.id === deck.id));
          if (isReadOnlyDeck) {
            try {
              await incrementDeckViews(deck.id);
              // Reload deck to get updated views
              const updatedDeck = await getDeck(deck.id);
              updateDeckStats(updatedDeck);
            } catch (error) {
              console.error('[DeckBuilder] loadDeckFromUrl - Error incrementing views:', error);
            }
          }
          
          hasLoadedFromUrlRef.current = true;
          return;
        } catch (apiError) {
          console.error('[DeckBuilder] loadDeckFromUrl - Failed to load deck from API:', apiError);
          await showNotification('Deck Not Public', 'This deck is not shared and cannot be viewed.');
          // Redirect to home screen
          window.location.href = '/';
          return;
        }
      } else {
        // Not a valid UUID - show error and redirect
        console.error('[DeckBuilder] loadDeckFromUrl - Invalid UUID format in URL:', decodedCode);
        await showNotification('Invalid Deck URL', 'The deck URL must be a valid deck UUID.');
        window.location.href = '/';
        return;
      }
      
    } catch (error) {
      console.error('[Deck Load] Error loading deck from URL:', error);
      // If it's a UUID and we failed, show error and redirect
      const decodedCode = decodeURIComponent(encodedCode);
      if (isValidUUID(decodedCode)) {
        showNotification('Deck Not Public', 'This deck is not shared and cannot be viewed.').then(() => {
          window.location.href = '/';
        });
      }
    }
  };
  
  // Watch for URL changes to load deck from /deck/<encoded> (for navigation after initial load)
  useEffect(() => {
    // Also listen for popstate events (back/forward navigation)
    // Note: replaceState does NOT trigger popstate, only pushState and actual browser navigation do
    const handlePopState = () => {
      const path = window.location.pathname;
      const deckMatch = path.match(/^\/deck\/(.+)$/);
      
      if (deckMatch) {
        const encodedCode = deckMatch[1];
        // Use the global loadDeckFromUrl function
        loadDeckFromUrl(encodedCode);
      }
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [loadDeckFromUrl]);
  
  // Handle import deck from clipboard
  const handleImportDeck = async () => {
    try {
      // Read from clipboard - use Clipboard API (works in Chrome, Edge, and modern browsers)
      let clipboardText = '';
      
      // Check if Clipboard API is available
      if (!navigator.clipboard || typeof navigator.clipboard.readText !== 'function') {
        await showNotification(
          'Import Failed', 
          'Clipboard API is not available. This may require HTTPS or a secure context. Please paste the deck code manually or use a modern browser like Chrome or Edge.'
        );
        return;
      }
      
      try {
        clipboardText = await navigator.clipboard.readText();
      } catch (clipboardError) {
        // Handle specific clipboard errors (permissions, etc.)
        console.error('[Import] Clipboard read error:', clipboardError);
        await showNotification(
          'Import Failed', 
          'Could not read from clipboard. This may require clipboard permissions. Please ensure you grant clipboard access when prompted, or paste the deck code manually.'
        );
        return;
      }
      
      console.log('[Import] Clipboard text read:', clipboardText);
      console.log('[Import] Clipboard text type:', typeof clipboardText);
      console.log('[Import] Clipboard text trimmed:', clipboardText?.trim());
      
      // Extract deck code from URL if clipboard contains a URL
      // Support formats like: http://localhost:5173/deck/2185-20202-... or /deck/2185-20202-...
      const urlMatch = clipboardText.match(/\/deck\/(.+)$/);
      if (urlMatch) {
        const deckCode = urlMatch[1];
        console.log('[Import] Detected URL format, extracted deck code:', deckCode);
        clipboardText = deckCode;
      }
      
      const result = parseAndLoadDeckCode(clipboardText, true);
      console.log('[Import] Parse result:', result);
      
      if (!result.success) {
        console.error('[Import] Import failed:', {
          error: result.error,
          clipboardText: clipboardText,
          clipboardLength: clipboardText?.length || 0
        });
        await showNotification('Invalid Deck', `Invalid deck in clipboard. Check console for details. Error: ${result.error || 'Unknown error'}`);
        return;
      }
      
      await showNotification(
        'Deck Imported',
        `Deck imported successfully!\nLegend: ${result.legendCard ? 'Yes' : 'No'}\nMain: ${result.mainDeckCount}\nBattlefields: ${result.battlefieldCount}\nRunes: ${result.runeCount}\nSide: ${result.sideDeckCount}`
      );
      
    } catch (error) {
      console.error('[Import] Error importing deck:', error);
      console.error('[Import] Error stack:', error.stack);
      await showNotification('Import Failed', 'Failed to import deck. Please ensure clipboard contains valid deck format.');
    }
  };
  
  // Check if all loading is complete
  const isLoading = loadingDecks;
  
  return (
    <>
      <LayoutContainer isDarkMode={isDarkMode}>
        {/* Content is sized in pixels based on 1920x1080 reference */}
        <div className={`relative w-[1920px] h-[1080px] flex ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`} data-screenshot-container>
          {/* Full-page loading overlay */}
          {isLoading && (
            <div 
              className={`absolute inset-0 z-50 flex items-center justify-center ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}
              style={{ pointerEvents: 'all' }}
            >
              <div className="flex flex-col items-center gap-4">
                <div className={`text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Loading...
                </div>
                <div className="w-16 h-16 border-4 border-t-blue-600 border-r-blue-600 border-b-transparent border-l-transparent rounded-full animate-spin"></div>
              </div>
            </div>
          )}
        {/* Left Panel - 20% (384px) */}
        <div className={`w-[384px] h-full border-r-2 flex flex-col px-4 py-4 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-blue-50 border-gray-300'}`}>
          {/* Card Image - auto height */}
          <div className="w-full flex-shrink-0 mb-2">
            <img 
              src={getCardImageUrl(selectedCard, cardsData)}
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
                  disabled={!currentDeckId || isReadOnly}
                  className={`py-1 px-2 rounded text-[11px] font-medium bg-blue-600 text-white shadow-md hover:bg-blue-700 active:bg-blue-800 transition-colors ${(!currentDeckId || isReadOnly) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  Import Deck
                </button>
                <button 
                  onClick={handleExportDeck}
                  disabled={isReadOnly}
                  className={`py-1 px-2 rounded text-[11px] font-medium bg-blue-600 text-white shadow-md hover:bg-blue-700 active:bg-blue-800 transition-colors ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  Export Deck
                </button>

                {/* Row 2 */}
                <button 
                  onClick={handleDeleteDeck}
                  disabled={isSaving || !currentDeckId || isReadOnly}
                  className={`py-1 px-2 rounded text-[11px] font-medium bg-red-600 text-white shadow-md hover:bg-red-700 active:bg-red-800 transition-colors ${(isSaving || !currentDeckId || isReadOnly) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  Delete Deck
                </button>
                <button 
                  onClick={handleClearDeck}
                  disabled={!currentDeckId || isReadOnly}
                  className={`py-1 px-2 rounded text-[11px] font-medium bg-red-600 text-white shadow-md hover:bg-red-700 active:bg-red-800 transition-colors ${(!currentDeckId || isReadOnly) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  Clear Deck
                </button>

                {/* Deck Dropdown - spans 2 columns */}
                <select
                  value={currentDeckId || ''}
                  onChange={(e) => {
                    if (e.target.value) {
                      handleSelectDeck(e.target.value);
                    }
                  }}
                  disabled={!isLoggedIn()}
                  className={`col-span-2 py-1 px-2 rounded text-[11px] font-medium border shadow-sm transition-colors ${
                    !isLoggedIn()
                      ? 'opacity-50 cursor-not-allowed bg-gray-400'
                      : 'cursor-pointer'
                  } ${
                    isDarkMode 
                      ? 'bg-gray-600 border-gray-500 text-gray-100 hover:bg-gray-500' 
                      : 'bg-gray-100 border-gray-300 text-gray-800 hover:bg-gray-200'
                  }`}
                >
                  <option value="" disabled hidden style={{ display: 'none' }}></option>
                  {sortedDecks.map(deck => {
                    const isDefault = deck.id === defaultDeckId;
                    return (
                      <option key={deck.id} value={deck.id}>
                        {deck.name}{isDefault ? ' ⭐' : ''}
                      </option>
                    );
                  })}
                </select>

                {/* Row 3 */}
                <button 
                  onClick={() => openNameModal('new')}
                  disabled={!isLoggedIn()}
                  className={`py-1 px-2 rounded text-[11px] font-medium bg-blue-600 text-white shadow-md hover:bg-blue-700 active:bg-blue-800 transition-colors ${!isLoggedIn() ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  New Deck
                </button>
                <button 
                  onClick={() => {
                    const currentDeck = decks.find(d => d.id === currentDeckId);
                    if (currentDeck) {
                      openNameModal('rename', currentDeck.name);
                    }
                  }}
                  disabled={!currentDeckId || isReadOnly}
                  className={`py-1 px-2 rounded text-[11px] font-medium bg-blue-600 text-white shadow-md hover:bg-blue-700 active:bg-blue-800 transition-colors ${(!currentDeckId || isReadOnly) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  Rename Deck
                </button>

                {/* Row 4 */}
                <button 
                  onClick={() => {
                    if (isReadOnly && currentDeckMetadata.deckName) {
                      // For shared decks, use the shared deck name
                      openNameModal('saveAs', `Copy of ${currentDeckMetadata.deckName}`);
                    } else if (currentDeckId) {
                      const currentDeck = decks.find(d => d.id === currentDeckId);
                      if (currentDeck) {
                        openNameModal('saveAs', `Copy of ${currentDeck.name}`);
                      }
                    } else {
                      openNameModal('saveAs', 'New Deck');
                    }
                  }}
                  disabled={!isLoggedIn()}
                  className={`py-1 px-2 rounded text-[11px] font-medium bg-green-600 text-white shadow-md hover:bg-green-700 active:bg-green-800 transition-colors ${!isLoggedIn() ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  Save As
                </button>
                <button 
                  onClick={handleSaveDeck}
                  disabled={isSaving || !currentDeckId || isReadOnly || !isLoggedIn()}
                  className={`py-1 px-2 rounded text-[11px] font-medium bg-green-600 text-white shadow-md hover:bg-green-700 active:bg-green-800 transition-colors ${(isSaving || !currentDeckId || isReadOnly || !isLoggedIn()) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  Save Deck
                </button>

                {/* Row 5 */}
                <button 
                  onClick={() => {
                    console.log('[DeckBuilder] Exit button clicked');
                    console.log('[DeckBuilder] currentDeckId:', currentDeckId);
                    // Always set the current deck as editingDeckUUID when exiting
                    // This ensures the homepage will select this deck when we return
                    if (currentDeckId) {
                      console.log('[DeckBuilder] Exit button - setting editingDeckUUID:', currentDeckId);
                      setEditingDeckUUID(currentDeckId);
                      console.log('[DeckBuilder] Exit button - editingDeckUUID set, navigating...');
                    } else {
                      console.log('[DeckBuilder] Exit button - no currentDeckId to save');
                    }
                    // Use setTimeout to ensure localStorage write completes before navigation
                    setTimeout(() => {
                      window.location.href = '/';
                    }, 10);
                  }}
                  className="py-1 px-2 rounded text-[11px] font-medium bg-gray-600 text-white shadow-md hover:bg-gray-700 active:bg-gray-800 transition-colors">
                  Exit
                </button>
                <button 
                  onClick={handleSetAsDefault}
                  disabled={!currentDeckId || isReadOnly}
                  className={`py-1 px-2 rounded text-[11px] font-medium bg-blue-600 text-white shadow-md hover:bg-blue-700 active:bg-blue-800 transition-colors ${(!currentDeckId || isReadOnly) ? 'opacity-50 cursor-not-allowed' : ''}`}>
                  Set as Default
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Middle Panel - 60% (1152px) */}
        <div className={`flex-1 h-full px-4 py-2 pb-4 flex flex-col gap-2 relative ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`} data-deck-panel>
          {/* Loading Modal Overlay - Solid overlay covering entire middle section */}
          {isDeckLoading && (
            <div className={`absolute inset-0 z-[100] flex items-center justify-center ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`} style={{ margin: 0, padding: 0 }}>
              <div className="flex flex-col items-center gap-4">
                <div className="animate-spin rounded-full h-16 w-16 border-4 border-blue-500 border-t-transparent"></div>
                <div className={`text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-800'}`}>
                  Loading Deck...
                </div>
                <div className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                  Loading images and runes...
                </div>
                <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  {loadingProgress.loaded} / {loadingProgress.expected} images loaded
                </div>
              </div>
            </div>
          )}
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
                {/* Views and Likes Display - Only show if deck is shared (not private) */}
                {((currentDeckId || currentDeckMetadata.deckId) && (currentDeckMetadata.isShared || (currentDeckId && decks.find(d => d.id === currentDeckId)?.shared))) && (
                  <div className="flex items-center gap-3 ml-2">
                    <div className="flex items-center gap-1">
                      <span className={`text-[14px] ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        Views: {deckStats.views || 0}
                      </span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className={`text-[14px] ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                        Likes: {deckStats.likes || 0}
                      </span>
                    </div>
                  </div>
                )}
              </div>
              {/* Deck Name - Centered */}
              <div className="absolute left-1/2 transform -translate-x-1/2">
                {(() => {
                  const deckName = decks.find(d => d.id === currentDeckId)?.name || currentDeckMetadata.deckName || 'No Deck Selected';
                  const ownerDisplayName = currentDeckMetadata.ownerDisplayName;
                  const isViewingOthersDeck = !currentDeckMetadata.isOwner && ownerDisplayName;
                  
                  return (
                    <span className={`text-[14px] ${isDarkMode ? 'text-gray-100' : 'text-gray-700'}`}>
                      <span className="font-bold">{deckName}</span>
                      {isViewingOthersDeck && (
                        <span className="font-normal"> by {ownerDisplayName}</span>
                      )}
                    </span>
                  );
                })()}
              </div>
              <div className="flex items-center gap-2" data-deck-controls>
                {!isReadOnly && (
                  <>
                    <button 
                      onClick={handleSortAZ}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium rounded shadow-md transition-colors whitespace-nowrap"
                    >
                      Sort A-Z
                    </button>
                    <button 
                      onClick={handleSortByCost}
                      className="px-3 py-1 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium rounded shadow-md transition-colors whitespace-nowrap"
                    >
                      Sort by Cost
                    </button>
                    <button 
                      onClick={handleRandomize}
                      className="px-3 py-1 bg-yellow-500 hover:bg-yellow-600 text-white text-[11px] font-medium rounded shadow-md transition-colors"
                    >
                      Randomize
                    </button>
                  </>
                )}
                {isReadOnly && isLoggedIn() && currentDeckMetadata.deckId && currentDeckMetadata.isShared && (
                  <button 
                    onClick={handleToggleLike}
                    className="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white text-[11px] font-medium rounded shadow-md transition-colors whitespace-nowrap"
                  >
                    {deckStats.isLiked ? '💔 Unlike' : '❤️ Like'}
                  </button>
                )}
                <button 
                  onClick={openNotesModal}
                  className="px-3 py-1 bg-gray-500 hover:bg-gray-600 text-white text-[11px] font-medium rounded shadow-md transition-colors"
                  title="Deck Notes"
                >
                  📝
                </button>
                <button 
                  onClick={toggleDarkMode}
                  className={`px-3 py-1 text-[11px] font-medium rounded shadow-md transition-colors ${
                    isDarkMode 
                      ? 'bg-gray-600 hover:bg-gray-500 text-gray-100' 
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                  }`}
                  title={isDarkMode ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
                >
                  {isDarkMode ? '🌙' : '☀️'}
                </button>
                <button 
                  onClick={handleScreenshot}
                  className={`px-3 py-1 text-[11px] font-medium rounded shadow-md transition-colors ${
                    isDarkMode 
                      ? 'bg-gray-600 hover:bg-gray-500 text-gray-100' 
                      : 'bg-gray-100 hover:bg-gray-200 text-gray-800'
                  }`}
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
                  console.log('[Champion] onMouseDown:', {
                    button: e.button,
                    ctrlKey: e.ctrlKey,
                    metaKey: e.metaKey,
                    shiftKey: e.shiftKey,
                    altKey: e.altKey,
                    type: e.type,
                    hasChampion: !!chosenChampion
                  });
                  
                  // Check for middle-click or Ctrl/Command+click
                  const isMiddleClick = e.button === 1;
                  const isCtrlClick = (e.ctrlKey || e.metaKey) && e.button === 0;
                  
                  if ((isMiddleClick || isCtrlClick) && chosenChampion) {
                    handleMiddleClick(e, chosenChampion, 'champion');
                  } else if (chosenChampion) {
                    handleChampionMouseDown(e);
                  }
                }}
                onClick={(e) => {
                  // Triple-click for mobile (handled by handleTripleClick)
                  if (chosenChampion) {
                    handleTripleClick(chosenChampion, 'champion');
                  }
                }}
                onMouseEnter={() => handleCardHover(chosenChampion)}
                onMouseLeave={handleCardHoverCancel}
                onContextMenu={handleChampionContext}
              >
                {chosenChampion ? (
                  <>
                    <img
                      src={getCardImageUrl(chosenChampion, cardsData)}
                      alt={`Chosen Champion ${chosenChampion}`}
                      className="w-[92%] object-contain pointer-events-none"
                      style={{ aspectRatio: '515/719' }}
                      data-card-id={chosenChampion}
                      ref={(img) => {
                        if (img && img.complete && img.naturalHeight !== 0 && !loadedImagesRef.current.has(chosenChampion)) {
                          // Use setTimeout to defer state update and break render cycle
                          setTimeout(() => {
                            handleImageLoad(chosenChampion);
                          }, 0);
                        }
                      }}
                      onLoad={() => handleImageLoad(chosenChampion)}
                      onError={() => handleImageLoad(chosenChampion)}
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
                      console.log(`[MainDeck ${index}] onMouseDown:`, {
                        button: e.button,
                        ctrlKey: e.ctrlKey,
                        metaKey: e.metaKey,
                        shiftKey: e.shiftKey,
                        altKey: e.altKey,
                        type: e.type,
                        hasCard: !!cardId
                      });
                      
                      // Check for middle-click or Ctrl/Command+click
                      const isMiddleClick = e.button === 1;
                      const isCtrlClick = (e.ctrlKey || e.metaKey) && e.button === 0;
                      
                      if ((isMiddleClick || isCtrlClick) && cardId) {
                        handleMiddleClick(e, cardId, 'mainDeck', index);
                      } else if (cardId) {
                        handleMouseDown(e, index);
                      }
                    }}
                    onClick={(e) => {
                      // Triple-click for mobile (handled by handleTripleClick)
                      if (cardId) {
                        handleTripleClick(cardId, 'mainDeck', index);
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
                          src={getCardImageUrl(cardId, cardsData)}
                          alt={`Card ${cardId} slot ${index + 1}`}
                          className="w-[92%] object-contain pointer-events-none"
                          style={{ aspectRatio: '515/719' }}
                          data-card-id={cardId}
                          ref={(img) => {
                            if (img && img.complete && img.naturalHeight !== 0 && !loadedImagesRef.current.has(cardId)) {
                              // Use setTimeout to defer state update and break render cycle
                              setTimeout(() => {
                                handleImageLoad(cardId);
                              }, 0);
                            }
                          }}
                          onLoad={() => handleImageLoad(cardId)}
                          onError={() => handleImageLoad(cardId)}
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
                  console.log('[Legend] onMouseDown:', {
                    button: e.button,
                    ctrlKey: e.ctrlKey,
                    metaKey: e.metaKey,
                    shiftKey: e.shiftKey,
                    altKey: e.altKey,
                    type: e.type,
                    hasLegend: !!legendCard
                  });
                  
                  // Check for middle-click or Ctrl/Command+click
                  const isMiddleClick = e.button === 1;
                  const isCtrlClick = (e.ctrlKey || e.metaKey) && e.button === 0;
                  
                  if ((isMiddleClick || isCtrlClick) && legendCard) {
                    handleMiddleClick(e, legendCard, 'legend');
                  } else if (legendCard) {
                    handleLegendMouseDown(e);
                  }
                }}
                onClick={(e) => {
                  // Triple-click for mobile (handled by handleTripleClick)
                  if (legendCard) {
                    handleTripleClick(legendCard, 'legend');
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
                      src={getCardImageUrl(legendCard, cardsData)}
                      alt={`Legend ${legendCard}`}
                      className="w-full h-full object-contain pointer-events-none"
                      data-card-id={legendCard}
                      ref={(img) => {
                        if (img && img.complete && img.naturalHeight !== 0 && !loadedImagesRef.current.has(legendCard)) {
                          // Use setTimeout to defer state update and break render cycle
                          setTimeout(() => {
                            handleImageLoad(legendCard);
                          }, 0);
                        }
                      }}
                      onLoad={() => handleImageLoad(legendCard)}
                      onError={() => handleImageLoad(legendCard)}
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
                            console.log(`[Battlefield ${index}] onMouseDown:`, {
                              button: e.button,
                              ctrlKey: e.ctrlKey,
                              metaKey: e.metaKey,
                              shiftKey: e.shiftKey,
                              altKey: e.altKey,
                              type: e.type,
                              hasCard: !!cardId
                            });
                            
                            // Check for middle-click or Ctrl/Command+click
                            const isMiddleClick = e.button === 1;
                            const isCtrlClick = (e.ctrlKey || e.metaKey) && e.button === 0;
                            
                            if ((isMiddleClick || isCtrlClick) && cardId) {
                              handleMiddleClick(e, cardId, 'battlefield', index);
                            } else if (cardId) {
                              handleBattlefieldMouseDown(e, index);
                            }
                          }}
                          onClick={(e) => {
                            // Triple-click for mobile (handled by handleTripleClick)
                            if (cardId) {
                              handleTripleClick(cardId, 'battlefield', index);
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
                                src={getCardImageUrl(cardId, cardsData)}
                                alt={`Battlefield ${cardId}`}
                                className="w-[92%] h-[92%] object-contain pointer-events-none"
                                data-card-id={cardId}
                                ref={(img) => {
                                  if (img && img.complete && img.naturalHeight !== 0 && !loadedImagesRef.current.has(cardId)) {
                                    // Use setTimeout to defer state update and break render cycle
                                    setTimeout(() => {
                                      handleImageLoad(cardId);
                                    }, 0);
                                  }
                                }}
                                onLoad={() => handleImageLoad(cardId)}
                                onError={() => handleImageLoad(cardId)}
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
                        onClick={(e) => {
                          if (isReadOnly) return; // Prevent modification in read-only mode
                          // Check for triple-click first (mobile) - this will only trigger modal after 3 clicks
                          const { runeABaseId } = getRuneCards;
                          if (runeABaseId) {
                            handleTripleClick(formatCardId(runeABaseId, runeAVariantIndex), 'runeA');
                          }
                          // Always handle normal rune click (triple-click detection doesn't prevent single clicks)
                          handleRuneClick('A');
                        }}
                        onMouseDown={(e) => {
                          if (isReadOnly) {
                            e.preventDefault();
                            return; // Prevent modification in read-only mode
                          }
                          console.log('[Rune A] onMouseDown:', {
                            button: e.button,
                            ctrlKey: e.ctrlKey,
                            metaKey: e.metaKey,
                            shiftKey: e.shiftKey,
                            altKey: e.altKey,
                            type: e.type
                          });
                          
                          // Check for middle-click or Ctrl/Command+click
                          const isMiddleClick = e.button === 1;
                          const isCtrlClick = (e.ctrlKey || e.metaKey) && e.button === 0;
                          
                          if (isMiddleClick || isCtrlClick) {
                            const { runeABaseId } = getRuneCards;
                            if (runeABaseId) {
                              handleMiddleClick(e, formatCardId(runeABaseId, runeAVariantIndex), 'runeA');
                            }
                          } else if (e.button !== 0) {
                            // Only prevent default for non-left clicks (to allow normal left click for rune movement)
                            e.preventDefault();
                          }
                        }}
                        onMouseEnter={() => {
                          const { runeA } = getRuneCards;
                          if (runeA) setSelectedCard(runeA);
                        }}
                      >
                        {(() => {
                          const { runeA } = getRuneCards;
                          return runeA ? (
                            <img
                              src={getCardImageUrl(runeA, cardsData)}
                              alt="Rune A"
                              className="w-[92%] object-contain pointer-events-none"
                              style={{ aspectRatio: '515/719', outline: '1px solid black', outlineOffset: '0px' }}
                              data-card-id={runeA}
                              ref={(img) => {
                                if (img && img.complete && img.naturalHeight !== 0 && !loadedImagesRef.current.has(runeA)) {
                                  // Use setTimeout to defer state update and break render cycle
                                  setTimeout(() => {
                                    handleImageLoad(runeA);
                                  }, 0);
                                }
                              }}
                              onLoad={() => handleImageLoad(runeA)}
                              onError={() => handleImageLoad(runeA)}
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
                        onClick={(e) => {
                          if (isReadOnly) return; // Prevent modification in read-only mode
                          // Check for triple-click first (mobile) - this will only trigger modal after 3 clicks
                          const { runeBBaseId } = getRuneCards;
                          if (runeBBaseId) {
                            handleTripleClick(formatCardId(runeBBaseId, runeBVariantIndex), 'runeB');
                          }
                          // Always handle normal rune click (triple-click detection doesn't prevent single clicks)
                          handleRuneClick('B');
                        }}
                        onMouseDown={(e) => {
                          console.log('[Rune B] onMouseDown:', {
                            button: e.button,
                            ctrlKey: e.ctrlKey,
                            metaKey: e.metaKey,
                            shiftKey: e.shiftKey,
                            altKey: e.altKey,
                            type: e.type
                          });
                          
                          // Check for middle-click or Ctrl/Command+click
                          const isMiddleClick = e.button === 1;
                          const isCtrlClick = (e.ctrlKey || e.metaKey) && e.button === 0;
                          
                          if (isMiddleClick || isCtrlClick) {
                            const { runeBBaseId } = getRuneCards;
                            if (runeBBaseId) {
                              handleMiddleClick(e, formatCardId(runeBBaseId, runeBVariantIndex), 'runeB');
                            }
                          } else if (e.button !== 0) {
                            // Only prevent default for non-left clicks (to allow normal left click for rune movement)
                            e.preventDefault();
                          }
                        }}
                        onMouseEnter={() => {
                          const { runeB } = getRuneCards;
                          if (runeB) setSelectedCard(runeB);
                        }}
                      >
                        {(() => {
                          const { runeB } = getRuneCards;
                          return runeB ? (
                            <img
                              src={getCardImageUrl(runeB, cardsData)}
                              alt="Rune B"
                              className="w-[92%] object-contain pointer-events-none"
                              style={{ aspectRatio: '515/719', outline: '1px solid black', outlineOffset: '0px' }}
                              data-card-id={runeB}
                              ref={(img) => {
                                if (img && img.complete && img.naturalHeight !== 0 && !loadedImagesRef.current.has(runeB)) {
                                  // Use setTimeout to defer state update and break render cycle
                                  setTimeout(() => {
                                    handleImageLoad(runeB);
                                  }, 0);
                                }
                              }}
                              onLoad={() => handleImageLoad(runeB)}
                              onError={() => handleImageLoad(runeB)}
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
                          console.log(`[SideDeck ${index}] onMouseDown:`, {
                            button: e.button,
                            ctrlKey: e.ctrlKey,
                            metaKey: e.metaKey,
                            shiftKey: e.shiftKey,
                            altKey: e.altKey,
                            type: e.type,
                            hasCard: !!cardId
                          });
                          
                          // Check for middle-click or Ctrl/Command+click
                          const isMiddleClick = e.button === 1;
                          const isCtrlClick = (e.ctrlKey || e.metaKey) && e.button === 0;
                          
                          if ((isMiddleClick || isCtrlClick) && cardId) {
                            handleMiddleClick(e, cardId, 'sideDeck', index);
                          } else if (cardId) {
                            handleSideDeckMouseDown(e, index);
                          }
                        }}
                        onClick={(e) => {
                          // Triple-click for mobile (handled by handleTripleClick)
                          if (cardId) {
                            handleTripleClick(cardId, 'sideDeck', index);
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
                              src={getCardImageUrl(cardId, cardsData)}
                              alt={`Side Deck Card ${cardId} slot ${index + 1}`}
                              className="w-[92%] object-contain pointer-events-none"
                              style={{ aspectRatio: '515/685' }}
                              data-card-id={cardId}
                              ref={(img) => {
                                if (img && img.complete && img.naturalHeight !== 0) {
                                  handleImageLoad(cardId);
                                }
                              }}
                              onLoad={() => handleImageLoad(cardId)}
                              onError={() => handleImageLoad(cardId)}
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
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSearch();
                      }
                    }}
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
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSearch();
                      }
                    }}
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
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSearch();
                      }
                    }}
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
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSearch();
                      }
                    }}
                    disabled={searchFilters.cardType === 'Legend' || searchFilters.cardType === 'Battlefield'}
                    className={`w-12 px-1 py-1 text-[10px] rounded border ${isDarkMode ? 'bg-gray-600 border-gray-500 text-gray-100' : 'bg-white border-gray-300 text-gray-800'} ${(searchFilters.cardType === 'Legend' || searchFilters.cardType === 'Battlefield') ? 'opacity-50 cursor-not-allowed' : ''}`}
                    placeholder="Max"
                  />
                </div>
              </div>
            </div>
            
            {/* Might range and Sort Order - Same line */}
            <div className="grid grid-cols-2 gap-2">
              <div className="flex flex-col">
                <label className={`text-[11px] font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Might</label>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    value={searchFilters.mightMin}
                    onChange={(e) => setSearchFilters({...searchFilters, mightMin: e.target.value})}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSearch();
                      }
                    }}
                    disabled={searchFilters.cardType === 'Gear' || searchFilters.cardType === 'Spell' || searchFilters.cardType === 'Legend' || searchFilters.cardType === 'Battlefield'}
                    className={`w-12 px-1 py-1 text-[10px] rounded border ${isDarkMode ? 'bg-gray-600 border-gray-500 text-gray-100' : 'bg-white border-gray-300 text-gray-800'} ${(searchFilters.cardType === 'Gear' || searchFilters.cardType === 'Spell' || searchFilters.cardType === 'Legend' || searchFilters.cardType === 'Battlefield') ? 'opacity-50 cursor-not-allowed' : ''}`}
                    placeholder="Min"
                  />
                  <span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>≤</span>
                  <span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>Might</span>
                  <span className={`text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>≤</span>
                  <input
                    type="number"
                    value={searchFilters.mightMax}
                    onChange={(e) => setSearchFilters({...searchFilters, mightMax: e.target.value})}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        handleSearch();
                      }
                    }}
                    disabled={searchFilters.cardType === 'Gear' || searchFilters.cardType === 'Spell' || searchFilters.cardType === 'Legend' || searchFilters.cardType === 'Battlefield'}
                    className={`w-12 px-1 py-1 text-[10px] rounded border ${isDarkMode ? 'bg-gray-600 border-gray-500 text-gray-100' : 'bg-white border-gray-300 text-gray-800'} ${(searchFilters.cardType === 'Gear' || searchFilters.cardType === 'Spell' || searchFilters.cardType === 'Legend' || searchFilters.cardType === 'Battlefield') ? 'opacity-50 cursor-not-allowed' : ''}`}
                    placeholder="Max"
                  />
                </div>
              </div>
              <div className="flex flex-col">
                <label className={`text-[11px] font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>Sort Order</label>
                <div className="flex items-center gap-2">
                  <select
                    value={sortOrder}
                    onChange={(e) => setSortOrder(e.target.value)}
                    disabled={isReadOnly}
                    className={`w-full px-2 py-1 text-[11px] rounded border ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''} ${isDarkMode ? 'bg-gray-600 border-gray-500 text-gray-100' : 'bg-white border-gray-300 text-gray-800'}`}
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
                      disabled={isReadOnly}
                      className={`w-4 h-4 ${isReadOnly ? 'opacity-50 cursor-not-allowed' : ''} ${isDarkMode ? 'accent-blue-500' : 'accent-blue-600'}`}
                    />
                  </div>
                </div>
              </div>
            </div>
            
            {/* Search button - Full width row */}
    <div className="w-full grid grid-cols-2 gap-2">
      <button
        onClick={handleSearch}
        className={`w-full px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-medium rounded shadow-md transition-colors ${isDarkMode ? 'bg-blue-600 hover:bg-blue-700' : ''}`}
      >
        Search
      </button>
      <button
        onClick={() => {
          const newFilters = { ...DEFAULT_SEARCH_FILTERS };
          setSearchFilters(newFilters);
          setSortOrder('A-Z');
          setSortDescending(false);
          handleSearch({
            filters: newFilters,
            sortOrder: 'A-Z',
            sortDescending: false
          });
        }}
        className={`w-full px-4 py-2 bg-red-600 text-white text-[11px] font-medium rounded shadow-md hover:bg-red-700 active:bg-red-800 transition-colors`}
      >
        Reset
      </button>
    </div>
          </div>
          
          {/* Results Box */}
          <div className={`flex-1 border-2 rounded px-5 py-3 flex flex-col min-h-0 ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-400'}`}>
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
                          src={getCardImageUrl(cardId, cardsData)}
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
        const rotation = 'rotate(0deg)';
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
              src={getCardImageUrl(draggedCard, cardsData)}
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
              setExportModal({ ...exportModal, isOpen: false });
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
            <div className={`px-6 py-4 space-y-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {/* Row 1: Sharing Status */}
              {exportModal.deckId && (
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {/* Color indicator */}
                    <div className={`w-4 h-4 rounded-full ${
                      exportModal.sharingStatus === 'private' ? 'bg-red-500' :
                      exportModal.sharingStatus === 'shared' ? 'bg-yellow-500' :
                      'bg-green-500'
                    }`} />
                    {/* Status text and description */}
                    <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                      {exportModal.sharingStatus === 'private' ? 'Private Deck' :
                       exportModal.sharingStatus === 'shared' ? 'Shared Deck' :
                       'Public Deck'}
                      <span className={`text-xs font-normal ml-1 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                        ({exportModal.sharingStatus === 'private' ? 'Only you can access' :
                         exportModal.sharingStatus === 'shared' ? 'Accessible via URL only' :
                         'Publicly visible via URL'})
                      </span>
                    </span>
                  </div>
                  
                  {/* Radio Buttons (only show if owner) */}
                  {exportModal.isOwner && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => handleSharingStatusChange('private')}
                        disabled={exportModal.sharingStatus === 'private'}
                        className={`px-4 py-2 rounded font-medium transition-colors ${
                          exportModal.sharingStatus === 'private'
                            ? 'bg-red-600 text-white cursor-not-allowed opacity-60'
                            : 'bg-red-600 text-white hover:bg-red-700'
                        }`}
                      >
                        Private
                      </button>
                      <button
                        onClick={() => handleSharingStatusChange('shared')}
                        disabled={exportModal.sharingStatus === 'shared'}
                        className={`px-4 py-2 rounded font-medium transition-colors ${
                          exportModal.sharingStatus === 'shared'
                            ? 'bg-yellow-600 text-white cursor-not-allowed opacity-60'
                            : 'bg-yellow-600 text-white hover:bg-yellow-700'
                        }`}
                      >
                        Shared
                      </button>
                      <button
                        onClick={() => handleSharingStatusChange('public')}
                        disabled={exportModal.sharingStatus === 'public'}
                        className={`px-4 py-2 rounded font-medium transition-colors ${
                          exportModal.sharingStatus === 'public'
                            ? 'bg-green-600 text-white cursor-not-allowed opacity-60'
                            : 'bg-green-600 text-white hover:bg-green-700'
                        }`}
                      >
                        Public
                      </button>
                    </div>
                  )}
                </div>
              )}
              
              {/* Row 2: Deck URL */}
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                  Deck URL
                </span>
                <button
                  onClick={handleCopyDeckUrl}
                  className="px-4 py-2 rounded font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  Copy URL
                </button>
              </div>
              
              {/* Row 3: TTS Code with Copy Button */}
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                  Tabletop Simulator Code
                </span>
                <button
                  onClick={handleCopyDeckCode}
                  className="px-4 py-2 rounded font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  Copy Code
                </button>
              </div>
              
              {/* Row 4: Printable Decklist Form */}
              <div className="flex items-center justify-between">
                <span className={`text-sm font-medium ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                  Printable Decklist Form
                </span>
                <button
                  onClick={handleOpenPdfExport}
                  className="px-4 py-2 rounded font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  Generate
                </button>
              </div>
            </div>
            
            {/* Footer */}
            <div className={`px-6 py-4 border-t ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
              <div className="flex gap-3 justify-center">
                <button
                  onClick={() => setExportModal({ ...exportModal, isOpen: false })}
                  className={`px-4 py-2 rounded font-medium transition-colors ${
                    isDarkMode 
                      ? 'bg-gray-600 text-gray-200 hover:bg-gray-500' 
                      : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                  }`}
                >
                  Close
                </button>
              </div>
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
                    const imageUrl = getCardImageUrl(variantCardId, cardsData);
                    
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
      
      {/* Notes Modal */}
      {notesModal.isOpen && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              closeNotesModal();
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
                {notesModal.isReadOnly ? 'Deck Notes (Read-Only)' : 'Deck Notes'}
              </h2>
            </div>
            
            {/* Body */}
            <div className={`px-6 py-4 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              <textarea
                value={notesModal.notes}
                onChange={(e) => handleNotesModalChange(e.target.value)}
                readOnly={notesModal.isReadOnly}
                placeholder={notesModal.isReadOnly ? 'No notes available' : 'Enter your deck notes here...'}
                className={`w-full h-64 px-3 py-2 rounded border resize-none ${
                  isDarkMode 
                    ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500' 
                    : 'bg-white border-gray-400 text-gray-900 placeholder-gray-400'
                } ${notesModal.isReadOnly ? 'cursor-not-allowed opacity-75' : ''}`}
                onKeyDown={(e) => {
                  if (e.key === 'Escape' && !notesModal.isReadOnly) {
                    closeNotesModal();
                  }
                }}
              />
            </div>
            
            {/* Footer */}
            <div className={`px-6 py-4 border-t flex gap-3 justify-center ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
              <button
                onClick={closeNotesModal}
                className={`px-4 py-2 rounded font-medium transition-colors ${
                  isDarkMode 
                    ? 'bg-gray-600 text-gray-200 hover:bg-gray-500' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                {notesModal.isReadOnly ? 'Close' : 'Cancel'}
              </button>
              {!notesModal.isReadOnly && (
                <button
                  onClick={handleNotesModalSave}
                  className="px-4 py-2 rounded font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                >
                  Save
                </button>
              )}
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
      
      {/* PDF Export Modal */}
      {pdfExportModal.isOpen && (
        <div 
          className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleClosePdfExport();
            }
          }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black bg-opacity-50" />
          
          {/* Modal Content - Large modal */}
          <div 
            className={`relative z-10 w-[90vw] max-w-[1400px] h-[90vh] max-h-[900px] rounded-lg shadow-2xl border-2 flex flex-col ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-400'}`}
            style={{ transform: `scale(${containerScale})`, transformOrigin: 'center center' }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`px-6 py-4 border-b flex items-center justify-between flex-shrink-0 ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
              <h2 className={`text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                PDF Export - Tournament Decklist Form
              </h2>
              <button
                onClick={handleClosePdfExport}
                className={`px-3 py-1 rounded transition-colors ${
                  isDarkMode
                    ? 'bg-gray-700 hover:bg-gray-600 text-gray-100'
                    : 'bg-gray-200 hover:bg-gray-300 text-gray-900'
                }`}
              >
                ✕
              </button>
            </div>
            
            {/* Body - Two column layout */}
            <div className="flex-1 flex overflow-hidden">
              {/* Left Section - Form */}
              <div className={`w-1/2 border-r p-6 overflow-y-auto ${isDarkMode ? 'border-gray-600 bg-gray-850' : 'border-gray-300 bg-gray-50'}`}>
                <div className="space-y-4">
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                      First Name
                    </label>
                    <input
                      type="text"
                      value={pdfExportModal.firstName}
                      onChange={(e) => handlePdfExportFieldChange('firstName', e.target.value)}
                      className={`w-full px-3 py-2 rounded border ${
                        isDarkMode 
                          ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500' 
                          : 'bg-white border-gray-400 text-gray-900 placeholder-gray-400'
                      } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      placeholder="Enter first name"
                    />
                  </div>
                  
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                      Last Name
                    </label>
                    <input
                      type="text"
                      value={pdfExportModal.lastName}
                      onChange={(e) => handlePdfExportFieldChange('lastName', e.target.value)}
                      className={`w-full px-3 py-2 rounded border ${
                        isDarkMode 
                          ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500' 
                          : 'bg-white border-gray-400 text-gray-900 placeholder-gray-400'
                      } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      placeholder="Enter last name"
                    />
                  </div>
                  
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                      Riot ID
                    </label>
                    <input
                      type="text"
                      value={pdfExportModal.riotId}
                      onChange={(e) => handlePdfExportFieldChange('riotId', e.target.value)}
                      className={`w-full px-3 py-2 rounded border ${
                        isDarkMode 
                          ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500' 
                          : 'bg-white border-gray-400 text-gray-900 placeholder-gray-400'
                      } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      placeholder="Enter Riot ID (e.g., PlayerName#1234)"
                    />
                  </div>
                  
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                      Event Date
                    </label>
                    <input
                      type="date"
                      value={pdfExportModal.eventDate}
                      onChange={(e) => handlePdfExportFieldChange('eventDate', e.target.value)}
                      className={`w-full px-3 py-2 rounded border ${
                        isDarkMode 
                          ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500' 
                          : 'bg-white border-gray-400 text-gray-900 placeholder-gray-400'
                      } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                    />
                  </div>
                  
                  <div>
                    <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-200' : 'text-gray-700'}`}>
                      Event Name
                    </label>
                    <input
                      type="text"
                      value={pdfExportModal.eventName}
                      onChange={(e) => handlePdfExportFieldChange('eventName', e.target.value)}
                      className={`w-full px-3 py-2 rounded border ${
                        isDarkMode 
                          ? 'bg-gray-700 border-gray-600 text-gray-200 placeholder-gray-500' 
                          : 'bg-white border-gray-400 text-gray-900 placeholder-gray-400'
                      } focus:outline-none focus:ring-2 focus:ring-blue-500`}
                      placeholder="Enter event name"
                    />
                    {hasFutureCards() && (
                      <div className={`mt-2 px-3 py-2 rounded border ${isDarkMode ? 'bg-yellow-900/30 border-yellow-600 text-yellow-200' : 'bg-yellow-50 border-yellow-400 text-yellow-800'} text-sm`}>
                        ⚠️ Your deck contains future cards and may be invalid for in-person tournaments.
                      </div>
                    )}
                    {!deckValidation.isValid && (
                      <div className={`mt-2 px-3 py-2 rounded border ${isDarkMode ? 'bg-red-900/30 border-red-600 text-red-200' : 'bg-red-50 border-red-400 text-red-800'} text-sm`}>
                        ❌ Your deck does not meet the official decklist requirements and may be invalid for in-person tournaments.
                      </div>
                    )}
                  </div>
                </div>
              </div>
              
              {/* Right Section - PDF Preview */}
              <div 
                ref={pdfPreviewContainerRef}
                className={`w-1/2 p-6 overflow-hidden flex items-center justify-center ${isDarkMode ? 'bg-gray-900' : 'bg-gray-100'}`}
              >
                <div 
                  className="flex items-center justify-center w-full h-full"
                  style={{
                    maxWidth: '100%',
                    maxHeight: '100%'
                  }}
                >
                  <div 
                    ref={pdfPreviewContentRef}
                    className={`shadow-lg ${isDarkMode ? 'bg-white' : 'bg-white'}`}
                    style={{ 
                      width: '210mm',
                      height: '297mm',
                      padding: '6.35mm',
                      aspectRatio: '210/297',
                      boxSizing: 'border-box',
                      transform: `scale(${pdfPreviewScale})`,
                      transformOrigin: 'center center'
                    }}
                  >
                    {/* PDF Preview Content */}
                    <div className="h-full flex flex-col" style={{ width: '100%', height: '100%', boxSizing: 'border-box' }}>
                      {/* Title Section with Logo */}
                      <div className="flex items-center relative" style={{ marginTop: 0, marginBottom: '6.35mm' }}>
                        {/* Logo - Left aligned, bigger than title */}
                        <img 
                          src="/vite.svg" 
                          alt="Logo" 
                          className="absolute left-0"
                          style={{ height: '3.6rem', width: 'auto' }}
                        />
                        {/* Title - Centered with heading box */}
                        <div className="flex-1 flex items-center justify-center" style={{ position: 'relative' }}>
                          <div style={{ height: '28px', backgroundColor: 'rgb(156, 156, 156)', border: '1px solid rgb(0, 0, 0)', boxSizing: 'border-box', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', paddingLeft: '12px', paddingRight: '12px' }}>
                            <h1 className="text-lg font-bold text-center text-gray-900" style={{ margin: 0, color: 'rgb(17, 17, 17)', whiteSpace: 'nowrap' }}>
                              Riftbound Tournament Decklist
                            </h1>
                          </div>
                        </div>
                      </div>
                      
                      {/* Form Fields - Three Column Layout with 2-cell rows */}
                      <div className="flex-1" style={{ marginTop: 0 }}>
                        {/* First Row */}
                        <div className="flex gap-1.5 mb-1.5" style={{ minWidth: 0 }}>
                          {/* First Name - 2 cells */}
                          <div className="flex flex-shrink-0" style={{ height: '38px', flex: '1 1 0', minWidth: 0, border: '1px solid rgb(0, 0, 0)', boxSizing: 'border-box' }}>
                            <div className="px-1 flex items-center text-xs flex-shrink-0" style={{ width: '30%', minWidth: 0, backgroundColor: 'rgb(229, 229, 229)', borderRight: '1px solid rgb(0, 0, 0)', color: 'rgb(107, 107, 107)', boxSizing: 'border-box' }}>
                              First Name:
                            </div>
                            <div className="px-1 flex items-center text-xs overflow-hidden flex-shrink min-w-0" style={{ width: '70%', minWidth: 0, color: 'rgb(17, 17, 17)' }}>
                              <span className="truncate block w-full">{pdfExportModal.firstName || ''}</span>
                            </div>
                          </div>
                          
                          {/* Last Name - 2 cells */}
                          <div className="flex flex-shrink-0" style={{ height: '38px', flex: '1 1 0', minWidth: 0, border: '1px solid rgb(0, 0, 0)', boxSizing: 'border-box' }}>
                            <div className="px-1 flex items-center text-xs flex-shrink-0" style={{ width: '30%', minWidth: 0, backgroundColor: 'rgb(229, 229, 229)', borderRight: '1px solid rgb(0, 0, 0)', color: 'rgb(107, 107, 107)', boxSizing: 'border-box' }}>
                              Last Name:
                            </div>
                            <div className="px-1 flex items-center text-xs overflow-hidden flex-shrink min-w-0" style={{ width: '70%', minWidth: 0, color: 'rgb(17, 17, 17)' }}>
                              <span className="truncate block w-full">{pdfExportModal.lastName || ''}</span>
                            </div>
                          </div>
                          
                          {/* Last Initial - skinnier, 2 cells - width calculated to fit "00/00/0000" in value box (60% of total) */}
                          <div className="flex flex-shrink-0" style={{ height: '38px', width: 'calc(10ch / 0.6 + 2px)', minWidth: 0, border: '1px solid rgb(0, 0, 0)', boxSizing: 'border-box' }}>
                            <div className="px-1 flex items-center text-xs flex-shrink-0" style={{ width: '40%', minWidth: 0, backgroundColor: 'rgb(229, 229, 229)', borderRight: '1px solid rgb(0, 0, 0)', color: 'rgb(107, 107, 107)', boxSizing: 'border-box' }}>
                              Last Initial:
                            </div>
                            <div className="px-1 flex items-center justify-center text-lg font-bold overflow-hidden flex-shrink min-w-0" style={{ width: '60%', minWidth: 0, color: 'rgb(17, 17, 17)' }}>
                              {getLastInitial(pdfExportModal.lastName) || ''}
                            </div>
                          </div>
                        </div>
                        
                        {/* Second Row */}
                        <div className="flex gap-1.5 mb-4" style={{ minWidth: 0 }}>
                          {/* Riot ID - 2 cells */}
                          <div className="flex flex-shrink-0" style={{ height: '38px', flex: '1 1 0', minWidth: 0, border: '1px solid rgb(0, 0, 0)', boxSizing: 'border-box' }}>
                            <div className="px-1 flex items-center text-xs flex-shrink-0" style={{ width: '30%', minWidth: 0, backgroundColor: 'rgb(229, 229, 229)', borderRight: '1px solid rgb(0, 0, 0)', color: 'rgb(107, 107, 107)', boxSizing: 'border-box' }}>
                              Riot ID:
                            </div>
                            <div className="px-1 flex items-center text-xs overflow-hidden flex-shrink min-w-0" style={{ width: '70%', minWidth: 0, color: 'rgb(17, 17, 17)' }}>
                              <span className="truncate block w-full">{pdfExportModal.riotId || ''}</span>
                            </div>
                          </div>
                          
                          {/* Event Name - 2 cells */}
                          <div className="flex flex-shrink-0" style={{ height: '38px', flex: '1 1 0', minWidth: 0, border: '1px solid rgb(0, 0, 0)', boxSizing: 'border-box' }}>
                            <div className="px-1 flex items-center text-xs flex-shrink-0" style={{ width: '30%', minWidth: 0, backgroundColor: 'rgb(229, 229, 229)', borderRight: '1px solid rgb(0, 0, 0)', color: 'rgb(107, 107, 107)', boxSizing: 'border-box' }}>
                              Event Name:
                            </div>
                            <div className="px-1 flex items-center text-xs overflow-hidden flex-shrink min-w-0" style={{ width: '70%', minWidth: 0, color: 'rgb(17, 17, 17)' }}>
                              <span className="truncate block w-full">{pdfExportModal.eventName || ''}</span>
                            </div>
                          </div>
                          
                          {/* Event Date - skinnier, 2 cells - width calculated to fit "00/00/0000" in value box (60% of total) */}
                          <div className="flex flex-shrink-0" style={{ height: '38px', width: 'calc(10ch / 0.6 + 2px)', minWidth: 0, border: '1px solid rgb(0, 0, 0)', boxSizing: 'border-box' }}>
                            <div className="px-1 flex items-center text-xs flex-shrink-0" style={{ width: '40%', minWidth: 0, backgroundColor: 'rgb(229, 229, 229)', borderRight: '1px solid rgb(0, 0, 0)', color: 'rgb(107, 107, 107)', boxSizing: 'border-box' }}>
                              Event Date:
                            </div>
                            <div className="px-1 flex items-center justify-center text-xs overflow-hidden flex-shrink min-w-0" style={{ width: '60%', minWidth: 0, color: 'rgb(17, 17, 17)' }}>
                              <span className="truncate block w-full text-center">{getFormattedDate(pdfExportModal.eventDate) || ''}</span>
                            </div>
                          </div>
                        </div>
                        
                        {/* Deck List - Two Column Layout */}
                        <div className="flex gap-1.5" style={{ flex: '1 1 0', minHeight: 0 }}>
                          {/* Left Column - Main Deck */}
                          <div className="flex flex-col" style={{ flex: '1 1 0', minWidth: 0 }}>
                            {/* Main Deck Heading */}
                            <div style={{ height: '22px', backgroundColor: 'rgb(156, 156, 156)', border: '1px solid rgb(0, 0, 0)', boxSizing: 'border-box' }}>
                              <div className="font-bold text-base px-2 flex items-center justify-center h-full" style={{ color: 'rgb(17, 17, 17)' }}>
                                Main Deck
                              </div>
                            </div>
                            
                            {/* Main Deck Lines - 40 lines with borders between each row */}
                            <div className="flex flex-col" style={{ flex: '1 1 0', minHeight: 0 }}>
                              {getMainDeckLines().map((card, index) => (
                                <div key={index} className="flex flex-shrink-0" style={{ height: '22px', border: '1px solid rgb(0, 0, 0)', borderTop: 'none', boxSizing: 'border-box' }}>
                                  {/* Quantity box - fixed width for 2 digits */}
                                  <div className="px-1 flex items-center justify-center flex-shrink-0" style={{ width: '28px', minWidth: '28px', maxWidth: '28px', borderRight: '1px solid rgb(0, 0, 0)', color: 'rgb(17, 17, 17)', boxSizing: 'border-box', fontSize: '0.984375rem', backgroundColor: 'rgb(229, 229, 229)' }}>
                                    {card.quantity || ''}
                                  </div>
                                  {/* Card name - rest of line */}
                                  <div className="px-1 flex items-center overflow-hidden flex-shrink min-w-0" style={{ flex: '1 1 0', minWidth: 0, color: 'rgb(17, 17, 17)', fontSize: '0.984375rem' }}>
                                    <span className="truncate block w-full">{card.name || ''}</span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>
                          
                          {/* Right Column - Legend, Chosen Champion, Battlefields, Runes, Side Deck */}
                          <div className="flex flex-col" style={{ flex: '1 1 0', minWidth: 0 }}>
                            {/* Legend Section - 1x1 table */}
                            <div style={{ height: '22px', backgroundColor: 'rgb(156, 156, 156)', border: '1px solid rgb(0, 0, 0)', boxSizing: 'border-box' }}>
                              <div className="font-bold text-base px-2 flex items-center justify-center h-full" style={{ color: 'rgb(17, 17, 17)' }}>
                                Legend
                              </div>
                            </div>
                            {(() => {
                              const legend = getLegendLine();
                              return (
                                <div className="flex flex-shrink-0" style={{ height: '22px', border: '1px solid rgb(0, 0, 0)', borderTop: 'none', boxSizing: 'border-box' }}>
                                  <div className="px-1 flex items-center overflow-hidden flex-shrink min-w-0" style={{ width: '100%', color: 'rgb(17, 17, 17)', fontSize: '0.984375rem' }}>
                                    <span className="truncate block w-full">{legend.name || ''}</span>
                                  </div>
                                </div>
                              );
                            })()}
                            
                            {/* Chosen Champion Section - 1x1 table */}
                            <div style={{ height: '22px', backgroundColor: 'rgb(156, 156, 156)', border: '1px solid rgb(0, 0, 0)', marginTop: '4px', boxSizing: 'border-box' }}>
                              <div className="font-bold text-base px-2 flex items-center justify-center h-full" style={{ color: 'rgb(17, 17, 17)' }}>
                                Chosen Champion
                              </div>
                            </div>
                            {(() => {
                              const champion = getChosenChampionLine();
                              return (
                                <div className="flex flex-shrink-0" style={{ height: '22px', border: '1px solid rgb(0, 0, 0)', borderTop: 'none', boxSizing: 'border-box' }}>
                                  <div className="px-1 flex items-center overflow-hidden flex-shrink min-w-0" style={{ width: '100%', color: 'rgb(17, 17, 17)', fontSize: '0.984375rem' }}>
                                    <span className="truncate block w-full">{champion.name || ''}</span>
                                  </div>
                                </div>
                              );
                            })()}
                            
                            {/* Battlefields Section - 1x3 table */}
                            <div style={{ height: '22px', backgroundColor: 'rgb(156, 156, 156)', border: '1px solid rgb(0, 0, 0)', marginTop: '4px', boxSizing: 'border-box' }}>
                              <div className="font-bold text-base px-2 flex items-center justify-center h-full" style={{ color: 'rgb(17, 17, 17)' }}>
                                Battlefields
                              </div>
                            </div>
                            {getBattlefieldLines().map((card, index) => (
                              <div key={index} className="flex flex-shrink-0" style={{ height: '22px', border: '1px solid rgb(0, 0, 0)', borderTop: 'none', boxSizing: 'border-box' }}>
                                <div className="px-1 flex items-center overflow-hidden flex-shrink min-w-0" style={{ width: '100%', color: 'rgb(17, 17, 17)', fontSize: '0.984375rem' }}>
                                  <span className="truncate block w-full">{card.name || ''}</span>
                                </div>
                              </div>
                            ))}
                            
                            {/* Runes Section - 2x2 table */}
                            <div style={{ height: '22px', backgroundColor: 'rgb(156, 156, 156)', border: '1px solid rgb(0, 0, 0)', marginTop: '4px', boxSizing: 'border-box' }}>
                              <div className="font-bold text-base px-2 flex items-center justify-center h-full" style={{ color: 'rgb(17, 17, 17)' }}>
                                Runes
                              </div>
                            </div>
                            {getRuneLines().map((card, index) => (
                              <div key={index} className="flex flex-shrink-0" style={{ height: '22px', border: '1px solid rgb(0, 0, 0)', borderTop: 'none', boxSizing: 'border-box' }}>
                                <div className="px-1 flex items-center justify-center flex-shrink-0" style={{ width: '28px', minWidth: '28px', maxWidth: '28px', borderRight: '1px solid rgb(0, 0, 0)', color: 'rgb(17, 17, 17)', boxSizing: 'border-box', fontSize: '0.984375rem', backgroundColor: 'rgb(229, 229, 229)' }}>
                                  {card.quantity || ''}
                                </div>
                                <div className="px-1 flex items-center overflow-hidden flex-shrink min-w-0" style={{ flex: '1 1 0', minWidth: 0, color: 'rgb(17, 17, 17)', fontSize: '0.984375rem' }}>
                                  <span className="truncate block w-full">{card.name || ''}</span>
                                </div>
                              </div>
                            ))}
                            
                            {/* Side Deck Section - 2x8 table */}
                            <div style={{ height: '22px', backgroundColor: 'rgb(156, 156, 156)', border: '1px solid rgb(0, 0, 0)', marginTop: '4px', boxSizing: 'border-box' }}>
                              <div className="font-bold text-base px-2 flex items-center justify-center h-full" style={{ color: 'rgb(17, 17, 17)' }}>
                                Side Deck
                              </div>
                            </div>
                            {getSideDeckLines().map((card, index) => (
                              <div key={index} className="flex flex-shrink-0" style={{ height: '22px', border: '1px solid rgb(0, 0, 0)', borderTop: 'none', boxSizing: 'border-box' }}>
                                <div className="px-1 flex items-center justify-center flex-shrink-0" style={{ width: '28px', minWidth: '28px', maxWidth: '28px', borderRight: '1px solid rgb(0, 0, 0)', color: 'rgb(17, 17, 17)', boxSizing: 'border-box', fontSize: '0.984375rem', backgroundColor: 'rgb(229, 229, 229)' }}>
                                  {card.quantity || ''}
                                </div>
                                <div className="px-1 flex items-center overflow-hidden flex-shrink min-w-0" style={{ flex: '1 1 0', minWidth: 0, color: 'rgb(17, 17, 17)', fontSize: '0.984375rem' }}>
                                  <span className="truncate block w-full">{card.name || ''}</span>
                                </div>
                              </div>
                            ))}
                            
                            {/* For Judge Use Only Section */}
                            <div style={{ height: '22px', backgroundColor: 'rgb(156, 156, 156)', border: '1px solid rgb(0, 0, 0)', marginTop: '4px', boxSizing: 'border-box' }}>
                              <div className="font-bold text-base px-2 flex items-center justify-center h-full" style={{ color: 'rgb(17, 17, 17)' }}>
                                For Judge Use Only
                              </div>
                            </div>
                            
                            {/* Main / Side */}
                            <div className="flex flex-shrink-0" style={{ height: '22px', border: '1px solid rgb(0, 0, 0)', borderTop: 'none', boxSizing: 'border-box' }}>
                              <div className="px-1 flex items-center text-xs flex-shrink-0" style={{ width: '30%', minWidth: 0, backgroundColor: 'rgb(229, 229, 229)', borderRight: '1px solid rgb(0, 0, 0)', color: 'rgb(107, 107, 107)', boxSizing: 'border-box' }}>
                                Main / Side:
                              </div>
                              <div className="px-1 flex items-center text-xs overflow-hidden flex-shrink min-w-0" style={{ width: '70%', minWidth: 0, color: 'rgb(17, 17, 17)', backgroundColor: 'rgb(229, 229, 229)' }}>
                                <span className="truncate block w-full"></span>
                              </div>
                            </div>
                            
                            {/* Deck Check Rd - First */}
                            <div className="flex flex-shrink-0" style={{ height: '22px', border: '1px solid rgb(0, 0, 0)', borderTop: '2px solid rgb(0, 0, 0)', boxSizing: 'border-box' }}>
                              <div className="px-1 flex items-center text-xs flex-shrink-0" style={{ width: '30%', minWidth: 0, backgroundColor: 'rgb(229, 229, 229)', borderRight: '1px solid rgb(0, 0, 0)', color: 'rgb(107, 107, 107)', boxSizing: 'border-box' }}>
                                Deck Check Rd:
                              </div>
                              <div className="px-1 flex items-center text-xs overflow-hidden flex-shrink min-w-0" style={{ width: '70%', minWidth: 0, color: 'rgb(17, 17, 17)', backgroundColor: 'rgb(229, 229, 229)' }}>
                                <span className="truncate block w-full"></span>
                              </div>
                            </div>
                            
                            {/* Judge - First */}
                            <div className="flex flex-shrink-0" style={{ height: '22px', border: '1px solid rgb(0, 0, 0)', borderTop: 'none', boxSizing: 'border-box' }}>
                              <div className="px-1 flex items-center text-xs flex-shrink-0" style={{ width: '30%', minWidth: 0, backgroundColor: 'rgb(229, 229, 229)', borderRight: '1px solid rgb(0, 0, 0)', color: 'rgb(107, 107, 107)', boxSizing: 'border-box' }}>
                                Judge:
                              </div>
                              <div className="px-1 flex items-center text-xs overflow-hidden flex-shrink min-w-0" style={{ width: '70%', minWidth: 0, color: 'rgb(17, 17, 17)', backgroundColor: 'rgb(229, 229, 229)' }}>
                                <span className="truncate block w-full"></span>
                              </div>
                            </div>
                            
                            {/* Status - First - 2 lines height */}
                            <div className="flex flex-shrink-0" style={{ height: '44px', border: '1px solid rgb(0, 0, 0)', borderTop: 'none', boxSizing: 'border-box' }}>
                              <div className="px-1 flex items-center text-xs flex-shrink-0" style={{ width: '30%', minWidth: 0, backgroundColor: 'rgb(229, 229, 229)', borderRight: '1px solid rgb(0, 0, 0)', color: 'rgb(107, 107, 107)', boxSizing: 'border-box' }}>
                                Status:
                              </div>
                              <div className="px-1 flex items-center text-xs overflow-hidden flex-shrink min-w-0" style={{ width: '70%', minWidth: 0, color: 'rgb(17, 17, 17)', backgroundColor: 'rgb(229, 229, 229)' }}>
                                <span className="truncate block w-full"></span>
                              </div>
                            </div>
                            
                            {/* Deck Check Rd - Second */}
                            <div className="flex flex-shrink-0" style={{ height: '22px', border: '1px solid rgb(0, 0, 0)', borderTop: '2px solid rgb(0, 0, 0)', boxSizing: 'border-box' }}>
                              <div className="px-1 flex items-center text-xs flex-shrink-0" style={{ width: '30%', minWidth: 0, backgroundColor: 'rgb(229, 229, 229)', borderRight: '1px solid rgb(0, 0, 0)', color: 'rgb(107, 107, 107)', boxSizing: 'border-box' }}>
                                Deck Check Rd:
                              </div>
                              <div className="px-1 flex items-center text-xs overflow-hidden flex-shrink min-w-0" style={{ width: '70%', minWidth: 0, color: 'rgb(17, 17, 17)', backgroundColor: 'rgb(229, 229, 229)' }}>
                                <span className="truncate block w-full"></span>
                              </div>
                            </div>
                            
                            {/* Judge - Second */}
                            <div className="flex flex-shrink-0" style={{ height: '22px', border: '1px solid rgb(0, 0, 0)', borderTop: 'none', boxSizing: 'border-box' }}>
                              <div className="px-1 flex items-center text-xs flex-shrink-0" style={{ width: '30%', minWidth: 0, backgroundColor: 'rgb(229, 229, 229)', borderRight: '1px solid rgb(0, 0, 0)', color: 'rgb(107, 107, 107)', boxSizing: 'border-box' }}>
                                Judge:
                              </div>
                              <div className="px-1 flex items-center text-xs overflow-hidden flex-shrink min-w-0" style={{ width: '70%', minWidth: 0, color: 'rgb(17, 17, 17)', backgroundColor: 'rgb(229, 229, 229)' }}>
                                <span className="truncate block w-full"></span>
                              </div>
                            </div>
                            
                            {/* Status - Second - 2 lines height */}
                            <div className="flex flex-shrink-0" style={{ height: '44px', border: '1px solid rgb(0, 0, 0)', borderTop: 'none', boxSizing: 'border-box' }}>
                              <div className="px-1 flex items-center text-xs flex-shrink-0" style={{ width: '30%', minWidth: 0, backgroundColor: 'rgb(229, 229, 229)', borderRight: '1px solid rgb(0, 0, 0)', color: 'rgb(107, 107, 107)', boxSizing: 'border-box' }}>
                                Status:
                              </div>
                              <div className="px-1 flex items-center text-xs overflow-hidden flex-shrink min-w-0" style={{ width: '70%', minWidth: 0, color: 'rgb(17, 17, 17)', backgroundColor: 'rgb(229, 229, 229)' }}>
                                <span className="truncate block w-full"></span>
                              </div>
                            </div>
                            
                            {/* Deck Check Rd - Third */}
                            <div className="flex flex-shrink-0" style={{ height: '22px', border: '1px solid rgb(0, 0, 0)', borderTop: '2px solid rgb(0, 0, 0)', boxSizing: 'border-box' }}>
                              <div className="px-1 flex items-center text-xs flex-shrink-0" style={{ width: '30%', minWidth: 0, backgroundColor: 'rgb(229, 229, 229)', borderRight: '1px solid rgb(0, 0, 0)', color: 'rgb(107, 107, 107)', boxSizing: 'border-box' }}>
                                Deck Check Rd:
                              </div>
                              <div className="px-1 flex items-center text-xs overflow-hidden flex-shrink min-w-0" style={{ width: '70%', minWidth: 0, color: 'rgb(17, 17, 17)', backgroundColor: 'rgb(229, 229, 229)' }}>
                                <span className="truncate block w-full"></span>
                              </div>
                            </div>
                            
                            {/* Judge - Third */}
                            <div className="flex flex-shrink-0" style={{ height: '22px', border: '1px solid rgb(0, 0, 0)', borderTop: 'none', boxSizing: 'border-box' }}>
                              <div className="px-1 flex items-center text-xs flex-shrink-0" style={{ width: '30%', minWidth: 0, backgroundColor: 'rgb(229, 229, 229)', borderRight: '1px solid rgb(0, 0, 0)', color: 'rgb(107, 107, 107)', boxSizing: 'border-box' }}>
                                Judge:
                              </div>
                              <div className="px-1 flex items-center text-xs overflow-hidden flex-shrink min-w-0" style={{ width: '70%', minWidth: 0, color: 'rgb(17, 17, 17)', backgroundColor: 'rgb(229, 229, 229)' }}>
                                <span className="truncate block w-full"></span>
                              </div>
                            </div>
                            
                            {/* Status - Third - 2 lines height */}
                            <div className="flex flex-shrink-0" style={{ height: '44px', border: '1px solid rgb(0, 0, 0)', borderTop: 'none', boxSizing: 'border-box' }}>
                              <div className="px-1 flex items-center text-xs flex-shrink-0" style={{ width: '30%', minWidth: 0, backgroundColor: 'rgb(229, 229, 229)', borderRight: '1px solid rgb(0, 0, 0)', color: 'rgb(107, 107, 107)', boxSizing: 'border-box' }}>
                                Status:
                              </div>
                              <div className="px-1 flex items-center text-xs overflow-hidden flex-shrink min-w-0" style={{ width: '70%', minWidth: 0, color: 'rgb(17, 17, 17)', backgroundColor: 'rgb(229, 229, 229)' }}>
                                <span className="truncate block w-full"></span>
                              </div>
                            </div>
                            
                            {/* View Decklist On SummonersBase.com and QR Code - Two columns */}
                            <div className="flex items-center justify-center" style={{ marginTop: '32px', gap: '24px' }}>
                              {/* Left column - Text */}
                              <div className="flex flex-col items-center justify-center" style={{ minWidth: 0 }}>
                                <span className="text-base" style={{ color: 'rgb(17, 17, 17)' }}>
                                  View Decklist On
                                </span>
                                <span className="text-base font-bold" style={{ color: 'rgb(17, 17, 17)' }}>
                                  SummonersBase.com
                                </span>
                              </div>
                              {/* Right column - QR Code */}
                              {currentDeckId && (
                                <div style={{ flexShrink: 0 }}>
                                  <QRCodeSVG
                                    value={`${window.location.origin}/deck/${currentDeckId}`}
                                    size={70}
                                    level="M"
                                    includeMargin={false}
                                    fgColor="#606060"
                                  />
                                </div>
                              )}
                            </div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
            
            {/* Footer */}
            <div className={`px-6 py-4 border-t flex gap-3 justify-center flex-shrink-0 ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
              <button
                onClick={handleClosePdfExport}
                className={`px-6 py-2 rounded font-medium transition-colors ${
                  isDarkMode 
                    ? 'bg-gray-600 text-gray-200 hover:bg-gray-500' 
                    : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                }`}
              >
                Close
              </button>
              <button
                onClick={handleDownloadPdf}
                className="px-6 py-2 rounded font-medium bg-green-600 text-white hover:bg-green-700 transition-colors"
              >
                Download
              </button>
              <button
                onClick={handlePrintPdf}
                className="px-6 py-2 rounded font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
              >
                Print
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
