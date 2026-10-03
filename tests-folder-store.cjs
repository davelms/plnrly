const { test } = require('node:test')
const assert = require('node:assert/strict')
const { mkdtemp, mkdir, readFile, readdir, writeFile, rm } = require('node:fs/promises')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const store = require('./electron/folder-store.cjs')
const ids = {
  projects: 'd9346b7c-e519-4f71-8cc4-f62da0223596',
  people: '1ab8805a-19ce-4bfb-8c23-565e1de597ae',
  tasks: 'de7c13c3-50a7-4b7a-a79e-96c7e5a7effa',
  notes: '97af75d2-3f96-49a1-99ca-93d3fc3e507b'
}
const at = '2026-10-03T09:00:00.000Z'
const schema = '# Plnrly profile schema v3'
async function fixture() {
  const parent = await mkdtemp(join(tmpdir(), 'plnrly-test-'))
  const folder = join(parent, 'Work')
  await mkdir(folder)
  const profile = await store.initializeProfile(folder, schema)
  return { parent, folder, profile }
}
async function manifest(folder) { return JSON.parse(await readFile(join(folder, 'manifest.json'), 'utf8')) }
async function record(folder, kind, id) { return JSON.parse(await readFile(join(folder, kind, `${id}.json`), 'utf8')) }

test('new folders contain a v3 scaffold and accept current records', async () => {
  const { parent, folder, profile } = await fixture()
  try {
    assert.equal(profile.schemaVersion, 3)
    assert.equal((await manifest(folder)).schemaVersion, 3)
    assert.equal((await manifest(folder)).app, 'Plnrly')
    assert.equal((await store.inspectProfile(folder)).id, profile.id)
    for (const name of ['README.md', 'SCHEMA.md', 'manifest.json', 'projects', 'people', 'tasks', 'notes']) assert.ok((await readdir(folder)).includes(name))
    const item = { schemaVersion: 3, id: ids.tasks, createdAt: at, updatedAt: at, title: 'Prepare review' }
    await store.writeRecord(folder, 'tasks', ids.tasks, JSON.stringify(item))
    assert.deepEqual(JSON.parse((await store.readRecords(folder)).tasks[0].content), item)
    await assert.rejects(() => store.writeRecord(folder, 'tasks', '../bad', '{}'))
    await assert.rejects(() => store.writeRecord(folder, 'tasks', ids.tasks, JSON.stringify({ ...item, schemaVersion: 2 })), /schema version 3/)
    await assert.rejects(() => store.initializeProfile(folder, schema))
    const unrelated = join(parent, 'Unrelated')
    await mkdir(unrelated)
    await writeFile(join(unrelated, 'notes.txt'), 'keep')
    await assert.rejects(() => store.initializeProfile(unrelated, schema), /empty folder/)
  } finally { await rm(parent, { recursive: true, force: true }) }
})

test('v1 folder upgrades through v2 to v3, preserves data, and records both steps', async () => {
  const { parent, folder } = await fixture()
  try {
    const oldManifest = await manifest(folder)
    oldManifest.app = 'Lattice'
    oldManifest.schemaVersion = 1
    delete oldManifest.migrations
    await writeFile(join(folder, 'manifest.json'), JSON.stringify(oldManifest))
    await writeFile(join(folder, 'README.md'), '# Work\n\nMy own instructions.\n')
    await writeFile(join(folder, 'SCHEMA.md'), '# Historical schema v1')
    for (const [kind, id] of Object.entries(ids)) await writeFile(join(folder, kind, `${id}.json`), JSON.stringify({ id, createdAt: at, updatedAt: at, customField: 'preserve me' }))
    const opened = await store.migrateProfile(folder, schema)
    assert.equal(opened.migratedFrom, 1)
    assert.equal(opened.upgradedRecords, 4)
    const updated = await manifest(folder)
    assert.equal(updated.app, 'Plnrly')
    assert.equal(updated.schemaVersion, 3)
    assert.deepEqual(updated.migrations.map(({ from, to }) => ({ from, to })), [{ from: 1, to: 2 }, { from: 2, to: 3 }])
    for (const [kind, id] of Object.entries(ids)) {
      const item = await record(folder, kind, id)
      assert.equal(item.schemaVersion, 3)
      assert.equal(item.id, id)
      assert.equal(item.updatedAt, at)
      assert.equal(item.customField, 'preserve me')
    }
    assert.match(await readFile(join(folder, 'README.md'), 'utf8'), /My own instructions/)
    assert.match(await readFile(join(folder, 'SCHEMA.md'), 'utf8'), /schema v3/)
    const again = await store.migrateProfile(folder, schema)
    assert.equal(again.upgradedRecords, 0)
    assert.equal((await manifest(folder)).migrations.length, 2)
  } finally { await rm(parent, { recursive: true, force: true }) }
})

test('v2 folder upgrades its manifest marker and records without changing identity', async () => {
  const { parent, folder, profile } = await fixture()
  try {
    const oldManifest = { ...await manifest(folder), app: 'Lattice', schemaVersion: 2, migrations: [] }
    await writeFile(join(folder, 'manifest.json'), JSON.stringify(oldManifest))
    const oldRecord = { schemaVersion: 2, id: ids.tasks, createdAt: at, updatedAt: at, title: 'Keep work', projectIds: [ids.projects], customField: 'keep' }
    await writeFile(join(folder, 'tasks', `${ids.tasks}.json`), JSON.stringify(oldRecord))
    const opened = await store.migrateProfile(folder, schema)
    assert.equal(opened.id, profile.id)
    assert.equal((await manifest(folder)).app, 'Plnrly')
    assert.deepEqual((await manifest(folder)).migrations.map(({ from, to }) => ({ from, to })), [{ from: 2, to: 3 }])
    assert.deepEqual(await record(folder, 'tasks', ids.tasks), { ...oldRecord, schemaVersion: 3 })
  } finally { await rm(parent, { recursive: true, force: true }) }
})

test('failed preflight leaves a legacy folder untouched; retry finishes mixed records', async () => {
  const { parent, folder } = await fixture()
  try {
    const oldManifest = { ...await manifest(folder), app: 'Lattice', schemaVersion: 1 }
    await writeFile(join(folder, 'manifest.json'), JSON.stringify(oldManifest))
    await writeFile(join(folder, 'tasks', `${ids.tasks}.json`), JSON.stringify({ id: ids.tasks, updatedAt: at }))
    await writeFile(join(folder, 'notes', `${ids.notes}.json`), '{broken')
    await assert.rejects(() => store.migrateProfile(folder, schema), /invalid JSON/)
    assert.equal((await manifest(folder)).schemaVersion, 1)
    assert.equal((await record(folder, 'tasks', ids.tasks)).schemaVersion, undefined)
    await writeFile(join(folder, 'notes', `${ids.notes}.json`), JSON.stringify({ id: ids.notes, schemaVersion: 2, updatedAt: at }))
    await store.migrateProfile(folder, schema)
    assert.equal((await manifest(folder)).schemaVersion, 3)
    assert.equal((await record(folder, 'tasks', ids.tasks)).schemaVersion, 3)
    assert.equal((await record(folder, 'notes', ids.notes)).schemaVersion, 3)
  } finally { await rm(parent, { recursive: true, force: true }) }
})

test('newer folders are rejected without mutation', async () => {
  const { parent, folder } = await fixture()
  try {
    const future = { ...await manifest(folder), schemaVersion: 4 }
    await writeFile(join(folder, 'manifest.json'), JSON.stringify(future))
    await assert.rejects(() => store.migrateProfile(folder, schema), /Update Plnrly/)
    assert.deepEqual(await manifest(folder), future)
  } finally { await rm(parent, { recursive: true, force: true }) }
})

test('a current folder repairs a late-arriving v1 record', async () => {
  const { parent, folder } = await fixture()
  try {
    await writeFile(join(folder, 'tasks', `${ids.tasks}.json`), JSON.stringify({ id: ids.tasks, createdAt: at, updatedAt: at, title: 'Late file' }))
    const opened = await store.migrateProfile(folder, schema)
    assert.equal(opened.schemaVersion, 3)
    assert.equal(opened.upgradedRecords, 1)
    assert.equal((await record(folder, 'tasks', ids.tasks)).schemaVersion, 3)
    assert.equal((await manifest(folder)).migrations.length, 0)
  } finally { await rm(parent, { recursive: true, force: true }) }
})

test('opening an existing Plnrly folder imports it without replacing records', async () => {
  const { parent, folder, profile } = await fixture()
  try {
    const item = { schemaVersion: 3, id: ids.tasks, createdAt: at, updatedAt: at, title: 'Keep this task' }
    await store.writeRecord(folder, 'tasks', ids.tasks, JSON.stringify(item))
    const beforeManifest = await manifest(folder)
    const opened = await store.migrateProfile(folder, schema)
    assert.equal(opened.id, profile.id)
    assert.equal(opened.folderPath, folder)
    assert.equal(opened.upgradedRecords, 0)
    assert.deepEqual(await manifest(folder), beforeManifest)
    assert.deepEqual(await record(folder, 'tasks', ids.tasks), item)
  } finally { await rm(parent, { recursive: true, force: true }) }
})

test('profile display name is editable without renaming its folder or changing schema', async () => {
  const { parent, folder, profile } = await fixture()
  try {
    assert.equal(profile.name, 'Work')
    await writeFile(join(folder, 'README.md'), '# My own profile instructions\n')
    const item = { schemaVersion: 3, id: ids.tasks, createdAt: at, updatedAt: at, title: 'Keep this task' }
    await store.writeRecord(folder, 'tasks', ids.tasks, JSON.stringify(item))
    const renamed = await store.renameProfile(folder, profile.id, 'Planning / Personal')
    assert.equal(renamed.name, 'Planning / Personal')
    assert.equal(renamed.folderPath, folder)
    assert.equal(renamed.schemaVersion, 3)
    assert.equal((await manifest(folder)).profileName, 'Planning / Personal')
    assert.equal((await store.migrateProfile(folder, schema)).name, 'Planning / Personal')
    assert.equal(await readFile(join(folder, 'README.md'), 'utf8'), '# My own profile instructions\n')
    assert.deepEqual(await record(folder, 'tasks', ids.tasks), item)
    await assert.rejects(() => store.renameProfile(folder, profile.id, '  '), /profile name/)
    await assert.rejects(() => store.renameProfile(folder, ids.people, 'Wrong folder'), /current profile/)
  } finally { await rm(parent, { recursive: true, force: true }) }
})
