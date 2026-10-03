import schemaVersion from '../shared/schema-version.json'
export const CURRENT_SCHEMA_VERSION = schemaVersion.current
export type Status = 'Backlog' | 'Next' | 'In progress' | 'Done'
export type Priority = 'Low' | 'Medium' | 'High'
export type EntityBase = { id: string; schemaVersion: number; createdAt: string; updatedAt: string; deletedAt?: string }
export type Task = EntityBase & { title: string; description: string; status: Status; priority: Priority; dueDate: string; projectIds: string[]; personIds: string[]; noteIds: string[] }
export type Project = EntityBase & { name: string; description: string; color: string; archived: boolean }
export type Person = EntityBase & { name: string; email: string; role: string; notes: string }
export type Note = EntityBase & { title: string; body: string; projectIds: string[]; taskIds: string[]; personIds: string[] }
export type EntityKind = 'tasks' | 'projects' | 'people' | 'notes'
export type Data = { tasks: Task[]; projects: Project[]; people: Person[]; notes: Note[] }
export type Profile = { id: string; name: string; folderPath?: string; schemaVersion?: number; createdAt: string; lastSyncAt?: string }
export type CalendarEvent = { id: string; source: 'Google' | 'Outlook' | 'ICS'; feedId?: string; calendarName?: string; color?: string; title: string; start: string; end: string; url?: string; location?: string; description?: string }
export const statuses: Status[] = ['Backlog', 'Next', 'In progress', 'Done']
export const priorities: Priority[] = ['Low', 'Medium', 'High']
export const emptyData = (): Data => ({ tasks: [], projects: [], people: [], notes: [] })
export const stamp = () => new Date().toISOString()
export const uid = () => crypto.randomUUID()
export const newBase = (): EntityBase => { const now = stamp(); return { id: uid(), schemaVersion: CURRENT_SCHEMA_VERSION, createdAt: now, updatedAt: now } }
export const visible = <T extends EntityBase>(items: T[]) => items.filter(item => !item.deletedAt)
export function loadProfiles(): Profile[] { try { return JSON.parse(localStorage.getItem('plnrly.profiles') || '[]') } catch { return [] } }
export function saveProfiles(profiles: Profile[]) { localStorage.setItem('plnrly.profiles', JSON.stringify(profiles)) }
export function loadData(id: string): Data {
  try {
    const stored = { ...emptyData(), ...JSON.parse(localStorage.getItem(`plnrly.data.${id}`) || '{}') }
    return Object.fromEntries((['projects', 'people', 'tasks', 'notes'] as EntityKind[]).map(kind => [kind, (stored[kind] || []).map((item: EntityBase) => ({ ...item, schemaVersion: !item.schemaVersion || item.schemaVersion < CURRENT_SCHEMA_VERSION ? CURRENT_SCHEMA_VERSION : item.schemaVersion }))])) as Data
  } catch { return emptyData() }
}
export function saveData(id: string, data: Data) { localStorage.setItem(`plnrly.data.${id}`, JSON.stringify(data)) }
export const formatDate = (date: string) => date ? new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' }).format(new Date(`${date}T12:00:00`)) : ''
