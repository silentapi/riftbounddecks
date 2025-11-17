# Setup Documentation

## Backend Setup

See [backend/SETUP.md](../backend/SETUP.md) for detailed backend setup instructions.

## Frontend Setup

See [frontend/README.md](../frontend/README.md) for frontend setup instructions.

## Environment Variables

### Backend (.env)

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

### Frontend

Frontend environment variables (if needed) should be configured in `frontend/.env`.

## Initial Setup Steps

1. **Install Backend Dependencies**
   ```bash
   cd backend
   npm install
   ```

2. **Install Frontend Dependencies**
   ```bash
   cd frontend
   npm install
   ```

3. **Configure Environment**
   - Copy `backend/.env.example` to `backend/.env`
   - Update MongoDB URI and JWT secret

4. **Initialize Master Registration Key**
   ```bash
   cd backend
   npm run init-master-key
   ```

5. **Start Services**
   - Backend: `cd backend && npm run dev`
   - Frontend: `cd frontend && npm run dev`

