import { useState, useEffect, useRef, useMemo } from 'react';
import LayoutContainer from '../components/LayoutContainer';
import { 
  getTheme, 
  setTheme as setThemeLocal,
  getScreenshotMode,
  setScreenshotMode as setScreenshotModeLocal,
  getEditingDeckUUID,
  setEditingDeckUUID
} from '../utils/deckStorage';
import { getUser, logout as authLogout } from '../utils/auth';
import { validateDeck as validateDeckRules } from '../utils/deckValidation';
import { getDecks, ensureOneDeck } from '../utils/decksApi';
import { getPreferences, updatePreferences } from '../utils/preferencesApi';
import { migrateLegacyDecks } from '../utils/legacyMigration';
import { getProfilePictureUrl } from '../utils/profilePicture';
import { getCards } from '../utils/cardsApi';
import { getCardImageUrl, parseCardId } from '../utils/cardImageUtils';

function Homepage() {
  // Check if we're in production environment (defaults to 'test' if not set)
  const environment =
    import.meta.env.VITE_ENVIRONMENT ??
    import.meta.env.REACT_APP_ENV ??
    'test';
  const isProduction = environment === 'prod' || environment === 'production';
  
  // Dark mode state - initialize from localStorage (will be updated from API)
  const [isDarkMode, setIsDarkMode] = useState(() => getTheme() === 'dark');
  const [screenshotMode, setScreenshotModeState] = useState(() => getScreenshotMode());
  
  // Decks state
  const [decks, setDecks] = useState([]);
  const [selectedDeckId, setSelectedDeckId] = useState(null);
  const [defaultDeckId, setDefaultDeckIdState] = useState(null);
  const [loadingDecks, setLoadingDecks] = useState(true);
  
  // Deck validation state
  const [deckValidation, setDeckValidation] = useState({
    isValid: true,
    messages: []
  });
  
  // Profile picture state
  const [profilePictureUrl, setProfilePictureUrl] = useState(null);
  const [profilePictureLoading, setProfilePictureLoading] = useState(true);
  
  // Display name state
  const [displayName, setDisplayName] = useState(null);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  
  // Container scale for modal scaling
  const [containerScale, setContainerScale] = useState(1);
  
  // Cards data state - loaded from backend API
  const [cardsData, setCardsData] = useState([]);
  const [cardsLoading, setCardsLoading] = useState(true);
  
  // Toast notifications state
  const [toasts, setToasts] = useState([]);
  
  // Ref to track if we've already processed editingDeckUUID (prevents double-processing in StrictMode)
  const hasProcessedEditingDeckUUIDRef = useRef(false);
  const hasMigratedRef = useRef(false);
  
  // Filter state
  const [filters, setFilters] = useState({
    username: '',
    description: '',
    matchType: 'Any',
    privacy: 'Any',
    format: 'Any'
  });
  
  // Host state
  const [hostForm, setHostForm] = useState({
    format: 'Current',
    type: 'Best of 3',
    description: '',
    password: ''
  });
  
  // Queue state
  const [queueForm, setQueueForm] = useState({
    format: 'Current',
    matchType: 'Best of 3'
  });
  
  // Queue player count (mock data for now)
  const [queuePlayerCount, setQueuePlayerCount] = useState(0);
  
  // Placeholder data for lobbies (will be replaced with API data later)
  const PLACEHOLDER_LOBBIES = [
    {
      id: '550e8400-e29b-41d4-a716-446655440001',
      username: 'PlayerOne',
      description: 'Looking for a competitive match!',
      format: 'Current',
      matchType: 'Best of 3',
      privacy: 'Unlocked',
      password: null,
      profilePictureCardId: 'OGN-155'
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440002',
      username: 'DeckMaster',
      description: 'Testing new deck builds',
      format: 'Future',
      matchType: 'Single',
      privacy: 'Locked',
      password: 'test123',
      profilePictureCardId: 'OGN-157'
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440003',
      username: 'RiftboundPro',
      description: 'Ranked practice session',
      format: 'Current',
      matchType: 'Best of 3',
      privacy: 'Unlocked',
      password: null,
      profilePictureCardId: 'OGN-159'
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440004',
      username: 'CasualPlayer',
      description: 'Just for fun!',
      format: 'Future',
      matchType: 'Single',
      privacy: 'Unlocked',
      password: null,
      profilePictureCardId: 'OGN-161'
    }
  ];
  
  // Placeholder data for games (will be replaced with API data later)
  const PLACEHOLDER_GAMES = [
    {
      id: '550e8400-e29b-41d4-a716-446655440101',
      host: 'ChampionPlayer',
      joiner: 'LegendSeeker',
      hostLegend: 'OGN-251', // Random from OGN-247 to OGN-269 (odd numbers)
      joinerLegend: 'OGN-263', // Random from OGN-247 to OGN-269 (odd numbers)
      format: 'Current',
      matchType: 'Best of 3',
      description: 'Competitive ranked match'
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440102',
      host: 'DeckBuilder',
      joiner: 'MetaGamer',
      hostLegend: 'SFD-185', // Future format example
      joinerLegend: 'SFD-195', // Future format example
      format: 'Future',
      matchType: 'Single',
      description: 'Testing new deck builds'
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440103',
      host: 'ProGamer',
      joiner: 'CasualGamer',
      hostLegend: 'OGN-255', // Random from OGN-247 to OGN-269 (odd numbers)
      joinerLegend: 'OGN-259', // Random from OGN-247 to OGN-269 (odd numbers)
      format: 'Current',
      matchType: 'Best of 3',
      description: 'Practice session'
    },
    {
      id: '550e8400-e29b-41d4-a716-446655440104',
      host: 'RiftboundMaster',
      joiner: 'CardCollector',
      hostLegend: 'OGN-247', // Random from OGN-247 to OGN-269 (odd numbers)
      joinerLegend: 'OGN-269', // Random from OGN-247 to OGN-269 (odd numbers)
      format: 'Current',
      matchType: 'Best of 3',
      description: 'Tournament qualifier'
    }
  ];
  
  // Lobbies and Games state (initialized as empty, loaded on mount)
  const [lobbies, setLobbies] = useState([]);
  const [games, setGames] = useState([]);
  
  // Profile picture URLs for each lobby (keyed by lobby id)
  const [lobbyProfilePictures, setLobbyProfilePictures] = useState({});
  
  // Hosting state
  const [hostedLobbyId, setHostedLobbyId] = useState(null); // UUID of the lobby we're hosting
  const [applicants, setApplicants] = useState([]); // Array of users who want to join our lobby
  
  // Join lobby modal state
  const [joinLobbyModal, setJoinLobbyModal] = useState({
    isOpen: false,
    lobby: null
  });
  
  // Password modal state
  const [passwordModal, setPasswordModal] = useState({
    isOpen: false,
    lobby: null,
    password: ''
  });
  
  // Load lobbies from API (currently returns placeholder data)
  const loadLobbies = async () => {
    try {
      console.log('[Homepage] Loading lobbies...');
      // TODO: Replace with actual API call
      // const response = await fetch('/api/lobbies');
      // const data = await response.json();
      // return data;
      
      // For now, return placeholder data
      console.log('[Homepage] Using placeholder lobbies data');
      const data = PLACEHOLDER_LOBBIES.map(lobby => ({
        ...lobby,
        applicants: lobby.applicants || []
      }));
      console.log('[Homepage] Loaded lobbies:', data.length, 'lobbies');
      return data;
    } catch (error) {
      console.error('[Homepage] Error loading lobbies:', error);
      // Return empty array on error
      return [];
    }
  };
  
  // Load profile pictures for lobbies
  const loadLobbyProfilePictures = async (lobbiesToLoad) => {
    const picturePromises = lobbiesToLoad.map(async (lobby) => {
      const cardId = lobby.profilePictureCardId || 'OGN-155';
      try {
        const url = await getProfilePictureUrl(cardId);
        return { lobbyId: lobby.id, url };
      } catch (error) {
        console.error(`[Homepage] Error loading profile picture for lobby ${lobby.id}:`, error);
        return { lobbyId: lobby.id, url: null };
      }
    });
    
    const results = await Promise.all(picturePromises);
    const pictureMap = {};
    results.forEach(({ lobbyId, url }) => {
      pictureMap[lobbyId] = url;
    });
    
    setLobbyProfilePictures(prev => ({ ...prev, ...pictureMap }));
  };
  
  // Load games from API (currently returns placeholder data)
  const loadGames = async () => {
    try {
      console.log('[Homepage] Loading games...');
      // TODO: Replace with actual API call
      // const response = await fetch('/api/games');
      // const data = await response.json();
      // return data;
      
      // For now, return placeholder data
      console.log('[Homepage] Using placeholder games data');
      const data = PLACEHOLDER_GAMES;
      console.log('[Homepage] Loaded games:', data.length, 'games');
      return data;
    } catch (error) {
      console.error('[Homepage] Error loading games:', error);
      // Return empty array on error
      return [];
    }
  };
  
  // Load cards from backend API on mount
  useEffect(() => {
    const loadCards = async () => {
      try {
        console.log('[Homepage] Loading cards from API...');
        setCardsLoading(true);
        const cards = await getCards();
        setCardsData(cards);
        console.log('[Homepage] Loaded cards:', cards.length, 'cards');
      } catch (error) {
        console.error('[Homepage] Error loading cards:', error);
        // Set empty array on error to prevent crashes
        setCardsData([]);
      } finally {
        setCardsLoading(false);
      }
    };
    
    loadCards();
  }, []);
  
  // Load preferences and decks on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('[Homepage] Loading preferences and decks from API...');
        
        // Step 1: Migrate legacy decks if needed (only once)
        if (!hasMigratedRef.current) {
          console.log('[Homepage] Checking for legacy decks to migrate...');
          hasMigratedRef.current = true;
          await migrateLegacyDecks();
        }
        
        // Step 2: Load preferences from API
        console.log('[Homepage] Loading preferences from API...');
        const preferences = await getPreferences();
        console.log('[Homepage] Loaded preferences:', preferences);
        
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
        console.log('[Homepage] Ensuring at least one deck exists...');
        await ensureOneDeck();
        
        // Step 4: Load decks from API
        console.log('[Homepage] Loading decks from API...');
        const loadedDecks = await getDecks();
    console.log('[Homepage] Loaded decks:', loadedDecks.map(d => ({ id: d.id, name: d.name })));
    setDecks(loadedDecks);
        setLoadingDecks(false);
    
        // Step 5: Set default deck from preferences
        const defaultId = preferences?.defaultDeckId || null;
        console.log('[Homepage] Default deck ID from preferences:', defaultId);
    setDefaultDeckIdState(defaultId);
    
        // Step 6: Load profile picture from preferences
        const profileCardId = preferences?.profilePictureCardId || 'OGN-155';
        try {
          setProfilePictureLoading(true);
          const url = await getProfilePictureUrl(profileCardId);
          setProfilePictureUrl(url);
        } catch (error) {
          console.error('[Homepage] Error loading profile picture:', error);
          setProfilePictureUrl(null);
        } finally {
          setProfilePictureLoading(false);
        }
        
        // Step 7: Set display name from preferences
        setDisplayName(preferences?.displayName || null);
        setPreferencesLoaded(true);
    
        // Step 8: Load lobbies and games
        console.log('[Homepage] Loading lobbies and games...');
        const loadedLobbies = await loadLobbies();
        const loadedGames = await loadGames();
        setLobbies(loadedLobbies);
        setGames(loadedGames);
        // Load profile pictures for lobbies
        await loadLobbyProfilePictures(loadedLobbies);
        console.log('[Homepage] Lobbies and games loaded successfully');
    
        // Step 9: Check if we have an editing deck UUID set
    // Only process if we haven't already processed it in this load cycle
    if (!hasProcessedEditingDeckUUIDRef.current) {
      const editingDeckUUID = getEditingDeckUUID();
      console.log('[Homepage] Editing deck UUID from storage:', editingDeckUUID);
      
      // Set selected deck priority: editingDeckUUID > default > first deck
      if (editingDeckUUID && loadedDecks.find(d => d.id === editingDeckUUID)) {
        // We have a deck that was being edited, select it
        console.log('[Homepage] Selecting editing deck UUID:', editingDeckUUID);
        setSelectedDeckId(editingDeckUUID);
        // Mark that we've processed it
        hasProcessedEditingDeckUUIDRef.current = true;
        // Clear the editing deck UUID so it doesn't persist on future loads
        setEditingDeckUUID(null);
        console.log('[Homepage] Cleared editing deck UUID from storage');
      } else {
        // No editing deck UUID or it doesn't exist in loaded decks
        // Mark as processed so we don't check again
        hasProcessedEditingDeckUUIDRef.current = true;
        // Fall through to default selection logic
        if (defaultId && loadedDecks.find(d => d.id === defaultId)) {
          console.log('[Homepage] Selecting default deck:', defaultId);
          setSelectedDeckId(defaultId);
        } else if (loadedDecks.length > 0) {
          console.log('[Homepage] Selecting first deck:', loadedDecks[0].id);
          setSelectedDeckId(loadedDecks[0].id);
        }
      }
    }
      } catch (error) {
        console.error('[Homepage] Error loading data:', error);
        setLoadingDecks(false);
        // Mark preferences as loaded (even if failed) so username can be displayed
        setPreferencesLoaded(true);
        // Fallback to localStorage if API fails
        try {
          const { loadDecks: loadDecksLocal } = await import('../utils/deckStorage');
          const localDecks = loadDecksLocal();
          setDecks(localDecks || []);
        } catch (fallbackError) {
          console.error('[Homepage] Error in fallback:', fallbackError);
        }
      }
    };
    
    loadData();
  }, []);
  
  // Update theme class when isDarkMode changes
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    // Update preferences on server when theme changes
    const updateTheme = async () => {
      try {
        console.log('[Homepage] Updating theme preference:', isDarkMode ? 'dark' : 'light');
        await updatePreferences({ theme: isDarkMode ? 'dark' : 'light' });
        setThemeLocal(isDarkMode ? 'dark' : 'light');
      } catch (error) {
        console.error('[Homepage] Error updating theme preference:', error);
      }
    };
    
    // Only update if we've loaded preferences (avoid updating on initial mount)
    if (!loadingDecks) {
      updateTheme();
    }
  }, [isDarkMode, loadingDecks]);
  
  // Calculate container scale for modal scaling
  useEffect(() => {
    const updateScale = () => {
      // Use the same method as LayoutContainer
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
    
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);
  
  // Reload decks when needed (e.g., after deck operations)
  const reloadDecks = async () => {
    try {
      console.log('[Homepage] Reloading decks from API...');
      const loadedDecks = await getDecks();
      console.log('[Homepage] Reloaded decks:', loadedDecks.map(d => ({ id: d.id, name: d.name })));
      setDecks(loadedDecks);
    } catch (error) {
      console.error('[Homepage] Error reloading decks:', error);
    }
  };
  
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
  
  // Filter lobbies based on filter state
  const filteredLobbies = useMemo(() => {
    return lobbies.filter(lobby => {
      // Username filter (case-insensitive)
      if (filters.username && !lobby.username?.toLowerCase().includes(filters.username.toLowerCase())) {
        return false;
      }
      
      // Description filter (case-insensitive)
      if (filters.description && !lobby.description?.toLowerCase().includes(filters.description.toLowerCase())) {
        return false;
      }
      
      // Match Type filter
      if (filters.matchType !== 'Any' && lobby.matchType !== filters.matchType) {
        return false;
      }
      
      // Privacy filter
      if (filters.privacy !== 'Any' && lobby.privacy !== filters.privacy) {
        return false;
      }
      
      // Format filter
      if (filters.format !== 'Any' && lobby.format !== filters.format) {
        return false;
      }
      
      return true;
    });
  }, [lobbies, filters]);
  
  // Filter games based on filter state
  const filteredGames = useMemo(() => {
    return games.filter(game => {
      // Username filter (case-insensitive) - matches host or joiner
      if (filters.username) {
        const usernameLower = filters.username.toLowerCase();
        const hostMatch = game.host?.toLowerCase().includes(usernameLower);
        const joinerMatch = game.joiner?.toLowerCase().includes(usernameLower);
        if (!hostMatch && !joinerMatch) {
          return false;
        }
      }
      
      // Description filter (case-insensitive)
      if (filters.description && !game.description?.toLowerCase().includes(filters.description.toLowerCase())) {
        return false;
      }
      
      // Match Type filter
      if (filters.matchType !== 'Any' && game.matchType !== filters.matchType) {
        return false;
      }
      
      // Format filter
      if (filters.format !== 'Any' && game.format !== filters.format) {
        return false;
      }
      
      // Privacy filter doesn't apply to games, so we ignore it
      
      return true;
    });
  }, [games, filters]);
  
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
  
  // Handle logout
  const handleLogout = async () => {
    await authLogout();
    window.location.href = '/login';
  };
  
  // Handle navigation to deck builder
  const handleDeckBuilder = () => {
    window.location.href = '/deck';
  };
  
  // Handle deck selection
  const handleDeckChange = (e) => {
    setSelectedDeckId(e.target.value);
  };
  
  // Handle edit deck - opens in same tab
  const handleEditDeck = () => {
    if (selectedDeckId) {
      console.log('[Homepage] Edit button clicked for deck:', selectedDeckId);
      // Store the editing deck UUID so we can select it when returning to this page
      setEditingDeckUUID(selectedDeckId);
      console.log('[Homepage] Stored editing deck UUID:', selectedDeckId);
      window.location.href = `/deck/${selectedDeckId}`;
    } else {
      console.log('[Homepage] Edit button clicked but no deck selected');
    }
  };
  
  // Handle set as default
  const handleSetAsDefault = async () => {
    if (selectedDeckId) {
      try {
        console.log('[Homepage] Setting default deck:', selectedDeckId);
        await updatePreferences({ defaultDeckId: selectedDeckId });
      setDefaultDeckIdState(selectedDeckId);
      // Reload decks to update the star display
        await reloadDecks();
      } catch (error) {
        console.error('[Homepage] Error setting default deck:', error);
      }
    }
  };
  
  // Handle filter changes
  const handleFilterChange = (field, value) => {
    setFilters(prev => ({ ...prev, [field]: value }));
  };
  
  // Handle reset filters
  const handleResetFilters = () => {
    setFilters({
      username: '',
      description: '',
      matchType: 'Any',
      privacy: 'Any',
      format: 'Any'
    });
  };
  
  // Handle host form changes
  const handleHostFormChange = (field, value) => {
    setHostForm(prev => ({ ...prev, [field]: value }));
  };
  
  // Handle host match
  const handleHostMatch = async () => {
    try {
      console.log('[Homepage] Creating lobby with settings:', hostForm);
      
      // Validate deck is usable for the selected format
      if (!isDeckUsableForFormat(hostForm.format)) {
        console.warn('[Homepage] Cannot host lobby: deck is not usable for format', hostForm.format);
        return;
      }
      
      // Generate UUID for the new lobby
      let lobbyId;
      if (typeof window !== 'undefined' && window.crypto && window.crypto.randomUUID) {
        lobbyId = window.crypto.randomUUID();
      } else if (typeof crypto !== 'undefined' && crypto.randomUUID) {
        lobbyId = crypto.randomUUID();
      } else {
        // Fallback implementation for older browsers or environments without crypto.randomUUID
        lobbyId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
          const r = Math.random() * 16 | 0;
          const v = c === 'x' ? r : (r & 0x3 | 0x8);
          return v.toString(16);
        });
      }
      console.log('[Homepage] Generated lobby UUID:', lobbyId);
      
      // Get current user info
      const user = getUser();
      const hostUsername = displayName || username || 'User';
      
      // Create lobby object
      const newLobby = {
        id: lobbyId,
        username: hostUsername,
        description: hostForm.description || '',
        format: hostForm.format,
        matchType: hostForm.type,
        privacy: hostForm.password ? 'Locked' : 'Unlocked',
        password: hostForm.password || null,
        applicants: []
      };
      
      console.log('[Homepage] Created lobby object:', newLobby);
      
      // TODO: Replace with actual API call
      // const response = await fetch('/api/lobbies', {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify(newLobby)
      // });
      // const createdLobby = await response.json();
      
      // For now, add to local state
      setLobbies(prev => {
        const updated = [...prev, newLobby];
        console.log('[Homepage] Added lobby to list. Total lobbies:', updated.length);
        return updated;
      });
      
      // Set as hosted lobby and initialize applicants
      setHostedLobbyId(lobbyId);
      setApplicants([]);
      console.log('[Homepage] Set hosted lobby ID:', lobbyId);
      console.log('[Homepage] Initialized applicants list (empty)');
      
    } catch (error) {
      console.error('[Homepage] Error creating lobby:', error);
    }
  };
  
  // Handle cancel host
  const handleCancelHost = async () => {
    try {
      if (!hostedLobbyId) {
        console.warn('[Homepage] Cannot cancel: no hosted lobby');
        return;
      }
      
      console.log('[Homepage] Cancelling hosted lobby:', hostedLobbyId);
      
      // TODO: Replace with actual API call
      // const response = await fetch(`/api/lobbies/${hostedLobbyId}`, {
      //   method: 'DELETE'
      // });
      
      // Remove from local state
      setLobbies(prev => {
        const filtered = prev.filter(lobby => lobby.id !== hostedLobbyId);
        console.log('[Homepage] Removed lobby from list. Remaining lobbies:', filtered.length);
        return filtered;
      });
      
      // Clear hosting state
      setHostedLobbyId(null);
      setApplicants([]);
      console.log('[Homepage] Cleared hosted lobby state');
      console.log('[Homepage] Host form settings preserved:', hostForm);
      
    } catch (error) {
      console.error('[Homepage] Error cancelling lobby:', error);
    }
  };
  
  // Handle queue form changes
  const handleQueueFormChange = (field, value) => {
    setQueueForm(prev => ({ ...prev, [field]: value }));
  };
  
  // Handle join queue
  const handleJoinQueue = () => {
    // Prevent joining if user is currently hosting a lobby
    if (hostedLobbyId) {
      console.log('[Homepage] Cannot join queue: user is currently hosting a lobby');
      return;
    }
    
    // TODO: Implement join queue functionality
    console.log('Join queue:', queueForm);
  };
  
  // Handle join lobby
  const handleJoinLobby = (lobby) => {
    // Prevent joining if user is currently hosting a lobby
    if (hostedLobbyId) {
      console.log('[Homepage] Cannot join lobby: user is currently hosting a lobby');
      return;
    }
    
    // If lobby is password-protected, show password modal
    if (lobby.privacy === 'Locked' && lobby.password) {
      setPasswordModal({
        isOpen: true,
        lobby: lobby,
        password: ''
      });
      return;
    }
    
    // Join lobby without password
    joinLobbyWithPassword(lobby, null);
  };
  
  // Join lobby with password (or null if no password)
  const joinLobbyWithPassword = (lobby, password) => {
    // Get current user info
    const user = getUser();
    const currentUsername = displayName || username || 'User';
    
    // Add current user to the lobby's applicants list
    setLobbies(prev => {
      return prev.map(l => {
        if (l.id === lobby.id) {
          // Initialize applicants array if it doesn't exist
          const currentApplicants = l.applicants || [];
          // Check if user is already in applicants
          const isAlreadyApplicant = currentApplicants.some(
            app => app.username === currentUsername || app.name === currentUsername
          );
          
          if (!isAlreadyApplicant) {
            return {
              ...l,
              applicants: [...currentApplicants, { username: currentUsername, name: currentUsername }]
            };
          }
          return l;
        }
        return l;
      });
    });
    
    // Open the join modal
    setJoinLobbyModal({
      isOpen: true,
      lobby: lobby
    });
    
    console.log('[Homepage] Joining lobby:', lobby.id, 'as', currentUsername, password ? 'with password' : 'without password');
  };
  
  // Handle password modal submit
  const handlePasswordSubmit = () => {
    if (!passwordModal.lobby) return;
    
    // Validate password
    if (passwordModal.password !== passwordModal.lobby.password) {
      // Incorrect password - show toast and close modal
      addToast('Incorrect password', 3000);
      setPasswordModal({
        isOpen: false,
        lobby: null,
        password: ''
      });
      return;
    }
    
    // Correct password - close modal and join lobby
    setPasswordModal({
      isOpen: false,
      lobby: null,
      password: ''
    });
    
    // Join lobby with the entered password
    joinLobbyWithPassword(passwordModal.lobby, passwordModal.password);
  };
  
  // Handle password modal cancel
  const handlePasswordCancel = () => {
    setPasswordModal({
      isOpen: false,
      lobby: null,
      password: ''
    });
  };
  
  // Handle password input change
  const handlePasswordChange = (value) => {
    setPasswordModal(prev => ({
      ...prev,
      password: value
    }));
  };
  
  // Handle cancel join lobby
  const handleCancelJoinLobby = () => {
    if (!joinLobbyModal.lobby) return;
    
    const user = getUser();
    const currentUsername = displayName || username || 'User';
    
    // Remove current user from the lobby's applicants list
    setLobbies(prev => {
      return prev.map(l => {
        if (l.id === joinLobbyModal.lobby.id) {
          const currentApplicants = l.applicants || [];
          return {
            ...l,
            applicants: currentApplicants.filter(
              app => app.username !== currentUsername && app.name !== currentUsername
            )
          };
        }
        return l;
      });
    });
    
    // Close the modal
    setJoinLobbyModal({
      isOpen: false,
      lobby: null
    });
    
    console.log('[Homepage] Cancelled joining lobby:', joinLobbyModal.lobby.id);
  };
  
  // Handle refresh lobbies
  const handleRefreshLobbies = async () => {
    console.log('[Homepage] Refreshing lobbies...');
    try {
      const loadedLobbies = await loadLobbies();
      setLobbies(loadedLobbies);
      // Load profile pictures for lobbies
      await loadLobbyProfilePictures(loadedLobbies);
      console.log('[Homepage] Lobbies refreshed successfully:', loadedLobbies.length, 'lobbies');
    } catch (error) {
      console.error('[Homepage] Error refreshing lobbies:', error);
    }
  };
  
  // Handle refresh games
  const handleRefreshGames = async () => {
    console.log('[Homepage] Refreshing games...');
    try {
      const loadedGames = await loadGames();
      setGames(loadedGames);
      console.log('[Homepage] Games refreshed successfully:', loadedGames.length, 'games');
    } catch (error) {
      console.error('[Homepage] Error refreshing games:', error);
    }
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
  
  // Get the selected deck's legend card
  const selectedDeck = decks.find(d => d.id === selectedDeckId);
  const legendCard = selectedDeck?.cards?.legendCard || null;
  
  // Check if the selected deck has any future cards
  const hasFutureCards = () => {
    if (!selectedDeck || !selectedDeck.cards) return false;
    
    const { legendCard, battlefields, mainDeck, sideDeck, chosenChampion } = selectedDeck.cards;
    const allCards = [
      legendCard,
      ...(battlefields || []),
      ...(mainDeck || []).filter(c => c),
      ...(sideDeck || []).filter(c => c),
      chosenChampion
    ].filter(c => c);
    
    return allCards.some(cardId => {
      const cardData = getCardDetails(cardId);
      return isFutureRelease(cardData?.releaseDate);
    });
  };
  
  // Check if the deck is usable for a given format
  // - Invalid decks cannot be used in any format
  // - Future decks can only be used in Future format
  // - Non-future decks can be used in both Current and Future formats
  const isDeckUsableForFormat = (format) => {
    // If deck is invalid, it cannot be used
    if (!deckValidation.isValid) return false;
    
    // If no deck is selected, it cannot be used
    if (!selectedDeck || !selectedDeck.cards) return false;
    
    // If format is Future, any valid deck can be used
    if (format === 'Future') return true;
    
    // If format is Current, only non-future decks can be used
    if (format === 'Current') {
      return !hasFutureCards();
    }
    
    // Default: allow if deck is valid
    return true;
  };
  
  // Validate deck when selected deck changes
  useEffect(() => {
    const currentDeck = decks.find(d => d.id === selectedDeckId);
    if (currentDeck && currentDeck.cards) {
      const validation = validateDeckRules(currentDeck.cards, getCardDetails);
      setDeckValidation(validation);
    } else {
      setDeckValidation({ isValid: true, messages: [] });
    }
  }, [selectedDeckId, decks]);
  
  // Get logged-in user from auth
  const user = getUser();
  const username = user?.username || null;
  
  // Check if all loading is complete
  const isLoading = loadingDecks || !preferencesLoaded || profilePictureLoading;
  
  return (
    <LayoutContainer isDarkMode={isDarkMode}>
      {/* Content is sized in pixels based on 1920x1080 reference */}
      <div className={`relative w-[1920px] h-[1080px] flex ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
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
        {/* Left Sidebar - 20% (384px) */}
        <div className={`w-[384px] h-full border-r-2 flex flex-col px-4 py-4 overflow-y-auto ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-blue-50 border-gray-300'}`}>
          <div className={`flex-1 flex flex-col gap-4 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
            {/* Title Section */}
            <div className={`relative p-4 border-2 rounded ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-400'}`}>
              <div className="flex items-center gap-2 mb-2">
                <img 
                  src="/vite.svg" 
                  alt="Summoner's Base Logo" 
                  className="h-6 w-auto"
                />
                <h2 className={`text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Summoner's Base{!isProduction && ' [T]'}
                </h2>
              </div>
              <p className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                {preferencesLoaded ? (
                  <>Logged in as: {displayName || username || 'User'}</>
                ) : (
                  <span className="opacity-50">Loading...</span>
                )}
              </p>
              {/* Profile Picture Icon - Absolutely positioned on the right, vertically centered */}
              <div className="absolute right-4 top-1/2 -translate-y-1/2 flex items-center">
                {profilePictureLoading ? (
                  <div className={`w-[60px] h-[60px] rounded-full border flex items-center justify-center ${isDarkMode ? 'bg-gray-600 border-gray-500' : 'bg-gray-200 border-gray-300'}`}>
                    <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      ...
                    </div>
                  </div>
                ) : profilePictureUrl ? (
                  <img
                    src={profilePictureUrl}
                    alt="Profile"
                    className="w-[60px] h-[60px] rounded-full border object-cover"
                    style={{ borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' }}
                  />
                ) : (
                  <div className={`w-[60px] h-[60px] rounded-full border flex items-center justify-center ${isDarkMode ? 'bg-gray-600 border-gray-500' : 'bg-gray-200 border-gray-300'}`}>
                    <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      ?
                    </div>
                  </div>
                )}
              </div>
            </div>
            
            {/* Card View Section */}
            <div className={`p-4 border-2 rounded ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-400'}`}>
              <h3 className={`text-base font-bold mb-3 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                Legend
              </h3>
              <div className="w-full flex items-center justify-center">
                <div 
                  className={`w-full rounded border flex items-center justify-center overflow-hidden ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-200 border-gray-300'}`}
                  style={{ aspectRatio: '515/719' }}
                >
                    <img
                      src={getCardImageUrl(legendCard, cardsData)}
                    alt={legendCard ? `Legend ${legendCard}` : 'Card back'}
                    className="w-full h-full object-contain"
                  />
                </div>
              </div>
            </div>
            
            {/* Deck Section */}
            <div className={`p-4 border-2 rounded ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-400'}`}>
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-base font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Deck
                </h3>
                {/* Deck Validation Indicator */}
                <div className="relative group" data-deck-validation>
                  <div className="flex items-center gap-2 cursor-help">
                    {hasFutureCards() && (
                      <div className="bg-black/50 border-4 border-red-500 text-white text-[10px] font-bold px-1 py-0.5 rounded-full shadow-md">
                        Future
                      </div>
                    )}
                    <span className="text-lg">{deckValidation.isValid ? "✅" : "❌"}</span>
                    <span className={`text-xs font-medium ${deckValidation.isValid ? 'text-green-600' : 'text-red-600'}`}>
                      {deckValidation.isValid ? "Valid" : "Invalid"}
                    </span>
                  </div>
                  {/* Tooltip */}
                  <div className={`absolute right-0 top-full mt-2 z-50 w-64 p-3 rounded shadow-lg border-2 ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-400'} opacity-0 group-hover:opacity-100 pointer-events-none transition-opacity`}>
                    <div className="text-sm space-y-1">
                      {deckValidation.messages.length > 0 ? (
                        deckValidation.messages.map((msg, idx) => (
                          <div key={idx} className={msg.startsWith("✓") ? 'text-green-600' : 'text-red-600'}>
                            {msg.startsWith("✓") ? "• " : "• "}{msg.replace("✓ ", "")}
                          </div>
                        ))
                      ) : (
                        <div className="text-gray-500">No deck selected</div>
                      )}
                    </div>
                  </div>
                </div>
              </div>
              <div className="space-y-2">
                <select
                  value={selectedDeckId || ''}
                  onChange={handleDeckChange}
                  className={`w-full px-2 py-1 rounded border text-sm ${
                    isDarkMode 
                      ? 'bg-gray-600 border-gray-500 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                      : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                  }`}
                >
                  {sortedDecks.map(deck => {
                    const isDefault = deck.id === defaultDeckId;
                    return (
                      <option key={deck.id} value={deck.id}>
                        {deck.name}{isDefault ? ' ⭐' : ''}
                      </option>
                    );
                  })}
                </select>
                <div className="flex gap-2">
                  <button
                    onClick={handleEditDeck}
                    disabled={!selectedDeckId}
                    className={`flex-1 py-2 px-3 rounded text-xs font-medium bg-blue-600 text-white shadow-md hover:bg-blue-700 active:bg-blue-800 transition-colors ${!selectedDeckId ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    Edit
                  </button>
                  <button
                    onClick={handleSetAsDefault}
                    disabled={!selectedDeckId}
                    className={`flex-1 py-2 px-3 rounded text-xs font-medium bg-blue-600 text-white shadow-md hover:bg-blue-700 active:bg-blue-800 transition-colors ${!selectedDeckId ? 'opacity-50 cursor-not-allowed' : ''}`}
                  >
                    Set as Default
                  </button>
                </div>
              </div>
            </div>
            
            {/* Controls Section */}
            <div className={`p-4 border-2 rounded ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-400'}`}>
              <h3 className={`text-base font-bold mb-3 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                Controls
              </h3>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleDeckBuilder}
                  className={`py-2 px-3 rounded text-sm font-medium bg-blue-600 text-white shadow-md hover:bg-blue-700 active:bg-blue-800 transition-colors`}
                >
                  Deck Builder
                </button>
                
                <button
                  onClick={() => {
                    window.location.href = '/profile';
                  }}
                  className={`py-2 px-3 rounded text-sm font-medium bg-gray-600 text-white shadow-md hover:bg-gray-700 active:bg-gray-800 transition-colors`}
                >
                  Profile
                </button>
                
                <button
                  onClick={() => {
                    // TODO: Implement history functionality
                    console.log('History clicked');
                  }}
                  disabled={isProduction}
                  className={`py-2 px-3 rounded text-sm font-medium transition-colors ${
                    isProduction
                      ? 'bg-gray-400 text-gray-600 cursor-not-allowed opacity-50'
                      : 'bg-gray-600 text-white shadow-md hover:bg-gray-700 active:bg-gray-800'
                  }`}
                >
                  History
                </button>
                
                <button
                  onClick={handleLogout}
                  className={`py-2 px-3 rounded text-sm font-medium bg-red-600 text-white shadow-md hover:bg-red-700 active:bg-red-800 transition-colors`}
                >
                  Logout
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Main Content Area - 60% (1152px) */}
        <div className={`flex-1 h-full flex flex-col px-4 py-4 gap-4 min-h-0 ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
          {/* Queue Section */}
          <div className={`flex-shrink-0 p-4 border-2 rounded ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-gray-100 border-gray-400'}`}>
            <h3 className={`text-base font-bold mb-3 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              Ranked Ladder
            </h3>
            <div className="flex items-center gap-3">
              <label className={`text-sm font-medium whitespace-nowrap ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Format:
              </label>
              <select
                value={queueForm.format}
                onChange={(e) => handleQueueFormChange('format', e.target.value)}
                className={`px-3 py-2 rounded border text-sm ${
                  isDarkMode 
                    ? 'bg-gray-600 border-gray-500 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                    : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                }`}
              >
                <option value="Current">Current</option>
                <option value="Future">Future</option>
              </select>
              
              <label className={`text-sm font-medium whitespace-nowrap ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Match Type:
              </label>
              <select
                value={queueForm.matchType}
                onChange={(e) => handleQueueFormChange('matchType', e.target.value)}
                className={`px-3 py-2 rounded border text-sm ${
                  isDarkMode 
                    ? 'bg-gray-600 border-gray-500 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                    : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                }`}
              >
                <option value="Best of 3">Best of 3</option>
                <option value="Single">Single</option>
              </select>
              
              <button
                onClick={handleJoinQueue}
                disabled={!isDeckUsableForFormat(queueForm.format) || hostedLobbyId !== null}
                className={`ml-auto px-4 py-2 rounded text-sm font-medium transition-colors ${
                  isDeckUsableForFormat(queueForm.format) && hostedLobbyId === null
                    ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700 active:bg-blue-800'
                    : 'bg-gray-400 text-gray-600 cursor-not-allowed opacity-50'
                }`}
              >
                Join Queue
              </button>
            </div>
          </div>
          
          {/* Lobbies Section */}
          <div className={`flex-1 border-2 rounded p-4 min-h-0 flex flex-col ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-gray-100 border-gray-400'}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-base font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                Open Lobbies <span className="font-normal">({filteredLobbies.length})</span>
              </h3>
              <button
                onClick={handleRefreshLobbies}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  isDarkMode
                    ? 'bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                }`}
                title="Refresh lobbies"
              >
                ↻ Refresh
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {filteredLobbies.length === 0 ? (
                <div className={`text-center py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  No lobbies available
                </div>
              ) : (
                filteredLobbies.map((lobby) => {
                  const isUsable = isDeckUsableForFormat(lobby.format);
                  const isDisabled = hostedLobbyId !== null;
                  const canInteract = isUsable && !isDisabled;
                  
                  return (
                    <div
                      key={lobby.id}
                      className="relative"
                    >
                      <div
                        onClick={() => canInteract && handleJoinLobby(lobby)}
                        className={`p-3 border-2 rounded transition-colors ${
                          canInteract
                            ? `cursor-pointer ${
                                isDarkMode 
                                  ? 'bg-gray-700 border-gray-600 hover:bg-gray-600 hover:border-blue-400' 
                                  : 'bg-white border-gray-300 hover:bg-gray-50 hover:border-blue-500'
                              }`
                            : `cursor-not-allowed ${
                                isDarkMode 
                                  ? 'bg-gray-700 border-gray-600' 
                                  : 'bg-white border-gray-300'
                              }`
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 flex items-center gap-3">
                            {/* Profile Picture */}
                            <div className="flex-shrink-0">
                              {lobbyProfilePictures[lobby.id] ? (
                                <img
                                  src={lobbyProfilePictures[lobby.id]}
                                  alt={`${lobby.username}'s profile`}
                                  className="w-12 h-12 rounded-full border-2 object-cover"
                                  style={{ borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' }}
                                  onError={(e) => {
                                    console.warn('Profile picture failed to load for lobby:', lobby.id);
                                  }}
                                />
                              ) : (
                                <div className={`w-12 h-12 rounded-full border-2 flex items-center justify-center ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-200 border-gray-300'}`}>
                                  <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                    ...
                                  </div>
                                </div>
                              )}
                            </div>
                            {/* Username and Description */}
                            <div className="flex-1">
                              <div className={`text-lg font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                                {lobby.username}
                              </div>
                              {lobby.description && (
                                <div className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                                  {lobby.description}
                                </div>
                              )}
                            </div>
                          </div>
                          <div className="flex flex-col items-end">
                            <div className={`text-xs px-2 py-1 rounded mb-2 ${lobby.privacy === 'Locked' ? (isDarkMode ? 'bg-yellow-900 text-yellow-200' : 'bg-yellow-100 text-yellow-800') : 'invisible'}`}>
                              🔒 Locked
                            </div>
                            <div className={`text-xs text-right ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                              <div className="flex items-center justify-end gap-1">
                                {lobby.format === 'Future' ? (
                                  <div className="bg-black/50 border-4 border-red-500 text-white text-[10px] font-bold px-1 py-0.5 rounded-full shadow-md">
                                    Future
                                  </div>
                                ) : (
                                  <div className="bg-black/50 border-4 border-green-500 text-white text-[10px] font-bold px-1 py-0.5 rounded-full shadow-md">
                                    Current
                                  </div>
                                )}
                              </div>
                              <div className="mt-1">
                                {lobby.matchType}
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                      {!canInteract && (
                        <div 
                          className={`absolute inset-0 rounded pointer-events-auto ${
                            isDarkMode 
                              ? 'bg-gray-900/70 border-2 border-gray-600' 
                              : 'bg-white/70 border-2 border-gray-300'
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
          
          {/* Games Section */}
          <div className={`flex-1 border-2 rounded p-4 min-h-0 flex flex-col ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-gray-100 border-gray-400'}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className={`text-base font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                Ongoing Games <span className="font-normal">({filteredGames.length})</span>
              </h3>
              <button
                onClick={handleRefreshGames}
                className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                  isDarkMode
                    ? 'bg-gray-700 text-gray-200 hover:bg-gray-600 border border-gray-600'
                    : 'bg-white text-gray-700 hover:bg-gray-50 border border-gray-300'
                }`}
                title="Refresh games"
              >
                ↻ Refresh
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2">
              {filteredGames.length === 0 ? (
                <div className={`text-center py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  No ongoing games
                </div>
              ) : (
                filteredGames.map((game) => {
                  const hostLegendData = getCardDetails(game.hostLegend);
                  const joinerLegendData = getCardDetails(game.joinerLegend);
                  const isDisabled = hostedLobbyId !== null;
                  
                  return (
                    <div
                      key={game.id}
                      className="relative"
                    >
                      <div
                        className={`p-3 border-2 rounded ${
                          isDisabled
                            ? `cursor-not-allowed ${
                                isDarkMode 
                                  ? 'bg-gray-700 border-gray-600' 
                                  : 'bg-white border-gray-300'
                              }`
                            : `${
                                isDarkMode 
                                  ? 'bg-gray-700 border-gray-600' 
                                  : 'bg-white border-gray-300'
                              }`
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          {/* Left side: Host legend image and name */}
                          <div className="flex items-center gap-2 flex-1">
                            <div 
                              className="w-12 h-16 rounded border overflow-hidden flex-shrink-0"
                              style={{ aspectRatio: '515/719' }}
                            >
                              <img 
                                src={getCardImageUrl(game.hostLegend, cardsData)}
                                alt={hostLegendData?.name || 'Host Legend'}
                                className="w-full h-full object-contain"
                              />
                            </div>
                            <div className="flex flex-col">
                              <div className={`text-sm font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                                {game.host}
                              </div>
                              {hostLegendData?.name && (
                                <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                  {hostLegendData.name}
                                </div>
                              )}
                            </div>
                          </div>
                          
                          {/* Center: Match details */}
                          <div className="flex flex-col items-center gap-1 flex-1 text-center">
                            <div className={`text-sm font-bold mb-1 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                              {game.description || 'Ongoing Match'}
                            </div>
                            <div className={`text-xs ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                              <div className="flex items-center justify-center gap-1">
                                {game.format === 'Future' ? (
                                  <div className="bg-black/50 border-4 border-red-500 text-white text-[10px] font-bold px-1 py-0.5 rounded-full shadow-md">
                                    Future
                                  </div>
                                ) : (
                                  <div className="bg-black/50 border-4 border-green-500 text-white text-[10px] font-bold px-1 py-0.5 rounded-full shadow-md">
                                    Current
                                  </div>
                                )}
                              </div>
                              <div className="mt-1">
                                {game.matchType}
                              </div>
                            </div>
                          </div>
                          
                          {/* Right side: Joiner name and legend image */}
                          <div className="flex items-center gap-2 flex-1 justify-end">
                            <div className="flex flex-col items-end">
                              <div className={`text-sm font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                                {game.joiner}
                              </div>
                              {joinerLegendData?.name && (
                                <div className={`text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                                  {joinerLegendData.name}
                                </div>
                              )}
                            </div>
                            <div 
                              className="w-12 h-16 rounded border overflow-hidden flex-shrink-0"
                              style={{ aspectRatio: '515/719' }}
                            >
                              <img 
                                src={getCardImageUrl(game.joinerLegend, cardsData)}
                                alt={joinerLegendData?.name || 'Joiner Legend'}
                                className="w-full h-full object-contain"
                              />
                            </div>
                          </div>
                        </div>
                      </div>
                      {isDisabled && (
                        <div 
                          className={`absolute inset-0 rounded pointer-events-auto ${
                            isDarkMode 
                              ? 'bg-gray-900/70 border-2 border-gray-600' 
                              : 'bg-white/70 border-2 border-gray-300'
                          }`}
                          onClick={(e) => e.stopPropagation()}
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>
        
        {/* Right Sidebar - 20% (384px) */}
        <div className={`w-[384px] h-full border-l-2 flex flex-col px-4 py-4 overflow-y-auto ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-blue-50 border-gray-300'}`}>
          <div className={`flex-1 flex flex-col gap-4 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
            {/* Filter Section */}
            <div className={`p-4 border-2 rounded ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-400'}`}>
              <h3 className={`text-base font-bold mb-3 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                Filter
              </h3>
              <div className="space-y-3">
                {/* Username filter */}
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Username
                  </label>
                  <input
                    type="text"
                    value={filters.username}
                    onChange={(e) => handleFilterChange('username', e.target.value)}
                    className={`w-full px-2 py-1 rounded border text-sm ${
                      isDarkMode 
                        ? 'bg-gray-600 border-gray-500 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                        : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                    }`}
                    placeholder="Username"
                  />
                </div>
                
                {/* Description filter */}
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Description
                  </label>
                  <input
                    type="text"
                    value={filters.description}
                    onChange={(e) => handleFilterChange('description', e.target.value)}
                    className={`w-full px-2 py-1 rounded border text-sm ${
                      isDarkMode 
                        ? 'bg-gray-600 border-gray-500 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                        : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                    }`}
                    placeholder="Description"
                  />
                </div>
                
                {/* Match Type filter */}
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Match Type
                  </label>
                  <select
                    value={filters.matchType}
                    onChange={(e) => handleFilterChange('matchType', e.target.value)}
                    className={`w-full px-2 py-1 rounded border text-sm ${
                      isDarkMode 
                        ? 'bg-gray-600 border-gray-500 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                        : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                    }`}
                  >
                    <option value="Any">Any</option>
                    <option value="Best of 3">Best of 3</option>
                    <option value="Single Game">Single Game</option>
                  </select>
                </div>
                
                {/* Privacy filter */}
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Privacy
                  </label>
                  <select
                    value={filters.privacy}
                    onChange={(e) => handleFilterChange('privacy', e.target.value)}
                    className={`w-full px-2 py-1 rounded border text-sm ${
                      isDarkMode 
                        ? 'bg-gray-600 border-gray-500 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                        : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                    }`}
                  >
                    <option value="Any">Any</option>
                    <option value="Locked">Locked</option>
                    <option value="Unlocked">Unlocked</option>
                  </select>
                </div>
                
                {/* Format filter */}
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Format
                  </label>
                  <select
                    value={filters.format}
                    onChange={(e) => handleFilterChange('format', e.target.value)}
                    className={`w-full px-2 py-1 rounded border text-sm ${
                      isDarkMode 
                        ? 'bg-gray-600 border-gray-500 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                        : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                    }`}
                  >
                    <option value="Any">Any</option>
                    <option value="Current">Current</option>
                    <option value="Future">Future</option>
                  </select>
                </div>
                
                {/* Reset Filters Button */}
                <button
                  onClick={handleResetFilters}
                  className={`w-full py-2 px-3 rounded text-sm font-medium transition-colors bg-blue-600 text-white shadow-md hover:bg-blue-700 active:bg-blue-800`}
                >
                  Reset Filters
                </button>
              </div>
            </div>
            
            {/* Host Section */}
            <div className={`p-4 border-2 rounded ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-400'}`}>
              <h3 className={`text-base font-bold mb-3 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                Host
              </h3>
              {hostedLobbyId ? (
                // Hosted lobby view
                <div className="space-y-3">
                  {/* Applicants list */}
                  <div>
                    <label className={`block text-xs font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Applicants
                    </label>
                    <div className={`max-h-48 overflow-y-auto space-y-2 border rounded p-2 ${
                      isDarkMode 
                        ? 'bg-gray-600 border-gray-500' 
                        : 'bg-gray-50 border-gray-300'
                    }`}>
                      {applicants.length === 0 ? (
                        <div className={`text-center py-4 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                          No applicants yet
                        </div>
                      ) : (
                        applicants.map((applicant, index) => (
                          <div
                            key={index}
                            className={`p-2 rounded border cursor-pointer transition-colors ${
                              isDarkMode
                                ? 'bg-gray-700 border-gray-600 hover:bg-gray-600 hover:border-blue-400'
                                : 'bg-white border-gray-300 hover:bg-gray-50 hover:border-blue-500'
                            }`}
                            onClick={() => {
                              // TODO: Show modal to confirm duel with applicant
                              console.log('[Homepage] Applicant clicked:', applicant);
                            }}
                          >
                            <div className={`text-sm font-medium ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                              {applicant.username || applicant.name || 'Unknown User'}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                  
                  {/* Cancel button */}
                  <button
                    onClick={handleCancelHost}
                    className="w-full py-2 px-3 rounded text-sm font-medium transition-colors bg-red-600 text-white shadow-md hover:bg-red-700 active:bg-red-800"
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                // Host form view
                <div className="space-y-3">
                  {/* Format dropdown */}
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Format
                    </label>
                    <select
                      value={hostForm.format}
                      onChange={(e) => handleHostFormChange('format', e.target.value)}
                      className={`w-full px-2 py-1 rounded border text-sm ${
                        isDarkMode 
                          ? 'bg-gray-600 border-gray-500 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                          : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                      }`}
                    >
                      <option value="Current">Current</option>
                      <option value="Future">Future</option>
                    </select>
                  </div>
                  
                  {/* Type dropdown */}
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Type
                    </label>
                    <select
                      value={hostForm.type}
                      onChange={(e) => handleHostFormChange('type', e.target.value)}
                      className={`w-full px-2 py-1 rounded border text-sm ${
                        isDarkMode 
                          ? 'bg-gray-600 border-gray-500 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                          : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                      }`}
                    >
                      <option value="Best of 3">Best of 3</option>
                      <option value="Single Game">Single Game</option>
                    </select>
                  </div>
                  
                  {/* Description text box */}
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Description
                    </label>
                    <input
                      type="text"
                      value={hostForm.description}
                      onChange={(e) => handleHostFormChange('description', e.target.value)}
                      className={`w-full px-2 py-1 rounded border text-sm ${
                        isDarkMode 
                          ? 'bg-gray-600 border-gray-500 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                          : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                      }`}
                      placeholder="Description"
                    />
                  </div>
                  
                  {/* Password text box */}
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Password
                    </label>
                    <input
                      type="password"
                      value={hostForm.password}
                      onChange={(e) => handleHostFormChange('password', e.target.value)}
                      className={`w-full px-2 py-1 rounded border text-sm ${
                        isDarkMode 
                          ? 'bg-gray-600 border-gray-500 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                          : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                      }`}
                      placeholder="Password (optional)"
                    />
                  </div>
                  
                  {/* Host button */}
                  <button
                    onClick={handleHostMatch}
                    disabled={!isDeckUsableForFormat(hostForm.format)}
                    className={`w-full py-2 px-3 rounded text-sm font-medium transition-colors ${
                      isDeckUsableForFormat(hostForm.format)
                        ? 'bg-green-600 text-white shadow-md hover:bg-green-700 active:bg-green-800'
                        : 'bg-gray-400 text-gray-600 cursor-not-allowed opacity-50'
                    }`}
                  >
                    Host
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
        
        {/* Under Construction Overlay - covers middle section and right sidebar - only shown in production environment */}
        {isProduction && (
          <div 
            className="absolute left-[384px] right-0 top-0 bottom-0 z-40 flex items-center justify-center pointer-events-auto"
            style={{ 
              backgroundColor: isDarkMode ? 'rgba(17, 24, 39, 0.85)' : 'rgba(255, 255, 255, 0.85)'
            }}
          >
            <div className="text-center">
              <div className={`text-6xl font-bold mb-4 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                Under Construction
              </div>
              <div className={`text-xl ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                This section is currently being developed
              </div>
            </div>
          </div>
        )}
      </div>
      
      {/* Password Modal */}
      {passwordModal.isOpen && passwordModal.lobby && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={handlePasswordCancel}
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        >
          <div 
            className={`w-96 p-6 rounded-lg border-2 shadow-xl ${
              isDarkMode 
                ? 'bg-gray-800 border-gray-600' 
                : 'bg-white border-gray-400'
            }`}
            style={{ transform: `scale(${containerScale})`, transformOrigin: 'center center' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={`text-xl font-bold mb-4 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              Enter Password
            </h3>
            
            <div className={`mb-4 p-4 rounded border ${
              isDarkMode 
                ? 'bg-gray-700 border-gray-600' 
                : 'bg-gray-50 border-gray-300'
            }`}>
              <div className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Host:
              </div>
              <div className={`text-lg font-bold mb-3 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                {passwordModal.lobby.username}
              </div>
              
              {passwordModal.lobby.description && (
                <>
                  <div className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Description:
                  </div>
                  <div className={`text-sm mb-3 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    {passwordModal.lobby.description}
                  </div>
                </>
              )}
            </div>
            
            <div className="mb-4">
              <label className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Password:
              </label>
              <input
                type="password"
                value={passwordModal.password}
                onChange={(e) => handlePasswordChange(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handlePasswordSubmit();
                  }
                }}
                autoFocus
                className={`w-full px-3 py-2 rounded border text-sm ${
                  isDarkMode 
                    ? 'bg-gray-600 border-gray-500 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                    : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                }`}
                placeholder="Enter lobby password"
              />
            </div>
            
            <div className="flex gap-3">
              <button
                onClick={handlePasswordCancel}
                className={`flex-1 py-2 px-4 rounded text-sm font-medium transition-colors ${
                  isDarkMode
                    ? 'bg-gray-600 text-gray-200 hover:bg-gray-500'
                    : 'bg-gray-500 text-white hover:bg-gray-600'
                }`}
              >
                Cancel
              </button>
              <button
                onClick={handlePasswordSubmit}
                className="flex-1 py-2 px-4 rounded text-sm font-medium transition-colors bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800"
              >
                OK
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Join Lobby Modal */}
      {joinLobbyModal.isOpen && joinLobbyModal.lobby && (
        <div 
          className="fixed inset-0 z-50 flex items-center justify-center"
          onClick={handleCancelJoinLobby}
          style={{ backgroundColor: 'rgba(0, 0, 0, 0.5)' }}
        >
          <div 
            className={`w-96 p-6 rounded-lg border-2 shadow-xl ${
              isDarkMode 
                ? 'bg-gray-800 border-gray-600' 
                : 'bg-white border-gray-400'
            }`}
            style={{ transform: `scale(${containerScale})`, transformOrigin: 'center center' }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className={`text-xl font-bold mb-4 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              Joining Lobby
            </h3>
            
            <div className={`mb-4 p-4 rounded border ${
              isDarkMode 
                ? 'bg-gray-700 border-gray-600' 
                : 'bg-gray-50 border-gray-300'
            }`}>
              <div className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                Host:
              </div>
              <div className={`text-lg font-bold mb-3 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                {joinLobbyModal.lobby.username}
              </div>
              
              {joinLobbyModal.lobby.description && (
                <>
                  <div className={`text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Description:
                  </div>
                  <div className={`text-sm mb-3 ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                    {joinLobbyModal.lobby.description}
                  </div>
                </>
              )}
              
              <div className="flex items-center gap-2 mb-2">
                <div className={`text-sm font-medium ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                  Format:
                </div>
                {joinLobbyModal.lobby.format === 'Future' ? (
                  <div className="bg-black/50 border-4 border-red-500 text-white text-[10px] font-bold px-1 py-0.5 rounded-full shadow-md">
                    Future
                  </div>
                ) : (
                  <div className="bg-black/50 border-4 border-green-500 text-white text-[10px] font-bold px-1 py-0.5 rounded-full shadow-md">
                    Current
                  </div>
                )}
              </div>
              
              <div className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-600'}`}>
                <span className="font-medium">Match Type: </span>
                {joinLobbyModal.lobby.matchType}
              </div>
            </div>
            
            <div className={`mb-4 p-3 rounded ${
              isDarkMode 
                ? 'bg-blue-900/30 border border-blue-700' 
                : 'bg-blue-50 border border-blue-200'
            }`}>
              <div className={`text-sm ${isDarkMode ? 'text-blue-200' : 'text-blue-800'}`}>
                ⏳ Waiting for host approval...
              </div>
            </div>
            
            <button
              onClick={handleCancelJoinLobby}
              className={`w-full py-2 px-4 rounded text-sm font-medium transition-colors ${
                isDarkMode
                  ? 'bg-gray-600 text-gray-200 hover:bg-gray-500'
                  : 'bg-gray-500 text-white hover:bg-gray-600'
              }`}
            >
              Cancel
            </button>
          </div>
        </div>
      )}
      
      {/* Toast Notifications */}
      <div className="fixed top-4 right-4 z-[10000] flex flex-col gap-2 pointer-events-none">
        {toasts.map((toast) => (
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
    </LayoutContainer>
  );
}

export default Homepage;

