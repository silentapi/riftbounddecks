# Decks API

Deck management endpoints for creating, reading, updating, and deleting decks.

## Authentication

All deck endpoints require authentication via JWT token:
```
Authorization: Bearer <jwt_token>
```

## Endpoints

### List Decks

**GET** `/api/decks`

Get all decks for the authenticated user.

**Response:** `200 OK`
```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "userId": "507f191e810c19729de860ea",
    "name": "My First Deck",
    "cards": {
      "mainDeck": ["OGN-039", "OGN-095", ...],
      "chosenChampion": "OGN-039",
      "sideDeck": ["OGN-106", ...],
      "battlefields": ["OGN-289", "OGN-292"],
      "runeACount": 6,
      "runeBCount": 6,
      "runeAVariantIndex": 0,
      "runeBVariantIndex": 0,
      "legendCard": "OGN-247"
    },
    "createdAt": "2025-01-22T10:00:00Z",
    "updatedAt": "2025-01-22T15:00:00Z"
  }
]
```

**Status Codes:**
- `200 OK` - Success
- `401 Unauthorized` - Invalid or missing token

---

### Get Deck

**GET** `/api/decks/:id`

Get a single deck by UUID.

**Parameters:**
- `id` (path) - Deck UUID

**Response:** `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "507f191e810c19729de860ea",
  "name": "My First Deck",
  "cards": {
    "mainDeck": ["OGN-039", "OGN-095", ...],
    "chosenChampion": "OGN-039",
    "sideDeck": ["OGN-106", ...],
    "battlefields": ["OGN-289", "OGN-292"],
    "runeACount": 6,
    "runeBCount": 6,
    "runeAVariantIndex": 0,
    "runeBVariantIndex": 0,
    "legendCard": "OGN-247"
  },
  "createdAt": "2025-01-22T10:00:00Z",
  "updatedAt": "2025-01-22T15:00:00Z"
}
```

**Status Codes:**
- `200 OK` - Success
- `401 Unauthorized` - Invalid or missing token
- `404 Not Found` - Deck not found

---

### Create Deck

**POST** `/api/decks`

Create a new deck.

**Request:**
```json
{
  "name": "New Deck",
  "cards": {
    "mainDeck": [],
    "chosenChampion": null,
    "sideDeck": [],
    "battlefields": [],
    "runeACount": 6,
    "runeBCount": 6,
    "runeAVariantIndex": 0,
    "runeBVariantIndex": 0,
    "legendCard": null
  }
}
```

**Response:** `201 Created`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "507f191e810c19729de860ea",
  "name": "New Deck",
  "cards": { ... },
  "createdAt": "2025-01-22T10:00:00Z",
  "updatedAt": "2025-01-22T10:00:00Z"
}
```

**Validation:**
- `name`: Required, 1-64 characters, case-insensitive unique per user
- `cards`: Optional, defaults to empty deck structure

**Status Codes:**
- `201 Created` - Deck created successfully
- `400 Bad Request` - Validation error
- `401 Unauthorized` - Invalid or missing token
- `409 Conflict` - Deck name already exists

---

### Update Deck

**PATCH** `/api/decks/:id`

Update deck contents or name.

**Parameters:**
- `id` (path) - Deck UUID

**Request:**
```json
{
  "name": "Updated Deck Name",
  "cards": {
    "mainDeck": ["OGN-039", "OGN-095", ...],
    "chosenChampion": "OGN-039",
    ...
  }
}
```

**Response:** `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "507f191e810c19729de860ea",
  "name": "Updated Deck Name",
  "cards": { ... },
  "createdAt": "2025-01-22T10:00:00Z",
  "updatedAt": "2025-01-22T16:00:00Z"
}
```

**Validation:**
- `name`: Optional, 1-64 characters if provided
- `cards`: Optional object with deck contents

**Status Codes:**
- `200 OK` - Deck updated successfully
- `400 Bad Request` - Validation error
- `401 Unauthorized` - Invalid or missing token
- `404 Not Found` - Deck not found
- `409 Conflict` - Deck name already exists

---

### Rename Deck

**PATCH** `/api/decks/:id/rename`

Rename a deck.

**Parameters:**
- `id` (path) - Deck UUID

**Request:**
```json
{
  "name": "Renamed Deck"
}
```

**Response:** `200 OK`
```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "userId": "507f191e810c19729de860ea",
  "name": "Renamed Deck",
  "cards": { ... },
  "createdAt": "2025-01-22T10:00:00Z",
  "updatedAt": "2025-01-22T16:00:00Z"
}
```

**Validation:**
- `name`: Required, 1-64 characters, case-insensitive unique per user

**Status Codes:**
- `200 OK` - Deck renamed successfully
- `400 Bad Request` - Validation error
- `401 Unauthorized` - Invalid or missing token
- `404 Not Found` - Deck not found
- `409 Conflict` - Deck name already exists

---

### Delete Deck

**DELETE** `/api/decks/:id`

Delete a deck.

**Parameters:**
- `id` (path) - Deck UUID

**Response:** `200 OK`
```json
{
  "message": "Deck deleted successfully"
}
```

**Validation:**
- Cannot delete the last deck (user must always have at least one deck)
- Automatically clears `defaultDeckId` if this deck was the default

**Status Codes:**
- `200 OK` - Deck deleted successfully
- `400 Bad Request` - Cannot delete last deck
- `401 Unauthorized` - Invalid or missing token
- `404 Not Found` - Deck not found

---

### Ensure One Deck

**POST** `/api/decks/ensure-one`

Ensure at least one deck exists for the user. Creates "Empty Deck" if none exist.

**Response:** `200 OK` or `201 Created`
```json
{
  "created": true,
  "deck": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "name": "Empty Deck",
    "cards": { ... },
    ...
  }
}
```

**Status Codes:**
- `200 OK` - User already has decks
- `201 Created` - Empty deck created

---

## Deck Validation Rules

- **Main Deck**: Maximum 40 cards
- **Side Deck**: Maximum 8 cards
- **Battlefields**: Maximum 3 cards
- **Runes**: `runeACount + runeBCount` must not exceed 12
- **Name**: 1-64 characters, case-insensitive unique per user

