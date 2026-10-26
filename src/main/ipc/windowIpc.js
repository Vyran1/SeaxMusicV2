// Controles de la barra de título propia (la ventana principal no tiene marco nativo)
const { ipcMain, BrowserWindow } = require('electron');

function windowFrom(event) {
  const win = BrowserWindow.fromWebContents(event.sender);
  return win && !win.isDestroyed() ? win : null;
}

ipcMain.handle('window-minimize', (event) => {
  windowFrom(event)?.minimize();
});

ipcMain.handle('window-toggle-maximize', (event) => {
  const win = windowFrom(event);
  if (!win) return false;
  if (win.isMaximized()) win.unmaximize();
  else win.maximize();
  return win.isMaximized();
});

ipcMain.handle('window-is-maximized', (event) => {
  return !!windowFrom(event)?.isMaximized();
});

ipcMain.handle('window-close', (event) => {
  windowFrom(event)?.close();
});
