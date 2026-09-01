# NDT Studio Backend - Gallery API

Backend API for NDT Studio photo gallery with album management, image uploads via Cloudflare Images, and smart recommendation system.

## 🚀 Quick Start

```bash
# Install dependencies
npm install

# Setup environment variables
cp .env.example .env
# Edit .env with your credentials

# Run database migrations
npx prisma migrate dev

# Seed database
npx prisma db seed

# Start development server
npm run start:dev

# Visit Swagger docs
open http://localhost:3000/api
```

## 📚 Documentation

- **[SETUP.md](./SETUP.md)** - Complete setup guide and troubleshooting
- **[API_REFERENCE.md](./API_REFERENCE.md)** - Full API documentation with examples
- **[Swagger UI](http://localhost:3000/api)** - Interactive API explorer

## 🏗️ Architecture

### Modules
- **Auth** - Supabase JWT authentication with role-based access
- **Albums** - Album CRUD with smart recommendations
- **Images** - Cloudflare Images integration with presigned URLs
- **Tags** - Hierarchical tag system

### Key Features
- ✅ Direct frontend → Cloudflare upload (presigned URLs)
- ✅ Category-aware recommendations with related, adjacent, discovery, and weekly rotation buckets
- ✅ Infinite scroll with cursor-based pagination
- ✅ Featured albums system
- ✅ SEO-friendly slugs (Vietnamese support)
- ✅ Public GET reads and administrator routes bypass the global request throttler
- ✅ Public POST routes retain their explicit limits (album view: 30 requests/min/IP)
- ✅ Role-based access control

## 📡 API Endpoints

### Albums
- `GET /albums` - List albums (public)
- `GET /albums/:slug` - Album detail (public)
- `GET /albums/:slug/related` - 12 related albums (public)
- `POST /albums` - Create album (admin)
- `PATCH /albums/:id` - Update album (admin)
- `DELETE /albums/:id` - Delete album (admin)

### Images
- `POST /images/upload-url` - Get presigned URL (admin)
- `POST /images/webhook` - Cloudflare callback (public)
- `GET /images/album/:albumId` - List album images (public)
- `PATCH /images/album/:albumId/reorder` - Reorder images (admin)

### Tags
- `GET /tags` - List all tags (public)
- `POST /tags` - Create tag (admin)

## 🔐 Authentication

Protected endpoints require Bearer token:
```bash
curl -H "Authorization: Bearer YOUR_SUPABASE_JWT" \\
     http://localhost:3000/albums
```

## 🗄️ Database

PostgreSQL with Prisma ORM:
- Albums, Images, Tags (many-to-many)
- Users, Bookings, Coupons (future)
- Hierarchical tag system
- Optimized indexes

## 🛠️ Tech Stack

- **NestJS 11** - Backend framework
- **Prisma** - ORM
- **PostgreSQL** - Database (Supabase)
- **Cloudflare Images** - Image storage & CDN
- **Passport JWT** - Authentication
- **Swagger** - API documentation
- **class-validator** - Input validation

## 📦 Environment Variables

Required:
```env
DATABASE_URL=
SUPABASE_URL=
SUPABASE_ANON_KEY=
SUPABASE_JWT_SECRET=
CLOUDFLARE_ACCOUNT_ID=
CLOUDFLARE_IMAGES_TOKEN=
CLOUDFLARE_IMAGES_HASH=
```

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

## 📝 Scripts

```bash
npm run start:dev      # Development with watch
npm run build          # Production build
npm run start:prod     # Production server
npm run lint           # ESLint
npm run format         # Prettier
```

## 🚀 Deployment

Recommended: Railway, Render, or AWS ECS

```bash
# Build
npm run build

# Start
npm run start:prod
```

## 📄 License

Private - NDT Studio

---

For detailed implementation info, see [IMPLEMENTATION_SUMMARY.md](../../IMPLEMENTATION_SUMMARY.md)
