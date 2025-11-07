import { useState, useEffect } from 'react';
import LayoutContainer from './components/LayoutContainer';
import cardsData from './data/cards.json';
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
  validateDeckName
} from './utils/deckStorage';

function App() {
  // Function to get card details by variant number
  const getCardDetails = (variantNumber) => {
    return cardsData.find(card => card.variantNumber === variantNumber);
  };
  
  // Function to get card image URL - easily changeable for different image sources
  const getCardImageUrl = (cardId) => {
    if (!cardId) return 'https://cdn.piltoverarchive.com/Cardback.webp';
    // Current source: Riftmana
    // Change this function to use different image sources as needed
    return `https://cdn.piltoverarchive.com/cards/${cardId}.webp`
    return `https://riftmana.com/wp-content/uploads/Cards/${cardId}.webp`;
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
  
  // State for Legend card (separate from champion)
  const [legendCard, setLegendCard] = useState(null);
  
  // State for the currently hovered/selected card
  const [selectedCard, setSelectedCard] = useState(null);
  
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
    
    setDeckValidation({ isValid, messages });
  };
  
  // Update validation whenever deck changes
  useEffect(() => {
    validateDeck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [legendCard, battlefields, mainDeck, sideDeck, chosenChampion]);
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
      legendCard: legendCard
    };
  };
  
  // Load deck cards into editor state
  const loadDeckCards = (cards) => {
    setMainDeck(cards.mainDeck || []);
    setChosenChampion(cards.chosenChampion || null);
    setSideDeck(compactSideDeck(cards.sideDeck || []));
    setBattlefields(cards.battlefields || []);
    
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
    
    setLegendCard(cards.legendCard || null);
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
        // Ensure array is exactly 8 elements
        while (newSideDeck.length > 8) {
          newSideDeck.pop();
        }
        while (newSideDeck.length < 8) {
          newSideDeck.push(null);
        }
        setSideDeck(newSideDeck);
      }
    } else {
      // Right-click handling
      if (cardType === 'Legend') {
        // Right-click on Legend: Add to legend slot if empty
        if (!legendCard) {
          setLegendCard(cardId);
        }
      } else if (cardType === 'Battlefield') {
        // Right-click on Battlefield: Add to battlefield slot if there's room (max 3) and not already present
        if (battlefields.length < 3 && !battlefields.includes(cardId)) {
          setBattlefields([...battlefields, cardId]);
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
      
      // Might range filter (skip if Gear, Spell, Legend, or Battlefield)
      if (searchFilters.cardType !== 'Gear' && searchFilters.cardType !== 'Spell' && searchFilters.cardType !== 'Legend' && searchFilters.cardType !== 'Battlefield') {
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
    
    // Store filtered cards (not just variantNumbers) for pagination
    setSearchResults(sorted);
    setCurrentPage(1);
    setTotalPages(Math.ceil(sorted.length / 24)); // 15 cards per page (3x5)
  };
  
  // Handle pagination
  const handlePageChange = (newPage) => {
    if (newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
    }
  };
  
  // Get current page results
  const getCurrentPageResults = () => {
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
  
  // Count how many copies of a card are in the main deck
  const countCardCopies = (cardId) => {
    return mainDeck.filter(id => id === cardId).length;
  };
  
  // Helper function to compact side deck (remove nulls from middle, pad to 8 at end)
  const compactSideDeck = (deck) => {
    const nonNulls = deck.filter(c => c !== null);
    while (nonNulls.length < 8) {
      nonNulls.push(null);
    }
    return nonNulls;
  };

  // Count total copies of a card across main deck (including champion) and side deck
  const countTotalCardCopies = (cardId) => {
    const mainDeckCopies = mainDeck.filter(id => id === cardId).length;
    const championCopies = (chosenChampion === cardId) ? 1 : 0;
    const sideDeckCopies = sideDeck.filter(id => id === cardId).length;
    return mainDeckCopies + championCopies + sideDeckCopies;
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
                while (newSideDeck.length > 8) newSideDeck.pop();
                while (newSideDeck.length < 8) newSideDeck.push(null);
                return newSideDeck;
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
              setSideDeck(newSideDeck);
            }
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
          // Dragged from search results - just overwrite legend, don't add previous to deck
          setLegendCard(draggedCard);
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
                while (newSideDeck.length < 8) {
                  newSideDeck.push(null);
                }
                return newSideDeck;
              });
            } else {
              // Either deck full or too many copies, restore card to side deck
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
            }
          } else {
            // Dropped in grid but not on a card - add to end, check copy limit
            const totalCopyCount = countTotalCardCopies(draggedCard);
            if (totalCopyCount < 3) {
              setMainDeck([...mainDeck, draggedCard]);
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
                // Ensure array is exactly 8 elements
                while (newSideDeck.length > 8) {
                  newSideDeck.pop();
                }
                while (newSideDeck.length < 8) {
                  newSideDeck.push(null);
                }
                return newSideDeck;
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
      if (cardId && mainDeck.length + (chosenChampion ? 1 : 0) < 40 && currentTotalCount < 3) {
        const newDeck = [...mainDeck];
        newDeck.splice(index, 0, cardId);
        setMainDeck(newDeck);
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
      if (cardId && sideDeck.filter(c => c).length < 8 && currentTotalCount < 3) {
        const newSideDeck = [...sideDeck];
        newSideDeck.splice(index, 0, cardId);
        setSideDeck(compactSideDeck(newSideDeck));
      }
    } else {
      // Right-click: Remove the card
      const newSideDeck = sideDeck.filter((_, i) => i !== index);
      setSideDeck(compactSideDeck(newSideDeck));
    }
  };
  
  // Handle middle-click: add a copy of the card
  const handleMiddleClick = (e, index) => {
    // Check if middle button (button 1) was clicked
    if (e.button === 1) {
      e.preventDefault();
      const cardId = mainDeck[index];
      const currentTotalCount = countTotalCardCopies(cardId);
      if (cardId && mainDeck.length + (chosenChampion ? 1 : 0) < 40 && currentTotalCount < 3) {
        const newDeck = [...mainDeck];
        newDeck.splice(index, 0, cardId);
        setMainDeck(newDeck);
      }
    }
  };
  
  // Handle middle-click: add a copy of the card for side deck
  const handleSideDeckMiddleClick = (e, index) => {
    // Check if middle button (button 1) was clicked
    if (e.button === 1) {
      e.preventDefault();
      const cardId = sideDeck[index];
      const currentTotalCount = countTotalCardCopies(cardId);
      if (cardId && sideDeck.filter(c => c).length < 8 && currentTotalCount < 3) {
        const newSideDeck = [...sideDeck];
        newSideDeck.splice(index, 0, cardId);
        setSideDeck(compactSideDeck(newSideDeck));
      }
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
        }
      } else {
        // Right-click: Remove champion and auto-fill
        autoFillChampion();
      }
    }
  };
  
  // Handle champion middle-click (add a copy to the main deck)
  const handleChampionMiddleClick = (e) => {
    if (e.button === 1 && chosenChampion) {
      e.preventDefault();
      // Add a copy of the champion to the end of the main deck if under 40 cards and under 3 total copies
      const currentTotal = mainDeck.length + (chosenChampion ? 1 : 0);
      const currentTotalCount = countTotalCardCopies(chosenChampion);
      if (currentTotal < 40 && currentTotalCount < 3) {
        setMainDeck(prev => [...prev, chosenChampion]);
      }
    }
  };
  
  // Handle legend context menu (right-click)
  const handleLegendContext = (e) => {
    e.preventDefault();
    if (legendCard) {
      // Remove legend from slot - just clear it, don't add to deck
      setLegendCard(null);
    }
  };
  
  // Handle legend middle-click (add a copy to the main deck)
  const handleLegendMiddleClick = (e) => {
    if (e.button === 1 && legendCard) {
      e.preventDefault();
      // Add a copy of the legend to the end of the main deck if under 40 cards and under 3 total copies
      const currentTotalCount = countTotalCardCopies(legendCard);
      if (mainDeck.length < 40 && currentTotalCount < 3) {
        setMainDeck(prev => [...prev, legendCard]);
      }
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
  
  // Handle battlefield middle-click
  const handleBattlefieldMiddleClick = (e, index) => {
    if (e.button === 1 && battlefields[index]) {
      e.preventDefault();
      // Remove the battlefield card
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
    while (sortedSideDeck.length < 8) {
      sortedSideDeck.push(null);
    }
    
    setMainDeck(sortedMainDeck);
    setSideDeck(sortedSideDeck);
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
    while (sortedSideDeck.length < 8) {
      sortedSideDeck.push(null);
    }
    
    setMainDeck(sortedMainDeck);
    setSideDeck(sortedSideDeck);
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
  
  // Helper function to get rune cards from legend
  const getRuneCards = () => {
    if (!legendCard) return { runeA: null, runeB: null };
    
    const cardData = getCardDetails(legendCard);
    const colors = cardData?.colors || [];
    const color1 = colors[0] || null;
    const color2 = colors[1] || null;
    
    return {
      runeA: color1 ? getRuneCardId(color1) : null,
      runeB: color2 ? getRuneCardId(color2) : null
    };
  };
  
  // Handle rune arrow clicks
  const handleRuneArrowClick = (direction) => {
    if (direction === 'left') {
      // Move from rune B to rune A
      if (runeBCount > 0 && runeACount < 12) {
        setRuneBCount(runeBCount - 1);
        setRuneACount(runeACount + 1);
      }
    } else {
      // Move from rune A to rune B
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
    }
  };
  
  // Handle import deck from clipboard
  const handleImportDeck = async () => {
    try {
      // Read from clipboard
      const clipboardText = await navigator.clipboard.readText();
      
      // Parse the clipboard string
      // Format: "OGN-265-1 OGN-246-1 OGN-103-1 ..."
      // We need to drop the -1, -2, etc. suffixes
      const cardIds = clipboardText.trim().split(/\s+/);
      
      const parsedCards = [];
      for (const cardStr of cardIds) {
        // Parse format: OGN-265-1 -> OGN-265
        // or OGN-265 -> OGN-265
        const match = cardStr.match(/^([A-Z]+)-(\d+)(?:-\d+)?$/);
        if (match) {
          const [, setCode, cardId] = match;
          parsedCards.push(`${setCode}-${cardId}`);
        }
      }
      
      // Check if any valid cards were found
      const foundValidCards = parsedCards.some(cardId => getCardDetails(cardId) !== undefined);
      
      if (parsedCards.length === 0 || !foundValidCards) {
        await showNotification('Invalid Deck', 'Invalid deck in clipboard');
        return;
      }
      
      // Clear current deck only if we have valid cards to import
      setChosenChampion(null);
      setMainDeck([]);
      setSideDeck([]);
      setBattlefields([null, null, null]);
      setRuneACount(6);
      setRuneBCount(6);
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
        const firstCard = getCardDetails(parsedCards[i]);
        if (firstCard?.type === 'Legend') {
          legendCard = parsedCards[i];
          i++;
        }
      }
      
      // 2. Main deck - add cards until we hit a battlefield or rune
      while (i < parsedCards.length) {
        const card = getCardDetails(parsedCards[i]);
        if (!card) {
          i++;
          continue;
        }
        
        if (card.type === 'Battlefield' || card.type === 'Rune') {
          break;
        }
        
        mainDeckCards.push(parsedCards[i]);
        i++;
      }
      
      // 3. Battlefields (0-3)
      while (i < parsedCards.length && battlefieldCards.length < 3) {
        const card = getCardDetails(parsedCards[i]);
        if (!card) {
          i++;
          continue;
        }
        
        if (card.type === 'Battlefield') {
          battlefieldCards.push(parsedCards[i]);
          i++;
        } else if (card.type === 'Rune') {
          break;
        } else {
          break;
        }
      }
      
      // 4. Runes (0-12)
      while (i < parsedCards.length && runeCards.length < 12) {
        const card = getCardDetails(parsedCards[i]);
        if (!card) {
          i++;
          continue;
        }
        
        if (card.type === 'Rune') {
          runeCards.push(parsedCards[i]);
          i++;
        } else {
          break;
        }
      }
      
      // 5. Remaining cards go to side deck (up to 8)
      while (i < parsedCards.length && sideDeckCards.length < 8) {
        const card = getCardDetails(parsedCards[i]);
        if (!card) {
          i++;
          continue;
        }
        sideDeckCards.push(parsedCards[i]);
        i++;
      }
      
      // Update state
      if (legendCard) {
        setLegendCard(legendCard);
      }
      
      // Handle champion - try to find the first champion in main deck
      const firstChampion = mainDeckCards.find(id => {
        const card = getCardDetails(id);
        return card?.super === "Champion";
      });
      
      if (firstChampion) {
        setChosenChampion(firstChampion);
        // Remove champion from main deck
        const championIndex = mainDeckCards.indexOf(firstChampion);
        const newMainDeck = mainDeckCards.filter((_, idx) => idx !== championIndex);
        setMainDeck(newMainDeck.slice(0, 39));
      } else {
        setMainDeck(mainDeckCards.slice(0, 39)); // Main deck is 39 cards (40 total with champion)
      }
      
      setBattlefields([...battlefieldCards, null, null, null].slice(0, 3));
      
      // Parse runes to determine counts for A and B
      if (legendCard) {
        const legendData = getCardDetails(legendCard);
        const colors = legendData?.colors || [];
        
        // Count runes by color
        const newRuneACount = runeCards.filter(id => {
          const card = getCardDetails(id);
          return card?.colors?.[0] === colors[0];
        }).length;
        
        const newRuneBCount = runeCards.filter(id => {
          const card = getCardDetails(id);
          return card?.colors?.[0] === colors[1];
        }).length;
        
        // If total doesn't equal 12, normalize to 6-6
        if (newRuneACount + newRuneBCount !== 12) {
          setRuneACount(6);
          setRuneBCount(6);
        } else {
          setRuneACount(Math.min(newRuneACount, 12));
          setRuneBCount(Math.min(newRuneBCount, 12));
        }
      } else {
        // No legend card, ensure runes are 6-6
        setRuneACount(6);
        setRuneBCount(6);
      }
      
      // Side deck - up to 8 cards
      setSideDeck(sideDeckCards.slice(0, 8));
      
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
        <div className={`flex-1 h-full px-4 py-2 pb-4 flex flex-col gap-2 ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
          {/* Main Deck - 60% height */}
          <div className={`flex-[0.6] border-2 rounded p-4 min-h-0 flex flex-col ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-blue-100 border-gray-400'}`}>
            {/* Header row with stats and controls */}
            <div className="mb-4 flex items-center justify-between px-2 relative">
              <div className="flex items-center gap-2">
                <span className={`text-[14px] font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-700'}`}>Main Deck:</span>
                <span className={`text-[14px] ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{mainDeck.filter(c => c).length + (chosenChampion ? 1 : 0)}/40</span>
              </div>
              {/* Deck Validation Indicator - Centered */}
              <div className="absolute left-1/2 transform -translate-x-1/2">
                <div className="relative group">
                  <div className="flex items-center gap-2 cursor-help">
                    <span className="text-lg">{deckValidation.isValid ? "✅" : "❌"}</span>
                    <span className={`text-[14px] font-medium ${deckValidation.isValid ? 'text-green-600' : 'text-red-600'}`}>
                      {deckValidation.isValid ? "Valid" : "Invalid"}
                    </span>
                  </div>
                  {/* Tooltip */}
                  <div className={`absolute left-1/2 transform -translate-x-1/2 top-full mt-2 z-50 w-64 p-3 rounded shadow-lg border-2 ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-400'} opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity`}>
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
              <div className="flex items-center gap-2">
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
                className={`rounded border-2 flex items-center justify-center overflow-hidden cursor-pointer transition-colors ${isDarkMode ? 'bg-gray-700 border-yellow-600 hover:border-yellow-500' : 'bg-yellow-100 border-yellow-600 hover:border-yellow-700'}`}
                style={{ aspectRatio: '515/685' }}
                onMouseDown={handleChampionMouseDown}
                onMouseEnter={() => chosenChampion && setSelectedCard(chosenChampion)}
                onContextMenu={handleChampionContext}
                onAuxClick={handleChampionMiddleClick}
              >
                {chosenChampion ? (
                  <img
                    src={getCardImageUrl(chosenChampion)}
                    alt={`Chosen Champion ${chosenChampion}`}
                    className="w-[92%] object-contain pointer-events-none"
                    style={{ aspectRatio: '515/719' }}
                  />
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
                    className={`rounded border flex items-center justify-center overflow-hidden cursor-pointer transition-colors select-none ${isDarkMode ? 'bg-gray-700 border-gray-600 hover:border-blue-400' : 'bg-gray-200 border-gray-300 hover:border-blue-500'}`}
                    style={{ aspectRatio: '515/685' }}
                    onMouseDown={(e) => cardId && handleMouseDown(e, index)}
                    onMouseEnter={() => cardId && setSelectedCard(cardId)}
                    onContextMenu={(e) => cardId && handleCardContext(e, index)}
                    onAuxClick={(e) => cardId && handleMiddleClick(e, index)}
                  >
                    {cardId ? (
                      <img
                        src={getCardImageUrl(cardId)}
                        alt={`Card ${cardId} slot ${index + 1}`}
                        className="w-[92%] object-contain pointer-events-none"
                        style={{ aspectRatio: '515/719' }}
                      />
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
                className={`w-full rounded border flex items-center justify-center overflow-hidden cursor-pointer transition-colors mb-1 ${isDarkMode ? 'bg-gray-700 border-gray-600 hover:border-blue-400' : 'bg-gray-200 border-gray-300 hover:border-blue-500'}`}
                data-legend-slot
                onMouseDown={handleLegendMouseDown}
                onMouseEnter={() => legendCard && setSelectedCard(legendCard)}
                onContextMenu={handleLegendContext}
                onAuxClick={handleLegendMiddleClick}
                style={{ aspectRatio: '515/719' }}
              >
                {legendCard ? (
                  <img
                    src={getCardImageUrl(legendCard)}
                    alt={`Legend ${legendCard}`}
                    className="w-full h-full object-contain pointer-events-none"
                  />
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
                              src={`https://riftmana.com/wp-content/uploads/Icons/svg/${color1.toLowerCase()}.svg`}
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
                              src={`https://riftmana.com/wp-content/uploads/Icons/svg/${color2.toLowerCase()}.svg`}
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
                          className={`rounded border flex items-center justify-center overflow-hidden cursor-pointer transition-colors ${isDarkMode ? 'bg-gray-700 border-gray-600 hover:border-blue-400' : 'bg-gray-200 border-gray-300 hover:border-blue-500'}`}
                          onMouseDown={(e) => cardId && handleBattlefieldMouseDown(e, index)}
                          onMouseEnter={() => cardId && setSelectedCard(cardId)}
                          onContextMenu={(e) => cardId && handleBattlefieldContext(e, index)}
                          onAuxClick={(e) => cardId && handleBattlefieldMiddleClick(e, index)}
                          style={{ aspectRatio: '719/515' }}
                        >
                          {cardId ? (
                            <img
                              src={getCardImageUrl(cardId)}
                              alt={`Battlefield ${cardId}`}
                              className="w-[116%] h-[116%] object-contain pointer-events-none"
                              style={{ transform: 'rotate(90deg)' }}
                            />
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
                  <div className="flex items-center justify-center gap-2 flex-1 min-h-0 overflow-hidden">
                    {/* Rune A slot */}
                    <div className="flex flex-col items-center justify-start flex-1 h-full">
                      <div 
                        className={`rounded border flex items-center justify-center overflow-hidden mb-1 w-full max-w-[80px] cursor-pointer transition-colors ${isDarkMode ? 'bg-gray-700 border-gray-600 hover:border-blue-400' : 'bg-gray-200 border-gray-300 hover:border-blue-500'}`} 
                        style={{ aspectRatio: '515/719' }}
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
                              style={{ aspectRatio: '515/719' }}
                            />
                          ) : (
                            <div className={`${isDarkMode ? 'text-gray-500' : 'text-gray-400'} text-[8px] text-center`}>Rune A</div>
                          );
                        })()}
                      </div>
                      <div className={`text-[11px] text-center font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-700'}`}>{runeACount}</div>
                    </div>
                    
                    {/* Arrow buttons - left on top, right on bottom */}
                    <div className="flex flex-col justify-center gap-1">
                      <button 
                        onClick={() => handleRuneArrowClick('left')}
                        className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-[12px] font-bold rounded transition-colors shadow-md"
                      >
                        ←
                      </button>
                      <button 
                        onClick={() => handleRuneArrowClick('right')}
                        className="px-3 py-2 bg-blue-500 hover:bg-blue-600 text-white text-[12px] font-bold rounded transition-colors shadow-md"
                      >
                        →
                      </button>
                    </div>
                    
                    {/* Rune B slot */}
                    <div className="flex flex-col items-center justify-start flex-1 h-full">
                      <div 
                        className={`rounded border flex items-center justify-center overflow-hidden mb-1 w-full max-w-[80px] cursor-pointer transition-colors ${isDarkMode ? 'bg-gray-700 border-gray-600 hover:border-blue-400' : 'bg-gray-200 border-gray-300 hover:border-blue-500'}`} 
                        style={{ aspectRatio: '515/719' }}
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
                              style={{ aspectRatio: '515/719' }}
                            />
                          ) : (
                            <div className={`${isDarkMode ? 'text-gray-500' : 'text-gray-400'} text-[8px] text-center`}>Rune B</div>
                          );
                        })()}
                      </div>
                      <div className={`text-[11px] text-center font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-700'}`}>{runeBCount}</div>
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
                        className={`rounded border flex items-center justify-center overflow-hidden cursor-pointer transition-colors select-none ${isDarkMode ? 'bg-gray-700 border-gray-600 hover:border-blue-400' : 'bg-gray-200 border-gray-300 hover:border-blue-500'}`}
                        onMouseDown={(e) => cardId && handleSideDeckMouseDown(e, index)}
                        onMouseEnter={() => cardId && setSelectedCard(cardId)}
                        onContextMenu={(e) => cardId && handleSideDeckContext(e, index)}
                        onAuxClick={(e) => cardId && handleSideDeckMiddleClick(e, index)}
                        style={{ aspectRatio: '515/685' }}
                      >
                        {cardId ? (
                          <img
                            src={getCardImageUrl(cardId)}
                            alt={`Side Deck Card ${cardId} slot ${index + 1}`}
                            className="w-[92%] object-contain pointer-events-none"
                style={{ aspectRatio: '515/685' }}
                          />
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
                    disabled={searchFilters.cardType === 'Gear' || searchFilters.cardType === 'Spell' || searchFilters.cardType === 'Legend' || searchFilters.cardType === 'Battlefield'}
                    className={`w-12 px-1 py-1 text-[10px] rounded border ${isDarkMode ? 'bg-gray-600 border-gray-500 text-gray-100' : 'bg-white border-gray-300 text-gray-800'} ${(searchFilters.cardType === 'Gear' || searchFilters.cardType === 'Spell' || searchFilters.cardType === 'Legend' || searchFilters.cardType === 'Battlefield') ? 'opacity-50 cursor-not-allowed' : ''}`}
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
            
            {/* Results Grid - 3 columns x 5 rows */}
            <div className="flex-1 grid grid-cols-4 gap-2 min-h-0" data-is-search-grid>
              {Array.from({ length: 24 }).map((_, index) => {
                const currentResults = getCurrentPageResults();
                const cardId = currentResults[index]?.variantNumber || null;
                return (
                  <div
                    key={index}
                    className={`rounded border flex items-center justify-center overflow-hidden cursor-pointer transition-colors select-none ${isDarkMode ? 'bg-gray-600 border-gray-500 hover:border-blue-400' : 'bg-gray-200 border-gray-300 hover:border-blue-500'}`}
                    onMouseDown={(e) => cardId && handleSearchResultMouseDown(e, cardId)}
                    onMouseEnter={() => cardId && setSelectedCard(cardId)}
                    onContextMenu={(e) => cardId && handleSearchResultContext(e, cardId)}
                    style={{ aspectRatio: '460/650', padding: '2px' }}
                  >
                    {cardId ? (
                      <img
                        src={getCardImageUrl(cardId)}
                        alt={`Search Result ${cardId}`}
                        className="w-full h-full object-contain pointer-events-none"
                        style={{ aspectRatio: '460/650' }}
                      />
                    ) : (
                      <div className={`${isDarkMode ? 'text-gray-500' : 'text-gray-400'} text-[14px]`}>+</div>
                    )}
                  </div>
                );
              })}
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
            <div className={`px-6 py-4 border-t flex gap-3 justify-end ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
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
    </>
  );
}

export default App;
