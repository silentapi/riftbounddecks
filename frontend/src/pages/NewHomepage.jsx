import { useState, useEffect } from 'react';
import LayoutContainer from '../components/LayoutContainer';
import { getTheme, setTheme as setThemeLocal } from '../utils/deckStorage';
import { getUser, logout as authLogout } from '../utils/auth';
import { getPreferences } from '../utils/preferencesApi';
import { getProfilePictureUrl } from '../utils/profilePicture';

function Homepage() {
  // Check if we're in production environment (defaults to 'test' if not set)
  const environment =
    import.meta.env.VITE_ENVIRONMENT ??
    import.meta.env.REACT_APP_ENV ??
    'test';
  const isProduction = environment === 'prod' || environment === 'production';
  
  // Dark mode state - initialize from localStorage (will be updated from API)
  const [isDarkMode, setIsDarkMode] = useState(() => getTheme() === 'dark');
  
  // Profile picture state
  const [profilePictureUrl, setProfilePictureUrl] = useState(null);
  const [profilePictureLoading, setProfilePictureLoading] = useState(true);
  
  // Display name state
  const [displayName, setDisplayName] = useState(null);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  
  // Load preferences on mount
  useEffect(() => {
    const loadData = async () => {
      try {
        console.log('[Homepage] Loading preferences from API...');
        
        // Load preferences from API
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
        
        // Load profile picture from preferences
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
        
        // Set display name from preferences
        setDisplayName(preferences?.displayName || null);
        setPreferencesLoaded(true);
      } catch (error) {
        console.error('[Homepage] Error loading data:', error);
        setPreferencesLoaded(true);
        setProfilePictureLoading(false);
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
        const { updatePreferences } = await import('../utils/preferencesApi');
        await updatePreferences({ theme: isDarkMode ? 'dark' : 'light' });
        setThemeLocal(isDarkMode ? 'dark' : 'light');
      } catch (error) {
        console.error('[Homepage] Error updating theme preference:', error);
      }
    };
    
    // Only update if we've loaded preferences (avoid updating on initial mount)
    if (preferencesLoaded) {
      updateTheme();
    }
  }, [isDarkMode, preferencesLoaded]);
  
  // Handle logout
  const handleLogout = async () => {
    await authLogout();
    window.location.href = '/login';
  };
  
  // Handle navigation to deck builder
  const handleDeckBuilder = () => {
    window.location.href = '/deck';
  };
  
  // Get logged-in user from auth
  const user = getUser();
  const username = user?.username || null;
  
  // Check if all loading is complete
  const isLoading = !preferencesLoaded || profilePictureLoading;
  
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
          {/* Empty center area - can be filled with content later */}
        </div>
        
        {/* Right Sidebar - 20% (384px) */}
        <div className={`w-[384px] h-full border-l-2 flex flex-col px-4 py-4 overflow-y-auto ${isDarkMode ? 'bg-gray-800 border-gray-700' : 'bg-blue-50 border-gray-300'}`}>
          {/* Empty right sidebar - can be filled with content later */}
        </div>
      </div>
    </LayoutContainer>
  );
}

export default Homepage;

