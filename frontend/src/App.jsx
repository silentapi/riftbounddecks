import { useState, useEffect } from 'react';
import LayoutContainer from './components/LayoutContainer';
import cardsData from './data/cards.json';

function App() {
  // Function to get card details by variant number
  const getCardDetails = (variantNumber) => {
    return cardsData.find(card => card.variantNumber === variantNumber);
  };
  
  const initialLegend = "OGN-247";

  // Initial deck with 40 cards
  const initialDeck = [
    "OGN-039", "OGN-095", "OGN-095", "OGN-095", "OGN-004", "OGN-004", "OGN-004", "OGN-009", "OGN-009", "OGN-009",
    "OGN-104", "OGN-104", "OGN-013", "OGN-013", "OGN-103", "OGN-103", "OGN-103", "OGN-029", "OGN-029", "OGN-029",
    "OGN-093", "OGN-093", "OGN-093", "OGN-096", "OGN-096", "OGN-096", "OGN-087", "OGN-087", "OGN-087", "OGN-024",
    "OGN-024", "OGN-024", "OGN-012", "OGN-012", "OGN-012", "OGN-027", "OGN-027", "OGN-027", "OGN-116", "OGN-116"
  ];

  const initialSideDeck = [
    "OGN-106", "OGN-106", "OGN-106", "OGN-116", "OGN-248", "OGN-248", "OGN-122", "OGN-122"
  ];
  
  const initialBattlefields = [
    "OGN-289", "OGN-292", "OGN-285"
  ];
  
  const initialRuneACount = 7;
  const initialRuneBCount = 5;
  
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
  
  // Separate state for chosen champion and main deck (39 cards)
  const [chosenChampion, setChosenChampion] = useState(() => {
    const firstChampion = findFirstChampion(initialDeck);
    return firstChampion || initialDeck[0];
  });
  
  const [mainDeck, setMainDeck] = useState(() => {
    const champion = findFirstChampion(initialDeck);
    return initialDeck.filter(id => id !== champion);
  });
  
  // Array of 8 card IDs for the side deck (initially empty)
  const [sideDeck, setSideDeck] = useState(initialSideDeck);
  
  // Array of 3 battlefield cards
  const [battlefields, setBattlefields] = useState(initialBattlefields);
  
  // Rune counts (A and B, must total 12)
  const [runeACount, setRuneACount] = useState(initialRuneACount);
  const [runeBCount, setRuneBCount] = useState(initialRuneBCount);
  
  // State for Legend card (separate from champion)
  const [legendCard, setLegendCard] = useState(initialLegend);
  
  // State for the currently hovered/selected card
  const [selectedCard, setSelectedCard] = useState(legendCard || "OGN-247");
  
  // Dark mode state
  const [isDarkMode, setIsDarkMode] = useState(false);
  
  // Drag and drop state
  const [draggedCard, setDraggedCard] = useState(null);
  const [dragIndex, setDragIndex] = useState(null);
  const [isDraggingFromChampion, setIsDraggingFromChampion] = useState(false);
  const [isDraggingFromLegend, setIsDraggingFromLegend] = useState(false);
  const [isDraggingFromSideDeck, setIsDraggingFromSideDeck] = useState(false);
  const [isDraggingFromBattlefield, setIsDraggingFromBattlefield] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [mousePosition, setMousePosition] = useState({ x: 0, y: 0 });
  const [containerScale, setContainerScale] = useState(1);
  
  // Toggle dark mode
  const toggleDarkMode = () => {
    setIsDarkMode(!isDarkMode);
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
      e.preventDefault(); // Prevent text selection and default drag behavior
      
      setMousePosition({ 
        x: e.clientX, 
        y: e.clientY 
      });
      
      // Store the card being dragged and its position
      const cardBeingDragged = sideDeck[index];
      
      // Remove card from side deck immediately when picked up (set to null)
      const newSideDeck = [...sideDeck];
      newSideDeck[index] = null;
      setSideDeck(newSideDeck);
      
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
        
        if (droppedCard?.type === "Battlefield") {
          const dropIndex = parseInt(battlefieldSlot.getAttribute('data-battlefield-index'));
          const newBattlefields = [...battlefields];
          
          if (isDraggingFromBattlefield) {
            // Dropping within battlefield section - reorder
            newBattlefields.splice(dropIndex, 0, draggedCard);
            setBattlefields(newBattlefields);
          } else {
            // Dropping from another section
            newBattlefields.splice(dropIndex, 0, draggedCard);
            setBattlefields(newBattlefields);
          }
        }
      }
      // Handle dropping onto side deck slot
      else if (sideDeckSlot) {
        const dropIndex = parseInt(sideDeckSlot.getAttribute('data-side-deck-index'));
        const newSideDeck = [...sideDeck];
        
        // Count non-null cards in side deck
        const currentSideDeckCount = sideDeck.filter(c => c).length;
        
        if (isDraggingFromSideDeck) {
          // Dropping within side deck - reorder (always allowed)
          newSideDeck.splice(dropIndex, 0, draggedCard);
          setSideDeck(newSideDeck);
        } else {
          // Dropping from main deck or other source into side deck
          if (currentSideDeckCount >= 8) {
            // Side deck is full, swap with the card at this position
            // First check if the card being added would exceed the copy limit
            const totalCopyCount = countTotalCardCopies(draggedCard);
            if (totalCopyCount < 3) {
              const oldCard = newSideDeck[dropIndex];
              newSideDeck[dropIndex] = draggedCard;
              setSideDeck(newSideDeck);
              
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
                // Restore to main deck
                setMainDeck([...mainDeck, oldCard]);
              }
            }
            // If too many copies, don't swap
          } else {
            // Side deck has space, check copy limit before adding
            const totalCopyCount = countTotalCardCopies(draggedCard);
            if (totalCopyCount < 3) {
              newSideDeck.splice(dropIndex, 0, draggedCard);
              setSideDeck(newSideDeck);
            }
            // If too many copies, card just doesn't get added
          }
        }
      }
      // Handle dropping onto legend slot
      else if (legendSlot) {
        const droppedCard = getCardDetails(draggedCard);
        
        if (droppedCard?.type === "Legend") {
          if (isDraggingFromLegend) {
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
      }
      // Handle dropping onto champion slot (index 0)
      else if (championSlot) {
        const droppedCard = getCardDetails(draggedCard);
        
        if (droppedCard?.super === "Champion") {
          if (isDraggingFromChampion) {
            // Dropping the champion back onto itself, just restore it
            setChosenChampion(draggedCard);
          } else {
            // Swapping champions - dragging a champion from deck onto champion slot
            const oldChampion = chosenChampion;
            setChosenChampion(draggedCard);
            
            // Add old champion to deck only if it doesn't already have 3 total copies
            if (oldChampion) {
              const championCopyCount = countTotalCardCopies(oldChampion);
              if (championCopyCount < 3) {
                setMainDeck(prev => [...prev, oldChampion]);
              }
            }
          }
        }
      } else if (cardElement) {
        // Dropped on a card slot in main deck
        const dropIndex = parseInt(cardElement.getAttribute('data-card-index'));
        const newDeck = [...mainDeck];
        
        if (isDraggingFromSideDeck) {
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
                newSideDeck[dragIndex] = oldCard;
                return newSideDeck;
              });
            }
          } else {
            // Main deck has space, check if we can add (max 3 copies total)
            const totalCopyCount = countTotalCardCopies(draggedCard);
            if (totalCopyCount < 3) {
              // Can add the card
              newDeck.splice(dropIndex, 0, draggedCard);
              setMainDeck(newDeck);
              
              // Successfully added to main deck, so clean up the null placeholder and shift the array
              setSideDeck(prevSideDeck => {
                const newSideDeck = [];
                for (let i = 0; i < prevSideDeck.length; i++) {
                  if (i !== dragIndex) {
                    newSideDeck.push(prevSideDeck[i]);
                  }
                }
                // Pad to 8 with nulls
                while (newSideDeck.length < 8) {
                  newSideDeck.push(null);
                }
                return newSideDeck;
              });
            } else {
              // Too many copies, restore card to side deck
              if (dragIndex !== null && dragIndex < 8) {
                setSideDeck(prevSideDeck => {
                  const newSideDeck = [...prevSideDeck];
                  newSideDeck[dragIndex] = draggedCard;
                  return newSideDeck;
                });
              }
            }
          }
        } else if (isDraggingFromLegend) {
          // Dragged from legend slot - add to deck
          newDeck.splice(dropIndex, 0, draggedCard);
          setMainDeck(newDeck);
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
          if (isDraggingFromSideDeck) {
            // Add to end of deck, but check copy limit and deck size
            const totalCards = mainDeck.length + (chosenChampion ? 1 : 0);
            const totalCopyCount = countTotalCardCopies(draggedCard);
            if (totalCards < 40 && totalCopyCount < 3) {
              setMainDeck([...mainDeck, draggedCard]);
              
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
                  newSideDeck[dragIndex] = draggedCard;
                  return newSideDeck;
                });
              }
            }
          } else if (isDraggingFromLegend) {
            // Add to end of deck - check copy limit
            const totalCopyCount = countTotalCardCopies(draggedCard);
            if (totalCopyCount < 3) {
              setMainDeck([...mainDeck, draggedCard]);
            }
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
                newSideDeck[dragIndex] = draggedCard;
                return newSideDeck;
              });
            }
          } else if (isDraggingFromLegend) {
            // If dragging legend outside, add to end of deck - check copy limit
            const totalCopyCount = countTotalCardCopies(draggedCard);
            if (totalCopyCount < 3) {
              setMainDeck([...mainDeck, draggedCard]);
            }
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
  }, [isDragging, draggedCard, isDraggingFromChampion, isDraggingFromLegend, isDraggingFromSideDeck, chosenChampion, mainDeck]);
  
  // Handle right-click: remove card or add card (with Shift)
  const handleCardContext = (e, index) => {
    e.preventDefault();
    
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
    
    if (e.shiftKey) {
      // Shift + right-click: Add a copy of the card at this position
      const cardId = sideDeck[index];
      const currentTotalCount = countTotalCardCopies(cardId);
      if (cardId && sideDeck.filter(c => c).length < 8 && currentTotalCount < 3) {
        const newSideDeck = [...sideDeck];
        newSideDeck.splice(index, 0, cardId);
        setSideDeck(newSideDeck);
      }
    } else {
      // Right-click: Remove the card
      const newSideDeck = sideDeck.filter((_, i) => i !== index);
      setSideDeck(newSideDeck);
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
        setSideDeck(newSideDeck);
      }
    }
  };
  
  // Handle champion context menu (right-click)
  const handleChampionContext = (e) => {
    e.preventDefault();
    if (chosenChampion) {
      // Remove champion and auto-fill
      autoFillChampion();
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
      // Remove legend from slot (add back to deck if not already there)
      const legendCount = mainDeck.filter(id => id === legendCard).length;
      if (legendCount < 3) {
        setMainDeck(prev => [...prev, legendCard]);
      }
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
    const sortedSideDeck = [...sideDeck].sort(sortCompare);
    
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
    const sortedSideDeck = [...sideDeck].sort(sortCompare);
    
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
        alert('Invalid deck in clipboard');
        return;
      }
      
      // Clear current deck only if we have valid cards to import
      setChosenChampion(null);
      setMainDeck([]);
      setSideDeck([]);
      setBattlefields([null, null, null]);
      setRuneACount(0);
      setRuneBCount(0);
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
        
        setRuneACount(Math.min(newRuneACount, 12));
        setRuneBCount(Math.min(newRuneBCount, 12));
      }
      
      // Side deck - up to 8 cards
      setSideDeck(sideDeckCards.slice(0, 8));
      
      alert(`Deck imported successfully!\nLegend: ${legendCard ? 'Yes' : 'No'}\nMain: ${mainDeckCards.length}\nBattlefields: ${battlefieldCards.length}\nRunes: ${runeCards.length}\nSide: ${sideDeckCards.length}`);
      
    } catch (error) {
      console.error('Error importing deck:', error);
      alert('Failed to import deck. Please ensure clipboard contains valid deck format.');
    }
  };
  
  return (
    <>
      <LayoutContainer isDarkMode={isDarkMode}>
        {/* Content is sized in pixels based on 1920x1080 reference */}
        <div className={`w-[1920px] h-[1080px] flex ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
        {/* Left Panel - 20% (384px) */}
        <div className={`w-[384px] h-full border-r-2 flex flex-col p-4 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-blue-50 border-gray-300'}`}>
          {/* Card Image - auto height */}
          <div className="w-full flex-shrink-0 mb-2">
            <img 
              src={`https://riftmana.com/wp-content/uploads/Cards/${selectedCard}.webp`}
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
                <button className="py-1 px-2 rounded text-[11px] font-medium bg-blue-600 text-white shadow-md hover:bg-blue-700 active:bg-blue-800 transition-colors">
                  Export Deck
                </button>

                {/* Row 2 */}
                <button className="py-1 px-2 rounded text-[11px] font-medium bg-red-600 text-white shadow-md hover:bg-red-700 active:bg-red-800 transition-colors">
                  Delete Deck
                </button>
                <button className="py-1 px-2 rounded text-[11px] font-medium bg-red-600 text-white shadow-md hover:bg-red-700 active:bg-red-800 transition-colors">
                  Clear Deck
                </button>

                {/* Deck Dropdown - spans 2 columns */}
                <div className="col-span-2 py-1 px-2 rounded text-[11px] font-medium bg-gray-100 text-gray-800 border border-gray-300 shadow-sm flex items-center justify-between cursor-pointer hover:bg-gray-200 transition-colors">
                  <span>My Deck (default)</span>
                  <span className="text-gray-500">▼</span>
                </div>

                {/* Row 3 */}
                <button className="py-1 px-2 rounded text-[11px] font-medium bg-blue-600 text-white shadow-md hover:bg-blue-700 active:bg-blue-800 transition-colors">
                  New Deck
                </button>
                <button className="py-1 px-2 rounded text-[11px] font-medium bg-blue-600 text-white shadow-md hover:bg-blue-700 active:bg-blue-800 transition-colors">
                  Rename Deck
                </button>

                {/* Row 4 */}
                <button className="py-1 px-2 rounded text-[11px] font-medium bg-green-600 text-white shadow-md hover:bg-green-700 active:bg-green-800 transition-colors">
                  Save As
                </button>
                <button className="py-1 px-2 rounded text-[11px] font-medium bg-green-600 text-white shadow-md hover:bg-green-700 active:bg-green-800 transition-colors">
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
            <div className="mb-4 flex items-center justify-between px-2">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className={`text-[14px] font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-700'}`}>Main Deck:</span>
                  <span className={`text-[14px] ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>{mainDeck.filter(c => c).length + (chosenChampion ? 1 : 0)}/40</span>
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
            <div className="flex-1 grid grid-cols-10 gap-1 min-h-0" data-is-grid>
              {/* Champion slot (index 0) */}
              <div 
                key="champion"
                data-champion-slot
                className={`rounded border-2 flex items-center justify-center overflow-hidden cursor-pointer transition-colors ${isDarkMode ? 'bg-gray-700 border-yellow-600 hover:border-yellow-500' : 'bg-yellow-100 border-yellow-600 hover:border-yellow-700'}`}
                onMouseDown={handleChampionMouseDown}
                onMouseEnter={() => chosenChampion && setSelectedCard(chosenChampion)}
                onContextMenu={handleChampionContext}
                onAuxClick={handleChampionMiddleClick}
              >
                {chosenChampion ? (
                  <img
                    src={`https://riftmana.com/wp-content/uploads/Cards/${chosenChampion}.webp`}
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
                    className={`rounded border flex items-center justify-center overflow-hidden cursor-pointer transition-colors ${isDarkMode ? 'bg-gray-700 border-gray-600 hover:border-blue-400' : 'bg-gray-200 border-gray-300 hover:border-blue-500'}`}
                    onMouseDown={(e) => cardId && handleMouseDown(e, index)}
                    onMouseEnter={() => cardId && setSelectedCard(cardId)}
                    onContextMenu={(e) => cardId && handleCardContext(e, index)}
                    onAuxClick={(e) => cardId && handleMiddleClick(e, index)}
                  >
                    {cardId ? (
                      <img
                        src={`https://riftmana.com/wp-content/uploads/Cards/${cardId}.webp`}
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
                    src={`https://riftmana.com/wp-content/uploads/Cards/${legendCard}.webp`}
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
                              src={`https://riftmana.com/wp-content/uploads/Cards/${cardId}.webp`}
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
                        className={`rounded border flex items-center justify-center overflow-hidden mb-1 w-full max-w-[85px] cursor-pointer transition-colors ${isDarkMode ? 'bg-gray-700 border-gray-600 hover:border-blue-400' : 'bg-gray-200 border-gray-300 hover:border-blue-500'}`} 
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
                              src={`https://riftmana.com/wp-content/uploads/Cards/${runeA}.webp`}
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
                        className={`rounded border flex items-center justify-center overflow-hidden mb-1 w-full max-w-[85px] cursor-pointer transition-colors ${isDarkMode ? 'bg-gray-700 border-gray-600 hover:border-blue-400' : 'bg-gray-200 border-gray-300 hover:border-blue-500'}`} 
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
                              src={`https://riftmana.com/wp-content/uploads/Cards/${runeB}.webp`}
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
                        className={`rounded border flex items-center justify-center overflow-hidden cursor-pointer transition-colors ${isDarkMode ? 'bg-gray-700 border-gray-600 hover:border-blue-400' : 'bg-gray-200 border-gray-300 hover:border-blue-500'}`}
                        onMouseDown={(e) => cardId && handleSideDeckMouseDown(e, index)}
                        onMouseEnter={() => cardId && setSelectedCard(cardId)}
                        onContextMenu={(e) => cardId && handleSideDeckContext(e, index)}
                        onAuxClick={(e) => cardId && handleSideDeckMiddleClick(e, index)}
                      >
                        {cardId ? (
                          <img
                            src={`https://riftmana.com/wp-content/uploads/Cards/${cardId}.webp`}
                            alt={`Side Deck Card ${cardId} slot ${index + 1}`}
                            className="w-[92%] object-contain pointer-events-none"
                            style={{ aspectRatio: '515/719' }}
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

        {/* Right Panel - 20% (384px) */}
        <div className={`w-[384px] h-full border-l-2 ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-purple-50 border-gray-300'}`}>
          <div className="p-8 text-center">
            <h2 className={`text-[48px] font-bold mb-4 ${isDarkMode ? 'text-gray-100' : 'text-gray-700'}`}>Search Panel</h2>
            <p className={`text-[18px] ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>To be implemented</p>
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
              src={`https://riftmana.com/wp-content/uploads/Cards/${draggedCard}.webp`}
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
    </>
  );
}

export default App;
