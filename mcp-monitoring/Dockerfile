# =============================================================================
# MCP Monitoring Server - Dockerfile
# =============================================================================
# Multi-stage build: builder → production
# Node.js 22 Alpine (minimal attack surface)
# =============================================================================

# ---- Stage 1: Builder ----
FROM node:22-alpine AS builder

WORKDIR /app

# Install dependencies first (cached layer)
COPY package.json package-lock.json* ./
RUN npm install

# Copy source and compile
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

# ---- Stage 2: Production ----
FROM node:22-alpine AS production

# Install wget for healthcheck
RUN apk add --no-cache wget

WORKDIR /app

# Only production dependencies
COPY package.json package-lock.json* ./
RUN npm install --omit=dev && npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/dist ./dist

# Non-root user for security
RUN addgroup -S mcpgroup && adduser -S mcpuser -G mcpgroup
USER mcpuser

EXPOSE 9000

# Health endpoint check
HEALTHCHECK --interval=30s --timeout=10s --start-period=15s --retries=3 \
  CMD wget -qO- http://localhost:9000/health || exit 1

CMD ["node", "dist/server.js"]
