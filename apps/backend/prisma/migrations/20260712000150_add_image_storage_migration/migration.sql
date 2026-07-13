CREATE TABLE "ImageStorageMigration" (
  "imageId" TEXT NOT NULL,
  "legacyCloudflareImageId" TEXT NOT NULL,
  "targetR2ObjectKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "sourceSize" INTEGER,
  "targetSize" INTEGER,
  "sourceSha256" TEXT,
  "targetSha256" TEXT,
  "error" TEXT,
  "verifiedAt" TIMESTAMP(3),
  "cloudflareDeletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImageStorageMigration_pkey" PRIMARY KEY ("imageId")
);

CREATE UNIQUE INDEX "ImageStorageMigration_legacyCloudflareImageId_key"
  ON "ImageStorageMigration"("legacyCloudflareImageId");
CREATE UNIQUE INDEX "ImageStorageMigration_targetR2ObjectKey_key"
  ON "ImageStorageMigration"("targetR2ObjectKey");
CREATE INDEX "ImageStorageMigration_status_updatedAt_idx"
  ON "ImageStorageMigration"("status", "updatedAt");
