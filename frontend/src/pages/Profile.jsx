import { useState, useEffect, useRef } from 'react';
import LayoutContainer from '../components/LayoutContainer';
import { getUser, changePassword } from '../utils/auth';
import { getTheme } from '../utils/deckStorage';
import { getProfilePictureUrl } from '../utils/profilePicture';
import { getPreferences, updatePreferences, getRegistrationKeys } from '../utils/preferencesApi';

function Profile() {
  // Dark mode state - initialize from localStorage
  const [isDarkMode, setIsDarkMode] = useState(() => getTheme() === 'dark');
  
  // Profile picture state
  const [profilePictureUrl, setProfilePictureUrl] = useState(null);
  const [profilePictureLoading, setProfilePictureLoading] = useState(true);
  const [profileCardId, setProfileCardId] = useState('OGN-155'); // Default fallback
  const profilePictureUrlRef = useRef(null); // Track current URL to prevent unnecessary resets
  
  // Preferences form state
  const [preferencesForm, setPreferencesForm] = useState({
    theme: 'dark',
    defaultDeckId: '',
    screenshotMode: 'full',
    profilePictureCardId: 'OGN-155',
    displayName: ''
  });
  
  // Decklist defaults form state
  const [decklistDefaultsForm, setDecklistDefaultsForm] = useState({
    firstName: '',
    lastName: '',
    riotId: ''
  });
  const [updatingDecklistDefaults, setUpdatingDecklistDefaults] = useState(false);
  const [preferencesLoading, setPreferencesLoading] = useState(true);
  const [updatingPreferences, setUpdatingPreferences] = useState(false);
  
  // Saved display name (only updated after successful API call)
  const [savedDisplayName, setSavedDisplayName] = useState(null);
  
  // Registration keys state
  const [registrationKeys, setRegistrationKeys] = useState([]);
  const [registrationKeysLoading, setRegistrationKeysLoading] = useState(true);
  
  // Change password form state
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [changingPassword, setChangingPassword] = useState(false);
  const [passwordError, setPasswordError] = useState('');
  
  // Toast notifications state
  const [toasts, setToasts] = useState([]);
  
  // Container scale for modal scaling
  const [containerScale, setContainerScale] = useState(1);
  
  // Profile picture selector modal state
  const [profilePictureModal, setProfilePictureModal] = useState({
    isOpen: false,
    loadingPictures: true,
    pictureUrls: {} // Map of cardId -> dataUrl
  });
  
  // Approved profile picture card IDs (30 cards total)
  const approvedProfileCardIds = [
    'OGN-027', 'OGN-028', 'OGN-030', 'OGN-035', 'OGN-036', 'OGN-066',
    'OGN-068', 'OGN-073', 'OGN-074', 'OGN-076', 'OGN-109', 'OGN-110',
    'OGN-111', 'OGN-112', 'OGN-113', 'OGN-117', 'OGN-151', 'OGN-155',
    'OGN-159', 'OGN-189', 'OGN-194', 'OGN-197', 'OGN-200', 'OGN-232', 'OGN-235',
    'OGN-238', 'OGN-240', 'OGN-241', 'OGS-010', 'OGS-004'
  ];
  
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
  
  // Get logged-in user from auth
  const user = getUser();
  const username = user?.username || 'User';
  
  // Load preferences on mount
  useEffect(() => {
    const loadPreferences = async () => {
      try {
        // Fetch preferences from API
        const preferences = await getPreferences();
        const cardId = preferences?.profilePictureCardId || 'OGN-155';
        
        // Set form state with loaded preferences
        setPreferencesForm({
          theme: preferences?.theme || 'dark',
          defaultDeckId: preferences?.defaultDeckId || '',
          screenshotMode: preferences?.screenshotMode || 'full',
          profilePictureCardId: preferences?.profilePictureCardId || 'OGN-155',
          displayName: preferences?.displayName || ''
        });
        
        // Set decklist defaults form state
        setDecklistDefaultsForm({
          firstName: preferences?.firstName || '',
          lastName: preferences?.lastName || '',
          riotId: preferences?.riotId || ''
        });
        
        // Set saved display name (for display purposes)
        setSavedDisplayName(preferences?.displayName || null);
        
        // Update dark mode if theme changed
        if (preferences?.theme) {
          setIsDarkMode(preferences.theme === 'dark');
        }
        
        // Set profile card ID (this will trigger the useEffect to load the picture)
        setProfileCardId(cardId);
        // Clear the ref when loading new preferences
        profilePictureUrlRef.current = null;
      } catch (error) {
        console.error('Error loading preferences:', error);
        // Fallback to default card ID if preferences fail
        setProfileCardId('OGN-155');
      } finally {
        setPreferencesLoading(false);
      }
    };
    
    loadPreferences();
  }, []);
  
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
  
  // Load registration keys on mount
  useEffect(() => {
    const loadRegistrationKeys = async () => {
      try {
        setRegistrationKeysLoading(true);
        const keys = await getRegistrationKeys();
        setRegistrationKeys(keys);
      } catch (error) {
        console.error('Error loading registration keys:', error);
        setRegistrationKeys([]);
      } finally {
        setRegistrationKeysLoading(false);
      }
    };
    
    loadRegistrationKeys();
  }, []);
  
  // Reload profile picture when profileCardId changes (after preferences are saved)
  useEffect(() => {
    if (profileCardId) {
      let isCancelled = false;
      
      const loadPicture = async () => {
        try {
          setProfilePictureLoading(true);
          const url = await getProfilePictureUrl(profileCardId);
          
          // Only update if this effect hasn't been cancelled (cardId hasn't changed)
          if (!isCancelled) {
            if (url) {
              setProfilePictureUrl(url);
              profilePictureUrlRef.current = url;
            } else {
              // Only set to null if we got a null response and don't have a previous URL
              // This prevents showing default when there's a transient error
              if (!profilePictureUrlRef.current) {
                setProfilePictureUrl(null);
              }
              console.warn('Profile picture URL is null for cardId:', profileCardId);
            }
          }
        } catch (error) {
          console.error('Error loading profile picture:', error);
          // Don't reset to null on error - keep previous image if available
          // Only set to null if this is the initial load (no previous URL)
          if (!isCancelled && !profilePictureUrlRef.current) {
            setProfilePictureUrl(null);
          }
        } finally {
          if (!isCancelled) {
            setProfilePictureLoading(false);
          }
        }
      };
      
      loadPicture();
      
      // Cleanup function to prevent race conditions
      return () => {
        isCancelled = true;
      };
    }
  }, [profileCardId]);
  
  // Update theme class when isDarkMode changes
  useEffect(() => {
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);
  
  // Handle navigation back to main screen
  const handleExit = () => {
    window.location.href = '/';
  };
  
  // Handle preference form field changes
  const handlePreferenceChange = (field, value) => {
    setPreferencesForm(prev => ({ ...prev, [field]: value }));
    // Do not update anything until Update button is clicked
  };
  
  // Handle decklist defaults form field changes
  const handleDecklistDefaultsChange = (field, value) => {
    setDecklistDefaultsForm(prev => ({ ...prev, [field]: value }));
  };
  
  // Handle update decklist defaults
  const handleUpdateDecklistDefaults = async () => {
    try {
      setUpdatingDecklistDefaults(true);
      
      // Prepare updates object
      const updates = {
        firstName: decklistDefaultsForm.firstName || null,
        lastName: decklistDefaultsForm.lastName || null,
        riotId: decklistDefaultsForm.riotId || null
      };
      
      const updatedPreferences = await updatePreferences(updates);
      
      // Update form state with server response
      setDecklistDefaultsForm({
        firstName: updatedPreferences.firstName || '',
        lastName: updatedPreferences.lastName || '',
        riotId: updatedPreferences.riotId || ''
      });
      
      // Show success toast
      addToast('Decklist defaults updated successfully!', 2000);
    } catch (error) {
      console.error('Error updating decklist defaults:', error);
      // Show error toast
      addToast(error.message || 'Failed to update decklist defaults', 3000);
    } finally {
      setUpdatingDecklistDefaults(false);
    }
  };
  
  // Open profile picture selector modal
  const openProfilePictureModal = async () => {
    setProfilePictureModal({
      isOpen: true,
      loadingPictures: true,
      pictureUrls: {}
    });
    
    // Pre-load all profile pictures
    const picturePromises = approvedProfileCardIds.map(async (cardId) => {
      try {
        const url = await getProfilePictureUrl(cardId);
        return { cardId, url };
      } catch (error) {
        console.error(`Error loading profile picture for ${cardId}:`, error);
        return { cardId, url: null };
      }
    });
    
    const results = await Promise.all(picturePromises);
    const pictureUrls = {};
    results.forEach(({ cardId, url }) => {
      if (url) {
        pictureUrls[cardId] = url;
      }
    });
    
    setProfilePictureModal(prev => ({
      ...prev,
      loadingPictures: false,
      pictureUrls
    }));
  };
  
  // Close profile picture selector modal
  const closeProfilePictureModal = () => {
    setProfilePictureModal({
      isOpen: false,
      loadingPictures: true,
      pictureUrls: {}
    });
  };
  
  // Handle profile picture selection
  const handleProfilePictureSelect = async (cardId) => {
    try {
      // Update preferences with new profile picture card ID
      await updatePreferences({ profilePictureCardId: cardId });
      
      // Clear the ref when changing card ID
      profilePictureUrlRef.current = null;
      
      // Update local state
      setProfileCardId(cardId);
      setPreferencesForm(prev => ({
        ...prev,
        profilePictureCardId: cardId
      }));
      
      // Close modal
      closeProfilePictureModal();
      
      // Show success toast
      addToast('Profile picture updated!', 2000);
    } catch (error) {
      console.error('Error updating profile picture:', error);
      addToast('Failed to update profile picture', 3000);
    }
  };
  
  // Copy registration key to clipboard
  const copyRegistrationKey = async (key) => {
    try {
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(key);
        addToast('Invite code copied to clipboard!', 2000);
        return;
      }
      
      // Fallback: Create a temporary textarea element
      const textarea = document.createElement('textarea');
      textarea.value = key;
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
          addToast('Invite code copied to clipboard!', 2000);
        } else {
          throw new Error('execCommand copy failed');
        }
      } catch (err) {
        document.body.removeChild(textarea);
        throw err;
      }
    } catch (error) {
      console.error('Error copying to clipboard:', error);
      addToast('Failed to copy invite code', 2000);
    }
  };
  
  // Copy registration link to clipboard
  const copyRegistrationLink = async (key) => {
    try {
      const baseUrl = window.location.origin;
      const registrationUrl = `${baseUrl}/register/${key}`;
      
      // Try modern clipboard API first
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(registrationUrl);
        addToast('Registration link copied to clipboard!', 2000);
        return;
      }
      
      // Fallback: Create a temporary textarea element
      const textarea = document.createElement('textarea');
      textarea.value = registrationUrl;
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
          addToast('Registration link copied to clipboard!', 2000);
        } else {
          throw new Error('execCommand copy failed');
        }
      } catch (err) {
        document.body.removeChild(textarea);
        throw err;
      }
    } catch (error) {
      console.error('Error copying registration link to clipboard:', error);
      addToast('Failed to copy registration link', 2000);
    }
  };
  
  // Handle update preferences
  const handleUpdatePreferences = async () => {
    try {
      setUpdatingPreferences(true);
      
      // Prepare updates object (only include defined values)
      const updates = {
        theme: preferencesForm.theme,
        screenshotMode: preferencesForm.screenshotMode,
        displayName: preferencesForm.displayName || null
      };
      
      const updatedPreferences = await updatePreferences(updates);
      
      // Update form state with server response
      setPreferencesForm({
        theme: updatedPreferences.theme || 'dark',
        defaultDeckId: updatedPreferences.defaultDeckId || '',
        screenshotMode: updatedPreferences.screenshotMode || 'full',
        profilePictureCardId: updatedPreferences.profilePictureCardId || 'OGN-155',
        displayName: updatedPreferences.displayName || ''
      });
      
      // Update saved display name only after successful API call
      setSavedDisplayName(updatedPreferences.displayName || null);
      
      // Apply theme change after successful update
      if (updatedPreferences.theme) {
        setIsDarkMode(updatedPreferences.theme === 'dark');
      }
      
      // Show success toast
      addToast('Preferences updated successfully!', 2000);
    } catch (error) {
      console.error('Error updating preferences:', error);
      // Show error toast
      addToast(error.message || 'Failed to update preferences', 3000);
    } finally {
      setUpdatingPreferences(false);
    }
  };
  
  // Handle password form field changes
  const handlePasswordChange = (field, value) => {
    setPasswordForm(prev => ({ ...prev, [field]: value }));
    // Clear error when user starts typing
    if (passwordError) {
      setPasswordError('');
    }
  };
  
  // Handle change password
  const handleChangePassword = async () => {
    // Clear previous errors
    setPasswordError('');
    
    // Client-side validation
    if (!passwordForm.currentPassword || !passwordForm.newPassword || !passwordForm.confirmPassword) {
      setPasswordError('All fields are required');
      return;
    }
    
    if (passwordForm.newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters long');
      return;
    }
    
    if (!/^(?=.*[a-zA-Z])(?=.*\d)/.test(passwordForm.newPassword)) {
      setPasswordError('New password must contain at least one letter and one number');
      return;
    }
    
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError('New passwords do not match');
      return;
    }
    
    try {
      setChangingPassword(true);
      
      await changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      
      // Clear form on success
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
      
      // Show success toast
      addToast('Password changed successfully!', 2000);
    } catch (error) {
      console.error('Error changing password:', error);
      // Show error message
      setPasswordError(error.message || 'Failed to change password');
      addToast(error.message || 'Failed to change password', 3000);
    } finally {
      setChangingPassword(false);
    }
  };
  
  // Check if all loading is complete
  const isLoading = preferencesLoading || profilePictureLoading || registrationKeysLoading;
  
  return (
    <>
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
            {/* Controls Section */}
            <div className={`p-4 border-2 rounded ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-400'}`}>
              <h3 className={`text-base font-bold mb-3 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                Controls
              </h3>
              <div className="flex flex-col gap-2">
                <button
                  onClick={handleExit}
                  className={`py-2 px-3 rounded text-sm font-medium bg-gray-600 text-white shadow-md hover:bg-gray-700 active:bg-gray-800 transition-colors`}
                >
                  Exit
                </button>
              </div>
            </div>
          </div>
        </div>
        
        {/* Main Content Area - 60% (1152px) */}
        <div className={`flex-1 h-full flex flex-col px-4 py-4 gap-4 min-h-0 ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
          {/* Player Name Section at Top */}
          <div className={`flex-shrink-0 p-4 border-2 rounded ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-gray-100 border-gray-400'}`}>
            <div className="flex items-center gap-4">
              {/* Profile Picture - Clickable */}
              <div className="flex-shrink-0 cursor-pointer" onClick={openProfilePictureModal}>
                {profilePictureLoading ? (
                  <div className={`w-24 h-24 rounded-full border-2 flex items-center justify-center transition-opacity hover:opacity-80 ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-200 border-gray-300'}`}>
                    <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Loading...
                    </div>
                  </div>
                ) : profilePictureUrl ? (
                  <img
                    src={profilePictureUrl}
                    alt="Profile Picture"
                    className="w-24 h-24 rounded-full border-2 object-cover transition-opacity hover:opacity-80"
                    style={{ borderColor: isDarkMode ? '#4B5563' : '#D1D5DB' }}
                    onError={(e) => {
                      // If image fails to load, don't reset to default - keep trying
                      // This prevents the image from disappearing on transient errors
                      console.warn('Profile picture image failed to load, but keeping URL:', profilePictureUrl);
                      // Don't set src to null or empty - let the browser handle retries
                    }}
                  />
                ) : (
                  <div className={`w-24 h-24 rounded-full border-2 flex items-center justify-center transition-opacity hover:opacity-80 ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-gray-200 border-gray-300'}`}>
                    <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      No Image
                    </div>
                  </div>
                )}
              </div>
              {/* Player Name */}
              <div className="flex flex-col">
                <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  {savedDisplayName || username}
                </h2>
                {savedDisplayName && (
                  <p className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                    {username}
                  </p>
                )}
              </div>
            </div>
          </div>
          
          {/* Invite Codes Section */}
          <div className={`flex-shrink-0 border-2 rounded p-4 flex flex-col ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-gray-100 border-gray-400'}`}>
            <h3 className={`text-base font-bold mb-3 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              Invite Codes <span className="font-normal">({registrationKeys.length})</span>
            </h3>
            <div className="overflow-y-auto space-y-2" style={{ height: 'calc(3 * 53px + 2 * 0.5rem)' }}>
              {registrationKeysLoading ? (
                <div className={`text-center py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Loading invite codes...
                </div>
              ) : registrationKeys.length === 0 ? (
                <div className={`text-center py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  No invite codes found
                </div>
              ) : (
                registrationKeys.map((regKey, index) => {
                  const isFullyClaimed = regKey.isFullyClaimed;
                  const maxUsesDisplay = regKey.isMasterKey || regKey.maxUses === -1 ? '∞' : regKey.maxUses;
                  const usesDisplay = regKey.isMasterKey || regKey.maxUses === -1 
                    ? `(${regKey.currentUses}/∞)` 
                    : `(${regKey.currentUses}/${regKey.maxUses})`;
                  
                  return (
                    <div 
                      key={regKey._id}
                      className={`p-2 rounded border flex-shrink-0 flex items-center justify-between ${isDarkMode ? 'bg-gray-700 border-gray-500' : 'bg-white border-gray-300'}`}
                      style={{ minHeight: '53px' }}
                    >
                      <div className="flex items-center gap-2 flex-1 min-w-0">
                        <span className={`text-lg flex-shrink-0 ${isFullyClaimed ? 'text-red-500' : 'text-green-500'}`}>
                          {isFullyClaimed ? '❌' : '✓'}
                        </span>
                        <span className={`text-sm font-medium flex-shrink-0 ${isDarkMode ? 'text-gray-200' : 'text-gray-800'}`}>
                          Invite Code #{index + 1}
                        </span>
                        <span className={`text-xs flex-shrink-0 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                          {usesDisplay}
                        </span>
                        {regKey.lastClaimedBy && (
                          <span className={`text-xs flex-shrink-0 ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                            Last Claimed By: {regKey.lastClaimedBy}
                          </span>
                        )}
                      </div>
                      <div className="flex gap-2 flex-shrink-0 ml-2">
                        <button
                          onClick={() => copyRegistrationKey(regKey.key)}
                          disabled={isFullyClaimed}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            isFullyClaimed
                              ? 'bg-gray-400 text-gray-600 cursor-not-allowed opacity-50'
                              : 'bg-blue-600 text-white hover:bg-blue-700 active:bg-blue-800'
                          }`}
                        >
                          Copy Code
                        </button>
                        <button
                          onClick={() => copyRegistrationLink(regKey.key)}
                          disabled={isFullyClaimed}
                          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
                            isFullyClaimed
                              ? 'bg-gray-400 text-gray-600 cursor-not-allowed opacity-50'
                              : 'bg-green-600 text-white hover:bg-green-700 active:bg-green-800'
                          }`}
                        >
                          Copy Link
                        </button>
                      </div>
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
            {/* Preferences Section */}
            <div className={`p-4 border-2 rounded ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-400'}`}>
              <h3 className={`text-base font-bold mb-3 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                Preferences
              </h3>
              
              {preferencesLoading ? (
                <div className={`text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Loading preferences...
                </div>
              ) : (
                <div className="space-y-3">
                  {/* Theme Preference */}
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Theme
                    </label>
                    <select
                      value={preferencesForm.theme}
                      onChange={(e) => handlePreferenceChange('theme', e.target.value)}
                      className={`w-full px-2 py-1 rounded border text-sm ${
                        isDarkMode 
                          ? 'bg-gray-600 border-gray-500 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                          : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                      }`}
                    >
                      <option value="dark">Dark</option>
                      <option value="light">Light</option>
                    </select>
                  </div>
                  
                  {/* Screenshot Mode Preference */}
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Screenshot Mode
                    </label>
                    <select
                      value={preferencesForm.screenshotMode}
                      onChange={(e) => handlePreferenceChange('screenshotMode', e.target.value)}
                      className={`w-full px-2 py-1 rounded border text-sm ${
                        isDarkMode 
                          ? 'bg-gray-600 border-gray-500 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                          : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                      }`}
                    >
                      <option value="full">Full</option>
                      <option value="deck">Deck</option>
                    </select>
                  </div>
                  
                  {/* Display Name Preference */}
                  <div>
                    <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                      Display Name
                    </label>
                    <input
                      type="text"
                      value={preferencesForm.displayName}
                      onChange={(e) => handlePreferenceChange('displayName', e.target.value)}
                      placeholder="Leave empty to use username"
                      maxLength={50}
                      className={`w-full px-2 py-1 rounded border text-sm ${
                        isDarkMode 
                          ? 'bg-gray-600 border-gray-500 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                          : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                      }`}
                    />
                    <p className={`mt-1 text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Must be unique
                    </p>
                  </div>
                  
                  {/* Update Button */}
                  <button
                    onClick={handleUpdatePreferences}
                    disabled={updatingPreferences}
                    className={`w-full py-2 px-3 rounded text-sm font-medium transition-colors ${
                      updatingPreferences
                        ? 'bg-gray-400 text-gray-600 cursor-not-allowed opacity-50'
                        : 'bg-blue-600 text-white shadow-md hover:bg-blue-700 active:bg-blue-800'
                    }`}
                  >
                    {updatingPreferences ? 'Updating...' : 'Update Preferences'}
                  </button>
                </div>
              )}
            </div>
            
            {/* Decklist Defaults Section */}
            <div className={`p-4 border-2 rounded ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-400'}`}>
              <h3 className={`text-base font-bold mb-3 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                Decklist Defaults
              </h3>
              
              <div className="space-y-3">
                {/* First Name */}
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    First Name
                  </label>
                  <input
                    type="text"
                    value={decklistDefaultsForm.firstName}
                    onChange={(e) => handleDecklistDefaultsChange('firstName', e.target.value)}
                    placeholder="Enter first name"
                    className={`w-full px-2 py-1 rounded border text-sm ${
                      isDarkMode 
                        ? 'bg-gray-600 border-gray-500 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                        : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                    }`}
                  />
                </div>
                
                {/* Last Name */}
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Last Name
                  </label>
                  <input
                    type="text"
                    value={decklistDefaultsForm.lastName}
                    onChange={(e) => handleDecklistDefaultsChange('lastName', e.target.value)}
                    placeholder="Enter last name"
                    className={`w-full px-2 py-1 rounded border text-sm ${
                      isDarkMode 
                        ? 'bg-gray-600 border-gray-500 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                        : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                    }`}
                  />
                </div>
                
                {/* Riot ID */}
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Riot ID
                  </label>
                  <input
                    type="text"
                    value={decklistDefaultsForm.riotId}
                    onChange={(e) => handleDecklistDefaultsChange('riotId', e.target.value)}
                    placeholder="Enter Riot ID"
                    className={`w-full px-2 py-1 rounded border text-sm ${
                      isDarkMode 
                        ? 'bg-gray-600 border-gray-500 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                        : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                    }`}
                  />
                </div>
                
                {/* Update Button */}
                <button
                  onClick={handleUpdateDecklistDefaults}
                  disabled={updatingDecklistDefaults}
                  className={`w-full py-2 px-3 rounded text-sm font-medium transition-colors ${
                    updatingDecklistDefaults
                      ? 'bg-gray-400 text-gray-600 cursor-not-allowed opacity-50'
                      : 'bg-blue-600 text-white shadow-md hover:bg-blue-700 active:bg-blue-800'
                  }`}
                >
                  {updatingDecklistDefaults ? 'Updating...' : 'Update Defaults'}
                </button>
              </div>
            </div>
            
            {/* Change Password Section */}
            <div className={`p-4 border-2 rounded ${isDarkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-400'}`}>
              <h3 className={`text-base font-bold mb-3 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                Change Password
              </h3>
              
              <div className="space-y-3">
                {/* Current Password */}
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Current Password
                  </label>
                  <input
                    type="password"
                    value={passwordForm.currentPassword}
                    onChange={(e) => handlePasswordChange('currentPassword', e.target.value)}
                    placeholder="Enter current password"
                    className={`w-full px-2 py-1 rounded border text-sm ${
                      isDarkMode 
                        ? 'bg-gray-600 border-gray-500 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                        : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                    }`}
                  />
                </div>
                
                {/* New Password */}
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    New Password
                  </label>
                  <input
                    type="password"
                    value={passwordForm.newPassword}
                    onChange={(e) => handlePasswordChange('newPassword', e.target.value)}
                    placeholder="Enter new password"
                    className={`w-full px-2 py-1 rounded border text-sm ${
                      isDarkMode 
                        ? 'bg-gray-600 border-gray-500 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                        : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                    }`}
                  />
                  <p className={`mt-1 text-[10px] ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                    Min 8 characters, must contain letter and number
                  </p>
                </div>
                
                {/* Confirm New Password */}
                <div>
                  <label className={`block text-xs font-medium mb-1 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                    Confirm New Password
                  </label>
                  <input
                    type="password"
                    value={passwordForm.confirmPassword}
                    onChange={(e) => handlePasswordChange('confirmPassword', e.target.value)}
                    placeholder="Confirm new password"
                    className={`w-full px-2 py-1 rounded border text-sm ${
                      isDarkMode 
                        ? 'bg-gray-600 border-gray-500 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                        : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                    }`}
                  />
                </div>
                
                {/* Error Message */}
                {passwordError && (
                  <div className={`text-xs px-2 py-1 rounded ${isDarkMode ? 'bg-red-900 text-red-200' : 'bg-red-100 text-red-700'}`}>
                    {passwordError}
                  </div>
                )}
                
                {/* Change Password Button */}
                <button
                  onClick={handleChangePassword}
                  disabled={changingPassword}
                  className={`w-full py-2 px-3 rounded text-sm font-medium transition-colors ${
                    changingPassword
                      ? 'bg-gray-400 text-gray-600 cursor-not-allowed opacity-50'
                      : 'bg-blue-600 text-white shadow-md hover:bg-blue-700 active:bg-blue-800'
                  }`}
                >
                  {changingPassword ? 'Changing...' : 'Change Password'}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
      </LayoutContainer>
      
      {/* Toast Notifications - Outside LayoutContainer to position relative to viewport */}
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
      
      {/* Profile Picture Selector Modal */}
      {profilePictureModal.isOpen && (
        <div 
          className="fixed inset-0 z-[10001] flex items-center justify-center"
          onClick={closeProfilePictureModal}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black bg-opacity-50" />
          
          {/* Modal Content */}
          <div 
            className={`relative z-10 rounded-lg shadow-2xl border-2 ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-400'}`}
            style={{ 
              width: '600px',
              maxWidth: '90vw',
              maxHeight: '90vh',
              transform: `scale(${containerScale})`,
              transformOrigin: 'center center'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className={`px-6 py-4 border-b ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
              <div className="flex items-center justify-between">
                <h2 className={`text-xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Select Profile Picture
                </h2>
                <button
                  onClick={closeProfilePictureModal}
                  className={`text-2xl leading-none ${isDarkMode ? 'text-gray-400 hover:text-gray-200' : 'text-gray-500 hover:text-gray-700'}`}
                >
                  ×
                </button>
              </div>
            </div>
            
            {/* Body */}
            <div className={`px-6 py-6 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              {profilePictureModal.loadingPictures ? (
                <div className={`text-center py-8 ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  Loading profile pictures...
                </div>
              ) : (
                <div className="grid grid-cols-6 gap-4 p-2 max-h-[500px] overflow-y-auto">
                  {approvedProfileCardIds.map((cardId) => {
                    const isSelected = cardId === profileCardId;
                    const pictureUrl = profilePictureModal.pictureUrls[cardId];
                    
                    return (
                      <div
                        key={cardId}
                        onClick={() => handleProfilePictureSelect(cardId)}
                        className={`relative aspect-square rounded-full border-2 cursor-pointer transition-all hover:scale-105 ${
                          isSelected
                            ? isDarkMode 
                              ? 'border-blue-500 ring-2 ring-blue-500' 
                              : 'border-blue-600 ring-2 ring-blue-600'
                            : isDarkMode
                              ? 'border-gray-600 hover:border-gray-500'
                              : 'border-gray-300 hover:border-gray-400'
                        }`}
                      >
                        {pictureUrl ? (
                          <img
                            src={pictureUrl}
                            alt={`Profile ${cardId}`}
                            className="w-full h-full rounded-full object-cover"
                          />
                        ) : (
                          <div className={`w-full h-full rounded-full flex items-center justify-center text-xs ${isDarkMode ? 'bg-gray-700 text-gray-400' : 'bg-gray-200 text-gray-500'}`}>
                            {cardId}
                          </div>
                        )}
                        {isSelected && (
                          <div className="absolute top-1 right-1 bg-blue-500 text-white text-xs px-1.5 py-0.5 rounded-full">
                            ✓
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
      
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

export default Profile;

