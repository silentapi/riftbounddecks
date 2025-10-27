import { useEffect, useRef, useState } from 'react';

/**
 * LayoutContainer - Main application container with 16:9 aspect ratio
 * 
 * This component ensures the app always maintains a 16:9 aspect ratio
 * and scales to fill either the full height or width of the viewport.
 * All content inside scales proportionally with the container size.
 */
function LayoutContainer({ children, isDarkMode = false }) {
  const containerRef = useRef(null);
  const [scale, setScale] = useState(1);
  
  // Reference size for 16:9 aspect ratio (1920x1080)
  const REFERENCE_WIDTH = 1920;
  const REFERENCE_HEIGHT = 1080;

  useEffect(() => {
    const updateScale = () => {
      if (containerRef.current) {
        const { width } = containerRef.current.getBoundingClientRect();
        const newScale = width / REFERENCE_WIDTH;
        setScale(newScale);
      }
    };

    // Initial scale calculation
    updateScale();

    // Update scale on window resize
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  return (
    <div className={`w-screen h-screen flex items-center justify-center p-4 ${isDarkMode ? 'bg-gray-900' : 'bg-gradient-to-br from-blue-50 to-purple-50'}`}>
      {/* 16:9 aspect ratio container that scales to fit viewport */}
      <div 
        ref={containerRef}
        className={`relative border-4 rounded-lg shadow-2xl overflow-hidden ${isDarkMode ? 'border-gray-700 bg-gray-950' : 'border-gray-800 bg-white'}`}
        style={{
          aspectRatio: '16/9',
          width: 'min(100vw - 2rem, (100vh - 2rem) * 16 / 9)',
          height: 'min((100vw - 2rem) * 9 / 16, 100vh - 2rem)'
        }}
      >
        {/* Scalable content area */}
        <div 
          className="absolute inset-0"
          style={{
            width: REFERENCE_WIDTH,
            height: REFERENCE_HEIGHT,
            transform: `scale(${scale})`,
            transformOrigin: 'top left'
          }}
        >
          {children}
        </div>
      </div>
    </div>
  );
}

export default LayoutContainer;

