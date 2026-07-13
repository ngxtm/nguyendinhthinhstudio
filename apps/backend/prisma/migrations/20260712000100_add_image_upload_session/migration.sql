CREATE TABLE "ImageUpload" (
  "id" TEXT NOT NULL,
  "albumId" TEXT NOT NULL,
  "uploadObjectKey" TEXT NOT NULL,
  "finalObjectKey" TEXT NOT NULL,
  "filename" TEXT NOT NULL,
  "contentType" TEXT NOT NULL,
  "fileSize" INTEGER NOT NULL,
  "status" TEXT NOT NULL DEFAULT 'pending',
  "sourceEtag" TEXT,
  "finalizationStartedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ImageUpload_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "ImageUpload_albumId_fkey"
    FOREIGN KEY ("albumId") REFERENCES "Album"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "ImageUpload_uploadObjectKey_key" ON "ImageUpload"("uploadObjectKey");
CREATE UNIQUE INDEX "ImageUpload_finalObjectKey_key" ON "ImageUpload"("finalObjectKey");
CREATE INDEX "ImageUpload_albumId_status_idx" ON "ImageUpload"("albumId", "status");
CREATE INDEX "ImageUpload_expiresAt_status_idx"
  ON "ImageUpload"("expiresAt", "status");
