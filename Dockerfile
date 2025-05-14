# Build stage
FROM node:16-alpine AS builder

WORKDIR /app

# Copy package files for efficient layer caching
COPY earthquake-notifier/package*.json ./

# Install all dependencies (including dev dependencies for build)
RUN npm install && npm install -g typescript

# Copy project files
COPY earthquake-notifier/src ./src
COPY earthquake-notifier/tsconfig.json ./

# Build the TypeScript project
RUN npm run build

# Production stage
FROM node:16-alpine

WORKDIR /app

# Copy package files
COPY earthquake-notifier/package*.json ./

# Install only production dependencies
# --ignore-scripts prevents prepare/preinstall scripts from running
RUN npm install --production --ignore-scripts

# Copy built app from builder stage
COPY --from=builder /app/dist ./dist

# Create data directory for persisting subscriber data
RUN mkdir -p data

# Set environment variables
ENV NODE_ENV=production

# Expose port for health checks
EXPOSE 8080

# Add healthcheck
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:8080/health || exit 1

# Start the bot
CMD ["node", "dist/index.js"]
