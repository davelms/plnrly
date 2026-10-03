const { app, BrowserWindow, ipcMain, protocol, net, shell, dialog, safeStorage } = require('electron')
const { join, normalize } = require('node:path')
const { pathToFileURL } = require('node:url')
const { randomUUID } = require('node:crypto')
const { existsSync } = require('node:fs')
const { readFile, writeFile, rename, mkdir, stat } = require('node:fs/promises')
const folderStore = require('./folder-store.cjs')
const { ensureColors, nextColor, validColor } = require('./calendar-colors.cjs')

app.setName('Plnrly')
app.setPath('userData', join(app.getPath('appData'), 'plnrly'))

protocol.registerSchemesAsPrivileged([{ scheme: 'plnrly', privileges: { standard: true, secure: true, supportFetchAPI: true, corsEnabled: true } }])
const devUrl = process.env.PLNRLY_DEV_URL
const folders = new Map()
let sources = []
let mainWindow
function userFile(name) { return join(app.getPath('userData'), name) }
async function atomicWrite(file, content) {
  await mkdir(app.getPath('userData'), { recursive: true })
  const temp = `${file}.${randomUUID()}.tmp`
  await writeFile(temp, content, { mode: 0o600 })
  await rename(temp, file)
}
async function loadState() {
  try {
    const entries = JSON.parse(await readFile(userFile('profile-paths.json'), 'utf8'))
    for (const entry of entries) if (typeof entry.id === 'string' && typeof entry.folderPath === 'string') folders.set(entry.id, entry.folderPath)
  } catch { /* No previously chosen folders. */ }
  try {
    if (!await safeStorage.isAsyncEncryptionAvailable()) return
    const encrypted = await readFile(userFile('calendar-sources.bin'))
    const decoded = await safeStorage.decryptStringAsync(encrypted)
    const stored = JSON.parse(decoded.result)
    if (Array.isArray(stored)) sources = ensureColors(stored.filter(item => item && typeof item.id === 'string' && typeof item.profileId === 'string'))
    if (decoded.shouldReEncrypt || sources.some((source, index) => source.color !== stored[index]?.color)) await saveSources()
  } catch { /* A missing or unreadable Keychain entry requires adding feeds again. */ }
}
async function saveFolders() { await atomicWrite(userFile('profile-paths.json'), JSON.stringify([...folders].map(([id, folderPath]) => ({ id, folderPath })), null, 2)) }
async function saveSources() {
  if (!await safeStorage.isAsyncEncryptionAvailable()) throw new Error('macOS Keychain is unavailable, so private calendar links cannot be saved.')
  const encrypted = await safeStorage.encryptStringAsync(JSON.stringify(sources))
  await atomicWrite(userFile('calendar-sources.bin'), encrypted)
}
function checkSender(event) { if (event.sender !== mainWindow?.webContents) throw new Error('Invalid sender') }
function folderFor(id) { const folder = folders.get(id); if (!folder) throw new Error('Choose this profile folder again in Plnrly.'); return folder }
function publicSources(profileId) { return sources.filter(item => item.profileId === profileId).map(({ id, name, provider, kind, updatedAt, color }) => ({ id, name, provider, kind, updatedAt, color })) }
function safeCalendarUrl(raw) {
  let url
  try { url = new URL(String(raw).replace(/^webcal:\/\//i, 'https://')) } catch { throw new Error('Enter a valid HTTPS calendar link.') }
  if (url.protocol !== 'https:') throw new Error('Calendar subscriptions need an HTTPS link.')
  return url.toString()
}
async function fetchCalendar(url) {
  let current = safeCalendarUrl(url)
  for (let redirects = 0; redirects < 5; redirects++) {
    const response = await fetch(current, { redirect: 'manual', signal: AbortSignal.timeout(20000), headers: { Accept: 'text/calendar, text/plain;q=0.8' } })
    if (response.status >= 300 && response.status < 400) { current = safeCalendarUrl(new URL(response.headers.get('location') || '', current).toString()); continue }
    if (!response.ok) throw new Error(`Calendar feed returned HTTP ${response.status}.`)
    if (Number(response.headers.get('content-length') || 0) > 10_000_000) throw new Error('Calendar feed exceeds 10 MB.')
    const chunks = []
    let size = 0
    for await (const chunk of response.body) {
      size += chunk.length
      if (size > 10_000_000) throw new Error('Calendar feed exceeds 10 MB.')
      chunks.push(chunk)
    }
    const text = Buffer.concat(chunks).toString('utf8')
    if (!text.includes('BEGIN:VCALENDAR')) throw new Error('This link did not return an ICS calendar.')
    return text
  }
  throw new Error('Calendar feed redirected too many times.')
}
async function readCalendarSource(source) {
  if (source.kind === 'url') return fetchCalendar(source.value)
  const info = await stat(source.value)
  if (info.size > 10_000_000) throw new Error('Calendar file exceeds 10 MB.')
  const text = await readFile(source.value, 'utf8')
  if (!text.includes('BEGIN:VCALENDAR')) throw new Error('The selected file is not an ICS calendar.')
  return text
}
function createWindow() {
  mainWindow = new BrowserWindow({ width: 1440, height: 900, minWidth: 850, minHeight: 620, title: 'Plnrly', backgroundColor: '#f8f9fc', show: false, webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true, webSecurity: true } })
  mainWindow.once('ready-to-show', () => mainWindow.show())
  mainWindow.webContents.setWindowOpenHandler(({ url }) => { if (url.startsWith('https://')) shell.openExternal(url); return { action: 'deny' } })
  mainWindow.webContents.on('will-navigate', (event, url) => { if (!url.startsWith('plnrly://app/') && (!devUrl || !url.startsWith(devUrl))) event.preventDefault() })
  if (devUrl) mainWindow.loadURL(devUrl); else mainWindow.loadURL('plnrly://app/')
}
app.whenReady().then(async () => {
  await loadState()
  if (!devUrl) protocol.handle('plnrly', request => {
    const url = new URL(request.url)
    const relative = url.pathname === '/' ? 'index.html' : decodeURIComponent(url.pathname).replace(/^\/+/, '')
    const clean = normalize(relative)
    if (clean.startsWith('..') || clean.includes('/../')) return new Response('Not found', { status: 404 })
    const file = join(__dirname, '..', 'dist', clean)
    return existsSync(file) ? net.fetch(pathToFileURL(file).toString()) : new Response('Not found', { status: 404 })
  })
  createWindow()
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
})
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit() })
ipcMain.handle('folder:known', async event => {
  checkSender(event)
  const profiles = []
  const errors = []
  const schema = await readFile(join(__dirname, '..', 'docs', 'SCHEMA.md'), 'utf8')
  for (const path of folders.values()) {
    try { profiles.push(await folderStore.migrateProfile(path, schema)) }
    catch (error) { errors.push(`${path}: ${error instanceof Error ? error.message : 'Could not open folder.'}`) }
  }
  return { profiles, errors }
})
ipcMain.handle('folder:choose', async event => {
  checkSender(event)
  const selection = await dialog.showOpenDialog(mainWindow, { title: 'Choose a Plnrly folder', properties: ['openDirectory', 'createDirectory'] })
  if (selection.canceled || !selection.filePaths[0]) return null
  const path = selection.filePaths[0]
  const created = !existsSync(join(path, 'manifest.json'))
  const schema = await readFile(join(__dirname, '..', 'docs', 'SCHEMA.md'), 'utf8')
  const profile = created ? await folderStore.initializeProfile(path, schema) : await folderStore.migrateProfile(path, schema)
  folders.set(profile.id, profile.folderPath); await saveFolders()
  return { ...profile, created }
})
ipcMain.handle('folder:read', async (event, id) => { checkSender(event); return folderStore.readRecords(folderFor(id)) })
ipcMain.handle('folder:write', async (event, id, kind, recordId, content) => { checkSender(event); await folderStore.writeRecord(folderFor(id), kind, recordId, content); return true })
ipcMain.handle('folder:rename', async (event, id, name) => { checkSender(event); return folderStore.renameProfile(folderFor(id), id, name) })
ipcMain.handle('calendar:list', (event, profileId) => { checkSender(event); return publicSources(profileId) })
ipcMain.handle('calendar:add-url', async (event, profileId, name, provider, rawUrl) => {
  checkSender(event); folderFor(profileId)
  const value = safeCalendarUrl(rawUrl)
  if (!name?.trim() || !['Google', 'Outlook', 'ICS'].includes(provider)) throw new Error('Enter a calendar name and source.')
  const source = { id: randomUUID(), profileId, name: name.trim(), provider, kind: 'url', value, updatedAt: '', color: nextColor(sources, profileId) }
  sources.push(source); await saveSources(); return publicSources(profileId)
})
ipcMain.handle('calendar:add-file', async (event, profileId, name, provider) => {
  checkSender(event); folderFor(profileId)
  if (!name?.trim() || !['Google', 'Outlook', 'ICS'].includes(provider)) throw new Error('Enter a calendar name and source.')
  const selection = await dialog.showOpenDialog(mainWindow, { title: 'Choose an ICS calendar file', properties: ['openFile'], filters: [{ name: 'iCalendar', extensions: ['ics', 'ical'] }] })
  if (selection.canceled || !selection.filePaths[0]) return null
  const source = { id: randomUUID(), profileId, name: name.trim(), provider, kind: 'file', value: selection.filePaths[0], updatedAt: '', color: nextColor(sources, profileId) }
  await readCalendarSource(source)
  sources.push(source); await saveSources(); return publicSources(profileId)
})
ipcMain.handle('calendar:remove', async (event, profileId, id) => { checkSender(event); sources = sources.filter(item => !(item.profileId === profileId && item.id === id)); await saveSources(); return publicSources(profileId) })
ipcMain.handle('calendar:set-color', async (event, profileId, id, color) => {
  checkSender(event); folderFor(profileId)
  if (!validColor(color)) throw new Error('Choose a valid calendar color.')
  const source = sources.find(item => item.profileId === profileId && item.id === id)
  if (!source) throw new Error('Calendar not found in this profile.')
  source.color = color.toUpperCase()
  await saveSources()
  return publicSources(profileId)
})
ipcMain.handle('calendar:refresh', async (event, profileId) => {
  checkSender(event)
  const result = []
  for (const source of sources.filter(item => item.profileId === profileId)) {
    try { const text = await readCalendarSource(source); source.updatedAt = new Date().toISOString(); result.push({ id: source.id, name: source.name, provider: source.provider, color: source.color, text }) }
    catch (error) { result.push({ id: source.id, name: source.name, provider: source.provider, color: source.color, error: error instanceof Error ? error.message : 'Could not refresh calendar.' }) }
  }
  if (result.some(item => item.text)) await saveSources()
  return result
})
