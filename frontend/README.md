# Riftbound Deckbuilder Frontend

React + Vite frontend for the Riftbound TCG deckbuilder application.

## 🏗️ Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   └── LayoutContainer.jsx    # 16:9 fixed aspect ratio container with scaling
│   ├── pages/                      # Page components (future)
│   ├── store/                      # Zustand state management (future)
│   ├── hooks/                      # Custom React hooks (future)
│   ├── utils/                      # Utility functions (future)
│   ├── App.jsx                     # Main application component
│   ├── main.jsx                    # React entry point
│   └── index.css                   # Tailwind CSS styles
├── package.json
├── vite.config.js
└── tailwind.config.js
```

## 🎨 Current Layout

### Panel Structure

The application uses a **three-column layout** (1920x1080 reference):

- **Left Panel (384px - 20%)**: Card preview and deck management
- **Middle Panel (1152px - 60%)**: Deck building area (Main Deck, Battlefield/Legend/Runes, Side Deck)
- **Right Panel (384px - 20%)**: Card search and filters (not yet implemented)

### LayoutContainer Component

The entire app is wrapped in `LayoutContainer.jsx` which:
- Maintains a 16:9 aspect ratio
- Scales the app to fill viewport (either width or height)
- Uses a 1920x1080 reference size with transform scaling
- **All content scales proportionally** with the container

## 🃏 Deck Structure

### Main Deck

- **Grid**: 10 columns × 4 rows = 40 cards
- **Array**: `mainDeck` state (40 card IDs like "OGN-036")
- **Count Display**: Shows actual non-empty cards (e.g., "39/40")

### Side Deck

- **Grid**: Not yet implemented (placeholder exists)
- **Array**: `sideDeck` state (8 card IDs)
- **Count Display**: "8/8" placeholder

### Card Images

Cards are loaded from:
```
https://riftmana.com/wp-content/uploads/Cards/{cardId}.webp
```

- Card dimensions: 515×719 pixels
- Aspect ratio: 515:719
- Format: WebP

## 🎮 Current Interactions

### Card Interactions (Main Deck Grid)

1. **Hover**: Updates card preview in left panel
2. **Left-click and drag**: Removes card, can drop to reorder
3. **Right-click**: Removes card from deck
4. **Shift + Right-click**: Duplicates card at that position
5. **Middle-click**: Duplicates card at that position

### Deck Management Buttons

- **Import Deck** / **Export Deck**: File operations (blue)
- **Delete Deck** / **Clear Deck**: Destructive actions (red)
- **New Deck** / **Rename Deck**: Card management (blue)
- **Save Deck** / **Save As**: Save operations (green)
- **Exit** / **Settings**: Navigation (gray/blue)
- **Deck Dropdown**: Shows current deck name (gray)

## ⚙️ State Management

Currently using React `useState` for:
- `mainDeck`: Array of 40 card IDs
- `sideDeck`: Array of 8 card IDs
- `selectedCard`: Currently previewed card ID
- `draggedCard`: Card being dragged
- `dragIndex`: Original position of dragged card
- `isDragging`: Boolean drag state

**Future**: Will migrate to Zustand for global state management.

## 📦 Dependencies

### Production
- `react`: ^19.1.1
- `react-dom`: ^19.1.1
- `zustand`: ^5.0.2 (installed, not yet used)

### Development
- `vite`: Build tool
- `tailwindcss`: Styling
- `postcss` + `autoprefixer`: CSS processing
- `@vitejs/plugin-react`: React support

## 🚀 Development

### Start Development Server

```bash
cd frontend
npm install
npm run dev
```

Visit `http://localhost:5173`

### Build for Production

```bash
npm run build
```

### Current Features

✅ 16:9 fixed aspect ratio scaling
✅ Three-panel layout structure
✅ Main deck 10×4 grid with card images
✅ Card hover preview in left panel
✅ Drag and drop reordering
✅ Right-click remove
✅ Shift+Right-click / Middle-click duplicate
✅ Deck statistics (Main Deck X/40, Side Deck X/8)
✅ Scrollable card text box
✅ Deck management buttons UI

### Planned Features

- [ ] Card database integration
- [ ] Side deck grid
- [ ] Battlefield/Legend/Runes sections
- [ ] Search panel (right side)
- [ ] Sort functionality (A-Z, by Cost)
- [ ] Randomize functionality
- [ ] Save/Load deck to backend
- [ ] Zustand state management
- [ ] Authentication UI

## 🐛 Known Issues

- Drag and drop uses array indices which can cause mismatches (fixed by keeping card in place)
- No persistent storage yet (backend required)
- Card text is placeholder only (needs database)

## 📝 Notes

- All sizing uses pixel values based on 1920×1080 reference
- The app scales everything proportionally using CSS transforms
- Card images must maintain 515:719 aspect ratio
- Grid cards use 85-92% size to show grid lines
- Material Design color scheme for buttons
