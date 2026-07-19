# Image upload R2 settlement

This runbook applies to the dedicated `reconciler` and authenticated `cutover` roles. Never paste Queue tokens, R2 credentials, presigned URLs, full object keys, or message bodies into receipts.

## Provider inventory

Record sanitized receipts for the source Queue/DLQ names and IDs, source and DLQ consumer IDs, HTTP-pull type, batch size, visibility timeout, retry delay, maximum retries, DLQ binding, retention, R2 bucket, canonical prefix, CopyObject event-rule ID and action. The DLQ inspection consumer must not have a recursive DLQ.

The reconciler receives a bucket-scoped R2 Object Read & Write credential and `IMAGE_UPLOAD_QUEUE_TOKEN`. Operator resolvers receive the distinct `IMAGE_UPLOAD_CUTOVER_QUEUE_TOKEN` and `IMAGE_UPLOAD_OPERATOR_TOKEN`. API, reconciler, and cutover secret sets must never overlap.

## Operation

- Start: `npm run images:uploads:reconcile --workspace=backend` with `IMAGE_UPLOAD_PROCESS_ROLE=reconciler`.
- Verify the singleton heartbeat and all six loop timestamps within two one-minute cadences.
- Warning threshold: oldest unresolved work or stale heartbeat at 15 minutes.
- Critical threshold: stale heartbeat, unresolved age, or retained-byte limit at one hour.
- Pause by terminating the reconciler gracefully; verify the advisory lock is released before operator work.
- Resume only after Queue/DLQ/R2/database readback matches the sanitized receipt.

## Conflict and quarantine disposition

Inspect both source Queue and DLQ through the documented `/messages/pull` endpoint. Database intent must commit before `/messages/ack`. Never reuse a receipt's ephemeral lease ID. A message reaching the DLQ is not authority to ACK or delete an object.

Promotion conflicts allow only `confirmed_absent_ack`, `cleanup_authorized`, or `committed_authorized`. Provider-event quarantine allows only `quarantined_ack` or `replay_requested`. Both commands require absolute evidence-receipt paths, stable record IDs, Queue/DLQ IDs, operator fingerprint, approval digest, cutover role, and both cutover secrets.

`replay_requested` requires freshly pulled bytes and a durable replay intent. Hashes alone cannot reconstruct a message. Cleanup requires exact durable authority, matching HEAD/event identity, DeleteObject, and a final absent HEAD. A committed image always wins over cleanup.

## Teardown/readback

After settlement, read back zero open conflicts/quarantines, zero invalid scheduled promotions, fresh heartbeat timestamps, Queue/DLQ metrics, event-rule action/prefix, and the R2 credential scope. Preserve sanitized receipts and append-only database evidence before removing temporary consumers or credentials.
