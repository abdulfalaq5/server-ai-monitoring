# =============================================================================
# Build Stage
# =============================================================================
FROM node:22-alpine AS builder

WORKDIR /app

# Copy dependency manifests
COPY package.json ./

# Install all dependencies (including devDependencies)
RUN npm install

# Copy source code and config files
COPY tsconfig.json ./
COPY src/ ./src/

# Compile TypeScript
RUN npm run build

# =============================================================================
# Production Stage
# =============================================================================
FROM node:22-alpine AS runner

WORKDIR /app

ENV NODE_ENV=production

# Copy package manifest
COPY package.json ./

# Install only production dependencies
RUN npm install --only=production

# Copy compiled files from builder stage
COPY --from=builder /app/dist ./dist

# Create storage mounts path
RUN mkdir -p /app/storage

# Run the bot
CMD ["npm", "start"]
