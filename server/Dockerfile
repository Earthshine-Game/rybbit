# syntax=docker/dockerfile:1

FROM node:20-alpine AS builder

WORKDIR /app

# Copy and build shared package first
COPY shared ./shared
WORKDIR /app/shared
RUN npm install && npm run build

# Install server dependencies
# Use npm install instead of npm ci for local file: dependencies to ensure proper symlinking
WORKDIR /app/server
COPY server/package*.json ./
RUN npm install

# Copy server source code
COPY server/ .

# Ensure shared package is accessible to TypeScript
# Verify node_modules exists, then create @rybbit structure
RUN test -d node_modules || (echo "ERROR: node_modules does not exist!" && exit 1) && \
    rm -rf node_modules/@rybbit 2>/dev/null || true && \
    mkdir -p node_modules/@rybbit/shared && \
    cp -r ../shared/dist node_modules/@rybbit/shared/. && \
    cp ../shared/package.json node_modules/@rybbit/shared/. && \
    echo "Shared package installed successfully"

# Build the application
RUN npm run build

# Runtime image
FROM node:20-alpine

WORKDIR /app

# Install PostgreSQL client for migrations and Chromium for Puppeteer PDF generation
# Also install build tools for native modules (needed for @mongodb-js/zstd)
RUN apk add --no-cache \
    postgresql-client \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont \
    python3 \
    make \
    g++ \
    libc6-compat

# Configure Puppeteer to use system Chromium
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium-browser
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true

# Copy built application and dependencies
COPY --from=builder /app/server/package*.json ./
COPY --from=builder /app/server/GeoLite2-City.mmdb ./GeoLite2-City.mmdb
COPY --from=builder /app/server/dist ./dist
COPY --from=builder /app/server/node_modules ./node_modules
COPY --from=builder /app/server/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/server/public ./public
COPY --from=builder /app/server/src ./src
COPY --from=builder /app/shared ./shared

# Rebuild native modules for Alpine Linux
# @mongodb-js/zstd requires native compilation
RUN npm rebuild @mongodb-js/zstd

# Copy entrypoint script directly from source to ensure it's available
COPY server/docker-entrypoint.sh /docker-entrypoint.sh

# Make the entrypoint executable and ensure Unix line endings
RUN chmod +x /docker-entrypoint.sh && \
    sed -i 's/\r$//' /docker-entrypoint.sh 2>/dev/null || true

# Expose the API port
EXPOSE 3001

# Use our custom entrypoint script
ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["node", "dist/index.js"]