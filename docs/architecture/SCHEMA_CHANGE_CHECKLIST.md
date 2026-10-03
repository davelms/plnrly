# Schema change checklist

Use this checklist for every on-disk schema change. Record the answers in the change description so a future maintainer can understand and test the conversion.

## Design

- [ ] Identify the current version `N` in `shared/schema-version.json` and define exactly what changes in `vN+1`.
- [ ] Inventory affected manifest fields, record kinds, paths, validation, relationships, sync behavior, and profile documentation.
- [ ] Explain how every old value maps to the new form. Preserve unmappable original values in a documented compatibility field.
- [ ] Explain how an interrupted upgrade resumes and how a late old-version record is handled.

## Implementation

- [ ] Freeze the last released `vN` profile in `tests/fixtures/schema/vN/` before changing its format. Keep all older fixtures untouched.
- [ ] Add the `N→N+1` migration step. Expand profile-level migration logic if the manifest or directory layout changes.
- [ ] Change `shared/schema-version.json` to `N+1` only with the migration, new-folder scaffold, readers, writers, and validators.
- [ ] Update `docs/SCHEMA.md`, profile README text, and any example records so outside AI tools can write the new format correctly.

## Verification

- [ ] Run `npm run check:schema`: it must find a fixture and a complete chain for every version from v1 through `N`.
- [ ] Confirm all historical fixtures migrate to current with IDs, timestamps, relationships, unknown fields, tombstones, and user content intact.
- [ ] Confirm a second open makes no further changes and interruption or malformed input leaves the profile recoverable.
- [ ] Confirm an app opening a future-version profile rejects it without mutation.
- [ ] Run `npm run build` and `npm run dmg` for a release. Do not bypass the schema gate.

Example at v100: the release must still open an untouched v1 folder and apply `1→2→…→100` automatically before showing its contents.
