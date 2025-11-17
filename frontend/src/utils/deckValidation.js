/**
 * Validates a deck based on Riftbound TCG rules
 * @param {Object} deckCards - The deck cards structure
 * @param {string|null} deckCards.legendCard - Legend card ID
 * @param {string[]} deckCards.battlefields - Array of battlefield card IDs
 * @param {string[]} deckCards.mainDeck - Array of main deck card IDs
 * @param {string[]} deckCards.sideDeck - Array of side deck card IDs
 * @param {string|null} deckCards.chosenChampion - Champion card ID
 * @param {Function} getCardDetails - Function to get card details by card ID
 * @returns {{isValid: boolean, messages: string[]}}
 */
export function validateDeck(deckCards, getCardDetails) {
  const { legendCard, battlefields, mainDeck, sideDeck, chosenChampion } = deckCards;
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
    messages.push("Champion is missing");
    isValid = false;
  } else {
    messages.push("✓ Champion exists");
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
  
  return { isValid, messages };
}

