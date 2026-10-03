import type { EntityKind } from './model'
export type CalendarSource = { id: string; name: string; provider: 'Google' | 'Outlook' | 'ICS'; kind: 'url' | 'file'; updatedAt: string; color: string }
export type FolderProfile = { id: string; name: string; folderPath: string; createdAt: string; schemaVersion: number; created?: boolean; migratedFrom?: number; upgradedRecords?: number }
export type CalendarPayload = { id: string; name: string; provider: CalendarSource['provider']; color: string; text?: string; error?: string }
type NativeBridge = {
  knownProfiles: () => Promise<{ profiles: FolderProfile[]; errors: string[] }>
  chooseFolder: () => Promise<FolderProfile | null>
  readProfile: (id: string) => Promise<Record<EntityKind, Array<{ name: string; content: string }>>>
  writeRecord: (id: string, kind: EntityKind, recordId: string, content: string) => Promise<boolean>
  renameProfile: (id: string, name: string) => Promise<FolderProfile>
  listCalendars: (profileId: string) => Promise<CalendarSource[]>
  addCalendarUrl: (profileId: string, name: string, provider: CalendarSource['provider'], url: string) => Promise<CalendarSource[]>
  addCalendarFile: (profileId: string, name: string, provider: CalendarSource['provider']) => Promise<CalendarSource[] | null>
  removeCalendar: (profileId: string, id: string) => Promise<CalendarSource[]>
  setCalendarColor: (profileId: string, id: string, color: string) => Promise<CalendarSource[]>
  refreshCalendars: (profileId: string) => Promise<CalendarPayload[]>
}
declare global { interface Window { plnrlyNative?: NativeBridge } }
export const isNative = () => !!window.plnrlyNative
