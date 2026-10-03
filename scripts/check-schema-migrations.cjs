const assert = require('node:assert/strict')
const { readdirSync, statSync } = require('node:fs')
const { join } = require('node:path')
const { CURRENT_SCHEMA_VERSION, migrationSteps } = require('../electron/folder-store.cjs')

const fixtureRoot = join(__dirname, '..', 'tests', 'fixtures', 'schema')
assert.ok(Number.isInteger(CURRENT_SCHEMA_VERSION) && CURRENT_SCHEMA_VERSION >= 1, 'Current schema version must be a positive integer')
const historical = Array.from({ length: CURRENT_SCHEMA_VERSION - 1 }, (_, index) => index + 1)
const fixtureVersions = readdirSync(fixtureRoot, { withFileTypes: true })
  .filter(entry => entry.isDirectory())
  .map(entry => {
    assert.match(entry.name, /^v[1-9]\d*$/, `Unexpected fixture directory: ${entry.name}`)
    return Number(entry.name.slice(1))
  })
  .sort((a, b) => a - b)
assert.deepEqual(fixtureVersions, historical, 'Keep one frozen fixture for every historical schema version, starting at v1')

for (const version of historical) {
  const steps = migrationSteps(version)
  assert.deepEqual(steps, Array.from({ length: CURRENT_SCHEMA_VERSION - version }, (_, index) => ({ from: version + index, to: version + index + 1 })), `Incomplete migration chain from v${version}`)
  const folder = join(fixtureRoot, `v${version}`)
  for (const name of ['manifest.json', 'README.md', 'SCHEMA.md', 'projects', 'people', 'tasks', 'notes']) {
    assert.ok(statSync(join(folder, name)), `v${version} fixture lacks ${name}`)
  }
}
assert.deepEqual(migrationSteps(CURRENT_SCHEMA_VERSION), [])
process.stdout.write(`Schema migration chain and fixtures cover v1 through v${CURRENT_SCHEMA_VERSION}.\n`)
