const { test } = require('node:test')
const assert = require('node:assert/strict')
const { cp, mkdtemp, readFile, readdir, rm } = require('node:fs/promises')
const { join } = require('node:path')
const { tmpdir } = require('node:os')
const { CURRENT_SCHEMA_VERSION, migrateProfile } = require('./electron/folder-store.cjs')

const kinds = ['projects', 'people', 'tasks', 'notes']
const fixtures = join(__dirname, 'tests', 'fixtures', 'schema')
async function json(path) { return JSON.parse(await readFile(path, 'utf8')) }
async function records(folder) {
  const result = {}
  for (const kind of kinds) {
    result[kind] = {}
    for (const name of (await readdir(join(folder, kind))).filter(name => name.endsWith('.json'))) {
      result[kind][name] = await json(join(folder, kind, name))
    }
  }
  return result
}

for (let version = 1; version < CURRENT_SCHEMA_VERSION; version++) {
  test(`frozen v${version} profile migrates directly to v${CURRENT_SCHEMA_VERSION} without losing data`, async () => {
    const parent = await mkdtemp(join(tmpdir(), 'plnrly-schema-matrix-'))
    const folder = join(parent, 'profile')
    try {
      await cp(join(fixtures, `v${version}`), folder, { recursive: true })
      const beforeManifest = await json(join(folder, 'manifest.json'))
      const before = await records(folder)
      const beforeReadme = await readFile(join(folder, 'README.md'), 'utf8')
      const first = await migrateProfile(folder, `# Plnrly profile schema v${CURRENT_SCHEMA_VERSION}`)
      assert.equal(first.migratedFrom, version)
      const afterManifest = await json(join(folder, 'manifest.json'))
      assert.equal(afterManifest.schemaVersion, CURRENT_SCHEMA_VERSION)
      assert.equal(afterManifest.app, 'Plnrly')
      for (const [key, value] of Object.entries(beforeManifest)) {
        if (key !== 'app' && key !== 'schemaVersion' && key !== 'migrations') assert.deepEqual(afterManifest[key], value, `manifest ${key} changed`)
      }
      assert.deepEqual(afterManifest.migrations.map(({ from, to }) => ({ from, to })),
        Array.from({ length: CURRENT_SCHEMA_VERSION - version }, (_, index) => ({ from: version + index, to: version + index + 1 })))
      assert.ok((await readFile(join(folder, 'README.md'), 'utf8')).includes(beforeReadme.trimEnd()))
      assert.match(await readFile(join(folder, 'SCHEMA.md'), 'utf8'), new RegExp(`schema v${CURRENT_SCHEMA_VERSION}`))
      const after = await records(folder)
      for (const kind of kinds) {
        assert.deepEqual(Object.keys(after[kind]).sort(), Object.keys(before[kind]).sort(), `${kind} filenames changed`)
        for (const [name, original] of Object.entries(before[kind])) {
          assert.equal(after[kind][name].schemaVersion, CURRENT_SCHEMA_VERSION)
          for (const [key, value] of Object.entries(original)) {
            if (key !== 'schemaVersion') assert.deepEqual(after[kind][name][key], value, `${kind}/${name} lost ${key}`)
          }
        }
      }
      const snapshot = await records(folder)
      const second = await migrateProfile(folder, `# Plnrly profile schema v${CURRENT_SCHEMA_VERSION}`)
      assert.equal(second.upgradedRecords, 0)
      assert.deepEqual(await records(folder), snapshot)
      assert.deepEqual(await json(join(folder, 'manifest.json')), afterManifest)
    } finally {
      await rm(parent, { recursive: true, force: true })
    }
  })
}
