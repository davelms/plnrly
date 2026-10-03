# Plnrly

Plnrly is a Mac planning app for tasks, projects, people, notes and read-only calendars. Tasks can belong to several projects and link to several people and notes. The Today screen shows urgent work and events; the task board supports drag and drop between Backlog, Next, In progress and Done.

## Install

Open `release/Plnrly-0.7.0-arm64.dmg` and drag Plnrly to Applications. The installer is for Apple silicon Macs. It is unsigned and unnotarized because no Apple Developer ID certificate was available. macOS may ask you to use **Open** from the app's context menu on first launch. Sign and notarize the app before distributing it to others.

## Profiles and storage

On first launch, Plnrly asks you to choose a folder before you can use the workspace. Choose an empty local folder or one managed by iCloud Drive, Google Drive for desktop, or another file sync service. Plnrly creates its schema, manifest, README, and empty data folders inside the folder you select. You can also select an existing Plnrly folder. On another Mac, install Plnrly and select the synced folder. Use the folder switcher for separate work, personal or other folders. One folder can contain as many projects as you like. If you used an earlier device-only version, its local records are copied into the first folder you choose.

The profile display name starts as the folder name and can be edited in Settings. Renaming the display name changes `manifest.json` and does not move the folder. Selecting a folder that already contains a Plnrly manifest imports that profile and preserves its records, applying any needed schema migrations.

Each profile contains:

```text
Profile name/
  README.md
  SCHEMA.md
  manifest.json
  projects/<uuid>.json
  people/<uuid>.json
  tasks/<uuid>.json
  notes/<uuid>.json
```

Each record is an ordinary JSON file with a stable UUID, `schemaVersion`, and `updatedAt`. The manifest also carries `schemaVersion`. When Plnrly opens an older folder, it upgrades records and documentation before showing any data, then records the migration in the manifest. If migration fails, the folder stays closed and the app shows the error. Plnrly merges the folder and local cache by timestamp after edits, when you return to the app, and every minute while it is open. The folder is the backend; no hosted database account is needed. You can give `SCHEMA.md` and selected JSON files to an AI assistant with access to your email or Slack and have it update records. The assistant should advance `updatedAt` for each edit. Plnrly does not read Slack or email itself. Keep credentials and raw private messages out of the profile folder unless you intend to store them there.

See [the schema](docs/SCHEMA.md) for all fields and relationship rules. Record deletions are represented by `deletedAt` so they can sync. If two devices edit the same record, the later `updatedAt` wins. For reliable cloud syncing, let your file sync service finish uploading before opening the profile on another device.

For future development, [AGENTS.md](AGENTS.md) and the [schema evolution contract](docs/architecture/SCHEMA_EVOLUTION.md) require a tested, lossless migration path from every historical profile version, starting at v1. `npm run build` checks that path before compiling.

## Calendars

In **Settings**, name a calendar and add an HTTPS ICS subscription URL or choose a local `.ics` file. Pick Google or Outlook as a label if useful. The app reads events only and refreshes them when the profile opens, every minute while it is visible, and when you choose **Refresh all**. Feed URLs and file locations are encrypted in the Mac app's storage using Keychain support, separate from the synced profile folder. Add each calendar again on another Mac.

The Calendar screen offers Schedule, Week, and Month views, with previous, next, and Today navigation. Select an event in the Calendar or Today's agenda to see its time, calendar, location, description, and an event link when provided by the feed.

Each calendar receives a distinct default color within its profile. Change the color beside the calendar in Settings; the agenda, calendar views, and event details use it. Calendar colors are saved with the encrypted calendar settings on this Mac, so set them again on another Mac if desired.

For Google Calendar, open that calendar's settings and copy its **Secret address in iCal format** from **Integrate calendar**. For Outlook on the web, use calendar publishing to copy the ICS link if your account allows it. Treat subscription URLs as private. Some work administrators disable calendar publishing; in that case a locally exported `.ics` file can be imported, but it will only update when you replace the file with a fresh export.

## Build from source

Requires Node.js 20+ and macOS on Apple silicon.

```sh
npm install
npm run build
npm run dmg
```

`npm run dev -- --host 127.0.0.1 --port 4173` runs a browser preview of the setup screen; choosing a folder requires the Mac app. `npm run start` opens the Electron app. `npm run dmg` writes the installer to `release/`.
