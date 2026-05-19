const { app, BrowserWindow } = require('electron');
const path = require('path');
const state = require('../state');

function createMainWindow() {
  state.mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#121212',
    icon: path.join(__dirname, '../../renderer/assets/icons/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../../preload/preload.js'),
      backgroundThrottling: false
    },
    autoHideMenuBar: true
  });

  state.mainWindow.loadFile(path.join(__dirname, '../../renderer/index.html'));

  // Open DevTools in development mode only
  if (process.argv.includes('--dev')) {
    state.mainWindow.webContents.openDevTools();
  }

  state.mainWindow.on('closed', () => {
    state.mainWindow = null;

    const isDevMode = process.argv.includes('--dev');

    if (isDevMode) {
      // ⭐ DEV MODE: Mantener ventanas abiertas para debug
      console.log('[DEV] Ventana principal cerrada - YouTube y Login permanecen abiertas para debug');
      // No cerrar youtubeWindow ni loginWindow
    } else {
      // ⭐ PROD MODE: Cerrar todo al cerrar main
      if (state.youtubeWindow && !state.youtubeWindow.isDestroyed()) {
        state.youtubeWindow.close();
        state.youtubeWindow = null;
      }
      if (state.djWindow && !state.djWindow.isDestroyed()) {
        state.djWindow.close();
        state.djWindow = null;
      }
      if (state.loginWindow && !state.loginWindow.isDestroyed()) {
        state.loginWindow.close();
        state.loginWindow = null;
      }
      state.backendWindows.forEach(win => {
        if (win && !win.isDestroyed()) {
          win.close();
        }
      });
      state.backendWindows = [];
      app.quit();
    }
  });
}

module.exports = { createMainWindow };
