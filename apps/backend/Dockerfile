# syntax=docker/dockerfile:1
FROM node:20-alpine AS base

# Stage 1: Dependencies & Build
FROM base AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy root package files and all workspace package.json
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/backend/prisma ./apps/backend/prisma/

# Install all dependencies including devDependencies
RUN npm ci

# Install NestJS CLI globally for build
RUN npm install -g @nestjs/cli

# Copy source code
COPY . .

# Build backend
WORKDIR /app/apps/backend
RUN nest build

# Stage 2: Production
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nestjs

# Copy built application and production dependencies
COPY --from=builder --chown=nestjs:nodejs /app/apps/backend/dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/backend/prisma ./prisma

USER nestjs

EXPOSE 3000
CMD ["node", "dist/main.js"]
