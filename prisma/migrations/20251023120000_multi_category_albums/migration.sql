-- Create AlbumCategory join table for many-to-many album-category relation
CREATE TABLE "AlbumCategory" (
  "albumId" TEXT NOT NULL,
  "categoryId" TEXT NOT NULL,
  "source" TEXT NOT NULL DEFAULT 'manual',
  "depth" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AlbumCategory_pkey" PRIMARY KEY ("albumId", "categoryId"),
  CONSTRAINT "AlbumCategory_albumId_fkey" FOREIGN KEY ("albumId") REFERENCES "Album" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AlbumCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- Seed existing album-category assignments as manual depth 0
INSERT INTO "AlbumCategory" ("albumId", "categoryId", "source", "depth")
SELECT "id", "categoryId", 'manual', 0
FROM "Album"
WHERE "categoryId" IS NOT NULL
ON CONFLICT ("albumId", "categoryId") DO NOTHING;

-- Recursively insert parent categories with increasing depth and parent source
WITH RECURSIVE category_hierarchy AS (
  SELECT a."id"        AS "albumId",
         c."id"        AS "categoryId",
         c."parentId"  AS "parentId",
         0              AS depth
  FROM "Album" a
  JOIN "Category" c ON a."categoryId" = c."id"
  WHERE a."categoryId" IS NOT NULL

  UNION ALL

  SELECT ch."albumId",
         p."id"        AS "categoryId",
         p."parentId"  AS "parentId",
         ch.depth + 1   AS depth
  FROM category_hierarchy ch
  JOIN "Category" p ON ch."parentId" = p."id"
  WHERE ch."parentId" IS NOT NULL
)
INSERT INTO "AlbumCategory" ("albumId", "categoryId", "source", "depth")
SELECT ch."albumId",
       ch."categoryId",
       CASE WHEN depth = 0 THEN 'manual' ELSE 'parent' END,
       depth
FROM category_hierarchy ch
ON CONFLICT ("albumId", "categoryId") DO NOTHING;

-- Drop legacy foreign key and column
ALTER TABLE "Album" DROP CONSTRAINT IF EXISTS "Album_categoryId_fkey";
DROP INDEX IF EXISTS "Album_categoryId_idx";
ALTER TABLE "Album" DROP COLUMN IF EXISTS "categoryId";

-- Add indexes for join table lookups
CREATE INDEX IF NOT EXISTS "AlbumCategory_categoryId_idx" ON "AlbumCategory" ("categoryId");
CREATE INDEX IF NOT EXISTS "AlbumCategory_albumId_idx" ON "AlbumCategory" ("albumId");
