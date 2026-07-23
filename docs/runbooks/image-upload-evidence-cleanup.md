# Image Upload Evidence Cleanup

Cleanup is dry-run by default. It starts only after Phase 2 final-ingress approval, stable general ingress, and the documented rollback window.

## Non-negotiable retention

- encrypted database backups are never deleted by this runbook;
- retain their ciphertext hashes, receipts, approvals, and restore evidence;
- retain the final evidence bundle and its manifest;
- refuse to remove an image referenced by any container, whether running or stopped;
- retain the designated rollback image until the rollback window closes; and
- remove config-read secrets only after credential revocation is read back and the former key is proven denied.

## Inventory and dry run

Create an owner-only manifest outside the repository. Record only paths, image IDs, modes, owners, sizes, and SHA-256 digests; never record secret values.

```sh
umask 077
MANIFEST_DIR="$HOME/ndt-cutover-evidence/final-cleanup"
mkdir -p "$MANIFEST_DIR"

find "$HOME/ndt-cutover-evidence" "$HOME/ndt-backups" \
  -maxdepth 6 -type f -printf '%m\t%u\t%s\t%p\n' \
  | sort >"$MANIFEST_DIR/files-inventory.txt"

docker ps -a --no-trunc \
  --format '{{.Names}}\t{{.Image}}\t{{.ID}}\t{{.Status}}' \
  | sort >"$MANIFEST_DIR/container-inventory.txt"

docker image ls --no-trunc \
  --format '{{.Repository}}:{{.Tag}}\t{{.ID}}\t{{.CreatedAt}}\t{{.Size}}' \
  | sort >"$MANIFEST_DIR/image-inventory.txt"

chmod 600 "$MANIFEST_DIR"/*.txt
echo "CLEANUP_DRY_RUN=1"
```

Review the inventory and create two explicit owner-only lists:

- `retain.txt`: encrypted backups, final receipts/approvals, current image, and rollback image;
- `purge.txt`: temporary restore/cutover directories, failed-attempt evidence, obsolete logs/exit markers, diagnostic images, expired staging downloads, and merged worktrees.

Every purge entry must be an absolute path or immutable image ID. Reject blank lines, wildcards, relative paths, directory roots, backup ciphertext names, and anything referenced by `container-inventory.txt`.

## Mutation approval

Do not turn the dry run into deletion in the same shell block. Obtain explicit operator approval for the reviewed manifest digest, then delete entries one at a time with literal paths/immutable IDs and verify absence after each action.

Credential cleanup requires a separate credential revocation receipt containing only the former Access Key ID fingerprint, revocation time, denied readback result, and operator approval. Never store the key or secret.

After cleanup, regenerate all three inventories, prove every retained digest still matches, prove every approved purge entry is absent, and store the post-cleanup manifest beside the final evidence bundle.
