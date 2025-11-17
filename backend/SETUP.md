# Backend Setup Guide

## Quick Start

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Create `.env` file:**
   Create a `.env` file in the `backend/` directory with the following content:
   ```env
   PORT=3000
   NODE_ENV=development
   MONGODB_URI=mongodb://localhost:27017/riftbound_deckbuilder
   JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
   JWT_EXPIRES_IN=24h
   LOG_LEVEL=info
   LOG_DIR=./logs
   FRONTEND_URL=http://localhost:5173
   ```

3. **Start MongoDB:**
   Make sure MongoDB is running locally or update `MONGODB_URI` to point to your MongoDB instance.

4. **Initialize master registration key:**
   ```bash
   npm run init-master-key
   ```
   This creates a master registration key that can be used for unlimited registrations. Save the key that's printed - you'll need it for the first user registration.

5. **Start the server:**
   ```bash
   npm run dev
   ```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `PORT` | Server port | `3000` |
| `NODE_ENV` | Environment (development/production) | `development` |
| `MONGODB_URI` | MongoDB connection string | `mongodb://localhost:27017/riftbound_deckbuilder` |
| `JWT_SECRET` | Secret key for JWT tokens | **Required** |
| `JWT_EXPIRES_IN` | JWT token expiration | `24h` |
| `LOG_LEVEL` | Logging level (debug/info/warn/error) | `info` |
| `LOG_DIR` | Directory for log files | `./logs` |
| `FRONTEND_URL` | Frontend URL for CORS | `http://localhost:5173` |

## First User Registration

After starting the server and creating a master key:

1. Use the master key from step 4 above
2. Register a user via `POST /api/auth/register`:
   ```json
   {
     "username": "yourusername",
     "email": "your@email.com",
     "password": "SecurePassword123",
     "registrationKey": "your-master-key-here"
   }
   ```
3. The new user will automatically receive their own registration key with 3 uses

## Testing the API

### Register a User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "email": "test@example.com",
    "password": "Test1234",
    "registrationKey": "your-master-key-here"
  }'
```

### Login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "username": "testuser",
    "password": "Test1234"
  }'
```

### Get Current User (requires token)
```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Get User Preferences
```bash
curl -X GET http://localhost:3000/api/user/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Update Theme
```bash
curl -X POST http://localhost:3000/api/user/preferences \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "theme": "light"
  }'
```

### Change Password
```bash
curl -X POST http://localhost:3000/api/user/change-password \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "currentPassword": "Test1234",
    "newPassword": "NewPassword123"
  }'
```

## Logs

Logs are written to the `logs/` directory:
- `app-YYYY-MM-DD.log` - All application logs
- `error-YYYY-MM-DD.log` - Error logs only
- `access-YYYY-MM-DD.log` - HTTP request logs
- `exceptions-YYYY-MM-DD.log` - Uncaught exceptions
- `rejections-YYYY-MM-DD.log` - Unhandled promise rejections

## Troubleshooting

### MongoDB Connection Issues
- Ensure MongoDB is running: `mongod` or check your MongoDB service
- Verify the connection string in `.env`
- Check MongoDB logs for connection errors

### Port Already in Use
- Change `PORT` in `.env` to a different port
- Or stop the process using port 3000

### JWT Errors
- Ensure `JWT_SECRET` is set in `.env`
- Use a strong, random secret in production

### Registration Key Issues
- Master keys have unlimited uses (`isMasterKey: true`)
- Regular keys have 3 uses by default
- Check key usage via `GET /api/auth/registration-key`

