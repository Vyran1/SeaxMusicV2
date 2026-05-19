const { ipcMain, app } = require('electron');
const state = require('../state');

// ===== Always on Top (PiP) =====
ipcMain.handle('set-always-on-top', (event, { enabled }) => {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    try {
      state.mainWindow.setAlwaysOnTop(!!enabled, 'screen-saver');
    } catch (e) { }
  }
  return { success: true, enabled: !!enabled };
});

// ===== IPC HANDLERS DE AUTO-UPDATER =====
ipcMain.handle('check-for-updates', async () => {
  if (state.appUpdater) {
    try {
      const result = await state.appUpdater.checkForUpdates();
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'Updater not initialized' };
});

ipcMain.handle('quit-and-install', async () => {
  if (state.appUpdater) {
    state.appUpdater.quitAndInstall();
    return { success: true };
  }
  return { success: false, error: 'Updater not initialized' };
});

ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});
