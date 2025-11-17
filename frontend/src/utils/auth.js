// Authentication utility functions for API integration

// Determine API base URL dynamically based on current hostname
// This allows the app to work when accessed via IP address or domain
function getApiBaseUrl() {
  // Use environment variable if set
  if (import.meta.env.VITE_API_BASE_URL) {
    return import.meta.env.VITE_API_BASE_URL;
  }
  
  // Use current hostname with port 3000 (backend port)
  // This works for both localhost and IP addresses
  const protocol = window.location.protocol;
  const hostname = window.location.hostname;
  const port = '3000'; // Backend port
  
  return `${protocol}//${hostname}:${port}`;
}

const API_BASE_URL = getApiBaseUrl();

// Storage keys
const STORAGE_KEYS = {
  TOKEN: 'auth_token',
  USER: 'auth_user',
  PREFERENCES: 'auth_preferences'
};

/**
 * Get the stored JWT token
 * @returns {string|null}
 */
export function getToken() {
  try {
    return localStorage.getItem(STORAGE_KEYS.TOKEN);
  } catch (error) {
    console.error('Error getting token:', error);
    return null;
  }
}

/**
 * Store JWT token
 * @param {string} token
 */
export function setToken(token) {
  try {
    if (token) {
      localStorage.setItem(STORAGE_KEYS.TOKEN, token);
    } else {
      localStorage.removeItem(STORAGE_KEYS.TOKEN);
    }
  } catch (error) {
    console.error('Error setting token:', error);
  }
}

/**
 * Get stored user information
 * @returns {Object|null}
 */
export function getUser() {
  try {
    const userStr = localStorage.getItem(STORAGE_KEYS.USER);
    return userStr ? JSON.parse(userStr) : null;
  } catch (error) {
    console.error('Error getting user:', error);
    return null;
  }
}

/**
 * Store user information
 * @param {Object} user
 */
export function setUser(user) {
  try {
    if (user) {
      localStorage.setItem(STORAGE_KEYS.USER, JSON.stringify(user));
    } else {
      localStorage.removeItem(STORAGE_KEYS.USER);
    }
  } catch (error) {
    console.error('Error setting user:', error);
  }
}

/**
 * Get stored user preferences
 * @returns {Object|null}
 */
export function getPreferences() {
  try {
    const prefsStr = localStorage.getItem(STORAGE_KEYS.PREFERENCES);
    return prefsStr ? JSON.parse(prefsStr) : null;
  } catch (error) {
    console.error('Error getting preferences:', error);
    return null;
  }
}

/**
 * Store user preferences
 * @param {Object} preferences
 */
export function setPreferences(preferences) {
  try {
    if (preferences) {
      localStorage.setItem(STORAGE_KEYS.PREFERENCES, JSON.stringify(preferences));
    } else {
      localStorage.removeItem(STORAGE_KEYS.PREFERENCES);
    }
  } catch (error) {
    console.error('Error setting preferences:', error);
  }
}

/**
 * Check if user is logged in
 * @returns {boolean}
 */
export function isLoggedIn() {
  const token = getToken();
  const user = getUser();
  return token !== null && user !== null;
}

/**
 * Clear all authentication data
 */
export function clearAuth() {
  setToken(null);
  setUser(null);
  setPreferences(null);
}

/**
 * Refresh access token using refresh token cookie
 * @returns {Promise<string|null>} - New access token or null if refresh failed
 */
async function refreshAccessToken() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/refresh`, {
      method: 'POST',
      credentials: 'include', // Include cookies for refresh token
      headers: {
        'Content-Type': 'application/json'
      }
    });

    if (!response.ok) {
      return null;
    }

    const result = await response.json();
    if (result.token) {
      setToken(result.token);
      return result.token;
    }
    return null;
  } catch (error) {
    console.error('Error refreshing token:', error);
    return null;
  }
}

/**
 * Make an authenticated API request
 * @param {string} endpoint - API endpoint (e.g., '/api/auth/me')
 * @param {Object} options - Fetch options
 * @returns {Promise<Response>}
 */
export async function authenticatedFetch(endpoint, options = {}) {
  let token = getToken();
  
  if (!token) {
    // Try to refresh token if we don't have one
    token = await refreshAccessToken();
    if (!token) {
      clearAuth();
      throw new Error('No authentication token available');
    }
  }

  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`,
    ...options.headers
  };

  let response = await fetch(`${API_BASE_URL}${endpoint}`, {
    ...options,
    credentials: 'include', // Include cookies for refresh token
    headers
  });

  // If token is invalid, try to refresh it once
  if (response.status === 401) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      // Retry the request with the new token
      headers['Authorization'] = `Bearer ${newToken}`;
      response = await fetch(`${API_BASE_URL}${endpoint}`, {
        ...options,
        credentials: 'include',
        headers
      });
    }
    
    // If still 401 after refresh, clear auth and throw error
    if (response.status === 401) {
      clearAuth();
      throw new Error('Authentication failed. Please log in again.');
    }
  }

  return response;
}

/**
 * Register a new user
 * @param {Object} data - Registration data
 * @param {string} data.username
 * @param {string} data.email
 * @param {string} data.password
 * @param {string} data.registrationKey
 * @returns {Promise<Object>} - Response with user, token, and preferences
 */
export async function register(data) {
  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/auth/register`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include', // Include cookies for refresh token
      body: JSON.stringify({
        username: data.username,
        email: data.email,
        password: data.password,
        registrationKey: data.registrationKey || data.inviteCode,
        displayName: data.displayName,
        rememberMe: data.rememberMe || false
      })
    });
  } catch (networkError) {
    // Handle network errors (server not running, CORS, etc.)
    console.error('Network error during registration:', networkError);
    throw new Error('Unable to connect to server. Please ensure the backend server is running.');
  }

  // Check if response is ok before trying to parse JSON
  if (!response.ok) {
    let errorMessage = 'Registration failed';
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch (parseError) {
      // If response isn't JSON, use status text
      errorMessage = response.statusText || `Server returned ${response.status}`;
    }
    throw new Error(errorMessage);
  }

  const result = await response.json();

  // Store authentication data
  setToken(result.token);
  setUser(result.user);
  setPreferences(result.preferences);

  // Sync theme from preferences
  if (result.preferences?.theme) {
    try {
      const { setTheme } = require('./deckStorage');
      setTheme(result.preferences.theme);
    } catch (e) {
      // deckStorage might not be available, ignore
    }
  }

  return result;
}

/**
 * Login user
 * @param {Object} data - Login data
 * @param {string} data.username - Username (or email)
 * @param {string} data.password
 * @param {boolean} data.rememberMe - Whether to use long-lived refresh token
 * @returns {Promise<Object>} - Response with user, token, and preferences
 */
export async function login(data) {
  // Determine if username or email was provided
  const isEmail = data.username && data.username.includes('@');
  
  const body = isEmail
    ? { email: data.username, password: data.password, rememberMe: data.rememberMe || false }
    : { username: data.username, password: data.password, rememberMe: data.rememberMe || false };

  let response;
  try {
    response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      credentials: 'include', // Include cookies for refresh token
      body: JSON.stringify(body)
    });
  } catch (networkError) {
    // Handle network errors (server not running, CORS, etc.)
    console.error('Network error during login:', networkError);
    throw new Error('Unable to connect to server. Please ensure the backend server is running.');
  }

  // Check if response is ok before trying to parse JSON
  if (!response.ok) {
    let errorMessage = 'Login failed';
    try {
      const errorData = await response.json();
      errorMessage = errorData.message || errorData.error || errorMessage;
    } catch (parseError) {
      // If response isn't JSON, use status text
      errorMessage = response.statusText || `Server returned ${response.status}`;
    }
    throw new Error(errorMessage);
  }

  const result = await response.json();

  // Store authentication data
  setToken(result.token);
  setUser(result.user);
  setPreferences(result.preferences);

  // Sync theme from preferences
  if (result.preferences?.theme) {
    try {
      const { setTheme } = require('./deckStorage');
      setTheme(result.preferences.theme);
    } catch (e) {
      // deckStorage might not be available, ignore
    }
  }

  return result;
}

/**
 * Get current user from API
 * @returns {Promise<Object>} - Current user data
 */
export async function getCurrentUser() {
  const response = await authenticatedFetch('/api/auth/me');
  
  if (!response.ok) {
    const result = await response.json();
    throw new Error(result.message || result.error || 'Failed to get user');
  }

  const user = await response.json();
  setUser(user); // Update stored user
  return user;
}

/**
 * Logout user
 * @returns {Promise<void>}
 */
export async function logout() {
  try {
    // Call backend logout endpoint to invalidate refresh token
    const token = getToken();
    if (token) {
      try {
        await fetch(`${API_BASE_URL}/api/auth/logout`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          },
          credentials: 'include' // Include cookies for refresh token
        });
      } catch (error) {
        // If logout fails, still clear local auth
        console.error('Error calling logout endpoint:', error);
      }
    }
  } catch (error) {
    console.error('Error during logout:', error);
  } finally {
    // Always clear local auth data
    clearAuth();
    // Also clear username from deckStorage for backward compatibility
    try {
      const { setUsername } = require('./deckStorage');
      setUsername(null);
    } catch (e) {
      // deckStorage might not be available, ignore
    }
  }
}

