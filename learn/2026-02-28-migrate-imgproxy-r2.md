---
topic: "Migrate Cloudflare Images → imgproxy + R2"
language: TypeScript
phase: BUILD
step: 3
total_steps: 8
difficulty: deep
teaching: guided
plan_source: ".claude/plans/migrate-imgproxy-r2/plan.md"
plan_type: multi-phase
started: 2026-02-28T00:00:00Z
updated: 2026-03-01T00:00:00Z
---

# Learn: Migrate Cloudflare Images → imgproxy + R2

## Plan Overview

Replace Cloudflare Images ($10-30/mo) with self-hosted imgproxy + Cloudflare R2 (~$0.75/mo).

### Architecture Change
```
BEFORE: Browser → Cloudflare Direct Upload (POST multipart) → Webhook → DB (variant URLs)
AFTER:  Browser → R2 Presigned PUT (raw binary) → Confirm → DB (imgproxy signed URLs)
```

### Phases (8 total)
1. Infrastructure Setup (Docker, env vars, DNS)
2. Backend New Services (StorageService, ImageUrlService)
3. Prisma Schema Migration (rename field)
4. Backend Migration (update existing services)
5. Frontend Changes (upload flow, static images)
6. Data Migration Script (CF → R2)
7. Testing & Validation
8. Cleanup

---

## Learning Log

### Phase 1: Infrastructure Setup ✅
- Added imgproxy service to docker-compose.yml (Traefik labels, healthcheck, memory limit)
- Updated backend env vars (removed Cloudflare, added R2 + imgproxy)
- Removed NEXT_PUBLIC_CLOUDFLARE_IMAGES_HASH from frontend
- Updated .env.example

**Concepts learned**: Object storage (R2), S3-compatible protocol, Docker labels (Traefik routing), healthcheck, memory limits, env var management (secrets vs hardcoded)

### Phase 2: Backend New Services ✅
- Created `StorageService` (S3Client, presigned upload URL, delete object)
- Created `ImageUrlService` (HMAC-SHA256 signing, imgproxy URL generation, variant URLs)

**Concepts learned**: Presigned URLs (why browser uploads directly to R2), async/await vs .then(), Promise types, HMAC-SHA256 signing (key + salt + path → signature), class field initialization order, why delete doesn't need signed URL

### Phase 3: Prisma Migration ✅
- Renamed `cloudflareImageId` → `r2ObjectKey` in schema
- Created manual migration (Supabase doesn't support shadow DB)
- Baselined existing migration, then deployed

**Concepts learned**: Prisma shadow database limitation with Supabase, manual migration creation, baseline existing DB

### Phase 4: Backend Migration ⏳ (next)
- Update images.service.ts, controller, module, albums
