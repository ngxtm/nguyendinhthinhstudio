# syntax=docker/dockerfile:1
FROM node:24-alpine@sha256:a0b9bf06e4e6193cf7a0f58816cc935ff8c2a908f81e6f1a95432d679c54fbfd AS base

# Stage 1: Dependencies & Build
FROM base AS builder
RUN apk add --no-cache libc6-compat
WORKDIR /app

# Copy root package files for monorepo
COPY package.json package-lock.json ./
COPY apps/backend/package.json ./apps/backend/
COPY apps/frontend/package.json ./apps/frontend/
COPY packages/eslint-config/package.json ./packages/eslint-config/
COPY packages/image-upload-policy/package.json ./packages/image-upload-policy/
COPY packages/types/package.json ./packages/types/
COPY packages/typescript-config/package.json ./packages/typescript-config/
COPY packages/ui/package.json ./packages/ui/
COPY packages/utils/package.json ./packages/utils/
COPY apps/backend/prisma ./apps/backend/prisma/

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy all source code
COPY . .

# Build the workspace dependency before compiling the backend.
RUN npm run build --workspace=@ndt/image-upload-policy
RUN npm run build --workspace=backend

# Replace path aliases with relative paths (critical for runtime)
WORKDIR /app/apps/backend
RUN npx --no-install tsc-alias -p tsconfig.build.json

# Preserve each entrypoint's compiled relative imports while exposing the
# canonical API and operator-script paths in the runtime image.
RUN mkdir -p runtime-dist/src runtime-dist/scripts && \
    cp -R dist/. runtime-dist/src/ && \
    cp -R dist/. runtime-dist/ && \
    test -f runtime-dist/src/main.js && \
    test -f runtime-dist/scripts/reconcile-image-uploads.js && \
    test -f runtime-dist/scripts/resolve-image-upload-promotion-conflict.js && \
    test -f runtime-dist/scripts/image-upload-cutover.js && \
    ! grep -R -n '"src/' runtime-dist && \
    ! grep -R -n "'src/" runtime-dist

# Stage 2: Production
FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production

# Create non-root user for security
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nestjs

# Copy built application
COPY --from=builder --chown=nestjs:nodejs /app/apps/backend/runtime-dist ./dist
COPY --from=builder --chown=nestjs:nodejs /app/apps/backend/package.json ./apps/backend/package.json
COPY --from=builder --chown=nestjs:nodejs /app/packages/image-upload-policy/package.json ./packages/image-upload-policy/package.json
COPY --from=builder --chown=nestjs:nodejs /app/packages/image-upload-policy/dist ./packages/image-upload-policy/dist
COPY --from=builder --chown=nestjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nestjs:nodejs /app/apps/backend/prisma ./prisma

# Fail the build if any runtime entrypoint or workspace export is absent.
RUN test -f /app/dist/src/main.js && \
    test -f /app/dist/scripts/reconcile-image-uploads.js && \
    test -f /app/dist/scripts/resolve-image-upload-promotion-conflict.js && \
    test -f /app/dist/scripts/image-upload-cutover.js && \
    test -f /app/apps/backend/package.json && \
    test -f /app/packages/image-upload-policy/package.json && \
    test -f /app/packages/image-upload-policy/dist/esm/index.js && \
    test -f /app/packages/image-upload-policy/dist/cjs/index.js && \
    test -f /app/packages/image-upload-policy/dist/index.d.ts && \
    test -f /app/packages/image-upload-policy/dist/cjs/package.json

USER nestjs

EXPOSE 3000
CMD ["node", "dist/src/main.js"]
