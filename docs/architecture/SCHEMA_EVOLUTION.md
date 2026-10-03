# Schema evolution contract

## Scope and lifetime

A Plnrly profile folder is the canonical data store. It may live in a local or cloud-synced directory and may be edited by other tools. `manifest.json` identifies the profile and records its `schemaVersion`; each record carries its own `schemaVersion`. The current version is declared once in `shared/schema-version.json`. The app release number does not determine profile compatibility.

The compatibility floor is **v1 permanently**. Every future release must migrate a valid profile from any `vN` where `1 ≤ N < current`, including a direct user jump from v1 to v100. The implementation may apply adjacent transformations in sequence; it must never require the user to install intermediate app releases. Do not squash or delete old transformations or frozen fixtures.

## What requires a new version

Version the on-disk contract whenever a consumer could interpret an existing folder differently: added required fields, removed or renamed fields, changed field meaning or defaults, enum changes, relationship changes, record kind changes, manifest changes, file or folder layout changes, or stricter validation. Update the AI-readable `SCHEMA.md` shipped inside each profile. A purely visual app change that leaves the folder format untouched does not need a schema bump.

## Migration behavior

1. Read and validate the manifest, every record, and every source path before the first mutation. Reject malformed or newer profiles with a useful error; do not partially interpret them as current.
2. Apply adjacent transformations in order, from each file's recorded version to current. Handle a profile with a mixture of versions because file sync can deliver old records after the manifest changed. The same step must produce the same result when retried.
3. Preserve profile and record IDs, `createdAt`, `updatedAt`, `deletedAt`, relationship IDs, unknown fields, and user content. If a field must be transformed, document its old and new meanings and prove the conversion is lossless in tests. If no lossless conversion exists, retain the original in a versioned compatibility field and expose it in the current schema documentation.
4. Stage changes with atomic file replacement. Complete all record, layout, README, and SCHEMA changes before writing the manifest's new version. If interrupted, the next open repeats safely. Keep a migration history in the manifest without duplicate steps.
5. After migration, validate the resulting profile against the current schema. Only then permit normal reads or edits. If migration cannot complete, keep the workspace unavailable and preserve the folder for retry or recovery.

The v1→v2 step adds `schemaVersion` to records. The v2→v3 step changes the historical app marker to `Plnrly` and updates record versions. Both steps remain available indefinitely. A later change involving paths or manifest shape requires a profile-level transformation in the migration engine, with the same preflight, atomicity, and restartability guarantees. Merely bumping the manifest and adding a record mapper is insufficient.

## Synced-folder behavior

An older app must reject a folder whose manifest is newer. The current app must tolerate a valid older record arriving after a profile was upgraded, migrate that record, and retain its `updatedAt`. Avoid format-only timestamp changes, which can make stale content win a sync conflict. Never remove tombstones during migration. If concurrent devices or file-sync conflicts produce ambiguous content, surface an error or preserve both copies for recovery rather than silently choosing or deleting data.

## Evidence required before release

- Keep a frozen, representative profile fixture for every historical version under `tests/fixtures/schema/vN/`. Fixtures are historical evidence: do not rewrite them when the current schema changes.
- Run the fixture matrix from every historical version to current. Compare IDs, timestamps, relationships, unknown fields, tombstones, and user text before and after. Verify the migration history and a second-open no-op.
- Test an empty new profile at current, mixed-version records, invalid JSON or interrupted migration retry, and future-version rejection without writes.
- `npm run check:schema` is part of `npm run build` and therefore of `npm run dmg`. A release must pass the gate. Do not disable or narrow the gate to get a build through.
