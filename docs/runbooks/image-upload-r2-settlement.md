# R2 promotion settlement

The API persists an `ImageUploadPromotion` before calling create-only R2 `CopyObject`. A normal response settles immediately. If the response is lost, the singleton reconciler waits 30 seconds, then polls the destination every five seconds.

Settlement requires the exact destination evidence: ETag, byte size, MIME, SHA-256, dimensions, promotion ID, and policy metadata. Object existence alone never commits. A mismatch opens an immutable promotion conflict; the reconciler does not overwrite or delete it. An absent destination with a matching source may receive one conditional retry. Two absent observations at least 30 seconds apart plus missing/mismatched source produce `dispatch_rejected + not_created` without canonical deletion.

The conflict resolver runs only as the cutover role with its bucket-scoped R2 credential and operator token. It accepts `confirmed_absent`, `cleanup_authorized`, or `committed_authorized`, and requires an absolute evidence receipt, operator fingerprint, and approval digest. Queue, DLQ, event-rule, provider-event, and quarantine inputs are obsolete and rejected.
