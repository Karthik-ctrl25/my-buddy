const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  onCmd: cb => ipcRenderer.on('cmd', (e, name, arg) => cb(name, arg)),
  clickThrough: on => ipcRenderer.send('click-through', on)
});