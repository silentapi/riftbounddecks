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
  // Initialize with a default size so scale calculation works immediately
  const [containerDimensions, setContainerDimensions] = useState({ width: '1920px', height: '1080px' });
  
  // Reference size for 16:9 aspect ratio (1920x1080)
  const REFERENCE_WIDTH = 1920;
  const REFERENCE_HEIGHT = 1080;

  useEffect(() => {
    const updateScale = () => {
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      
      // Border width (border-4 = 4px on each side = 8px total per dimension)
      const borderWidth = 8;
      // Small padding around the container
      const padding = 4;
      
      // Base copyright height estimate (unscaled, text-xs)
      const copyrightBaseHeight = 15;
      const copyrightMargin = 2; // Minimal margin between container and copyright
      
      // Calculate available space accounting for padding and border
      const availableWidth = viewportWidth - borderWidth - padding * 2;
      const availableHeight = viewportHeight - borderWidth - padding * 2;
      
      // Calculate scale based on width constraint
      const widthBasedScale = availableWidth / REFERENCE_WIDTH;
      const widthBasedHeight = REFERENCE_HEIGHT * widthBasedScale;
      const widthBasedCopyrightHeight = copyrightBaseHeight * widthBasedScale;
      const widthBasedTotalHeight = widthBasedHeight + widthBasedCopyrightHeight + copyrightMargin;
      
      // Calculate scale based on height constraint (accounting for copyright)
      // Solve: containerHeight * scale + copyrightBaseHeight * scale + margin <= availableHeight
      // (REFERENCE_HEIGHT + copyrightBaseHeight) * scale + margin <= availableHeight
      const heightBasedScale = (availableHeight - copyrightMargin) / (REFERENCE_HEIGHT + copyrightBaseHeight);
      const heightBasedWidth = REFERENCE_WIDTH * heightBasedScale;
      
      // Choose the scale that maximizes size while ensuring both fit
      let finalScale, finalWidth, finalHeight;
      
      // Check if width-constrained solution fits in height
      if (widthBasedTotalHeight <= availableHeight) {
        // Width constraint works - use it
        finalScale = widthBasedScale;
        finalWidth = availableWidth;
        finalHeight = widthBasedHeight;
      } else {
        // Height constraint is limiting - use it
        finalScale = heightBasedScale;
        finalWidth = heightBasedWidth;
        finalHeight = REFERENCE_HEIGHT * finalScale;
      }
      
      setScale(finalScale);
      setContainerDimensions({
        width: `${finalWidth}px`,
        height: `${finalHeight}px`
      });
    };

    // Initial scale calculation
    updateScale();

    // Update scale on window resize
    window.addEventListener('resize', updateScale);
    return () => window.removeEventListener('resize', updateScale);
  }, []);

  return (
    <div className={`w-screen h-screen flex flex-col items-center justify-center ${isDarkMode ? 'bg-gray-900' : 'bg-gradient-to-br from-blue-50 to-purple-50'}`} style={{ padding: '4px' }}>
      {/* 16:9 aspect ratio container that scales to fit viewport */}
      <div 
        ref={containerRef}
        data-visible-container
        data-scale={scale}
        className={`relative border-4 rounded-lg shadow-2xl overflow-hidden ${isDarkMode ? 'border-gray-700 bg-gray-950' : 'border-gray-800 bg-white'}`}
        style={{
          aspectRatio: '16/9',
          width: containerDimensions.width,
          height: containerDimensions.height
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
      {/* Copyright and disclaimer text - scales with 16:9 container */}
      <div 
        style={{
          transform: `scale(${scale})`,
          transformOrigin: 'top center',
          marginTop: '2px',
          width: `${REFERENCE_WIDTH}px`
        }}
      >
        <p className={`text-xs text-center whitespace-nowrap ${isDarkMode ? 'text-gray-400' : 'text-gray-600'}`}>
          © 2025 SummonersBase.com. Summoner's Base was created under Riot Games' "Legal Jibber Jabber" policy using assets owned by Riot Games. Riot Games does not endorse or sponsor this project.
        </p>
      </div>
    </div>
  );
}

export default LayoutContainer;

