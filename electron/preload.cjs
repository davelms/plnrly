const { contextBridge, ipcRenderer } = require('electron')
contextBridge.exposeInMainWorld('plnrlyNative', {
  knownProfiles: () => ipcRenderer.invoke('folder:known'),
  chooseFolder: () => ipcRenderer.invoke('folder:choose'),
  readProfile: id => ipcRenderer.invoke('folder:read', id),
  writeRecord: (id, kind, recordId, content) => ipcRenderer.invoke('folder:write', id, kind, recordId, content),
  renameProfile: (id, name) => ipcRenderer.invoke('folder:rename', id, name),
  listCalendars: profileId => ipcRenderer.invoke('calendar:list', profileId),
  addCalendarUrl: (profileId, name, provider, url) => ipcRenderer.invoke('calendar:add-url', profileId, name, provider, url),
  addCalendarFile: (profileId, name, provider) => ipcRenderer.invoke('calendar:add-file', profileId, name, provider),
  removeCalendar: (profileId, id) => ipcRenderer.invoke('calendar:remove', profileId, id),
  setCalendarColor: (profileId, id, color) => ipcRenderer.invoke('calendar:set-color', profileId, id, color),
  refreshCalendars: profileId => ipcRenderer.invoke('calendar:refresh', profileId)
})
