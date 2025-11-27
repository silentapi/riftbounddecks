# Frontend Dockerfile: multi-stage build that produces a static SPA served by nginx.
# Build-time env vars (either REACT_APP_* or VITE_*) control runtime URLs:
# - REACT_APP_API_BASE_URL / VITE_API_BASE_URL
# - REACT_APP_ENV / VITE_ENVIRONMENT
# - REACT_APP_ASSETS_BASE_URL / VITE_ASSETS_BASE_URL

FROM node:20-alpine AS build
WORKDIR /app

ARG REACT_APP_API_BASE_URL
ARG REACT_APP_ENV
ARG REACT_APP_ASSETS_BASE_URL
ARG VITE_API_BASE_URL
ARG VITE_ENVIRONMENT
ARG VITE_ASSETS_BASE_URL

ENV REACT_APP_API_BASE_URL=${REACT_APP_API_BASE_URL:-}
ENV REACT_APP_ENV=${REACT_APP_ENV:-}
ENV REACT_APP_ASSETS_BASE_URL=${REACT_APP_ASSETS_BASE_URL:-}

# Mirror the REACT_APP_* values to VITE_* so either convention works.
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL:-${REACT_APP_API_BASE_URL}}
ENV VITE_ENVIRONMENT=${VITE_ENVIRONMENT:-${REACT_APP_ENV}}
ENV VITE_ASSETS_BASE_URL=${VITE_ASSETS_BASE_URL:-${REACT_APP_ASSETS_BASE_URL}}

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM nginx:1.25-alpine AS runtime
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]

