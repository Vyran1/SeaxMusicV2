// Preload for update modal: exposes safe IPC for update info and install
const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('updateAPI', {
  onInfo: (callback) => {
    ipcRenderer.on('update-info', (event, info) => {
      callback(info);
    });
  },
  install: () => {
    ipcRenderer.send('update-install');
  }
});
