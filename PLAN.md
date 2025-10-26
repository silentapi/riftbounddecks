### Riftbound TCG Deckbuilder

A full-stack deckbuilder web app inspired by *DuelingBook*’s interface and functionality, designed for the *Riftbound TCG*. Built with **React (frontend)**, **FastAPI (backend)**, and **MongoDB (database)**.

---

## 🧭 Overview

This app allows players to:

* Log in, create, and manage Riftbound decks.
* Browse and search cards with advanced filters.
* Build decks visually in a grid-based editor.
* Save, export, import, randomize, and sort decks.
* Manage leaders, battlefields, runes, and side decks.

The design aims to mimic the structure and usability of *DuelingBook*, but adapted for Riftbound’s deck format.

---

## 🎨 Layout and UI Design

The interface maintains a **fixed aspect ratio**, scaling uniformly across devices. The app has three primary columns:

### **Left Panel – Card Info & Deck Controls (Red Zone)**

* **Card Preview:** Large image display of the selected card.

* **Card Text Area:** Scrollable box showing full description and stats.

* **Deck Management Buttons:**

  * New Deck
  * Rename Deck
  * Delete Deck
  * Save Deck
  * Save As
  * Import / Export Deck
  * Clear Deck
  * Set as Default

* **Deck Statistics:**

  * Total cards in deck (must be exactly 40)
  * Rune total (≤12)
  * Color distribution
  * Battlefields count

---

### **Center Panel – Deck Editing Area (Blue, Purple, Teal, Yellow, Orange Zones)**

#### **1. Main Deck Grid (Dark Blue)**

* 8×5 grid (40 total slots).
* Displays Riftbound main-deck cards.
* Cards can be dragged, swapped, or replaced.
* Hovering a card shows details in the left panel.
* Right-click opens a context menu for remove or duplicate.

#### **2. Legend (Purple)**

* Large slot area for the deck’s **Leader (Legend)**.
* Always centered below the main grid.
* Takes up two card heights, showing a larger image.
* Only one card can be placed here.

#### **3. Battlefields (Teal)**

* Single horizontal row with three **Battlefield slots**.
* Each slot displays a sideways (landscape) card image.
* Cards can be dragged here only if of type “Battlefield”.

#### **4. Runes (Yellow)**

* Two horizontal boxes for **Rune A** and **Rune B**.
* Each has:

  * Rune image
  * Color indicator (Red, Blue, Green, etc.)
  * “+” and “–” buttons to adjust count
  * Display showing quantity
* The total of both rune counts **must not exceed 12**.

#### **5. Side Deck (Orange)**

* Single horizontal row with **8 card slots**.
* Used for additional or situational cards.
* Similar drag-and-drop and hover logic to main deck.

---

### **Right Panel – Card Search & Filters (Green Zone)**

#### **Advanced Search Filters**

* Search by:

  * Card Name
  * Description
  * Type (Unit, Spell, Battlefield, Rune, Leader)
  * Cost or Energy
  * Color / Rune Type
  * Rarity
* Include dropdowns and text inputs with autocomplete.
* “Search” button executes backend query to card database.

#### **Search Results Display**

* Grid of card thumbnails, scrollable vertically.
* Clicking a card adds it to the selected deck area (default: main deck).
* Right-click offers “Add to side deck” or “Set as leader”.

#### **Sort & Filter Options**

* Sort by:

  * Name (A–Z)
  * Cost
  * Type
  * Rarity
* Toggle view between small icons and detailed list.
* Page controls (Next/Previous).

---

## ⚙️ Core Functionality

### **Deck CRUD Operations**

* Create, read, update, delete decks via REST endpoints.
* Each user has multiple decks saved to MongoDB.
* Deck structure:

  ```json
  {
    "userId": "string",
    "name": "string",
    "main": [ { "cardId": "string" } ],
    "leader": { "cardId": "string" },
    "battlefields": [ { "cardId": "string" }, ... ],
    "runes": {
      "colorA": { "color": "Red", "count": 6 },
      "colorB": { "color": "Blue", "count": 6 }
    },
    "side": [ { "cardId": "string" } ]
  }
  ```

---

## 🧩 Backend (FastAPI)

### **Endpoints**

| Method   | Route               | Description                     |
| -------- | ------------------- | ------------------------------- |
| `POST`   | `/auth/register`    | Create user                     |
| `POST`   | `/auth/login`       | Authenticate user               |
| `GET`    | `/cards`            | Search/filter Riftbound cards   |
| `POST`   | `/deck`             | Create new deck                 |
| `GET`    | `/deck/{id}`        | Retrieve deck                   |
| `PATCH`  | `/deck/{id}`        | Update deck                     |
| `DELETE` | `/deck/{id}`        | Delete deck                     |
| `GET`    | `/deck/list`        | List all decks for current user |
| `POST`   | `/deck/import`      | Import deck from file           |
| `GET`    | `/deck/export/{id}` | Export deck JSON                |
| `POST`   | `/deck/randomize`   | Generate random 40-card deck    |

### **Models**

* **User:** `username`, `email`, `password_hash`
* **Card:** `cardId`, `name`, `type`, `description`, `cost`, `color`, `rarity`, `imageUrl`
* **Deck:** As above.

### **Validation Rules**

* Main deck must be exactly 40 cards.
* Rune total ≤ 12.
* 1 leader max.
* Up to 3 battlefields.
* Side deck up to 8 cards.

---

## 🧱 Database (MongoDB)

Collections:

* `users`
* `cards`
* `decks`

Indexes:

* Cards: `name` (text), `description` (text), `type`, `color`
* Decks: `userId`, `name`
* Users: `username` (unique), `email` (unique)

---

## 🖥️ Frontend (React + Tailwind + Zustand)

### **Current Implementation Snapshot**

* React + Vite scaffold provides a static deck editor layout that mirrors the planned three-column structure (preview + controls, deck zones, advanced search).
* Presentational components render placeholder card data to visualize grids for the main deck, legend, battlefields, runes, side deck, and search results.
* Styling uses handcrafted CSS with responsive breakpoints to validate the target proportions before introducing Tailwind tokens.

### **State Management**

* Zustand store holds:

  * `user`
  * `currentDeck`
  * `cardSearchResults`
  * `uiSettings`
* Auto-saves deck on change (with debounce).

### **Component Breakdown**

* `DeckBuilderPage.jsx`

  * Grid layout for deck zones
  * Uses subcomponents for each section
* `CardPreviewPanel.jsx`

  * Displays selected card + text
* `DeckControls.jsx`

  * Save/delete/import/export
* `SearchPanel.jsx`

  * Filter inputs and search results
* `MainDeckGrid.jsx`

  * Renders the 8×5 main deck layout
* `LegendSlot.jsx`

  * Highlights the leader card with enlarged presentation
* `BattlefieldsRow.jsx`

  * Landscape cards for battlefield slots
* `RuneSection.jsx`

  * Displays rune counts with +/- controls
* `SideDeckRow.jsx`

  * Eight-slot horizontal reserve area

---

## 💡 UX Notes

* Cursor changes when dragging cards.
* Hover tooltips display card names.
* Color-coded borders for card rarity.
* Smooth transitions when cards are added or removed.
* Confirmation popups for deletes or clears.
* Toast notifications for save/import/export actions.

---

## 🔒 Authentication & Security

* JWT-based user sessions (handled via FastAPI).
* Password hashing using bcrypt.
* Only the deck owner can edit their decks.

---

## 🧰 Developer Setup

1. **Backend:**

   ```bash
   uvicorn app.main:app --reload
   ```
2. **Frontend:**

   ```bash
   npm install && npm run dev
   ```
3. **MongoDB:**

   * Use local or Atlas cluster.
   * Environment variables stored in `.env`.

---

## 🧠 Future Enhancements

* Public deck sharing (unique links).
* Deck analytics (curve, rune color ratios).
* Export to printable PDF proxy sheets.

