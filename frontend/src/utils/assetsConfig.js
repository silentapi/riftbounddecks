// Utility helpers for handling asset/CDN base URLs across the frontend.

/**
 * Read the configured assets base URL from the Vite/React env.
 * Falls back to an empty string when not defined.
 */
export function getAssetsBaseUrl() {
  return (
    import.meta.env.VITE_ASSETS_BASE_URL ??
    import.meta.env.REACT_APP_ASSETS_BASE_URL ??
    ''
  ).trim();
}

/**
 * Normalize the assets base URL by trimming whitespace and stripping a trailing slash.
 * Returns an empty string if no base URL is configured.
 */
export function getNormalizedAssetsBaseUrl() {
  const base = getAssetsBaseUrl();
  if (!base) {
    return '';
  }
  return base.endsWith('/') ? base.slice(0, -1) : base;
}

/**
 * Compose a full URL for an asset relative to the configured assets base.
 * Returns null when no base URL is configured so callers can fallback to local paths.
 */
export function buildAssetsUrl(relativePath) {
  const normalizedBase = getNormalizedAssetsBaseUrl();
  if (!normalizedBase) {
    return null;
  }

  const trimmedPath = (relativePath ?? '').replace(/^\/+/, '');
  if (!trimmedPath) {
    return normalizedBase;
  }

  return `${normalizedBase}/${trimmedPath}`;
}

/**
 * Fetch JSON from the CDN / asset host without any custom headers.
 * This is critical for CORS compatibility - the CDN rejects requests with
 * custom headers like Content-Type, Referer, or sec-ch-ua*.
 * 
 * @template T
 * @param {string} path - Relative path to the JSON file (e.g., 'cards.json' or '/test/cards.json')
 * @returns {Promise<T>} Parsed JSON data
 * @throws {Error} If the request fails or response is not ok
 */
export async function fetchCdnJson(path) {
  const normalizedBase = getNormalizedAssetsBaseUrl();
  if (!normalizedBase) {
    throw new Error('CDN base URL not configured. Set REACT_APP_ASSETS_BASE_URL or VITE_ASSETS_BASE_URL.');
  }

  // Normalize path: remove leading slashes from path, ensure base has no trailing slash
  const cleanedPath = (path ?? '').replace(/^\/+/, '');
  if (!cleanedPath) {
    throw new Error('Path cannot be empty');
  }

  const url = `${normalizedBase}/${cleanedPath}`;

  // CRITICAL: Use bare fetch with NO headers to avoid CORS issues
  // The CDN rejects requests with Content-Type, Referer, sec-ch-ua*, etc.
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`CDN request failed: ${res.status} ${res.statusText}`);
  }

  return res.json();
}

