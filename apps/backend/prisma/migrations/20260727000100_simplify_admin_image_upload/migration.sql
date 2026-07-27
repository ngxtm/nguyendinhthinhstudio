ALTER TABLE "ImageUploadPromotion"
  DROP CONSTRAINT "ImageUploadPromotion_current_facts_check";

ALTER TABLE "ImageUpload"
  DROP COLUMN "policyVersion",
  DROP COLUMN "policySnapshot";

ALTER TABLE "ImageUploadPromotion"
  DROP COLUMN "policyVersion";

ALTER TABLE "ImageUploadPromotion"
  ADD CONSTRAINT "ImageUploadPromotion_current_facts_check"
  CHECK (
    "origin" <> 'current' OR (
      "sourceEtag" IS NOT NULL AND
      "inspectedSha256" IS NOT NULL AND
      "inspectedByteSize" IS NOT NULL AND
      "canonicalMime" IS NOT NULL AND
      "inspectedWidth" IS NOT NULL AND
      "inspectedHeight" IS NOT NULL AND
      "copyDispatchedAt" IS NOT NULL AND
      "lastDispatchAttemptAt" IS NOT NULL AND
      "nextReconcileAt" IS NOT NULL AND
      "dispatchAttempts" >= 1
    )
  );
