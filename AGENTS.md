# Plnrly build instructions

These instructions apply to the entire Plnrly source tree. The profile folder is the user's durable backend and may be synced between devices. Treat its on-disk format as a public, long-lived contract.

## Non-breaking schema constraint

- Every schema change MUST be migratable from every released version, starting with v1. Keep the complete adjacent migration chain `v1 → v2 → … → current`, even when the current version reaches v100 or later. Never remove an old step or declare an older profile unsupported to simplify a release.
- Historical v1/v2 fixtures retain their original app marker. The v3 migration changes that marker to `Plnrly`; keep this compatibility step even though the current app has been renamed.
- A schema change includes changes to record or manifest fields, meanings, defaults, validation, relationship rules, file names, directory layout, and the AI-readable profile documentation. Increment `shared/schema-version.json` for each such change. App package versions are separate.
- On opening a profile, finish migration before exposing records for viewing or editing. A new profile MUST be created at the current schema version with the complete empty folder structure and documentation.
- A newer profile version MUST be rejected without mutation. A failed migration MUST leave the profile closed, report the error, and remain restartable without data loss.
- Migrations MUST retain stable record and profile IDs, timestamps, relationships, unknown fields, and user-authored content unless a documented semantic conversion requires a change. Never silently drop or overwrite data. Preserve tombstones (`deletedAt`). Do not advance `updatedAt` for a format-only conversion because it participates in sync conflict resolution.
- Preflight the full profile before writing. Write files atomically, make each step idempotent, and write the manifest version last. Design for interruption and for mixed-version records arriving later through file sync.

## Required work for a schema change

1. Read [docs/architecture/SCHEMA_EVOLUTION.md](docs/architecture/SCHEMA_EVOLUTION.md) and follow [docs/architecture/SCHEMA_CHANGE_CHECKLIST.md](docs/architecture/SCHEMA_CHANGE_CHECKLIST.md).
2. Add the next adjacent migration step to the migration registry in `electron/folder-store.cjs`. Extend the migration engine when the change affects manifest or directory structure; a record-only step is insufficient for those changes.
3. Update current-version profile creation, readers, writers, validators, `src/model.ts`, `docs/SCHEMA.md`, and the copy of `SCHEMA.md` written into new and upgraded profiles.
4. Add an immutable fixture under `tests/fixtures/schema/vN/` for the version being superseded. Keep every earlier fixture and migration. Test migration from **each** historical version to current, including records of all four kinds and relationships.
5. Run `npm run check:schema` and `npm run build`. The build gate must fail when any historical fixture or adjacent migration step is missing or when migration changes protected user data.

Do not ship a schema change by editing version metadata alone. Do not ask users to export, delete, or manually repair an ordinary older profile to make an upgrade work.
