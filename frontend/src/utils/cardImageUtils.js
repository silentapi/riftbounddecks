import { getNormalizedAssetsBaseUrl } from './assetsConfig';

const CARD_IMAGE_EXTENSION = '.png';
const CARD_BACK_VARIANT = 'Cardback';

function buildAssetUrl(relativePath) {
  if (!relativePath) {
    return '';
  }

  const trimmedPath = relativePath.trim();
  if (!trimmedPath) {
    return '';
  }

  if (/^https?:\/\//i.test(trimmedPath)) {
    return trimmedPath;
  }

  const normalizedBase = getNormalizedAssetsBaseUrl();
  const cleanedPath = trimmedPath.replace(/^\/+/, '');
  if (!cleanedPath) {
    return '';
  }

  if (normalizedBase) {
    return `${normalizedBase}/${cleanedPath}`;
  }

  return `/${cleanedPath}`;
}

function buildVariantImagePath(variantCode = CARD_BACK_VARIANT) {
  const normalizedVariant = variantCode?.trim() || CARD_BACK_VARIANT;
  return `/img/${normalizedVariant}${CARD_IMAGE_EXTENSION}`;
}

export function getCardBackImageUrl() {
  return buildAssetUrl(buildVariantImagePath(CARD_BACK_VARIANT));
}

export function parseCardId(cardId) {
  if (!cardId) return { baseId: null, variantIndex: 0 };
  const match = cardId.match(/^([A-Z]+-\d+)(?:-(\d+))?$/);
  if (match) {
    return {
      baseId: match[1],
      variantIndex: match[2] ? parseInt(match[2], 10) - 1 : 0
    };
  }
  return { baseId: cardId, variantIndex: 0 };
}

export function getCardImageUrl(cardId, cardsData = []) {
  if (!cardId) {
    return getCardBackImageUrl();
  }

  const { baseId, variantIndex } = parseCardId(cardId);
  const card = Array.isArray(cardsData)
    ? cardsData.find(c => c.variantNumber === baseId)
    : null;

  const candidates = [];
  const variantImagePath = card?.variantImages?.[variantIndex];
  if (variantImagePath) {
    candidates.push(variantImagePath);
  }

  const fallbackVariantCode =
    card?.variants?.[variantIndex] ??
    card?.variantNumber ??
    baseId ??
    cardId;
  candidates.push(buildVariantImagePath(fallbackVariantCode));

  for (const candidate of candidates) {
    const url = buildAssetUrl(candidate);
    if (url) {
      return url;
    }
  }

  return getCardBackImageUrl();
}

