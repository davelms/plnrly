const { join, resolve, basename } = require('node:path')
const { randomUUID } = require('node:crypto')
const { mkdir, readFile, writeFile, readdir, rename, stat } = require('node:fs/promises')
const { current: CURRENT_SCHEMA_VERSION } = require('../shared/schema-version.json')
const kinds = ['projects', 'people', 'tasks', 'notes']
const recordName = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.json$/i
const LEGACY_APP = 'Lattice' // Historical v1/v2 manifest marker; retain for migration.
const recordMigrations = {
  1: record => ({ ...record, schemaVersion: 2 }),
  2: record => ({ ...record, schemaVersion: 3 })
}
function migrationSteps(from) {
  const steps = []
  for (let version = from; version < CURRENT_SCHEMA_VERSION; version++) {
    if (!recordMigrations[version]) throw new Error(`No migration is available from schema v${version}.`)
    steps.push({ from: version, to: version + 1 })
  }
  return steps
}
function safeName(name) {
  const value = String(name || '').trim()
  if (!value || value === '.' || value === '..' || /[\\/:\x00-\x1f]/.test(value) || value.endsWith('.')) throw new Error('Choose a folder name without slashes or control characters.')
  return value
}
async function atomicWrite(path, content) {
  const temp = `${path}.${randomUUID()}.tmp`
  await writeFile(temp, content, { encoding: 'utf8', mode: 0o600 })
  await rename(temp, path)
}
function profileReadme(name) {
  return `# ${name}\n\nThis is a Plnrly profile. Schema version: ${CURRENT_SCHEMA_VERSION}. Open SCHEMA.md for the format. Each JSON file is one record. You may edit or add files with another AI tool; keep IDs stable and update updatedAt whenever a record changes. Do not put calendar feed links or access tokens in this folder.\n`
}
async function initializeProfile(folderPath, schemaText) {
  const resolved = resolve(folderPath)
  const profileName = safeName(basename(resolved))
  if (!(await stat(resolved)).isDirectory()) throw new Error('Choose a folder.')
  try {
    await stat(join(resolved, 'manifest.json'))
    throw new Error('This folder already has a manifest. Choose an existing Plnrly profile or another folder.')
  } catch (error) {
    if (error.code !== 'ENOENT') throw error
  }
  const existing = (await readdir(resolved)).filter(name => name !== '.DS_Store')
  if (existing.length) throw new Error('Choose an empty folder or an existing Plnrly profile folder.')
  const createdAt = new Date().toISOString()
  const id = randomUUID()
  const folders = Object.fromEntries(kinds.map(kind => [kind, kind]))
  for (const kind of kinds) await mkdir(join(resolved, kind), { recursive: true })
  await atomicWrite(join(resolved, 'README.md'), profileReadme(profileName))
  await atomicWrite(join(resolved, 'SCHEMA.md'), schemaText)
  await atomicWrite(join(resolved, 'manifest.json'), JSON.stringify({ app: 'Plnrly', schemaVersion: CURRENT_SCHEMA_VERSION, id, profileName, createdAt, folders, migrations: [] }, null, 2) + '\n')
  return { id, name: profileName, folderPath: resolved, createdAt, schemaVersion: CURRENT_SCHEMA_VERSION }
}
async function readManifest(resolved) {
  let manifest
  try { manifest = JSON.parse(await readFile(join(resolved, 'manifest.json'), 'utf8')) }
  catch { throw new Error('This folder has no readable Plnrly manifest.') }
  const version = manifest?.schemaVersion === undefined ? 1 : manifest.schemaVersion
  if (!Number.isInteger(version) || version < 1) throw new Error('This folder has an invalid schema version.')
  if (version > CURRENT_SCHEMA_VERSION) throw new Error(`This folder uses schema v${version}. Update Plnrly before opening it.`)
  const marker = version < 3 ? LEGACY_APP : 'Plnrly'
  if (manifest?.app !== marker || !recordName.test(`${manifest.id}.json`) || typeof manifest.profileName !== 'string' || !manifest.profileName.trim()) throw new Error('The selected folder is not a valid Plnrly profile.')
  for (const kind of kinds) {
    if (manifest.folders?.[kind] !== kind) throw new Error(`The profile manifest has an invalid ${kind} folder.`)
    if (!(await stat(join(resolved, kind))).isDirectory()) throw new Error(`The profile is missing its ${kind} folder.`)
  }
  return { manifest, version }
}
async function inspectProfile(folderPath) {
  const resolved = resolve(folderPath)
  const { manifest, version } = await readManifest(resolved)
  if (version !== CURRENT_SCHEMA_VERSION) throw new Error(`This folder needs migration from schema v${version}.`)
  return { id: manifest.id, name: manifest.profileName, folderPath: resolved, createdAt: manifest.createdAt, schemaVersion: version }
}
async function renameProfile(folderPath, id, name) {
  const resolved = resolve(folderPath)
  const { manifest, version } = await readManifest(resolved)
  if (version !== CURRENT_SCHEMA_VERSION || manifest.id !== id) throw new Error('Open the current profile folder before renaming it.')
  const profileName = String(name || '').trim().normalize('NFC')
  if (!profileName || profileName.length > 80 || /[\x00-\x1f\x7f]/.test(profileName)) throw new Error('Use a profile name of 1–80 characters without control characters.')
  if (manifest.profileName !== profileName) await atomicWrite(join(resolved, 'manifest.json'), JSON.stringify({ ...manifest, profileName }, null, 2) + '\n')
  return inspectProfile(resolved)
}
async function migrateProfile(folderPath, schemaText) {
  const resolved = resolve(folderPath)
  const { manifest, version } = await readManifest(resolved)
  const folderSteps = migrationSteps(version)
  const patches = []
  for (const kind of kinds) {
    const dir = join(resolved, kind)
    for (const name of (await readdir(dir)).filter(name => name.endsWith('.json'))) {
      if (!recordName.test(name)) throw new Error(`Cannot migrate ${kind}/${name}: filename must be a UUID.`)
      const path = join(dir, name)
      let record
      try { record = JSON.parse(await readFile(path, 'utf8')) }
      catch { throw new Error(`Cannot migrate ${kind}/${name}: invalid JSON.`) }
      if (!record || typeof record !== 'object' || Array.isArray(record) || `${record.id}.json` !== name) throw new Error(`Cannot migrate ${kind}/${name}: record ID does not match its filename.`)
      const recordVersion = record.schemaVersion === undefined ? 1 : record.schemaVersion
      if (!Number.isInteger(recordVersion) || recordVersion < 1 || recordVersion > CURRENT_SCHEMA_VERSION) throw new Error(`Cannot migrate ${kind}/${name}: unsupported schema version.`)
      if (recordVersion < CURRENT_SCHEMA_VERSION) {
        let upgraded = record
        for (const step of migrationSteps(recordVersion)) upgraded = recordMigrations[step.from](upgraded)
        patches.push({ path, content: JSON.stringify(upgraded, null, 2) + '\n' })
      }
    }
  }
  // All records are parsed before the first write. If a write is interrupted, the old
  // manifest remains in place and the next open repeats this idempotent migration.
  for (const patch of patches) await atomicWrite(patch.path, patch.content)
  if (version < CURRENT_SCHEMA_VERSION) {
    await atomicWrite(join(resolved, 'SCHEMA.md'), schemaText)
    let readme
    try { readme = await readFile(join(resolved, 'README.md'), 'utf8') }
    catch { readme = profileReadme(manifest.profileName) }
    if (!readme.includes(`Schema version: ${CURRENT_SCHEMA_VERSION}`)) await atomicWrite(join(resolved, 'README.md'), `${readme.trimEnd()}\n\nThis folder is now a Plnrly profile. Schema version: ${CURRENT_SCHEMA_VERSION}. See SCHEMA.md for the current format.\n`)
    const migrations = Array.isArray(manifest.migrations) ? manifest.migrations : []
    const history = folderSteps.map(step => ({ ...step, at: new Date().toISOString() }))
    await atomicWrite(join(resolved, 'manifest.json'), JSON.stringify({ ...manifest, app: 'Plnrly', schemaVersion: CURRENT_SCHEMA_VERSION, migrations: [...migrations, ...history] }, null, 2) + '\n')
  }
  return { ...await inspectProfile(resolved), migratedFrom: version < CURRENT_SCHEMA_VERSION ? version : undefined, upgradedRecords: patches.length }
}
async function readRecords(folderPath) {
  const profile = await inspectProfile(folderPath)
  const result = {}
  for (const kind of kinds) {
    const names = (await readdir(join(profile.folderPath, kind))).filter(name => name.endsWith('.json'))
    result[kind] = await Promise.all(names.map(async name => ({ name, content: await readFile(join(profile.folderPath, kind, name), 'utf8') })))
  }
  return result
}
async function writeRecord(folderPath, kind, id, content) {
  if (!kinds.includes(kind) || typeof id !== 'string' || !recordName.test(`${id}.json`)) throw new Error('Invalid record path.')
  if (typeof content !== 'string' || content.length > 5_000_000) throw new Error('Record must be JSON under 5 MB.')
  const parsed = JSON.parse(content)
  if (parsed.id !== id || parsed.schemaVersion !== CURRENT_SCHEMA_VERSION) throw new Error(`Record needs matching ID and schema version ${CURRENT_SCHEMA_VERSION}.`)
  const profile = await inspectProfile(folderPath)
  await atomicWrite(join(profile.folderPath, kind, `${id}.json`), content)
}
module.exports = { CURRENT_SCHEMA_VERSION, migrationSteps, initializeProfile, inspectProfile, renameProfile, migrateProfile, readRecords, writeRecord, safeName }
