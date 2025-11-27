# Backend Dockerfile for the Riftbound Deckbuilder API.
# Builds the Node/Express server in production mode and relies on runtime env vars:
# - MONGO_URI (Mongo connection string, mapped to MONGODB_URI)
# - APP_ENV (e.g. test or prod)
# - CDN_BASE_URL (base URL where the worker uploads cards/assets)
FROM node:20-alpine

WORKDIR /app

# NODE_ENV and APP_ENV should both be production-ready unless overrides are provided.
ENV NODE_ENV=production
ENV APP_ENV=production

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Listen on port 3000 by default; Docker command should map to the desired host port.
EXPOSE 3000

CMD ["npm", "start"]

