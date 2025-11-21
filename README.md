# Riftbound TCG Deckbuilder

A full-stack deckbuilder web app for the *Riftbound TCG*. Built with React, FastAPI, and MongoDB.

## 🚀 Quick Start

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Visit http://localhost:5173

### Backend

```bash
cd backend
# TODO: Add backend setup instructions
```

## 📁 Project Structure

```
riftbounddecks/
├── frontend/           # React + Vite app
│   ├── src/
│   │   ├── components/ # React components
│   │   ├── pages/     # Page components
│   │   ├── store/     # Zustand state management
│   │   ├── hooks/     # Custom React hooks
│   │   └── utils/     # Utility functions
│   └── ...
├── backend/            # FastAPI app
│   └── app/
└── PLAN.md            # Full project specifications
```

## 🛠️ Tech Stack

- **Frontend:** React 19, Vite, Tailwind CSS, Zustand
- **Backend:** FastAPI, MongoDB (to be implemented)
- **Development:** ESLint, Prettier

## 📖 Documentation

- [PLAN.md](./PLAN.md) - Full project specifications
- [AGENTS.md](./AGENTS.md) - Development guidelines and workflows
- [SETUP.md](./SETUP.md) - Initial server setup guide (one-time)
- [DEPLOYMENT.md](./DEPLOYMENT.md) - Deployment guide for VPS

## ✨ Features

- Create and manage Riftbound decks
- Browse and search cards with advanced filters
- Build decks in a visual grid-based editor
- Save, export, import, and randomize decks
- Manage leaders, battlefields, runes, and side decks

## 🚢 Deployment

Deploy both frontend and backend to the VPS:

```bash
# Full deployment (frontend + backend)
./scripts/deploy.sh

# Backend only
./scripts/deploy-backend.sh

# Frontend only
cd frontend && npm run deploy
```

See [DEPLOYMENT.md](./DEPLOYMENT.md) for detailed deployment instructions.

---

**Status:** 🟡 In Development - Hello World stage complete

