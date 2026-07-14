CREATE TABLE "CloudflareStaticAssetMigration" (
  "legacyCloudflareImageId" TEXT NOT NULL,
  "localPath" TEXT NOT NULL,
  "sourceSha256" TEXT NOT NULL,
  "targetSha256" TEXT NOT NULL,
  "targetBytes" INTEGER NOT NULL,
  "deployedVerifiedAt" TIMESTAMP(3),
  "cloudflareDeletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CloudflareStaticAssetMigration_pkey"
    PRIMARY KEY ("legacyCloudflareImageId")
);

CREATE UNIQUE INDEX "CloudflareStaticAssetMigration_localPath_key"
  ON "CloudflareStaticAssetMigration"("localPath");
