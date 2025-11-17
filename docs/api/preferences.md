# User Preferences API

User preferences management endpoints for theme, default deck, and other settings.

## Authentication

All preferences endpoints require authentication via JWT token:
```
Authorization: Bearer <jwt_token>
```

## Endpoints

### Get Preferences

**GET** `/api/user/preferences`

Get current user's preferences.

**Response:** `200 OK`
```json
{
  "_id": "507f1f77bcf86cd799439020",
  "userId": "507f191e810c19729de860ea",
  "theme": "dark",
  "lastOpenedDeck": null,
  "defaultDeckId": "550e8400-e29b-41d4-a716-446655440000",
  "screenshotMode": "full",
  "dateCreated": "2025-01-22T10:00:00Z",
  "lastUpdated": "2025-01-22T15:00:00Z"
}
```

**Status Codes:**
- `200 OK` - Success
- `401 Unauthorized` - Invalid or missing token

---

### Update Preferences

**POST** `/api/user/preferences`

Update user preferences (upsert - creates if doesn't exist).

**Request:**
```json
{
  "theme": "light",
  "defaultDeckId": "550e8400-e29b-41d4-a716-446655440000",
  "screenshotMode": "deck"
}
```

**Response:** `200 OK` or `201 Created`
```json
{
  "_id": "507f1f77bcf86cd799439020",
  "userId": "507f191e810c19729de860ea",
  "theme": "light",
  "lastOpenedDeck": null,
  "defaultDeckId": "550e8400-e29b-41d4-a716-446655440000",
  "screenshotMode": "deck",
  "dateCreated": "2025-01-22T10:00:00Z",
  "lastUpdated": "2025-01-22T18:00:00Z"
}
```

**Validation:**
- `theme`: Optional, must be "light" or "dark"
- `defaultDeckId`: Optional, must be valid UUID of a deck owned by user, or null
- `screenshotMode`: Optional, must be "full" or "deck"
- `lastOpenedDeck`: Optional, must be valid ObjectId or UUID, or null

**Status Codes:**
- `200 OK` - Preferences updated
- `201 Created` - Preferences created
- `400 Bad Request` - Validation error
- `401 Unauthorized` - Invalid or missing token
- `404 Not Found` - Default deck not found or doesn't belong to user

---

## Preferences Fields

### theme
- **Type**: String
- **Values**: `"light"` | `"dark"`
- **Default**: `"dark"`
- **Description**: UI theme preference

### defaultDeckId
- **Type**: String (UUID) | null
- **Default**: `null`
- **Description**: UUID of the user's default deck
- **Validation**: Must be a valid deck UUID owned by the user

### screenshotMode
- **Type**: String
- **Values**: `"full"` | `"deck"`
- **Default**: `"full"`
- **Description**: Preferred screenshot view mode

### lastOpenedDeck
- **Type**: ObjectId | UUID | null
- **Default**: `null`
- **Description**: Reference to the last opened deck (can be ObjectId or UUID)

