const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('pipAPI', {
  onVideoInfo: (callback) => {
    ipcRenderer.on('update-video-info', (event, info) => callback(info));
  },
  onAudioTimeUpdate: (callback) => {
    ipcRenderer.on('audio-time-update', (event, timeInfo) => callback(timeInfo));
  },
  onPlaybackState: (callback) => {
    ipcRenderer.on('video-playing', () => callback(true));
    ipcRenderer.on('video-paused', () => callback(false));
  },
  sendControl: (action, value) => {
    ipcRenderer.send('pip-control', { action, value });
  },
  onDockState: (callback) => {
    ipcRenderer.on('pip-dock-state', (event, dockInfo) => callback(dockInfo));
  },
  onAccentColor: (callback) => {
    ipcRenderer.on('pip-accent-color', (event, rgb) => callback(rgb));
  },
  sendHover: (isHovering) => {
    ipcRenderer.send('pip-hover-update', isHovering);
  },
  close: () => ipcRenderer.invoke('pip-close')
});
