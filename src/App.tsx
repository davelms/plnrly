import { useEffect, useMemo, useRef, useState } from 'react'
import { CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight, Circle, Folder, LayoutGrid, ListTodo, Menu, NotebookText, Plus, Search, Settings, SlidersHorizontal, Sun, Users, X } from 'lucide-react'
import { CalendarEvent, Data, EntityKind, Note, Person, Priority, Profile, Project, Status, Task, formatDate, emptyData, loadData, loadProfiles, newBase, priorities, saveData, saveProfiles, stamp, statuses, visible } from './model'
import { syncFolderProfile } from './folder'
import { parseCalendar } from './ics'
import { CalendarSource, isNative } from './native'
import CalendarView, { AgendaRow, EventDetails, eventOnDay } from './CalendarView'

type View = 'Today' | 'Tasks' | 'Projects' | 'People' | 'Notes' | 'Calendar' | 'Settings'
type Draft = { kind: EntityKind; id?: string }
const nav: { label: View; icon: typeof Sun }[] = [{ label: 'Today', icon: Sun }, { label: 'Tasks', icon: ListTodo }, { label: 'Projects', icon: Folder }, { label: 'People', icon: Users }, { label: 'Notes', icon: NotebookText }, { label: 'Calendar', icon: CalendarDays }]
const todayKey = () => new Date().toLocaleDateString('en-CA')
const initials = (name: string) => name.split(/\s+/).map(part => part[0]).join('').slice(0, 2).toUpperCase()
const relativeDue = (dueDate: string) => !dueDate ? '' : dueDate === todayKey() ? 'Today' : formatDate(dueDate)
const eventsKey = (id: string) => `plnrly.calendar.events.${id}`
const singular = (kind: EntityKind) => kind === 'people' ? 'person' : kind.slice(0, -1)
function readCachedEvents(id: string): CalendarEvent[] { try { return JSON.parse(localStorage.getItem(eventsKey(id)) || '[]') } catch { return [] } }
function classForPriority(priority: Priority) { return `priority priority-${priority.toLowerCase()}` }
function IconButton({ children, onClick, title }: { children: React.ReactNode; onClick: () => void; title: string }) { return <button className="icon-button" type="button" onClick={onClick} aria-label={title} title={title}>{children}</button> }

export default function App() {
  const [profiles, setProfiles] = useState<Profile[]>([])
  const [profilesReady, setProfilesReady] = useState(!isNative())
  const [profileId, setProfileId] = useState('')
  const [legacyData] = useState<Data | null>(() => {
    const saved = loadProfiles()
    const active = localStorage.getItem('plnrly.activeProfile')
    const old = saved.find(item => item.id === active && !item.folderPath) || saved.find(item => !item.folderPath)
    const orphan = active && !saved.some(item => item.id === active) ? active : null
    const fallback = Array.from({ length: localStorage.length }, (_, index) => localStorage.key(index))
      .find((key): key is string => !!key?.startsWith('plnrly.data.'))?.slice('plnrly.data.'.length)
    const id = old?.id || orphan || fallback
    if (!id) return null
    const records = loadData(id)
    return Object.values(records).some(items => items.length) ? records : null
  })
  const profile = profiles.find(item => item.id === profileId) || profiles[0]
  const [data, setData] = useState<Data>(emptyData)
  const [dataProfileId, setDataProfileId] = useState('')
  const [pendingRevision, setPendingRevision] = useState(0)
  const [view, setView] = useState<View>('Today')
  const [draft, setDraft] = useState<Draft | null>(null)
  const [query, setQuery] = useState('')
  const [projectFilter, setProjectFilter] = useState('all')
  const [personFilter, setPersonFilter] = useState('all')
  const [priorityFilter, setPriorityFilter] = useState('all')
  const [profileMenu, setProfileMenu] = useState(false)
  const [syncState, setSyncState] = useState<'idle' | 'syncing' | 'synced' | 'error'>('idle')
  const [message, setMessage] = useState('')
  const [events, setEvents] = useState<CalendarEvent[]>(() => readCachedEvents(profile?.id || ''))
  const [calendarSources, setCalendarSources] = useState<CalendarSource[]>([])
  const [profileNameInput, setProfileNameInput] = useState('')
  const [calendarsLoading, setCalendarsLoading] = useState(false)
  const [selectedEvent, setSelectedEvent] = useState<CalendarEvent | null>(null)
  const [calendarName, setCalendarName] = useState('')
  const [calendarProvider, setCalendarProvider] = useState<CalendarSource['provider']>('ICS')
  const [calendarUrl, setCalendarUrl] = useState('')
  const [mobileMenu, setMobileMenu] = useState(false)
  const restoredOnce = useRef(false)
  const activeProfileId = useRef(profile?.id || '')
  const editRevision = useRef(0)
  const syncBusy = useRef(new Set<string>())
  const tasks = visible(data.tasks)
  const projects = visible(data.projects)
  const people = visible(data.people)
  const notes = visible(data.notes)
  const projectMap = useMemo(() => new Map(projects.map(item => [item.id, item])), [data.projects])
  const personMap = useMemo(() => new Map(people.map(item => [item.id, item])), [data.people])
  useEffect(() => {
    if (!profile) return
    activeProfileId.current = profile.id
    localStorage.setItem('plnrly.activeProfile', profile.id)
    const cached = loadData(profile.id)
    setData(cached); setDataProfileId(profile.id); setPendingRevision(0); setSyncState('idle')
    setEvents(readCachedEvents(profile.id))
    setCalendarSources([])
    setCalendarsLoading(!!profile.folderPath)
    if (profile.folderPath) {
      void sync(profile, cached)
      void loadCalendars(profile.id)
    } else setCalendarSources([])
  }, [profile?.id, profile?.folderPath])
  useEffect(() => { setProfileNameInput(profile?.name || '') }, [profile?.id, profile?.name])
  useEffect(() => { if (profilesReady && profiles.length) saveProfiles(profiles) }, [profiles, profilesReady])
  useEffect(() => { if (profile && dataProfileId === profile.id) saveData(profile.id, data) }, [data, profile?.id, dataProfileId])
  useEffect(() => {
    if (!isNative() || restoredOnce.current) return
    restoredOnce.current = true
    void window.plnrlyNative!.knownProfiles().then(({ profiles: found, errors }) => {
      setProfiles(found)
      const preferred = localStorage.getItem('plnrly.activeProfile')
      setProfileId(found.find(item => item.id === preferred)?.id || found[0]?.id || '')
      const migrated = found.filter(item => item.migratedFrom !== undefined)
      if (errors.length) setMessage(errors.join(' · '))
      else if (migrated.length) setMessage(`Upgraded ${migrated.length} folder${migrated.length === 1 ? '' : 's'} to schema v${migrated[0].schemaVersion}.`)
      setProfilesReady(true)
    }).catch(error => { setMessage(error instanceof Error ? error.message : 'Could not load profile folders.'); setProfilesReady(true) })
  }, [])
  useEffect(() => {
    if (!pendingRevision || !profile?.folderPath || dataProfileId !== profile.id) return
    const timer = window.setTimeout(() => { void sync(profile, data) }, 900)
    return () => window.clearTimeout(timer)
  }, [pendingRevision, profile?.id, dataProfileId])
  useEffect(() => {
    if (!profile?.folderPath) return
    const refresh = () => {
      if (document.visibilityState === 'visible') {
        void sync(profile, loadData(profile.id))
        void refreshCalendars(profile.id)
      }
    }
    const interval = window.setInterval(refresh, 60_000)
    window.addEventListener('focus', refresh)
    return () => { window.clearInterval(interval); window.removeEventListener('focus', refresh) }
  }, [profile?.id, profile?.folderPath])
  const filteredTasks = tasks.filter(task => {
    const text = `${task.title} ${task.description} ${task.projectIds.map(id => projectMap.get(id)?.name || '').join(' ')} ${task.personIds.map(id => personMap.get(id)?.name || '').join(' ')}`.toLowerCase()
    return text.includes(query.toLowerCase()) && (projectFilter === 'all' || task.projectIds.includes(projectFilter)) && (personFilter === 'all' || task.personIds.includes(personFilter)) && (priorityFilter === 'all' || task.priority === priorityFilter)
  })
  const sortedEvents = [...events].sort((a, b) => a.start.localeCompare(b.start))
  const todayEvents = sortedEvents.filter(event => eventOnDay(event, new Date()))
  const priorityTasks = tasks.filter(task => task.status !== 'Done' && (task.priority === 'High' || task.dueDate <= todayKey() && !!task.dueDate)).sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999')).slice(0, 4)
  function mutate<K extends EntityKind>(kind: K, record: Data[K][number]) {
    setData(current => ({ ...current, [kind]: (current[kind] as Array<{ id: string }>).some(item => item.id === record.id) ? current[kind].map(item => item.id === record.id ? record : item) : [...current[kind], record] }))
    editRevision.current += 1; setSyncState('idle'); setPendingRevision(value => value + 1)
  }
  function remove(kind: EntityKind, id: string) {
    if (!window.confirm('Move this item to the profile archive?')) return
    setData(current => ({ ...current, [kind]: current[kind].map(item => item.id === id ? { ...item, deletedAt: stamp(), updatedAt: stamp() } : item) }))
    editRevision.current += 1; setDraft(null); setSyncState('idle'); setPendingRevision(value => value + 1)
  }
  function moveTask(task: Task, status: Status) { mutate('tasks', { ...task, status, updatedAt: stamp() }) }
  async function sync(target = profile, local = data) {
    if (!target?.folderPath) { setMessage('Create or link a folder profile to sync.'); return }
    if (syncBusy.current.has(target.id)) return
    syncBusy.current.add(target.id)
    const revision = editRevision.current
    setSyncState('syncing')
    try {
      const merged = await syncFolderProfile(target, local)
      if (revision === editRevision.current) {
        saveData(target.id, merged)
        if (activeProfileId.current === target.id) { setData(merged); setSyncState('synced') }
      } else setPendingRevision(value => value + 1)
      setProfiles(current => current.map(item => item.id === target.id ? { ...item, lastSyncAt: stamp() } : item))
      if (revision === editRevision.current) setPendingRevision(0)
    } catch (error) { setSyncState('error'); setMessage(error instanceof Error ? error.message : 'Folder sync failed.') }
    finally { syncBusy.current.delete(target.id) }
  }
  async function loadCalendars(id: string) {
    if (!window.plnrlyNative) return
    try { const listed = await window.plnrlyNative.listCalendars(id); if (activeProfileId.current === id) setCalendarSources(listed); await refreshCalendars(id) }
    catch (error) { setMessage(error instanceof Error ? error.message : 'Could not load calendars.') }
    finally { if (activeProfileId.current === id) setCalendarsLoading(false) }
  }
  async function refreshCalendars(id = profile?.id) {
    if (!id || !window.plnrlyNative) return
    try {
      const payloads = await window.plnrlyNative.refreshCalendars(id)
      const previous = readCachedEvents(id)
      let next = previous.filter(event => payloads.some(item => item.id === event.feedId && !!item.error))
      for (const payload of payloads) if (payload.text) next = [...next, ...parseCalendar(payload)]
      const colors = new Map(payloads.map(item => [item.id, item.color]))
      next = next.map(event => ({ ...event, color: colors.get(event.feedId || '') || event.color }))
      localStorage.setItem(eventsKey(id), JSON.stringify(next))
      if (activeProfileId.current === id) setEvents(next)
      const errors = payloads.filter(item => item.error).map(item => `${item.name}: ${item.error}`)
      setMessage(errors.length ? errors.join(' · ') : `Refreshed ${payloads.length} calendar${payloads.length === 1 ? '' : 's'}.`)
      const listed = await window.plnrlyNative.listCalendars(id)
      if (activeProfileId.current === id) setCalendarSources(listed)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Calendar refresh failed.') }
  }
  async function addCalendar(kind: 'url' | 'file') {
    if (!profile?.folderPath || !window.plnrlyNative) { setMessage('Create or link a folder profile first.'); return }
    try {
      const name = calendarName.trim()
      if (!name) throw new Error('Enter a calendar name.')
      const updated = kind === 'url'
        ? await window.plnrlyNative.addCalendarUrl(profile.id, name, calendarProvider, calendarUrl.trim())
        : await window.plnrlyNative.addCalendarFile(profile.id, name, calendarProvider)
      if (!updated) return
      setCalendarSources(updated); setCalendarUrl(''); setCalendarName('')
      await refreshCalendars(profile.id)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not add calendar.') }
  }
  async function removeCalendar(id: string) {
    if (!window.plnrlyNative) return
    try {
      const updated = await window.plnrlyNative.removeCalendar(profile.id, id)
      setCalendarSources(updated)
      const next = events.filter(event => event.feedId !== id)
      setEvents(next); localStorage.setItem(eventsKey(profile.id), JSON.stringify(next))
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not remove calendar.') }
  }
  async function setCalendarColor(id: string, color: string) {
    if (!profile?.folderPath || !window.plnrlyNative) return
    try {
      const updated = await window.plnrlyNative.setCalendarColor(profile.id, id, color)
      if (activeProfileId.current === profile.id) setCalendarSources(updated)
      const next = readCachedEvents(profile.id).map(event => event.feedId === id ? { ...event, color } : event)
      localStorage.setItem(eventsKey(profile.id), JSON.stringify(next))
      if (activeProfileId.current === profile.id) setEvents(next)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not update calendar color.') }
  }
  async function renameCurrentProfile(event: React.FormEvent) {
    event.preventDefault()
    if (!profile?.folderPath || !window.plnrlyNative) return
    try {
      const renamed = await window.plnrlyNative.renameProfile(profile.id, profileNameInput)
      setProfiles(current => current.map(item => item.id === renamed.id ? { ...item, name: renamed.name } : item))
      setMessage(`Profile renamed to ${renamed.name}.`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not rename profile.') }
  }
  async function chooseFolder() {
    if (!window.plnrlyNative) return
    try {
      const chosen = await window.plnrlyNative.chooseFolder()
      if (!chosen) return
      const { created, migratedFrom, upgradedRecords, ...next } = chosen
      if (!profiles.length && legacyData && Object.values(legacyData).some(items => items.length)) {
        const merged = await syncFolderProfile(next, legacyData)
        saveData(next.id, merged)
      }
      setProfiles(current => [...current.filter(item => item.id !== next.id), next])
      setProfileId(next.id); setProfileMenu(false); setView('Today')
      setMessage(created ? `Folder ready at ${next.folderPath}` : migratedFrom ? `Upgraded this folder from schema v${migratedFrom} to v${next.schemaVersion} (${upgradedRecords || 0} records).` : `Opened ${next.folderPath}`)
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Could not set up the folder.') }
  }
  function switchProfile(id: string) { setProfileId(id); setProfileMenu(false); setView('Today'); setQuery(''); setProjectFilter('all'); setPersonFilter('all'); setPriorityFilter('all') }
  const title = view === 'Today' ? 'Today' : view
  const activeKind: EntityKind = view === 'Projects' ? 'projects' : view === 'People' ? 'people' : view === 'Notes' ? 'notes' : 'tasks'
  if (!profilesReady) return <div className="setup-screen"><div className="setup-card"><div className="brand"><span className="brand-mark"><i/><i/><i/><i/></span><span>Plnrly</span></div><h1>Opening Plnrly…</h1></div></div>
  if (!profile) return <div className="setup-screen"><div className="setup-card"><div className="brand"><span className="brand-mark"><i/><i/><i/><i/></span><span>Plnrly</span></div><div className="setup-icon"><Folder size={29}/></div><h1>Choose a folder to begin</h1><p>Select an empty folder to create a profile, or select a folder that already contains a Plnrly profile to import it. Its name can be changed later without moving the folder.</p>{message && <div className="setup-message" role="status">{message}</div>}<button className="primary-button" onClick={chooseFolder} disabled={!isNative()}><Folder size={18}/> Choose folder</button>{!isNative() && <small>Open the Mac app to choose a folder.</small>}</div></div>
  return <div className="app-shell">
    <aside className={`sidebar ${mobileMenu ? 'open' : ''}`}>
      <div className="brand"><span className="brand-mark"><i/><i/><i/><i/></span><span>Plnrly</span></div>
      <div className="profile-wrap"><button className="profile-button" onClick={() => setProfileMenu(!profileMenu)}><span className="profile-avatar">{initials(profile?.name || 'P')}</span><span>{profile?.name}</span><ChevronDown size={16}/></button>
        {profileMenu && <div className="profile-menu">{profiles.map(item => <button key={item.id} className={item.id === profile?.id ? 'selected' : ''} onClick={() => switchProfile(item.id)}><span className="profile-avatar small">{initials(item.name)}</span><span>{item.name}<small>{item.folderPath}</small></span>{item.id === profile?.id && <Check size={16}/>}</button>)}<button className="profile-add" onClick={chooseFolder}><Folder size={16}/> Add or import folder</button></div>}</div>
      <nav className="main-nav">{nav.map(item => <button key={item.label} className={view === item.label ? 'active' : ''} onClick={() => { setView(item.label); setMobileMenu(false) }}><item.icon size={19}/>{item.label}</button>)}</nav>
      <div className="side-bottom"><button className={view === 'Settings' ? 'active' : ''} onClick={() => { setView('Settings'); setMobileMenu(false) }}><Settings size={19}/>Settings</button><div className="sync-caption"><Folder size={15}/> {syncState === 'syncing' ? 'Syncing…' : syncState === 'error' ? 'Sync issue' : profile.lastSyncAt ? `Synced ${new Date(profile.lastSyncAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}` : 'Folder profile'}</div></div>
    </aside>
    <main className="main-content">
      <header className="topbar"><div className="topbar-title"><IconButton title="Open menu" onClick={() => setMobileMenu(true)}><Menu size={20}/></IconButton><h1>{title}</h1>{view === 'Today' && <span>{new Intl.DateTimeFormat(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }).format(new Date())}</span>}</div><div className="topbar-actions"><label className="global-search"><Search size={18}/><input aria-label="Search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Search tasks, projects, people..."/></label><button className="primary-button" onClick={() => setDraft({ kind: activeKind })}><Plus size={18}/> New {singular(activeKind)}</button></div></header>
      {message && <div className="notice" role="status"><span>{message}</span><button onClick={() => setMessage('')} aria-label="Dismiss"><X size={16}/></button></div>}
      {view === 'Today' && <><div className="overview-grid"><section className="panel priority-panel"><div className="panel-heading"><h2>Priority tasks</h2><button className="text-link" onClick={() => setView('Tasks')}>View all</button></div>{priorityTasks.length ? priorityTasks.map(task => <div className="priority-row" key={task.id}><button className="round-check" onClick={() => moveTask(task, 'Done')} aria-label={`Complete ${task.title}`}><Circle size={21}/></button><button className="priority-copy" onClick={() => setDraft({ kind: 'tasks', id: task.id })}><strong>{task.title}</strong><span>{task.projectIds.map(id => projectMap.get(id)?.name).filter(Boolean).join(', ') || 'No project'} <b>·</b> {relativeDue(task.dueDate) || 'No due date'}</span></button><span className={classForPriority(task.priority)}>{task.priority}</span></div>) : <div className="empty-small">No urgent tasks. Add one or set a due date.</div>}</section>
      <section className="panel agenda-panel"><div className="panel-heading"><h2>Today's agenda</h2><button className="text-link" onClick={() => setView('Calendar')}>View calendar</button></div>{todayEvents.length ? todayEvents.slice(0, 5).map(event => <AgendaRow key={event.id} event={event} onOpen={setSelectedEvent}/>) : <div className="empty-small">{calendarsLoading ? 'Loading calendars…' : calendarSources.length ? 'No events today.' : 'Add an ICS calendar in Settings to see your day.'}</div>}</section></div><TaskBoard tasks={filteredTasks} projects={projectMap} people={personMap} onOpen={id => setDraft({ kind: 'tasks', id })} onMove={moveTask} onNew={status => setDraft({ kind: 'tasks', id: `new:${status}` })} filters={<Filters projects={projects} people={people} projectFilter={projectFilter} personFilter={personFilter} priorityFilter={priorityFilter} setProjectFilter={setProjectFilter} setPersonFilter={setPersonFilter} setPriorityFilter={setPriorityFilter}/>} /></>}
      {view === 'Tasks' && <TaskBoard tasks={filteredTasks} projects={projectMap} people={personMap} onOpen={id => setDraft({ kind: 'tasks', id })} onMove={moveTask} onNew={status => setDraft({ kind: 'tasks', id: `new:${status}` })} filters={<Filters projects={projects} people={people} projectFilter={projectFilter} personFilter={personFilter} priorityFilter={priorityFilter} setProjectFilter={setProjectFilter} setPersonFilter={setPersonFilter} setPriorityFilter={setPriorityFilter}/>} />}
      {view === 'Projects' && <Collection title="Projects" subtitle="Keep related work together. A task can belong to more than one project." items={projects.filter(item => item.name.toLowerCase().includes(query.toLowerCase()))} render={item => <><span className="collection-color" style={{ background: item.color }}/><div><strong>{item.name}</strong><small>{item.description || 'No description'}</small></div><span className="collection-count">{tasks.filter(task => task.projectIds.includes(item.id)).length} tasks</span></>} onOpen={id => setDraft({ kind: 'projects', id })} onNew={() => setDraft({ kind: 'projects' })}/>}
      {view === 'People' && <Collection title="People" subtitle="Connect people to tasks and notes across projects." items={people.filter(item => `${item.name} ${item.email}`.toLowerCase().includes(query.toLowerCase()))} render={item => <><span className="person-avatar">{initials(item.name)}</span><div><strong>{item.name}</strong><small>{item.role || item.email || 'No details'}</small></div><span className="collection-count">{tasks.filter(task => task.personIds.includes(item.id)).length} tasks</span></>} onOpen={id => setDraft({ kind: 'people', id })} onNew={() => setDraft({ kind: 'people' })}/>}
      {view === 'Notes' && <Collection title="Notes" subtitle="Notes can link to tasks, projects and people." items={notes.filter(item => `${item.title} ${item.body}`.toLowerCase().includes(query.toLowerCase()))} render={item => <><span className="note-icon"><NotebookText size={20}/></span><div><strong>{item.title}</strong><small>{item.body.slice(0, 100) || 'Empty note'}</small></div><span className="collection-count">{formatDate(item.updatedAt.slice(0,10))}</span></>} onOpen={id => setDraft({ kind: 'notes', id })} onNew={() => setDraft({ kind: 'notes' })}/>}
      {view === 'Calendar' && <CalendarView events={sortedEvents} sources={calendarSources} onOpen={setSelectedEvent} onRefresh={() => void refreshCalendars()} onSettings={() => setView('Settings')}/>}
      {view === 'Settings' && <section className="settings-page"><div className="section-top"><div><h2>Connections & storage</h2><p>Choose any local or synced folder for each profile. Calendar feeds are read only.</p></div></div>
        <div className="setting-panel"><div><h3>Current profile · schema v{profile.schemaVersion}</h3><p>Give this profile any display name. Its folder stays at the same path and holds all planning records.</p></div><form className="profile-name-form" onSubmit={event => void renameCurrentProfile(event)}><label>Profile name<input value={profileNameInput} maxLength={80} onChange={event => setProfileNameInput(event.target.value)} placeholder="Profile name"/></label><button className="secondary-button" type="submit" disabled={!profileNameInput.trim() || profileNameInput.trim() === profile.name}>Save name</button></form><div className="folder-link"><code>{profile.folderPath}</code></div><div className="setting-actions"><button className="secondary-button" onClick={chooseFolder}>Add or import a profile folder</button></div></div>
        <div className="setting-panel"><div><h3>ICS calendars</h3><p>Add a published HTTPS iCal link from Google or Outlook, or choose a local .ics file. Give each calendar its own color. Links and colors stay in this Mac app, outside the profile folder.</p></div><div className="calendar-form"><label>Calendar name<input value={calendarName} onChange={event => setCalendarName(event.target.value)} placeholder="Work calendar"/></label><label>Source<select value={calendarProvider} onChange={event => setCalendarProvider(event.target.value as CalendarSource['provider'])}><option>ICS</option><option>Google</option><option>Outlook</option></select></label><label>ICS subscription URL<input value={calendarUrl} onChange={event => setCalendarUrl(event.target.value)} placeholder="https://…/calendar.ics" type="url"/></label></div><div className="setting-actions"><button className="secondary-button" onClick={() => void addCalendar('url')} disabled={!profile.folderPath}>Add URL</button><button className="secondary-button" onClick={() => void addCalendar('file')} disabled={!profile.folderPath}>Choose .ics file</button><button className="secondary-button" onClick={() => void refreshCalendars()} disabled={!profile.folderPath}>Refresh all</button></div>{calendarSources.length > 0 && <div className="calendar-source-list">{calendarSources.map(source => <div className="calendar-source" key={source.id}><span><strong>{source.name}</strong><small>{source.provider} · {source.kind === 'url' ? 'Subscription URL' : 'Local file'}{source.updatedAt ? ` · Updated ${new Date(source.updatedAt).toLocaleString()}` : ''}</small></span><div className="calendar-source-actions"><label className="calendar-color-label" title={`Color for ${source.name}`}><span>Color</span><input type="color" aria-label={`Color for ${source.name}`} value={source.color} onChange={event => void setCalendarColor(source.id, event.target.value)}/></label><button className="secondary-button" onClick={() => void removeCalendar(source.id)}>Remove</button></div></div>)}</div>}</div>
      </section>}
    </main>
    {mobileMenu && <button className="mobile-shade" aria-label="Close menu" onClick={() => setMobileMenu(false)}/>}
    {draft && <Editor draft={draft} data={data} onClose={() => setDraft(null)} onSave={(kind, record) => { mutate(kind, record as never); setDraft(null) }} onRemove={remove}/>}
    {selectedEvent && <EventDetails event={selectedEvent} onClose={() => setSelectedEvent(null)}/>}
  </div>
}
function Filters({ projects, people, projectFilter, personFilter, priorityFilter, setProjectFilter, setPersonFilter, setPriorityFilter }: { projects: Project[]; people: Person[]; projectFilter: string; personFilter: string; priorityFilter: string; setProjectFilter: (value: string) => void; setPersonFilter: (value: string) => void; setPriorityFilter: (value: string) => void }) { return <div className="filters"><SlidersHorizontal size={18}/><select aria-label="Filter by project" value={projectFilter} onChange={event => setProjectFilter(event.target.value)}><option value="all">All projects</option>{projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Filter by person" value={personFilter} onChange={event => setPersonFilter(event.target.value)}><option value="all">All people</option>{people.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select><select aria-label="Filter by priority" value={priorityFilter} onChange={event => setPriorityFilter(event.target.value)}><option value="all">All priorities</option>{priorities.map(item => <option key={item} value={item}>{item}</option>)}</select></div> }
function TaskBoard({ tasks, projects, people, filters, onOpen, onMove, onNew }: { tasks: Task[]; projects: Map<string, Project>; people: Map<string, Person>; filters: React.ReactNode; onOpen: (id: string) => void; onMove: (task: Task, status: Status) => void; onNew: (status: Status) => void }) {
  const [dragging, setDragging] = useState('')
  return <section className="board-section"><div className="board-top"><div><h2>Tasks</h2><span className="board-subtitle">Move work through your day</span></div>{filters}</div><div className="kanban">{statuses.map(status => { const column = tasks.filter(task => task.status === status); return <div key={status} className={`kanban-column ${dragging ? 'drag-active' : ''}`} onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); const task = tasks.find(item => item.id === event.dataTransfer.getData('text/plain')); if (task) onMove(task, status); setDragging('') }}><div className="column-heading"><h3>{status}<span>{column.length}</span></h3><IconButton title={`Add task to ${status}`} onClick={() => onNew(status)}><Plus size={17}/></IconButton></div><div className="column-items">{column.map(task => <article className={`task-card ${status === 'Done' ? 'completed' : ''}`} key={task.id} draggable onDragStart={event => { event.dataTransfer.setData('text/plain', task.id); setDragging(task.id) }} onDragEnd={() => setDragging('')}><button className="card-check" onClick={() => onMove(task, task.status === 'Done' ? 'Next' : 'Done')} aria-label={task.status === 'Done' ? 'Reopen task' : 'Complete task'}>{task.status === 'Done' ? <CheckCircle2 size={19}/> : <Circle size={19}/>}</button><button className="card-main" onClick={() => onOpen(task.id)}><strong>{task.title}</strong><span>{task.projectIds.map(id => projects.get(id)?.name).filter(Boolean).join(', ') || 'No project'}{task.dueDate && <> <b>·</b> {relativeDue(task.dueDate)}</>}</span><span className="card-bottom"><span className={classForPriority(task.priority)}>{task.priority}</span><span className="avatar-stack">{task.personIds.slice(0, 3).map(id => people.get(id)).filter((item): item is Person => !!item).map(item => <span key={item.id} className="mini-avatar" title={item.name}>{initials(item.name)}</span>)}</span></span></button></article>)}{!column.length && <button className="empty-column" onClick={() => onNew(status)}>+ Add a task</button>}</div></div> })}</div></section>
}
function Collection<T extends { id: string }>({ title, subtitle, items, render, onOpen, onNew }: { title: string; subtitle: string; items: T[]; render: (item: T) => React.ReactNode; onOpen: (id: string) => void; onNew: () => void }) { return <section className="panel collection"><div className="section-top"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="secondary-button" onClick={onNew}><Plus size={17}/> Add {(title === 'People' ? 'person' : title.slice(0, -1).toLowerCase())}</button></div>{items.length ? <div className="collection-list">{items.map(item => <button key={item.id} className="collection-row" onClick={() => onOpen(item.id)}>{render(item)}<ChevronRight size={18}/></button>)}</div> : <div className="empty-collection"><LayoutGrid size={28}/><strong>Nothing here yet</strong><span>Add your first {(title === 'People' ? 'person' : title.slice(0, -1).toLowerCase())} to get started.</span><button className="primary-button" onClick={onNew}><Plus size={17}/> Add {(title === 'People' ? 'person' : title.slice(0, -1).toLowerCase())}</button></div>}</section> }
function MultiSelect({ label, options, value, onChange }: { label: string; options: { id: string; name: string }[]; value: string[]; onChange: (ids: string[]) => void }) { return <fieldset className="multi-select"><legend>{label}</legend>{options.length ? <div>{options.map(option => <label key={option.id}><input type="checkbox" checked={value.includes(option.id)} onChange={event => onChange(event.target.checked ? [...value, option.id] : value.filter(id => id !== option.id))}/>{option.name}</label>)}</div> : <small>No {label.toLowerCase()} yet.</small>}</fieldset> }
function Editor({ draft, data, onClose, onSave, onRemove }: { draft: Draft; data: Data; onClose: () => void; onSave: (kind: EntityKind, record: Task | Project | Person | Note) => void; onRemove: (kind: EntityKind, id: string) => void }) {
  const existing = draft.id?.startsWith('new:') ? undefined : (data[draft.kind] as Array<Task | Project | Person | Note>).find(item => item.id === draft.id)
  const [form, setForm] = useState<Task | Project | Person | Note>(() => {
    if (existing) return { ...existing }
    const base = newBase()
    if (draft.kind === 'tasks') return { ...base, title: '', description: '', status: draft.id?.startsWith('new:') ? draft.id.slice(4) as Status : 'Backlog', priority: 'Medium', dueDate: '', projectIds: [], personIds: [], noteIds: [] }
    if (draft.kind === 'projects') return { ...base, name: '', description: '', color: '#4a5ed5', archived: false }
    if (draft.kind === 'people') return { ...base, name: '', email: '', role: '', notes: '' }
    return { ...base, title: '', body: '', projectIds: [], taskIds: [], personIds: [] }
  })
  function update(patch: Record<string, unknown>) { setForm(current => ({ ...current, ...patch })) }
  const isTask = draft.kind === 'tasks', isProject = draft.kind === 'projects', isPerson = draft.kind === 'people', isNote = draft.kind === 'notes'
  const heading = existing ? `Edit ${singular(draft.kind)}` : `New ${singular(draft.kind)}`
  const requiredName = isProject || isPerson ? (form as Project | Person).name : (form as Task | Note).title
  function submit(event: React.FormEvent) { event.preventDefault(); if (!requiredName.trim()) return; onSave(draft.kind, { ...form, updatedAt: stamp() }) }
  return <div className="modal-backdrop" onMouseDown={onClose}><form className="modal editor-modal" onSubmit={submit} onMouseDown={event => event.stopPropagation()}><div className="modal-head"><h2>{heading}</h2><IconButton title="Close" onClick={onClose}><X size={20}/></IconButton></div><div className="modal-body">
    {(isTask || isNote) && <label>Title<input autoFocus required value={(form as Task | Note).title} onChange={event => update({ title: event.target.value })} placeholder={isTask ? 'What needs doing?' : 'Note title'}/></label>}
    {(isProject || isPerson) && <label>Name<input autoFocus required value={(form as Project | Person).name} onChange={event => update({ name: event.target.value })} placeholder={isProject ? 'Project name' : 'Person name'}/></label>}
    {(isTask || isProject) && <label>Description<textarea rows={3} value={(form as Task | Project).description} onChange={event => update({ description: event.target.value })} placeholder="Add details..."/></label>}
    {isTask && <><div className="form-row"><label>Status<select value={(form as Task).status} onChange={event => update({ status: event.target.value })}>{statuses.map(status => <option key={status}>{status}</option>)}</select></label><label>Priority<select value={(form as Task).priority} onChange={event => update({ priority: event.target.value })}>{priorities.map(priority => <option key={priority}>{priority}</option>)}</select></label></div><label>Due date<input type="date" value={(form as Task).dueDate} onChange={event => update({ dueDate: event.target.value })}/></label><MultiSelect label="Projects" options={visible(data.projects)} value={(form as Task).projectIds} onChange={projectIds => update({ projectIds })}/><MultiSelect label="People" options={visible(data.people)} value={(form as Task).personIds} onChange={personIds => update({ personIds })}/><MultiSelect label="Notes" options={visible(data.notes).map(item => ({ id: item.id, name: item.title }))} value={(form as Task).noteIds} onChange={noteIds => update({ noteIds })}/></>}
    {isProject && <><label>Color<input type="color" value={(form as Project).color} onChange={event => update({ color: event.target.value })}/></label><label className="checkbox-label"><input type="checkbox" checked={(form as Project).archived} onChange={event => update({ archived: event.target.checked })}/> Archived</label></>}
    {isPerson && <><label>Email<input type="email" value={(form as Person).email} onChange={event => update({ email: event.target.value })} placeholder="name@example.com"/></label><label>Role<input value={(form as Person).role} onChange={event => update({ role: event.target.value })} placeholder="Role or relationship"/></label><label>Notes<textarea rows={4} value={(form as Person).notes} onChange={event => update({ notes: event.target.value })}/></label></>}
    {isNote && <><label>Body<textarea rows={8} value={(form as Note).body} onChange={event => update({ body: event.target.value })} placeholder="Write anything... Markdown is welcome."/></label><MultiSelect label="Projects" options={visible(data.projects)} value={(form as Note).projectIds} onChange={projectIds => update({ projectIds })}/><MultiSelect label="Tasks" options={visible(data.tasks).map(item => ({ id: item.id, name: item.title }))} value={(form as Note).taskIds} onChange={taskIds => update({ taskIds })}/><MultiSelect label="People" options={visible(data.people)} value={(form as Note).personIds} onChange={personIds => update({ personIds })}/></>}
  </div><div className="modal-actions">{existing && <button className="danger-button" type="button" onClick={() => onRemove(draft.kind, existing.id)}>Archive</button>}<span/><button className="secondary-button" type="button" onClick={onClose}>Cancel</button><button className="primary-button" type="submit">Save</button></div></form></div>
}
