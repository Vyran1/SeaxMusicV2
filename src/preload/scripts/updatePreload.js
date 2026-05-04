const { contextBridge, ipcRenderer } = require('electron');

let pendingInfo = null;
let pendingDevMode = null;
let pendingTheme = null;
let onInfoCallback = null;
let onDevModeCallback = null;
let onThemeCallback = null;

ipcRenderer.on('update-info', (event, info) => {
  if (onInfoCallback) {
    onInfoCallback(info);
  } else {
    pendingInfo = info;
  }
});

ipcRenderer.on('update-dev-mode', (event, data) => {
  if (onDevModeCallback) {
    onDevModeCallback(data);
  } else {
    pendingDevMode = data;
  }
});

ipcRenderer.on('update-theme', (event, themeData) => {
  if (onThemeCallback) {
    onThemeCallback(themeData);
  } else {
    pendingTheme = themeData;
  }
});

contextBridge.exposeInMainWorld('updateAPI', {
  onInfo: (callback) => {
    onInfoCallback = callback;
    if (pendingInfo !== null) {
      callback(pendingInfo);
      pendingInfo = null;
    }
  },
  onDevMode: (callback) => {
    onDevModeCallback = callback;
    if (pendingDevMode !== null) {
      callback(pendingDevMode);
      pendingDevMode = null;
    }
  },
  onTheme: (callback) => {
    onThemeCallback = callback;
    if (pendingTheme !== null) {
      callback(pendingTheme);
      pendingTheme = null;
    }
  },
  install: () => {
    ipcRenderer.send('update-install');
  },
  later: () => {
    ipcRenderer.send('update-later');
  }
});
