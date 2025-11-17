import { StrictMode, useState, useEffect } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import Login from './pages/Login.jsx'
import Homepage from './pages/Homepage.jsx'
import Profile from './pages/Profile.jsx'
import { isLoggedIn } from './utils/auth'

// Simple routing based on pathname
function Router() {
  const [path, setPath] = useState(window.location.pathname);
  
  // Listen for navigation changes (back/forward buttons, programmatic navigation)
  useEffect(() => {
    const handlePopState = () => {
      setPath(window.location.pathname);
    };
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);
  
  // Handle authentication-based redirects
  useEffect(() => {
    const loggedIn = isLoggedIn();
    const currentPath = window.location.pathname;
    
    if (currentPath === '/') {
      if (!loggedIn) {
        // Not logged in, redirect to login
        console.log('[Router] Not logged in, redirecting from / to /login');
        window.history.replaceState(null, '', '/login');
        setPath('/login');
        return;
      }
      // If logged in, stay on / and show Homepage
    } else if (currentPath === '/login') {
      if (loggedIn) {
        // Already logged in, redirect to homepage
        console.log('[Router] Already logged in, redirecting from /login to /');
        window.history.replaceState(null, '', '/');
        setPath('/');
        return;
      }
      // If not logged in, stay on /login
    } else if (currentPath === '/deck' || currentPath.startsWith('/deck/')) {
      if (!loggedIn) {
        // Not logged in, redirect to login (via /)
        console.log('[Router] Not logged in, redirecting from /deck to /');
        window.history.replaceState(null, '', '/');
        setPath('/');
        return;
      }
    } else if (currentPath === '/profile') {
      if (!loggedIn) {
        // Not logged in, redirect to login (via /)
        console.log('[Router] Not logged in, redirecting from /profile to /');
        window.history.replaceState(null, '', '/');
        setPath('/');
        return;
      }
    }
  }, [path]);
  
  // Homepage route - requires authentication
  if (path === '/') {
    if (!isLoggedIn()) {
      // Not logged in, will redirect in useEffect
      return null;
    }
    return <Homepage />;
  }
  
  // Login route
  if (path === '/login') {
    return <Login />;
  }
  
  // App.jsx handles /deck and /deck/<code> routes - requires authentication
  if (path === '/deck' || path.startsWith('/deck/')) {
    if (!isLoggedIn()) {
      // Not logged in, will redirect in useEffect
      return null;
    }
    return <App />;
  }
  
  // Profile route - requires authentication
  if (path === '/profile') {
    if (!isLoggedIn()) {
      // Not logged in, will redirect in useEffect
      return null;
    }
    return <Profile />;
  }
  
  // Default to Login for unknown routes
  return <Login />;
}

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Router />
  </StrictMode>,
)
