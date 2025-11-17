# Authentication API

Authentication endpoints for user registration, login, and session management.

## Endpoints

### Register User

**POST** `/api/auth/register`

Create a new user account with an invite code.

**Request:**
```json
{
  "username": "johndoe",
  "email": "john@example.com",
  "password": "SecurePassword123!",
  "registrationKey": "abc123xyz789"
}
```

**Response:** `201 Created`
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
    "lastOpenedDeck": null,
    "defaultDeckId": null,
    "screenshotMode": "full",
    "dateCreated": "2025-01-22T10:00:00Z",
    "lastUpdated": "2025-01-22T10:00:00Z"
  }
}
```

**Validation:**
- `username`: 3-50 characters, alphanumeric and underscores only, unique
- `email`: Valid email format, unique
- `password`: Minimum 8 characters, at least one letter and one number
- `registrationKey`: Must be valid and have remaining uses

**Status Codes:**
- `201 Created` - User created successfully
- `400 Bad Request` - Validation error
- `404 Not Found` - Registration key not found
- `403 Forbidden` - Registration key exhausted
- `409 Conflict` - Username or email already exists

---

### Login

**POST** `/api/auth/login`

Authenticate user and receive JWT token.

**Request:**
```json
{
  "username": "johndoe",
  "password": "SecurePassword123!"
}
```

**Alternative (email login):**
```json
{
  "email": "john@example.com",
  "password": "SecurePassword123!"
}
```

**Response:** `200 OK`
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
    "lastOpenedDeck": null,
    "defaultDeckId": null,
    "screenshotMode": "full",
    "dateCreated": "2025-01-22T10:00:00Z",
    "lastUpdated": "2025-01-22T10:00:00Z"
  }
}
```

**Status Codes:**
- `200 OK` - Login successful
- `400 Bad Request` - Missing username/email or password
- `401 Unauthorized` - Invalid credentials

---

### Get Current User

**GET** `/api/auth/me`

Get currently authenticated user information.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:** `200 OK`
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
- `200 OK` - Success
- `401 Unauthorized` - Invalid or missing token

---

### Get Registration Key

**GET** `/api/auth/registration-key`

Get current user's registration key information.

**Headers:**
```
Authorization: Bearer <jwt_token>
```

**Response:** `200 OK`
```json
{
  "_id": "507f1f77bcf86cd799439021",
  "key": "abc123xyz789",
  "ownerId": "507f191e810c19729de860ea",
  "maxUses": 3,
  "currentUses": 1,
  "remainingUses": 2,
  "isMasterKey": false,
  "dateCreated": "2025-01-22T10:00:00Z",
  "lastUpdated": "2025-01-22T10:00:00Z",
  "usageHistory": [
    {
      "_id": "507f1f77bcf86cd799439022",
      "registeredUser": {
        "_id": "507f191e810c19729de860eb",
        "username": "newuser",
        "email": "newuser@example.com",
        "dateCreated": "2025-01-23T10:00:00Z"
      },
      "dateCreated": "2025-01-23T10:00:00Z"
    }
  ]
}
```

**Status Codes:**
- `200 OK` - Success
- `401 Unauthorized` - Invalid or missing token
- `404 Not Found` - Registration key not found
