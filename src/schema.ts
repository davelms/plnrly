import { CURRENT_SCHEMA_VERSION, EntityKind, EntityBase, Note, Person, Priority, Project, Status, Task, priorities, statuses } from './model'

type AnyRecord = Task | Project | Person | Note
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const date = /^\d{4}-\d{2}-\d{2}$/
function object(value: unknown): value is Record<string, unknown> { return !!value && typeof value === 'object' && !Array.isArray(value) }
function string(value: unknown): value is string { return typeof value === 'string' }
function strings(value: unknown): value is string[] { return Array.isArray(value) && value.every(string) }
function ids(value: unknown): value is string[] { return strings(value) && value.every(id => uuid.test(id)) }
function timestamp(value: unknown): value is string { return string(value) && !Number.isNaN(Date.parse(value)) }
function assert(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message) }
export function validateRecord(kind: EntityKind, fileName: string, value: unknown): AnyRecord {
  const path = `${kind}/${fileName}`
  assert(object(value), `${path} must contain a JSON object.`)
  assert(value.schemaVersion === CURRENT_SCHEMA_VERSION, `${path} needs schemaVersion ${CURRENT_SCHEMA_VERSION}.`)
  assert(string(value.id) && uuid.test(value.id) && fileName === `${value.id}.json`, `${path} must be named after its UUID id.`)
  assert(timestamp(value.createdAt) && timestamp(value.updatedAt), `${path} needs createdAt and updatedAt timestamps.`)
  assert(value.deletedAt === undefined || timestamp(value.deletedAt), `${path} has an invalid deletedAt timestamp.`)
  if (kind === 'tasks') {
    assert(string(value.title) && value.title.trim() && string(value.description), `${path} needs a non-empty title and a description string.`)
    assert(statuses.includes(value.status as Status), `${path} has an invalid status.`)
    assert(priorities.includes(value.priority as Priority), `${path} has an invalid priority.`)
    assert(string(value.dueDate) && (value.dueDate === '' || date.test(value.dueDate) && !Number.isNaN(Date.parse(value.dueDate))), `${path} needs a YYYY-MM-DD dueDate or an empty string.`)
    assert(ids(value.projectIds) && ids(value.personIds) && ids(value.noteIds), `${path} needs UUID arrays for projectIds, personIds and noteIds.`)
  } else if (kind === 'projects') {
    assert(string(value.name) && value.name.trim() && string(value.description) && string(value.color) && /^#[0-9a-f]{6}$/i.test(value.color) && typeof value.archived === 'boolean', `${path} needs name, description, #RRGGBB color and archived fields.`)
  } else if (kind === 'people') {
    assert(string(value.name) && value.name.trim() && string(value.email) && string(value.role) && string(value.notes), `${path} needs name, email, role and notes strings.`)
  } else {
    assert(string(value.title) && value.title.trim() && string(value.body) && ids(value.projectIds) && ids(value.taskIds) && ids(value.personIds), `${path} needs title, body and UUID relationship arrays.`)
  }
  return value as AnyRecord
}
export function newerRecord<T extends EntityBase>(local: T, remote: T): T {
  return Date.parse(local.updatedAt) > Date.parse(remote.updatedAt) ? local : remote
}
