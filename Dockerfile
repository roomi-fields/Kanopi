# syntax=docker/dockerfile:1

# Stage 1: build the static SPA with /kanopi/ as the public base path.
FROM node:20-alpine AS build
WORKDIR /src

# Install dependencies first (better Docker layer caching).
# Workspace layout: root package.json + lockfile, two npm workspaces under
# packages/ (ui, core). packages/library/ is a plain folder (no package.json),
# consumed by the UI via relative `?raw` imports — it does not participate in
# `npm ci`, but copying its package.json would fail. Bring it in with the
# source copy below instead.
COPY package.json package-lock.json ./
COPY packages/ui/package.json packages/ui/
COPY packages/core/package.json packages/core/
RUN npm ci --legacy-peer-deps

# Copy source and build with the subpath baked in. VITE_BASE_PATH is read by
# vite.config.ts at build time (see Phase 5.1). Equivalent to `npm run build:prod`.
COPY . .
ENV VITE_BASE_PATH=/kanopi/
RUN cd packages/ui && npm run build

# Stage 2: nginx:alpine serves the built dist/ under /kanopi/.
FROM nginx:alpine
COPY --from=build /src/packages/ui/dist/ /usr/share/nginx/html/kanopi/
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
