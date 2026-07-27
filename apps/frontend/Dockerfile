# syntax=docker/dockerfile:1
FROM node:24-alpine AS base

# Stage 1: Install ALL monorepo dependencies
FROM base AS deps
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy root package files
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/ui/package.json ./packages/ui/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/types/package.json ./packages/types/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/utils/package.json ./packages/utils/

# Copy prisma schema (required for postinstall script)
COPY apps/backend/prisma ./apps/backend/prisma/

RUN npm ci --ignore-scripts
RUN cd apps/backend && npx prisma generate

# Stage 2: Build
FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/frontend/node_modules ./apps/frontend/node_modules
COPY . .

ENV NEXT_TELEMETRY_DISABLED=1
ENV NEXT_IGNORE_INCORRECT_LOCKFILE=1

# Next.js embeds public variables in the browser bundle during `next build`.
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ADMIN_API_ORIGINS
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG ADMIN_CSP_REPORT_ONLY=true
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ADMIN_API_ORIGINS=$NEXT_PUBLIC_ADMIN_API_ORIGINS
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV ADMIN_CSP_REPORT_ONLY=$ADMIN_CSP_REPORT_ONLY

RUN npm run build --workspace=frontend

# Stage 3: Production - use next start instead of standalone
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ARG NEXT_PUBLIC_API_URL
ARG NEXT_PUBLIC_ADMIN_API_ORIGINS
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ARG ADMIN_CSP_REPORT_ONLY=true
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_ADMIN_API_ORIGINS=$NEXT_PUBLIC_ADMIN_API_ORIGINS
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV ADMIN_CSP_REPORT_ONLY=$ADMIN_CSP_REPORT_ONLY

RUN addgroup --system --gid 1001 nodejs
RUN adduser --system --uid 1001 nextjs

# Copy built app and dependencies
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/.next ./apps/frontend/.next
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/public ./apps/frontend/public
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/package.json ./apps/frontend/package.json
COPY --from=builder --chown=nextjs:nodejs /app/apps/frontend/next.config.mjs ./apps/frontend/next.config.mjs
COPY --from=builder --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/package.json ./package.json

USER nextjs

EXPOSE 3000
ENV PORT=3000 HOSTNAME="0.0.0.0"

WORKDIR /app/apps/frontend
CMD ["node", "/app/node_modules/next/dist/bin/next", "start"]
