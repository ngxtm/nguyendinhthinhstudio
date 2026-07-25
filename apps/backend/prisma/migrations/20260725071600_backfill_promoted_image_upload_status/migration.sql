-- Backfill uploadStatus for promotion-committed images.
--
-- The two-phase upload roll-forward (20260719000100_image_upload_roll_forward)
-- creates Image rows through ImageUploadPromotionRepository.settleAndCommit
-- WITHOUT setting uploadStatus, so they inherited the schema default 'pending'.
-- Public album reads filter images by uploadStatus = 'completed', which hid
-- every promotion-committed image (e.g. album "the-white-reverie": imageCount 6
-- but images []). These images are already materialized in R2 with a valid
-- r2ObjectKey and variant URLs, so mark them completed.
UPDATE "Image"
SET "uploadStatus" = 'completed'
WHERE "uploadStatus" = 'pending'
  AND "r2ObjectKey" IS NOT NULL
  AND "r2ObjectKey" LIKE 'albums/%';