# Riftbound Deckbuilder Backend

Node.js Express backend server for the Riftbound TCG Deckbuilder application.

## Features

- **User Authentication**: Registration with invite codes, login, and JWT-based authentication
- **User Management**: View and update account settings (theme, password)
- **Invite System**: Each user receives 3 claimable invite codes upon registration
- **MongoDB Integration**: Document-based database for users, preferences, and registration keys
- **Verbose Logging**: Rolling log files in `logs/` directory with daily rotation
- **Colyseus-Ready**: Designed with future game server integration in mind

## Tech Stack

- **Node.js** with Express.js
- **MongoDB** with Mongoose ODM
- **JWT** for authentication
- **bcryptjs** for password hashing
- **Winston** with daily-rotate-file for logging
- **express-validator** for request validation

## Setup

### Prerequisites

- Node.js 18+ 
- MongoDB (local or Atlas)

### Installation

1. Install dependencies:
```bash
npm install
```

2. Create a `.env` file (copy from `.env.example`):
```bash
cp .env.example .env
```

3. Configure environment variables in `.env`:
```env
PORT=3000
NODE_ENV=development
MONGODB_URI=mongodb://localhost:27017/riftbound_deckbuilder
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=24h
LOG_LEVEL=info
LOG_DIR=./logs
```

4. Start the server:
```bash
# Development (with auto-reload)
npm run dev

# Production
npm start
```

## API Endpoints

### Authentication

- `POST /api/auth/register` - Register a new user (requires invite code)
- `POST /api/auth/login` - Login with username/email and password
- `GET /api/auth/me` - Get current authenticated user
- `GET /api/auth/registration-key` - Get user's registration key info

### User Settings

- `GET /api/user/preferences` - Get user preferences (theme, last opened deck)
- `POST /api/user/preferences` - Update user preferences
- `POST /api/user/change-password` - Change user password

## Database Models

### User
- `username` (unique)
- `email` (unique)
- `password_hash`
- `dateCreated`, `lastUpdated`

### UserPreferences
- `userId` (reference to User)
- `theme` ('light' or 'dark')
- `lastOpenedDeck` (reference to Deck, nullable)
- `dateCreated`, `lastUpdated`

### RegistrationKey
- `key` (unique hex string)
- `ownerId` (reference to User)
- `maxUses` (default: 3, -1 for unlimited)
- `currentUses`
- `isMasterKey` (boolean)
- `dateCreated`, `lastUpdated`

### RegistrationUsage
- `registrationKeyId` (reference to RegistrationKey)
- `registeredUserId` (reference to User)
- `dateCreated`

## Logging

Logs are written to the `logs/` directory with daily rotation:

- `app-YYYY-MM-DD.log` - All application logs
- `error-YYYY-MM-DD.log` - Error logs only
- `access-YYYY-MM-DD.log` - HTTP request/response logs
- `exceptions-YYYY-MM-DD.log` - Uncaught exceptions
- `rejections-YYYY-MM-DD.log` - Unhandled promise rejections

Logs are kept for 14 days (30 days for errors) and rotated when they exceed 20MB.

## Invite Code System

1. New users register with a valid invite code
2. Upon successful registration, users receive their own invite code with 3 uses
3. Users can view their invite code and see who registered using it
4. Master keys (admin-created) have unlimited uses

## Future Integration with Colyseus

The backend is structured to easily integrate Colyseus game server:

- Authentication tokens can be validated by Colyseus
- User data is accessible via MongoDB
- Separate game server can run alongside Express API
- Shared database allows seamless data access

## Development

### Project Structure

```
backend/
├── src/
│   ├── config/
│   │   ├── database.js      # MongoDB connection
│   │   └── logger.js        # Winston logging setup
│   ├── middleware/
│   │   ├── auth.js          # JWT authentication
│   │   ├── errorHandler.js  # Error handling
│   │   └── requestLogger.js # HTTP request logging
│   ├── models/
│   │   ├── User.js
│   │   ├── UserPreferences.js
│   │   ├── RegistrationKey.js
│   │   └── RegistrationUsage.js
│   ├── routes/
│   │   ├── auth.js          # Authentication routes
│   │   └── user.js          # User settings routes
│   └── index.js             # Express app entry point
├── logs/                    # Log files (gitignored)
├── .env                     # Environment variables (gitignored)
├── .env.example
├── package.json
└── README.md
```

## Testing

Run tests (when implemented):
```bash
npm test
```

## License

ISC

