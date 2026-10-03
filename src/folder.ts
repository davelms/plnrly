import { Data, EntityKind, Profile, emptyData } from './model'
import { newerRecord, validateRecord } from './schema'
export async function syncFolderProfile(profile: Profile, local: Data): Promise<Data> {
  if (!profile.folderPath || !window.plnrlyNative) throw new Error('Choose a folder profile in the Mac app to sync.')
  const files = await window.plnrlyNative.readProfile(profile.id)
  const merged = emptyData()
  const kinds: EntityKind[] = ['projects', 'people', 'tasks', 'notes']
  for (const kind of kinds) {
    const remoteItems = files[kind].map(file => {
      try { return validateRecord(kind, file.name, JSON.parse(file.content)) }
      catch (error) { throw new Error(`Cannot use ${kind}/${file.name}: ${error instanceof Error ? error.message : 'invalid JSON'}`) }
    })
    const remoteById = new Map(remoteItems.map(item => [item.id, item]))
    if (remoteById.size !== remoteItems.length) throw new Error(`The ${kind} folder has duplicate record filenames.`)
    const finalItems: unknown[] = []
    for (const item of local[kind]) {
      const remote = remoteById.get(item.id)
      if (!remote || newerRecord(item, remote as typeof item) === item) {
        await window.plnrlyNative.writeRecord(profile.id, kind, item.id, JSON.stringify(item, null, 2) + '\n')
        finalItems.push(item)
      } else finalItems.push(remote)
      remoteById.delete(item.id)
    }
    for (const item of remoteById.values()) finalItems.push(item)
    ;(merged as unknown as Record<string, unknown>)[kind] = finalItems
  }
  return merged
}
