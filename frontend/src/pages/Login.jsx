import { useState, useEffect } from 'react';
import LayoutContainer from '../components/LayoutContainer';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { getTheme } from '../utils/deckStorage';
import { register, login } from '../utils/auth';
import { changelogContent } from '../data/changelog.js';

function Login() {
  // Dark mode state - initialize from localStorage
  const [isDarkMode, setIsDarkMode] = useState(() => getTheme() === 'dark');
  
  // Form mode: 'login' or 'register'
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  
  // Form state
  const [formData, setFormData] = useState({
    username: '',
    password: '',
    email: '',
    inviteCode: '',
    displayName: ''
  });
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  
  // Apply theme on mount
  useEffect(() => {
    const theme = getTheme();
    setIsDarkMode(theme === 'dark');
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
  
  // Handle form input changes
  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    // Clear error when user starts typing
    if (error) {
      setError('');
    }
  };
  
  // Handle form submission
  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    // Basic client-side validation
    if (!formData.username || !formData.password) {
      setError('Username and password are required');
      return;
    }
    
    if (isRegisterMode) {
      if (!formData.email) {
        setError('Email is required for registration');
        return;
      }
      if (!formData.inviteCode) {
        setError('Invite code is required for registration');
        return;
      }
    }
    
    setIsLoading(true);
    
    try {
      if (isRegisterMode) {
        // Register new user
        await register({
          username: formData.username,
          email: formData.email,
          password: formData.password,
          inviteCode: formData.inviteCode,
          displayName: formData.displayName || undefined,
          rememberMe: rememberMe
        });
      } else {
        // Login existing user
        await login({
          username: formData.username,
          password: formData.password,
          rememberMe: rememberMe
        });
      }
      
      // Success - redirect to homepage
      window.location.href = '/';
    } catch (err) {
      // Handle API errors
      const errorMessage = err.message || (isRegisterMode ? 'Registration failed. Please try again.' : 'Login failed. Please try again.');
      setError(errorMessage);
      console.error(isRegisterMode ? 'Registration error:' : 'Login error:', err);
    } finally {
      setIsLoading(false);
    }
  };
  
  // Calculate container scale for proper scaling (same as App.jsx)
  const [containerScale, setContainerScale] = useState(1);
  
  useEffect(() => {
    const updateScale = () => {
      const scaledContainer = document.querySelector('[style*="transform: scale"]');
      if (scaledContainer) {
        const rect = scaledContainer.getBoundingClientRect();
        const scale = rect.width / 1920; // Reference width is 1920
        setContainerScale(scale);
      }
    };
    
    updateScale();
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);
  
  return (
    <LayoutContainer isDarkMode={isDarkMode}>
      {/* Content is sized in pixels based on 1920x1080 reference */}
      <div className={`w-[1920px] h-[1080px] flex flex-col ${isDarkMode ? 'bg-gray-900' : 'bg-white'}`}>
        {/* Top 1/4: Title Card */}
        <div className={`h-[270px] w-full border-b-2 flex items-center justify-center ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-blue-50 border-gray-300'}`}>
          <div className="text-center">
            <h1 className={`text-6xl font-bold mb-4 flex items-center justify-center gap-4 ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
              <img 
                src="/vite.svg" 
                alt="Riftbound Decks Logo" 
                className="h-[1em] w-auto"
              />
              Riftbound Decks
            </h1>
            <p className={`text-xl ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
              Build, manage, and play your Riftbound TCG decks
            </p>
          </div>
        </div>
        
        {/* Bottom 3/4: Login Form (Left) and Changelog (Right) */}
        <div className="flex-1 flex h-[810px]">
          {/* Left Half: Login Form */}
          <div className="w-[960px] h-full flex items-center justify-center p-8">
            <div className={`w-full max-w-[500px] border-2 rounded-lg shadow-2xl ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-400'}`}>
              {/* Header */}
              <div className={`px-8 py-6 border-b ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
                <h2 className={`text-3xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  {isRegisterMode ? 'Register' : 'Login'}
                </h2>
                <p className={`mt-2 text-sm ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
                  {isRegisterMode ? 'Create a new account' : 'Sign in to your account'}
                </p>
              </div>
              
              {/* Form */}
              <form onSubmit={handleSubmit} className="px-8 py-6">
                {/* Error Message */}
                {error && (
                  <div className={`mb-4 p-3 rounded border ${isDarkMode ? 'bg-red-900 border-red-700 text-red-200' : 'bg-red-50 border-red-300 text-red-700'}`}>
                    {error}
                  </div>
                )}
                
                {/* Username Field */}
                <div className="mb-4">
                  <label 
                    htmlFor="username" 
                    className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
                  >
                    Username
                  </label>
                  <input
                    type="text"
                    id="username"
                    name="username"
                    value={formData.username}
                    onChange={handleChange}
                    disabled={isLoading}
                    className={`w-full px-4 py-2 rounded border ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                        : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    placeholder="Enter your username"
                    autoComplete="username"
                  />
                </div>
                
                {/* Password Field */}
                <div className="mb-4">
                  <label 
                    htmlFor="password" 
                    className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
                  >
                    Password
                  </label>
                  <input
                    type="password"
                    id="password"
                    name="password"
                    value={formData.password}
                    onChange={handleChange}
                    disabled={isLoading}
                    className={`w-full px-4 py-2 rounded border ${
                      isDarkMode 
                        ? 'bg-gray-700 border-gray-600 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                        : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                    placeholder="Enter your password"
                    autoComplete={isRegisterMode ? "new-password" : "current-password"}
                  />
                </div>
                
                {/* Email Field (Register only) */}
                {isRegisterMode && (
                  <div className="mb-4">
                    <label 
                      htmlFor="email" 
                      className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
                    >
                      Email
                    </label>
                    <input
                      type="email"
                      id="email"
                      name="email"
                      value={formData.email}
                      onChange={handleChange}
                      disabled={isLoading}
                      className={`w-full px-4 py-2 rounded border ${
                        isDarkMode 
                          ? 'bg-gray-700 border-gray-600 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                          : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                      placeholder="Enter your email"
                      autoComplete="email"
                    />
                  </div>
                )}
                
                {/* Display Name Field (Register only) */}
                {isRegisterMode && (
                  <div className="mb-4">
                    <label 
                      htmlFor="displayName" 
                      className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
                    >
                      Display Name (optional)
                    </label>
                    <input
                      type="text"
                      id="displayName"
                      name="displayName"
                      value={formData.displayName}
                      onChange={handleChange}
                      disabled={isLoading}
                      className={`w-full px-4 py-2 rounded border ${
                        isDarkMode 
                          ? 'bg-gray-700 border-gray-600 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                          : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                      placeholder="Enter your display name"
                      maxLength={50}
                    />
                    <p className={`mt-1 text-xs ${isDarkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                      Must be unique. Leave empty to use username.
                    </p>
                  </div>
                )}
                
                {/* Invite Code Field (Register only) */}
                {isRegisterMode && (
                  <div className="mb-4">
                    <label 
                      htmlFor="inviteCode" 
                      className={`block text-sm font-medium mb-2 ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}
                    >
                      Invite Code
                    </label>
                    <input
                      type="text"
                      id="inviteCode"
                      name="inviteCode"
                      value={formData.inviteCode}
                      onChange={handleChange}
                      disabled={isLoading}
                      className={`w-full px-4 py-2 rounded border ${
                        isDarkMode 
                          ? 'bg-gray-700 border-gray-600 text-gray-100 focus:border-blue-500 focus:ring-1 focus:ring-blue-500' 
                          : 'bg-white border-gray-300 text-gray-800 focus:border-blue-500 focus:ring-1 focus:ring-blue-500'
                      } disabled:opacity-50 disabled:cursor-not-allowed`}
                      placeholder="Enter your invite code"
                    />
                  </div>
                )}
                
                {/* Remember Me Checkbox (Login only) */}
                {!isRegisterMode && (
                  <div className="mb-4 flex justify-center">
                    <label className={`flex items-center cursor-pointer ${isLoading ? 'opacity-50 cursor-not-allowed' : ''}`}>
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        disabled={isLoading}
                        className={`w-4 h-4 mr-2 rounded border ${
                          isDarkMode 
                            ? 'bg-gray-700 border-gray-600 text-blue-500 focus:ring-blue-500' 
                            : 'bg-white border-gray-300 text-blue-600 focus:ring-blue-500'
                        } disabled:opacity-50 disabled:cursor-not-allowed`}
                      />
                      <span className={`text-sm ${isDarkMode ? 'text-gray-300' : 'text-gray-700'}`}>
                        Remember me
                      </span>
                    </label>
                  </div>
                )}
                
                {/* Submit Button */}
                <button
                  type="submit"
                  disabled={isLoading}
                  className={`w-full py-3 px-4 rounded font-medium text-white transition-colors ${
                    isLoading
                      ? 'bg-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 hover:bg-blue-700 active:bg-blue-800'
                  }`}
                >
                  {isLoading 
                    ? (isRegisterMode ? 'Registering...' : 'Logging in...') 
                    : (isRegisterMode ? 'Register' : 'Login')
                  }
                </button>
                
                {/* Additional Links */}
                <div className="mt-4 text-center">
                  {isRegisterMode ? (
                    <a 
                      href="#" 
                      className={`text-sm ${isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
                      onClick={(e) => {
                        e.preventDefault();
                        setIsRegisterMode(false);
                        setError('');
                      }}
                    >
                      Already have an account? Login instead
                    </a>
                  ) : (
                    <div className="space-x-2">
                      <a 
                        href="#" 
                        className={`text-sm ${isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
                        onClick={(e) => {
                          e.preventDefault();
                          setIsRegisterMode(true);
                          setError('');
                        }}
                      >
                        Register
                      </a>
                      <span className={`text-sm ${isDarkMode ? 'text-gray-500' : 'text-gray-400'}`}>|</span>
                      <a 
                        href="#" 
                        className={`text-sm ${isDarkMode ? 'text-blue-400 hover:text-blue-300' : 'text-blue-600 hover:text-blue-700'}`}
                        onClick={(e) => {
                          e.preventDefault();
                          // TODO: Implement forgot password
                        }}
                      >
                        Forgot Password?
                      </a>
                    </div>
                  )}
                </div>
              </form>
            </div>
          </div>
          
          {/* Right Half: Changelog */}
          <div className="w-[960px] h-full border-l-2 flex items-center justify-center p-8">
            <div className={`w-full max-w-[500px] border-2 rounded-lg shadow-2xl ${isDarkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-400'}`}>
              <div className={`px-6 py-4 border-b ${isDarkMode ? 'border-gray-600' : 'border-gray-300'}`}>
                <h2 className={`text-2xl font-bold ${isDarkMode ? 'text-gray-100' : 'text-gray-900'}`}>
                  Changelog
                </h2>
              </div>
              <div className="h-[500px] overflow-hidden">
                <MarkdownRenderer content={changelogContent} isDarkMode={isDarkMode} />
              </div>
            </div>
          </div>
        </div>
      </div>
    </LayoutContainer>
  );
}

export default Login;

