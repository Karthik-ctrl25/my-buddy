const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onCmd: cb => ipcRenderer.on('cmd', (e, name, arg) => cb(name, arg)),
  clickThrough: on => ipcRenderer.send('click-through', on),
  getStats: () => ipcRenderer.invoke('stats'),                 // CPU / RAM from main.js
  streakCheck: () => ipcRenderer.invoke('streak-check'),       // ask main.js to check GitHub now
  streakSkip: () => ipcRenderer.send('streak-skip')            // "Skip today"
});