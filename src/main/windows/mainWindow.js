const logger = require('../utils/logger');
const { app, BrowserWindow } = require('electron');
const path = require('path');
const state = require('../state');

function createMainWindow() {
  state.mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#0d0d0f',
    // Sin marco nativo: la app dibuja su propia barra de título (renderer/index.html).
    // thickFrame mantiene el borde para redimensionar en Windows.
    frame: false,
    thickFrame: true,
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

  // Avisar al reproductor cuando la ventana principal se ve o deja de verse
  // (el visualizador y la vista previa solo trabajan con la ventana visible)
  const broadcastVisibility = () => {
    const win = state.mainWindow;
    const visible = !!(win && !win.isDestroyed() && win.isVisible() && !win.isMinimized());
    const yt = state.getActiveYouTubeWindow();
    if (yt && !yt.webContents.isDestroyed()) {
      yt.webContents.send('app-visibility', visible);
    }
  };
  ['show', 'hide', 'minimize', 'restore'].forEach((evt) => {
    state.mainWindow.on(evt, broadcastVisibility);
  });

  state.mainWindow.on('closed', () => {
    state.mainWindow = null;

    const isDevMode = process.argv.includes('--dev');

    if (isDevMode) {
      // ⭐ DEV MODE: Mantener ventanas abiertas para debug
      logger.debug('[DEV] Ventana principal cerrada - YouTube y Login permanecen abiertas para debug');
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
