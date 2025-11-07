# Riftbound Deckbuilder API Documentation

This document defines all backend API endpoints that the frontend expects for deck management, user preferences, and authentication.

---

## 🔐 Authentication

All deck management endpoints require authentication via JWT token in the `Authorization` header:
```
Authorization: Bearer <jwt_token>
```

---

## 📦 Data Models

### Deck Model

```json
{
  "_id": "ObjectId",
  "userId": "string (ObjectId reference to users collection)",
  "name": "string",
  "chosenChampion": "string (cardId, e.g., 'OGN-039')",
  "mainDeck": ["string (array of cardIds, max 40)"],
  "sideDeck": ["string (array of cardIds, max 8)"],
  "battlefields": ["string (array of cardIds, max 3)"],
  "runeACount": "integer (0-12)",
  "runeBCount": "integer (0-12)",
  "legendCard": "string (cardId, e.g., 'OGN-247')",
  "dateCreated": "ISO 8601 datetime string",
  "lastUpdated": "ISO 8601 datetime string"
}
```

**Validation Rules:**
- `mainDeck`: Must contain exactly 40 card IDs (including empty slots represented as empty strings or null)
- `sideDeck`: Maximum 8 card IDs
- `battlefields`: Maximum 3 card IDs
- `runeACount + runeBCount`: Must not exceed 12
- `chosenChampion`: Single card ID (can be null)
- `legendCard`: Single card ID (can be null)
- `name`: Required, non-empty string, max 100 characters

### User Model

```json
{
  "_id": "ObjectId",
  "username": "string",
  "email": "string",
  "password_hash": "string (bcrypt hashed password)",
  "dateCreated": "ISO 8601 datetime string",
  "lastUpdated": "ISO 8601 datetime string"
}
```

**Validation Rules:**
- `username`: Required, unique, 3-50 characters, alphanumeric and underscores only
- `email`: Required, unique, valid email format
- `password_hash`: Required, bcrypt hashed password (never returned in API responses)
- `dateCreated`: Automatically set on creation
- `lastUpdated`: Automatically updated on modification

**Note:** The `password_hash` field should never be returned in API responses. Use a separate User Response model that excludes sensitive fields.

### User Response Model (Public)

```json
{
  "_id": "string (ObjectId)",
  "username": "string",
  "email": "string",
  "dateCreated": "ISO 8601 datetime string",
  "lastUpdated": "ISO 8601 datetime string"
}
```

### User Preferences Model

```json
{
  "_id": "ObjectId",
  "userId": "string (ObjectId reference to users collection)",
  "theme": "string ('dark' | 'light')",
  "lastOpenedDeck": "string (ObjectId reference to decks collection, nullable)",
  "dateCreated": "ISO 8601 datetime string",
  "lastUpdated": "ISO 8601 datetime string"
}
```

**Validation Rules:**
- `theme`: Must be either `"dark"` or `"light"` (default: `"dark"`)
- `lastOpenedDeck`: Optional, must be a valid deck ObjectId that belongs to the user (can be `null`)
- `userId`: Required, must match authenticated user

### Deck List Item (Summary)

```json
{
  "_id": "string (deck ObjectId)",
  "name": "string",
  "chosenChampion": "string (cardId)",
  "dateCreated": "ISO 8601 datetime string",
  "lastUpdated": "ISO 8601 datetime string"
}
```

---

## 🎴 Deck Management Endpoints

### 1. Get Deck List

**Endpoint:** `GET /api/decks`

**Description:** Retrieves a list of all decks belonging to the authenticated user. Used to populate the deck dropdown selector.

**Authentication:** Required

**Request:**
```http
GET /api/decks
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "decks": [
    {
      "_id": "507f1f77bcf86cd799439011",
      "name": "My First Deck",
      "chosenChampion": "OGN-039",
      "dateCreated": "2025-01-15T10:30:00Z",
      "lastUpdated": "2025-01-20T14:22:00Z"
    },
    {
      "_id": "507f1f77bcf86cd799439012",
      "name": "Competitive Build",
      "chosenChampion": "OGN-095",
      "dateCreated": "2025-01-18T09:15:00Z",
      "lastUpdated": "2025-01-21T16:45:00Z"
    }
  ]
}
```

**Status Codes:**
- `200 OK`: Success
- `401 Unauthorized`: Invalid or missing token
- `500 Internal Server Error`: Server error

---

### 2. Get Single Deck

**Endpoint:** `GET /api/decks/{deckId}`

**Description:** Retrieves the full contents of a specific deck. Used when a user selects a deck from the dropdown. This endpoint should also update the user's `lastOpenedDeck` preference to this deck ID.

**Authentication:** Required

**Request:**
```http
GET /api/decks/507f1f77bcf86cd799439011
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "userId": "507f191e810c19729de860ea",
  "name": "My First Deck",
  "chosenChampion": "OGN-039",
  "mainDeck": [
    "OGN-039", "OGN-095", "OGN-095", "OGN-095", "OGN-004", "OGN-004", "OGN-004",
    "OGN-009", "OGN-009", "OGN-009", "OGN-104", "OGN-104", "OGN-013", "OGN-013",
    "OGN-103", "OGN-103", "OGN-103", "OGN-029", "OGN-029", "OGN-029", "OGN-093",
    "OGN-093", "OGN-093", "OGN-096", "OGN-096", "OGN-096", "OGN-087", "OGN-087",
    "OGN-087", "OGN-024", "OGN-024", "OGN-024", "OGN-012", "OGN-012", "OGN-012",
    "OGN-027", "OGN-027", "OGN-027", "OGN-116", "OGN-116"
  ],
  "sideDeck": [
    "OGN-106", "OGN-106", "OGN-106", "OGN-116", "OGN-248", "OGN-248", "OGN-122", "OGN-122"
  ],
  "battlefields": [
    "OGN-289", "OGN-292", "OGN-285"
  ],
  "runeACount": 7,
  "runeBCount": 5,
  "legendCard": "OGN-247",
  "dateCreated": "2025-01-15T10:30:00Z",
  "lastUpdated": "2025-01-20T14:22:00Z"
}
```

**Status Codes:**
- `200 OK`: Success
- `401 Unauthorized`: Invalid or missing token
- `403 Forbidden`: Deck belongs to another user
- `404 Not Found`: Deck not found
- `500 Internal Server Error`: Server error

**Notes:**
- When this endpoint is called successfully, the server should automatically update the user's `lastOpenedDeck` preference to this deck's `_id`
- This allows the frontend to restore the last opened deck on next login

---

### 3. Create New Deck

**Endpoint:** `POST /api/decks`

**Description:** Creates a new empty deck with only a name. Used when the user clicks "New Deck".

**Authentication:** Required

**Request:**
```http
POST /api/decks
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Untitled Deck"
}
```

**Response:**
```json
{
  "_id": "507f1f77bcf86cd799439013",
  "userId": "507f191e810c19729de860ea",
  "name": "Untitled Deck",
  "chosenChampion": null,
  "mainDeck": [],
  "sideDeck": [],
  "battlefields": [],
  "runeACount": 0,
  "runeBCount": 0,
  "legendCard": null,
  "dateCreated": "2025-01-22T12:00:00Z",
  "lastUpdated": "2025-01-22T12:00:00Z"
}
```

**Status Codes:**
- `201 Created`: Deck created successfully
- `400 Bad Request`: Invalid request body (e.g., missing name, name too long)
- `401 Unauthorized`: Invalid or missing token
- `500 Internal Server Error`: Server error

---

### 4. Save Deck

**Endpoint:** `PUT /api/decks/{deckId}`

**Description:** Updates the contents of an existing deck. Used when the user clicks "Save Deck" or when auto-saving.

**Authentication:** Required

**Request:**
```http
PUT /api/decks/507f1f77bcf86cd799439011
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Updated Deck Name",
  "chosenChampion": "OGN-039",
  "mainDeck": [
    "OGN-039", "OGN-095", "OGN-095", "OGN-095", "OGN-004", "OGN-004", "OGN-004",
    "OGN-009", "OGN-009", "OGN-009", "OGN-104", "OGN-104", "OGN-013", "OGN-013",
    "OGN-103", "OGN-103", "OGN-103", "OGN-029", "OGN-029", "OGN-029", "OGN-093",
    "OGN-093", "OGN-093", "OGN-096", "OGN-096", "OGN-096", "OGN-087", "OGN-087",
    "OGN-087", "OGN-024", "OGN-024", "OGN-024", "OGN-012", "OGN-012", "OGN-012",
    "OGN-027", "OGN-027", "OGN-027", "OGN-116", "OGN-116"
  ],
  "sideDeck": [
    "OGN-106", "OGN-106", "OGN-106", "OGN-116", "OGN-248", "OGN-248", "OGN-122", "OGN-122"
  ],
  "battlefields": [
    "OGN-289", "OGN-292", "OGN-285"
  ],
  "runeACount": 7,
  "runeBCount": 5,
  "legendCard": "OGN-247"
}
```

**Response:**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "userId": "507f191e810c19729de860ea",
  "name": "Updated Deck Name",
  "chosenChampion": "OGN-039",
  "mainDeck": [
    "OGN-039", "OGN-095", "OGN-095", "OGN-095", "OGN-004", "OGN-004", "OGN-004",
    "OGN-009", "OGN-009", "OGN-009", "OGN-104", "OGN-104", "OGN-013", "OGN-013",
    "OGN-103", "OGN-103", "OGN-103", "OGN-029", "OGN-029", "OGN-029", "OGN-093",
    "OGN-093", "OGN-093", "OGN-096", "OGN-096", "OGN-096", "OGN-087", "OGN-087",
    "OGN-087", "OGN-024", "OGN-024", "OGN-024", "OGN-012", "OGN-012", "OGN-012",
    "OGN-027", "OGN-027", "OGN-027", "OGN-116", "OGN-116"
  ],
  "sideDeck": [
    "OGN-106", "OGN-106", "OGN-106", "OGN-116", "OGN-248", "OGN-248", "OGN-122", "OGN-122"
  ],
  "battlefields": [
    "OGN-289", "OGN-292", "OGN-285"
  ],
  "runeACount": 7,
  "runeBCount": 5,
  "legendCard": "OGN-247",
  "dateCreated": "2025-01-15T10:30:00Z",
  "lastUpdated": "2025-01-22T15:30:00Z"
}
```

**Status Codes:**
- `200 OK`: Deck updated successfully
- `400 Bad Request`: Invalid request body or validation failed
- `401 Unauthorized`: Invalid or missing token
- `403 Forbidden`: Deck belongs to another user
- `404 Not Found`: Deck not found
- `500 Internal Server Error`: Server error

**Notes:**
- All fields are optional in the request body; only provided fields will be updated
- `lastUpdated` is automatically set by the server
- Validation rules apply (e.g., mainDeck must be 40 cards, rune totals ≤ 12)

---

### 5. Save Deck As

**Endpoint:** `POST /api/decks/save-as`

**Description:** Creates a new deck with a new name but copies the contents from the current deck. Used when the user clicks "Save As".

**Authentication:** Required

**Request:**
```http
POST /api/decks/save-as
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Copy of My Deck",
  "sourceDeckId": "507f1f77bcf86cd799439011",
  "chosenChampion": "OGN-039",
  "mainDeck": [
    "OGN-039", "OGN-095", "OGN-095", "OGN-095", "OGN-004", "OGN-004", "OGN-004",
    "OGN-009", "OGN-009", "OGN-009", "OGN-104", "OGN-104", "OGN-013", "OGN-013",
    "OGN-103", "OGN-103", "OGN-103", "OGN-029", "OGN-029", "OGN-029", "OGN-093",
    "OGN-093", "OGN-093", "OGN-096", "OGN-096", "OGN-096", "OGN-087", "OGN-087",
    "OGN-087", "OGN-024", "OGN-024", "OGN-024", "OGN-012", "OGN-012", "OGN-012",
    "OGN-027", "OGN-027", "OGN-027", "OGN-116", "OGN-116"
  ],
  "sideDeck": [
    "OGN-106", "OGN-106", "OGN-106", "OGN-116", "OGN-248", "OGN-248", "OGN-122", "OGN-122"
  ],
  "battlefields": [
    "OGN-289", "OGN-292", "OGN-285"
  ],
  "runeACount": 7,
  "runeBCount": 5,
  "legendCard": "OGN-247"
}
```

**Response:**
```json
{
  "_id": "507f1f77bcf86cd799439014",
  "userId": "507f191e810c19729de860ea",
  "name": "Copy of My Deck",
  "chosenChampion": "OGN-039",
  "mainDeck": [
    "OGN-039", "OGN-095", "OGN-095", "OGN-095", "OGN-004", "OGN-004", "OGN-004",
    "OGN-009", "OGN-009", "OGN-009", "OGN-104", "OGN-104", "OGN-013", "OGN-013",
    "OGN-103", "OGN-103", "OGN-103", "OGN-029", "OGN-029", "OGN-029", "OGN-093",
    "OGN-093", "OGN-093", "OGN-096", "OGN-096", "OGN-096", "OGN-087", "OGN-087",
    "OGN-087", "OGN-024", "OGN-024", "OGN-024", "OGN-012", "OGN-012", "OGN-012",
    "OGN-027", "OGN-027", "OGN-027", "OGN-116", "OGN-116"
  ],
  "sideDeck": [
    "OGN-106", "OGN-106", "OGN-106", "OGN-116", "OGN-248", "OGN-248", "OGN-122", "OGN-122"
  ],
  "battlefields": [
    "OGN-289", "OGN-292", "OGN-285"
  ],
  "runeACount": 7,
  "runeBCount": 5,
  "legendCard": "OGN-247",
  "dateCreated": "2025-01-22T16:00:00Z",
  "lastUpdated": "2025-01-22T16:00:00Z"
}
```

**Status Codes:**
- `201 Created`: New deck created successfully
- `400 Bad Request`: Invalid request body or validation failed
- `401 Unauthorized`: Invalid or missing token
- `403 Forbidden`: Source deck belongs to another user (if sourceDeckId provided)
- `404 Not Found`: Source deck not found (if sourceDeckId provided)
- `500 Internal Server Error`: Server error

**Notes:**
- `sourceDeckId` is optional; if provided, the server may use it for validation, but the deck contents come from the request body
- The new deck is created with a fresh `_id` and timestamps

---

### 6. Rename Deck

**Endpoint:** `PATCH /api/decks/{deckId}/rename`

**Description:** Updates only the name of a deck. Used when the user renames a deck.

**Authentication:** Required

**Request:**
```http
PATCH /api/decks/507f1f77bcf86cd799439011/rename
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "name": "Renamed Deck"
}
```

**Response:**
```json
{
  "_id": "507f1f77bcf86cd799439011",
  "userId": "507f191e810c19729de860ea",
  "name": "Renamed Deck",
  "chosenChampion": "OGN-039",
  "mainDeck": [
    "OGN-039", "OGN-095", "OGN-095", "OGN-095", "OGN-004", "OGN-004", "OGN-004",
    "OGN-009", "OGN-009", "OGN-009", "OGN-104", "OGN-104", "OGN-013", "OGN-013",
    "OGN-103", "OGN-103", "OGN-103", "OGN-029", "OGN-029", "OGN-029", "OGN-093",
    "OGN-093", "OGN-093", "OGN-096", "OGN-096", "OGN-096", "OGN-087", "OGN-087",
    "OGN-087", "OGN-024", "OGN-024", "OGN-024", "OGN-012", "OGN-012", "OGN-012",
    "OGN-027", "OGN-027", "OGN-027", "OGN-116", "OGN-116"
  ],
  "sideDeck": [
    "OGN-106", "OGN-106", "OGN-106", "OGN-116", "OGN-248", "OGN-248", "OGN-122", "OGN-122"
  ],
  "battlefields": [
    "OGN-289", "OGN-292", "OGN-285"
  ],
  "runeACount": 7,
  "runeBCount": 5,
  "legendCard": "OGN-247",
  "dateCreated": "2025-01-15T10:30:00Z",
  "lastUpdated": "2025-01-22T17:00:00Z"
}
```

**Status Codes:**
- `200 OK`: Deck renamed successfully
- `400 Bad Request`: Invalid name (empty, too long, etc.)
- `401 Unauthorized`: Invalid or missing token
- `403 Forbidden`: Deck belongs to another user
- `404 Not Found`: Deck not found
- `500 Internal Server Error`: Server error

---

### 7. Delete Deck

**Endpoint:** `DELETE /api/decks/{deckId}`

**Description:** Removes a deck from the authenticated user's list of decks. Used when the user clicks "Delete Deck".

**Authentication:** Required

**Request:**
```http
DELETE /api/decks/507f1f77bcf86cd799439011
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "message": "Deck deleted successfully",
  "deletedId": "507f1f77bcf86cd799439011"
}
```

**Status Codes:**
- `200 OK`: Deck deleted successfully
- `401 Unauthorized`: Invalid or missing token
- `403 Forbidden`: Deck belongs to another user
- `404 Not Found`: Deck not found
- `500 Internal Server Error`: Server error

---

## 👤 User Preferences Endpoints

### 8. Get User Preferences

**Endpoint:** `GET /api/user/preferences`

**Description:** Retrieves the user's preferences (e.g., theme: dark/light). Used on app load to restore theme setting.

**Authentication:** Required

**Request:**
```http
GET /api/user/preferences
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "_id": "507f1f77bcf86cd799439020",
  "userId": "507f191e810c19729de860ea",
  "theme": "dark",
  "lastOpenedDeck": "507f1f77bcf86cd799439011",
  "dateCreated": "2025-01-15T10:30:00Z",
  "lastUpdated": "2025-01-20T14:22:00Z"
}
```

**Status Codes:**
- `200 OK`: Success
- `401 Unauthorized`: Invalid or missing token
- `404 Not Found`: Preferences not found (should create default on first access)
- `500 Internal Server Error`: Server error

**Notes:**
- If preferences don't exist, the server should return default preferences (`theme: "dark"`, `lastOpenedDeck: null`) or create them automatically
- `lastOpenedDeck` can be `null` if no deck has been opened yet

---

### 9. Update User Preferences

**Endpoint:** `POST /api/user/preferences`

**Description:** Creates or updates user preferences. Used when the user toggles dark/light mode.

**Authentication:** Required

**Request:**
```http
POST /api/user/preferences
Authorization: Bearer <jwt_token>
Content-Type: application/json

{
  "theme": "light",
  "lastOpenedDeck": "507f1f77bcf86cd799439011"
}
```

**Response:**
```json
{
  "_id": "507f1f77bcf86cd799439020",
  "userId": "507f191e810c19729de860ea",
  "theme": "light",
  "lastOpenedDeck": "507f1f77bcf86cd799439011",
  "dateCreated": "2025-01-15T10:30:00Z",
  "lastUpdated": "2025-01-22T18:00:00Z"
}
```

**Status Codes:**
- `200 OK`: Preferences updated successfully
- `201 Created`: Preferences created successfully (if didn't exist)
- `400 Bad Request`: Invalid request body (e.g., invalid theme value, invalid deck ID)
- `401 Unauthorized`: Invalid or missing token
- `403 Forbidden`: `lastOpenedDeck` references a deck that doesn't belong to the user
- `404 Not Found`: `lastOpenedDeck` references a deck that doesn't exist
- `500 Internal Server Error`: Server error

**Notes:**
- This endpoint should upsert (create if doesn't exist, update if exists)
- `theme` must be either `"dark"` or `"light"`
- `lastOpenedDeck` is optional; can be set to `null` to clear it
- Both `theme` and `lastOpenedDeck` are optional in the request body; only provided fields will be updated
- If `lastOpenedDeck` is provided, the server must verify the deck exists and belongs to the user

---

## 🚪 Authentication Endpoints

### 10. Register User

**Endpoint:** `POST /api/auth/register`

**Description:** Creates a new user account. Used when a user signs up for the first time.

**Authentication:** Not required

**Request:**
```http
POST /api/auth/register
Content-Type: application/json

{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "user": {
    "_id": "507f191e810c19729de860ea",
    "username": "johndoe",
    "email": "john@example.com",
    "dateCreated": "2025-01-22T10:00:00Z",
    "lastUpdated": "2025-01-22T10:00:00Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

**Status Codes:**
- `201 Created`: User created successfully
- `400 Bad Request`: Invalid request body (e.g., missing fields, invalid email format, weak password)
- `409 Conflict`: Username or email already exists
- `500 Internal Server Error`: Server error

**Validation Rules:**
- `username`: Required, 3-50 characters, alphanumeric and underscores only, unique
- `email`: Required, valid email format, unique
- `password`: Required, minimum 8 characters, should contain at least one letter and one number

**Notes:**
- Password should be hashed using bcrypt before storage
- JWT token is returned immediately upon successful registration for automatic login
- User preferences are automatically created with default values (`theme: "dark"`, `lastOpenedDeck: null`)

---

### 11. Login

**Endpoint:** `POST /api/auth/login`

**Description:** Authenticates a user and returns a JWT token. Used when a user logs in.

**Authentication:** Not required

**Request:**
```http
POST /api/auth/login
Content-Type: application/json

{
  "username": "johndoe",
  "password": "SecurePassword123!"
}
```

**Alternative Request (email login):**
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "john@example.com",
  "password": "SecurePassword123!"
}
```

**Response:**
```json
{
  "user": {
    "_id": "507f191e810c19729de860ea",
    "username": "johndoe",
    "email": "john@example.com",
    "dateCreated": "2025-01-22T10:00:00Z",
    "lastUpdated": "2025-01-22T10:00:00Z"
  },
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "preferences": {
    "_id": "507f1f77bcf86cd799439020",
    "userId": "507f191e810c19729de860ea",
    "theme": "dark",
    "lastOpenedDeck": "507f1f77bcf86cd799439011",
    "dateCreated": "2025-01-22T10:00:00Z",
    "lastUpdated": "2025-01-22T15:00:00Z"
  }
}
```

**Status Codes:**
- `200 OK`: Login successful
- `400 Bad Request`: Invalid request body (missing username/email or password)
- `401 Unauthorized`: Invalid username/email or password
- `500 Internal Server Error`: Server error

**Notes:**
- User can login with either `username` or `email` (but not both in the same request)
- Password is verified against the stored bcrypt hash
- JWT token should include user ID and have an expiration time (e.g., 24 hours)
- User preferences are included in the response to allow frontend to restore theme and last opened deck immediately

---

### 12. Get Current User

**Endpoint:** `GET /api/auth/me`

**Description:** Retrieves the currently authenticated user's information. Used to verify token validity and get user details.

**Authentication:** Required

**Request:**
```http
GET /api/auth/me
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "_id": "507f191e810c19729de860ea",
  "username": "johndoe",
  "email": "john@example.com",
  "dateCreated": "2025-01-22T10:00:00Z",
  "lastUpdated": "2025-01-22T10:00:00Z"
}
```

**Status Codes:**
- `200 OK`: Success
- `401 Unauthorized`: Invalid or missing token
- `500 Internal Server Error`: Server error

**Notes:**
- This endpoint is useful for verifying token validity and refreshing user data
- Password hash is never included in the response

---

### 13. Logout

**Endpoint:** `POST /api/auth/logout`

**Description:** Logs out the user. Used when the user clicks "Exit".

**Authentication:** Required (token will be invalidated)

**Request:**
```http
POST /api/auth/logout
Authorization: Bearer <jwt_token>
```

**Response:**
```json
{
  "message": "Logged out successfully"
}
```

**Status Codes:**
- `200 OK`: Logged out successfully
- `401 Unauthorized`: Invalid or missing token
- `500 Internal Server Error`: Server error

**Notes:**
- If using token blacklisting, add the token to a blacklist
- Frontend should clear the token from storage on successful logout

---

## 🔄 Error Response Format

All error responses follow this format:

```json
{
  "error": {
    "code": "ERROR_CODE",
    "message": "Human-readable error message",
    "details": {}
  }
}
```

**Common Error Codes:**
- `VALIDATION_ERROR`: Request body validation failed
- `UNAUTHORIZED`: Missing or invalid authentication token
- `FORBIDDEN`: User doesn't have permission to access resource
- `NOT_FOUND`: Resource not found
- `SERVER_ERROR`: Internal server error

---

## 📝 Implementation Notes

1. **Authentication:** All endpoints except `/api/auth/login` and `/api/auth/register` require JWT authentication.

2. **Last Opened Deck:** The `lastOpenedDeck` preference is automatically updated when:
   - A user successfully retrieves a deck via `GET /api/decks/{deckId}`
   - A user explicitly updates preferences via `POST /api/user/preferences`
   - The frontend can use this to restore the last opened deck on app load

3. **User Isolation:** All deck operations must verify that the `userId` matches the authenticated user's ID.

4. **Validation:** Server-side validation is required for all deck operations:
   - Main deck must be exactly 40 cards
   - Side deck maximum 8 cards
   - Battlefields maximum 3 cards
   - Rune counts must total ≤ 12

5. **Timestamps:** `dateCreated` is set on creation and never changes. `lastUpdated` is updated on every modification.

6. **Card IDs:** Card IDs follow the format `"OGN-XXX"` where XXX is a three-digit number. The server should validate that card IDs exist in the cards collection, but this validation can be optional for MVP.

7. **Empty Decks:** When creating a new deck, initialize arrays as empty arrays `[]` and counts as `0`, not `null`.

8. **Deck List:** The deck list endpoint returns a summary to reduce payload size. Only include essential fields for the dropdown.

9. **Password Security:** Passwords must be hashed using bcrypt before storage. Never return password hashes in API responses. Use a separate User Response model that excludes sensitive fields.

10. **JWT Tokens:** JWT tokens should include the user ID in the payload and have a reasonable expiration time (e.g., 24 hours). Consider implementing token refresh for better security.

---

## 🧪 Testing Considerations

When implementing these endpoints, ensure:

- ✅ Authentication middleware properly extracts and validates JWT tokens
- ✅ User ownership is verified for all deck operations
- ✅ Validation rules are enforced server-side
- ✅ Error responses are consistent and informative
- ✅ Timestamps are properly formatted (ISO 8601)
- ✅ Empty arrays/null values are handled correctly
- ✅ Edge cases are covered (e.g., deleting non-existent deck, updating with invalid data)

