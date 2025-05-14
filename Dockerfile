# Build stage
FROM node:16-alpine AS builder

# Add non-root user for build stage
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 -G nodejs

WORKDIR /app

# Set ownership for the working directory
RUN chown nodejs:nodejs /app

# Switch to non-root user
USER nodejs

# Copy package files for efficient layer caching
COPY --chown=nodejs:nodejs earthquake-notifier/package*.json ./

# Install dependencies using npm ci for more reliable builds
RUN npm ci --ignore-scripts

# Copy project files
COPY --chown=nodejs:nodejs earthquake-notifier/tsconfig.json ./
COPY --chown=nodejs:nodejs earthquake-notifier/src ./src

# Run TypeScript compiler
RUN npx tsc

# Production stage
FROM node:16-alpine

# Add non-root user for production
RUN addgroup -g 1001 -S nodejs && adduser -S nodejs -u 1001 -G nodejs

WORKDIR /app

# Set ownership for the working directory
RUN chown nodejs:nodejs /app

# Copy package files
COPY --chown=nodejs:nodejs earthquake-notifier/package*.json ./

# Install production dependencies only
RUN npm ci --omit=dev --ignore-scripts

# Copy built app from builder stage
COPY --from=builder --chown=nodejs:nodejs /app/dist ./dist

# Create data and logs directories
RUN mkdir -p data logs && chown -R nodejs:nodejs data logs

# Switch to non-root user
USER nodejs

# Set environment variables
ENV NODE_ENV=production \
    NODE_OPTIONS="--max-old-space-size=256" \
    LOG_DIR=/app/logs

# Expose port for health checks
EXPOSE 8080

# Add healthcheck
HEALTHCHECK --interval=60s --timeout=10s --start-period=30s --retries=3 \
    CMD wget --quiet --tries=1 --spider http://localhost:8080/health || exit 1

# Start the bot
CMD ["node", "dist/index.js"]
