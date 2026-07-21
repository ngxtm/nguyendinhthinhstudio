# Image-upload GitHub ruleset

This runbook installs and verifies the `main-image-upload-required-checks` repository ruleset for `refs/heads/main`. It has active enforcement, no bypass actors, strict status-check freshness, and exactly the five image-upload workflow contexts in the reviewed JSON payload.

## Safety boundary

Listing and verifying rulesets are read-only. Creating, updating, disabling, or deleting a ruleset changes the merge policy and requires explicit operator approval immediately before the mutating command. Do not infer approval from an earlier staging or implementation approval.

## Preview

Validate the reviewed payload locally and inspect the current repository state:

```powershell
node scripts/verify-image-upload-ruleset.mjs --payload-only
gh api repos/ngxtm/nguyendinhthinhstudio/rulesets
```

If a ruleset named `main-image-upload-required-checks` already exists, do not POST a duplicate. Read it back with the verifier and reconcile any drift through a separately reviewed update payload.

## Apply after explicit approval

Run this command only after the operator approves the GitHub mutation:

```powershell
gh api --method POST repos/ngxtm/nguyendinhthinhstudio/rulesets --input docs/runbooks/image-upload-github-ruleset.json
```

Record the returned ruleset ID. Never place a GitHub token in this repository, command transcript, receipt, or CI artifact.

## Readback verification

```powershell
node scripts/verify-image-upload-ruleset.mjs
```

The verifier lists rulesets, selects the exact name, fetches its detail by ID, and proves the target, enforcement, main-only condition, strict policy, exact contexts, and empty bypass list. A classic branch-protection 404 is accepted only after those ruleset checks pass.

## Roll forward

If the required contexts are wrong or unavailable, repair the workflow or apply a separately reviewed ruleset update. Do not silently disable enforcement or add a bypass actor. Any update or deletion is a new GitHub mutation and requires explicit operator approval.
