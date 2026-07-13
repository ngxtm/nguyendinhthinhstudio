ALTER TABLE "Album"
  ADD COLUMN "deleteStatus" TEXT NOT NULL DEFAULT 'active',
  ADD COLUMN "deleteStartedAt" TIMESTAMP(3);

CREATE INDEX "Album_deleteStatus_idx" ON "Album"("deleteStatus");

CREATE TABLE "ImageObjectDeletion" (
  "id" TEXT NOT NULL,
  "imageId" TEXT,
  "provider" TEXT NOT NULL,
  "objectKey" TEXT NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "lastError" TEXT,
  "deletedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ImageObjectDeletion_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImageObjectDeletion_provider_objectKey_key"
  ON "ImageObjectDeletion"("provider", "objectKey");
CREATE INDEX "ImageObjectDeletion_status_createdAt_idx"
  ON "ImageObjectDeletion"("status", "createdAt");
