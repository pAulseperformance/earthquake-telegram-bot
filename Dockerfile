# Build stage
FROM node:16-alpine AS builder

WORKDIR /app

# Copy package files for efficient layer caching
COPY earthquake-notifier/package*.json ./

# Install dependencies without running the prepare script
RUN npm install --ignore-scripts

# Copy all project files
COPY earthquake-notifier/tsconfig.json ./
COPY earthquake-notifier/src ./src

# List files to verify they are copied correctly
RUN ls -la && ls -la src/

# Run TypeScript compiler explicitly
RUN npx tsc


# Production stage
FROM node:16-alpine

WORKDIR /app

# Copy package files
COPY earthquake-notifier/package*.json ./

# Install only production dependencies
# Skip the prepare script which would try to run build again
RUN npm install --omit=dev --ignore-scripts

# Copy built app from builder stage (only copy once)
COPY --from=builder /app/dist ./dist

# Debug: List files to verify dist was copied correctly
RUN ls -la && ls -la dist/ || echo "Dist directory not found or empty"

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
