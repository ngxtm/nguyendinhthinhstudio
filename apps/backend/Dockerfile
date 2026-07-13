# syntax=docker/dockerfile:1
FROM node:24-alpine AS base

# Stage 1: Dependencies & Build
FROM base AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy root package files for monorepo
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/backend/prisma ./apps/backend/prisma/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy all source code
COPY . .

# Build backend
WORKDIR /app/apps/backend
RUN npx nest build

# Replace path aliases with relative paths (critical for runtime)
RUN npx tsc-alias -p tsconfig.build.json

# Verify API and scheduled-job entrypoints are available in the runtime image.
RUN test -f dist/src/main.js && \
    test -f dist/scripts/cleanup-expired-image-uploads.js && \
    test -f dist/scripts/process-image-deletions.js

# Stage 2: Production
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy built application
COPY --from=builder --chown=nestjs:nodejs /app/apps/backend/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/backend/prisma ./prisma

USER nestjs

EXPOSE 3000
CMD ["node", "dist/src/main.js"]
