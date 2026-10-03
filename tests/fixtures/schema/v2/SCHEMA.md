# Lattice profile schema v2

A profile folder contains `manifest.json`, `README.md`, `SCHEMA.md`, and four data folders. The manifest's `schemaVersion` is the folder format version. Lattice upgrades older folders before opening them and records each step in `migrations`. Each JSON file in a data folder is one record and is named `<id>.json`. IDs are UUIDs. Every record has its own `schemaVersion`, which must match the manifest. All records include:

```json
{
  "schemaVersion": 2,
  "id": "923b6d3d-332c-424d-9f1a-fd9e02f786ac",
  "createdAt": "2026-10-03T09:00:00.000Z",
  "updatedAt": "2026-10-03T09:00:00.000Z"
}
```

A current manifest has this shape:

```json
{
  "app": "Lattice",
  "schemaVersion": 2,
  "id": "923b6d3d-332c-424d-9f1a-fd9e02f786ac",
  "profileName": "Work",
  "createdAt": "2026-10-03T09:00:00.000Z",
  "folders": { "projects": "projects", "people": "people", "tasks": "tasks", "notes": "notes" },
  "migrations": []
}
```

`profileName` is the display name shown in Lattice. It defaults to the folder name when the profile is created, but can be changed in Settings without renaming or moving the folder. Opening an existing Lattice folder uses its manifest and records as-is, upgrading older schema versions if needed.

Timestamps are ISO 8601 UTC strings. To archive a record, also set `deletedAt` and advance `updatedAt`. Keep the file so the deletion syncs to other devices. Relationship arrays contain record IDs and can contain several IDs. Lattice tolerates links to missing records, but you should repair them when possible. Extra fields are preserved during sync but are not shown in the interface.

## Project

`projects/<id>.json`

```json
{
  "schemaVersion": 2,
  "id": "d9346b7c-e519-4f71-8cc4-f62da0223596",
  "createdAt": "2026-10-03T09:00:00.000Z",
  "updatedAt": "2026-10-03T09:00:00.000Z",
  "name": "Website refresh",
  "description": "Planning and delivery",
  "color": "#4a5ed5",
  "archived": false
}
```

## Person

`people/<id>.json`

```json
{
  "schemaVersion": 2,
  "id": "1ab8805a-19ce-4bfb-8c23-565e1de597ae",
  "createdAt": "2026-10-03T09:00:00.000Z",
  "updatedAt": "2026-10-03T09:00:00.000Z",
  "name": "Morgan Lee",
  "email": "morgan@example.com",
  "role": "Designer",
  "notes": "Prefers concise updates."
}
```

## Task

`tasks/<id>.json`

```json
{
  "schemaVersion": 2,
  "id": "de7c13c3-50a7-4b7a-a79e-96c7e5a7effa",
  "createdAt": "2026-10-03T09:00:00.000Z",
  "updatedAt": "2026-10-03T09:00:00.000Z",
  "title": "Review homepage draft",
  "description": "Check copy and mobile layout.",
  "status": "Next",
  "priority": "High",
  "dueDate": "2026-10-05",
  "projectIds": ["d9346b7c-e519-4f71-8cc4-f62da0223596"],
  "personIds": ["1ab8805a-19ce-4bfb-8c23-565e1de597ae"],
  "noteIds": []
}
```

`status` is one of `Backlog`, `Next`, `In progress`, `Done`. `priority` is one of `Low`, `Medium`, `High`. `dueDate` is `YYYY-MM-DD` or an empty string.

## Note

`notes/<id>.json`

```json
{
  "schemaVersion": 2,
  "id": "97af75d2-3f96-49a1-99ca-93d3fc3e507b",
  "createdAt": "2026-10-03T09:00:00.000Z",
  "updatedAt": "2026-10-03T09:00:00.000Z",
  "title": "Homepage feedback",
  "body": "## Review\nKeep the introduction short.",
  "projectIds": ["d9346b7c-e519-4f71-8cc4-f62da0223596"],
  "taskIds": ["de7c13c3-50a7-4b7a-a79e-96c7e5a7effa"],
  "personIds": ["1ab8805a-19ce-4bfb-8c23-565e1de597ae"]
}
```

`body` can contain Markdown. Lattice currently edits it as text.

## Editing with an AI tool

Give the tool the profile folder's `SCHEMA.md` and the relevant records. Ask it to add or update a record with `schemaVersion: 2`, a UUID filename, valid relationship IDs, and a current `updatedAt`. Lattice picks up the change when you return to the app or during its next automatic refresh. Avoid putting passwords, OAuth tokens, or raw private messages in records unless you deliberately want those stored in the chosen synced folder.

## Automatic upgrades

Lattice upgrades v1 folders to v2 on open. It first checks every record, adds `schemaVersion: 2` to older records, updates `SCHEMA.md` and the README version note, and writes `manifest.json` last. IDs, relationships, extra fields, and `updatedAt` values are preserved. If an upgrade is interrupted, opening the folder again finishes it. A folder from a newer schema version is left untouched and requires a newer Lattice app.
