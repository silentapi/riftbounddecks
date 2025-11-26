import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

/**
 * ContextMenu component that appears above a card when hovering
 * Animates upward on hover and retreats when mouse leaves
 * 
 * @param {Array} items - Array of menu items with { label, onClick } structure
 * @param {boolean} isDarkMode - Dark mode state
 * @param {React.ReactNode} children - The card element to wrap
 * @param {string} className - Additional CSS classes for the wrapper
 */
function ContextMenu({ items = [], isDarkMode, children, className = '' }) {
  const [isHovered, setIsHovered] = useState(false);

  const handleMouseEnter = () => {
    setIsHovered(true);
  };

  const handleMouseLeave = () => {
    setIsHovered(false);
  };

  if (!items || items.length === 0) {
    return <div className={className}>{children}</div>;
  }

  return (
    <div
      className={`relative ${className}`}
      style={{ zIndex: 9999 }} // Highest z-index to ensure context menu is always on top
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      
      <AnimatePresence>
        {isHovered && (
          <>
            {/* Bridge div from card upward - ensures seamless coverage when moving mouse from card to menu */}
            <div
              className="absolute"
              style={{
                bottom: '100%',
                left: className && (className.includes('rune-deck-context-menu') || className.includes('rune-field-context-menu') || className.includes('rune-count-context-menu')) ? '50%' : '0',
                transform: className && (className.includes('rune-deck-context-menu') || className.includes('rune-field-context-menu') || className.includes('rune-count-context-menu')) ? 'translateX(-50%)' : 'none',
                width: className && className.includes('rune-field-context-menu') ? '60px' : // Narrower for rune field to avoid overlap with adjacent runes (rune is 37.5px, so 60px provides good coverage)
                       className && className.includes('rune-deck-context-menu') ? '250px' : // Wider for rune deck (no adjacent items)
                       className && className.includes('rune-count-context-menu') ? '100px' : // Medium width for rune count bubble
                       '100%', // Full width for other menus
                height: '150px', // Extends well above to cover menu area
                zIndex: 9999, // Highest z-index to ensure context menu is always on top
                pointerEvents: 'auto'
              }}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            />
            {/* Menu container - positioned above the card */}
            <div
              className={`absolute bottom-full mb-2 ${
                className && className.includes('rune-deck-context-menu') ? 'left-1/2 -translate-x-1/2' :
                className && className.includes('rune-field-context-menu') ? 'left-1/2 -translate-x-1/2' :
                className && className.includes('rune-count-context-menu') ? 'left-1/2 -translate-x-1/2' :
                'left-0 w-full'
              }`}
              style={{ 
                zIndex: 9999, // Highest z-index to ensure context menu is always on top
                pointerEvents: 'auto' 
              }}
              onMouseEnter={handleMouseEnter}
              onMouseLeave={handleMouseLeave}
            >
              {/* Bridge div from menu downward - ensures seamless coverage when moving mouse from menu back to card */}
              <div
                className="absolute"
                style={{
                  top: '100%',
                  left: className && (className.includes('rune-deck-context-menu') || className.includes('rune-field-context-menu') || className.includes('rune-count-context-menu')) ? '50%' : '0',
                  transform: className && (className.includes('rune-deck-context-menu') || className.includes('rune-field-context-menu') || className.includes('rune-count-context-menu')) ? 'translateX(-50%)' : 'none',
                  width: className && className.includes('rune-field-context-menu') ? '60px' : // Narrower for rune field to avoid overlap with adjacent runes (rune is 37.5px, so 60px provides good coverage)
                         className && className.includes('rune-deck-context-menu') ? '250px' : // Wider for rune deck (no adjacent items)
                         className && className.includes('rune-count-context-menu') ? '100px' : // Medium width for rune count bubble
                         '100%', // Full width for other menus
                  height: '150px', // Extends well below to cover card area
                  marginTop: '8px', // Match mb-2 gap (8px)
                  zIndex: 9999, // Highest z-index to ensure context menu is always on top
                  pointerEvents: 'auto'
                }}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              />
              <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: 20, scale: 0.9 }}
                transition={{ 
                  duration: 0.25,
                  ease: [0.4, 0, 0.2, 1] // Custom easing for smooth animation
                }}
                className={`${
                  className && className.includes('rune-deck-context-menu') ? 'w-auto min-w-[120px]' :
                  className && className.includes('rune-field-context-menu') ? 'w-auto min-w-[120px]' :
                  className && className.includes('rune-count-context-menu') ? 'w-[120px]' :
                  'w-full'
                }`}
                style={{ 
                  zIndex: 9999, // Highest z-index to ensure context menu is always on top
                  pointerEvents: 'auto' 
                }}
                onMouseEnter={handleMouseEnter}
                onMouseLeave={handleMouseLeave}
              >
                <div
                  className={`rounded-lg border-2 shadow-lg py-1 flex flex-col ${
                    className.includes('rune-deck-context-menu') ? 'w-full' : 
                    className.includes('rune-count-context-menu') ? 'w-full' : 'w-full'
                  } ${
                    isDarkMode
                      ? 'bg-gray-800 border-gray-600'
                      : 'bg-white border-gray-400'
                  }`}
                  style={{ 
                    backgroundColor: isDarkMode ? 'rgb(31, 41, 55)' : 'rgb(255, 255, 255)',
                    opacity: 1,
                    zIndex: 9999, // Highest z-index to ensure context menu is always on top
                    whiteSpace: className.includes('rune-count-context-menu') ? 'nowrap' : 'normal'
                  }}
                  onMouseEnter={handleMouseEnter}
                  onMouseLeave={handleMouseLeave}
                >
                  {items.map((item, index) => {
                    // Support divider items
                    if (item.divider) {
                      return (
                        <div
                          key={index}
                          className={`my-1 border-t ${
                            isDarkMode ? 'border-gray-600' : 'border-gray-300'
                          }`}
                        />
                      );
                    }
                    
                    return (
                      <button
                        key={index}
                        onClick={(e) => {
                          e.stopPropagation();
                          if (item.onClick) {
                            item.onClick();
                          }
                        }}
                        className={`w-full text-left px-4 py-2 text-sm font-medium transition-colors whitespace-nowrap ${
                          isDarkMode
                            ? 'text-gray-100 hover:bg-gray-700 active:bg-gray-600'
                            : 'text-gray-900 hover:bg-gray-100 active:bg-gray-200'
                        } ${index === 0 ? 'rounded-t-lg' : ''} ${
                          index === items.length - 1 ? 'rounded-b-lg' : ''
                        }`}
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}

export default ContextMenu;

