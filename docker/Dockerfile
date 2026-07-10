# ---- Build stage: web UI ----------------------------------------------------
FROM node:22-alpine AS web-build
WORKDIR /app/web
COPY web/package*.json ./
RUN npm ci --no-audit --no-fund || npm install --no-audit --no-fund
COPY web/ ./
RUN npm run build

# ---- Build stage: API --------------------------------------------------------
FROM node:22-alpine AS api-build
WORKDIR /app
COPY package*.json ./
RUN npm ci --no-audit --no-fund
COPY tsconfig.json vitest.config.ts ./
COPY src/ src/
COPY scripts/ scripts/
COPY tests/ tests/
RUN npx tsc -p tsconfig.json

# ---- Runtime ------------------------------------------------------------------
FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --no-audit --no-fund && addgroup -S openlot && adduser -S openlot -G openlot
COPY --from=api-build /app/dist ./dist
COPY --from=web-build /app/web/dist ./web/dist
COPY migrations/ ./migrations/
USER openlot
EXPOSE 4400
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:4400/api/health || exit 1
CMD ["node", "dist/src/index.js"]
