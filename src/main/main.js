const { app, BrowserWindow, ipcMain, session, powerSaveBlocker } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const discordRPC = require('./discordRPC');
const AppUpdater = require('./autoUpdater');

// Evitar throttling en segundo plano (audio estable)
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

// Forzar cache local dentro de userData para evitar errores de permisos en Windows
const cachePath = path.join(app.getPath('userData'), 'Cache');
app.setPath('cache', cachePath);

// ⭐ Auto-updater instance
// ⭐ Auto-updater instance
// Recibir volumen real del backend y reenviar al renderer (debe ir después de la inicialización de mainWindow)
ipcMain.on('video-volume-updated', (event, realVolume) => {
  if (!isEventFromActiveYouTube(event)) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('video-volume-updated', realVolume);
  }
  if (typeof realVolume === 'number') {
    currentAppVolume = realVolume;
  }
});
let appUpdater = null;
let powerSaveBlockerId = null;

/**
 * ARQUITECTURA DE SEAXMUSIC:
 * 
 * 1. VENTANA PRINCIPAL (mainWindow) - 1400x900
 *    - Interfaz de usuario de SeaxMusic
 *    - Controles de reproducción (UI visual)
 *    - Búsqueda de música
 *    - Gestión de usuario
 * 
 * 2. VENTANA BACKEND (backendWindow) - 1280x720
 *    - YouTube abierto normalmente en un navegador Electron
 *    - El usuario interactúa directamente con YouTube
 *    - Búsqueda, reproducción y controles como YouTube normal
 * 
 * 3. VENTANA DE LOGIN (loginWindow) - 480x640
 *    - Autenticación de usuario (modal)
 *    - Registración
 * 
 * FLUJO:
 * Usuario busca música → Abre YouTube en ventana backend → Selecciona/reproduce video
 * Los controles de SeaxMusic son visuales (interfaz Spotify-like)
 */

let mainWindow = null;
let youtubeWindow = null;  // ⭐ Ventana YouTube activa
let djWindow = null;       // ⭐ Ventana YouTube secundaria para DJ Mix
let loginWindow = null;    // ⭐ Variable para ventana de login separada
let backendWindows = [];
let videoViewVisible = false;
let videoViewPrevBounds = null;
let videoViewCssKey = null;
let videoPreviewTimer = null;
let videoPreviewPrev = null;
let videoPreviewClients = 0;
let pipWindow = null;
let lastVideoInfo = null;

// User data file path
const userDataPath = path.join(app.getPath('userData'), 'user-data.json');
// ⭐ Favorites legacy path (compat)
const legacyFavoritesPath = path.join(app.getPath('userData'), 'favorites.json');
const favoritesMigrationFlagPath = path.join(app.getPath('userData'), 'favorites.migrated');

function safeReadJson(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const data = fs.readFileSync(filePath, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('[JSON] Error leyendo:', filePath, e);
  }
  return null;
}

function getMaxResThumbnail(thumbnail, videoId) {
  if (videoId) {
    return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  }
  if (!thumbnail) return null;
  return thumbnail
    .replace(/\/default\.jpg$/, '/maxresdefault.jpg')
    .replace(/\/mqdefault\.jpg$/, '/maxresdefault.jpg')
    .replace(/\/hqdefault\.jpg$/, '/maxresdefault.jpg')
    .replace(/\/sddefault\.jpg$/, '/maxresdefault.jpg')
    .replace('/mqdefault', '/maxresdefault')
    .replace('/hqdefault', '/maxresdefault')
    .replace('/sddefault', '/maxresdefault');
}

function getCurrentUserData() {
  return safeReadJson(userDataPath);
}

function buildUserKey(user) {
  if (!user) return 'guest';
  const name = (user.name || '').trim().toLowerCase();
  const email = (user.email || '').trim().toLowerCase();
  const handle = (user.handle || '').trim().toLowerCase();
  const base = (email && name) ? `${email}|${name}` : (email || handle || name || 'guest');
  return base;
}

function getFavoritesPathForUser(user) {
  const userKey = buildUserKey(user);
  if (userKey === 'guest') {
    // Mantener compatibilidad con favoritos sin usuario
    return legacyFavoritesPath;
  }
  const hash = crypto.createHash('sha256').update(userKey).digest('hex').slice(0, 12);
  return path.join(app.getPath('userData'), `favorites-${hash}.json`);
}

function migrateLegacyFavoritesIfNeeded(user) {
  if (!user) return;
  const userFavoritesPath = getFavoritesPathForUser(user);
  try {
    if (!fs.existsSync(userFavoritesPath) && fs.existsSync(legacyFavoritesPath) && !fs.existsSync(favoritesMigrationFlagPath)) {
      const legacyData = safeReadJson(legacyFavoritesPath);
      if (Array.isArray(legacyData) && legacyData.length > 0) {
        fs.writeFileSync(userFavoritesPath, JSON.stringify(legacyData, null, 2), 'utf8');
        console.log('[FAVORITES] Migrados favoritos legacy a usuario actual');
        fs.writeFileSync(favoritesMigrationFlagPath, new Date().toISOString(), 'utf8');
      }
    }
  } catch (e) {
    console.error('[FAVORITES] Error migrando favoritos legacy:', e);
  }
}

// ===== SISTEMA DE FAVORITOS PERSISTENTE =====
function loadFavorites() {
  try {
    const user = getCurrentUserData();
    migrateLegacyFavoritesIfNeeded(user);
    const favoritesPath = getFavoritesPathForUser(user);
    const data = safeReadJson(favoritesPath);
    if (Array.isArray(data)) return data;
  } catch (e) {
    console.error('[FAVORITES] Error cargando favoritos:', e);
  }
  return [];
}

function saveFavorites(favorites) {
  try {
    const user = getCurrentUserData();
    const favoritesPath = getFavoritesPathForUser(user);
    fs.writeFileSync(favoritesPath, JSON.stringify(favorites, null, 2), 'utf8');
    console.log('[FAVORITES] Guardados:', favorites.length, 'favoritos');
    return true;
  } catch (e) {
    console.error('[FAVORITES] Error guardando favoritos:', e);
    return false;
  }
}

// En dev mode, limpiar datos de sesión anterior para testing
if (process.argv.includes('--dev')) {
  console.log('[DEV] Dev mode: Limpiando datos de sesión anterior...');
  try {
    if (fs.existsSync(userDataPath)) {
      fs.unlinkSync(userDataPath);
      console.log('[SESSION] Datos de sesión anterior borrados');
    }
  } catch (error) {
    console.error('Error limpiando datos:', error);
  }
}

// ⭐ FUNCIÓN HELPER: Obtener sesión de YouTube
function getYouTubeSession() {
  return session.fromPartition('persist:youtube');
}

// Create the main window
function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    backgroundColor: '#121212',
    icon: path.join(__dirname, '../renderer/assets/icons/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/preload.js'),
      backgroundThrottling: false
    },
    autoHideMenuBar: true
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Open DevTools in development mode only
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  mainWindow.on('closed', () => {
    mainWindow = null;
    
    const isDevMode = process.argv.includes('--dev');
    
    if (isDevMode) {
      // ⭐ DEV MODE: Mantener ventanas abiertas para debug
      console.log('[DEV] Ventana principal cerrada - YouTube y Login permanecen abiertas para debug');
      // No cerrar youtubeWindow ni loginWindow
    } else {
      // ⭐ PROD MODE: Cerrar todo al cerrar main
      if (youtubeWindow && !youtubeWindow.isDestroyed()) {
        youtubeWindow.close();
        youtubeWindow = null;
      }
      if (djWindow && !djWindow.isDestroyed()) {
        djWindow.close();
        djWindow = null;
      }
      if (loginWindow && !loginWindow.isDestroyed()) {
        loginWindow.close();
        loginWindow = null;
      }
      backendWindows.forEach(win => {
        if (win && !win.isDestroyed()) {
          win.close();
        }
      });
      backendWindows = [];
      app.quit();
    }
  });
}

// Create a hidden backend window for YouTube playback
function createBackendWindow(id) {
  const backendWindow = new BrowserWindow({
    show: true,
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../renderer/assets/icons/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/backend-preload.js'),
      partition: 'persist:youtube', // ⭐ CORRECCIÓN: Usar partition
      backgroundThrottling: false
    }
  });

  backendWindow.loadURL('https://www.youtube.com');
  backendWindow.customId = id;
  backendWindows.push(backendWindow);

  if (process.argv.includes('--dev')) {
    backendWindow.webContents.openDevTools({ mode: 'detach' });
  }

  backendWindow.on('closed', () => {
    const index = backendWindows.findIndex(win => win.customId === id);
    if (index !== -1) {
      backendWindows.splice(index, 1);
    }
  });

  return backendWindow;
}

// ⭐ CORRECCIÓN: Crear ventana YouTube con partition (no session)
function createYouTubeWindow(isLoginWindow = false) {
  // ⭐ Elegir el preload correcto según el tipo de ventana
  const preloadPath = isLoginWindow 
    ? path.join(__dirname, '../preload/login-preload.js')    // Login: solo detecta login
    : path.join(__dirname, '../preload/backend-preload.js'); // Player: controles de video
  
  const windowConfig = {
    width: isLoginWindow ? 500 : 1280,
    height: isLoginWindow ? 700 : 720,
    minWidth: isLoginWindow ? 400 : 800,
    minHeight: isLoginWindow ? 600 : 600,
    show: false, // Inicialmente oculta, se muestra cuando esté lista
    backgroundColor: '#000000',
    icon: path.join(__dirname, '../renderer/assets/icons/icon.ico'),
    skipTaskbar: !isLoginWindow,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      partition: 'persist:youtube', // ⭐ CORRECCIÓN: partition en vez de session
      backgroundThrottling: false
    },
    autoHideMenuBar: true,
    ...(isLoginWindow && {
      parent: mainWindow,
      modal: true
    })
  };
  
  const win = new BrowserWindow(windowConfig);
  if (!isLoginWindow) {
    try { win.setTitle('SeaxMusic Video'); } catch (e) {}
  }
  return win;
}

function createPipWindow() {
  if (pipWindow && !pipWindow.isDestroyed()) {
    pipWindow.show();
    pipWindow.focus();
    return pipWindow;
  }

  pipWindow = new BrowserWindow({
    width: 340,
    height: 420,
    minWidth: 260,
    minHeight: 340,
    resizable: true,
    frame: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    backgroundColor: '#0b0b0e',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../preload/pip-preload.js')
    }
  });

  try {
    pipWindow.setAlwaysOnTop(true, 'screen-saver');
  } catch (e) {}

  pipWindow.loadFile(path.join(__dirname, '../renderer/html/pip.html'));
  pipWindow.webContents.once('did-finish-load', () => {
    if (pipWindow && !pipWindow.isDestroyed() && lastVideoInfo) {
      pipWindow.webContents.send('update-video-info', lastVideoInfo);
    }
  });

  pipWindow.on('closed', () => {
    pipWindow = null;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('pip-closed');
    }
  });

  return pipWindow;
}

function getActiveYouTubeWindow() {
  return youtubeWindow && !youtubeWindow.isDestroyed() ? youtubeWindow : null;
}

function getDjYouTubeWindow() {
  return djWindow && !djWindow.isDestroyed() ? djWindow : null;
}

function isEventFromActiveYouTube(event) {
  const active = getActiveYouTubeWindow();
  return !!(active && event && event.sender === active.webContents);
}

async function setVideoOnlyMode(win, enabled) {
  if (!win || win.isDestroyed()) return;
  const css = `
    html, body, ytd-app { background: #000 !important; overflow: hidden !important; }
    ytd-masthead, #secondary, #comments, #related, #chat, #sidebar,
    ytd-watch-next-secondary-results-renderer, #below, #info, #header,
    ytd-mini-guide-renderer, ytd-guide-renderer { display: none !important; }
    ytd-watch-flexy, #player, ytd-player, #movie_player, .html5-video-player {
      width: 100vw !important; height: 100vh !important; max-height: 100vh !important;
    }
    #player-container-outer, #player-container-inner { width: 100vw !important; height: 100vh !important; }
  `;

  if (enabled) {
    if (!videoViewCssKey) {
      videoViewCssKey = await win.webContents.insertCSS(css);
    }
  } else if (videoViewCssKey) {
    try { await win.webContents.removeInsertedCSS(videoViewCssKey); } catch (e) {}
    videoViewCssKey = null;
  }
}

// IPC Handlers

// Create a new backend YouTube window
ipcMain.handle('create-backend-player', async (event, playerId) => {
  if (youtubeWindow && !youtubeWindow.isDestroyed()) {
    console.log('[REUSE] Reutilizando ventana de YouTube existente');
    youtubeWindow.focus();
    return { success: true, playerId, reused: true };
  }
  
  youtubeWindow = createYouTubeWindow(false);
  
  console.log('[YOUTUBE] YouTube window creada por create-backend-player');
  youtubeWindow.loadURL('https://www.youtube.com');
  
  // En modo dev, mostrar ventana y DevTools inmediatamente
  if (process.argv.includes('--dev')) {
    youtubeWindow.show();
    youtubeWindow.webContents.openDevTools({ mode: 'detach' });
    console.log('[DEV] YouTube window visible con DevTools');
  }
  
  const ytWin = youtubeWindow;
  youtubeWindow.on('closed', () => {
    if (youtubeWindow === ytWin) {
      youtubeWindow = null;
    }
  });
  
  return { success: true, playerId };
});

// ===== DJ MIX: Preload en ventana secundaria =====
ipcMain.handle('dj-preload-next', async (event, { url }) => {
  try {
    if (!url) return { success: false, error: 'URL requerida' };

  if (!djWindow || djWindow.isDestroyed()) {
    djWindow = createYouTubeWindow(false);
    if (process.argv.includes('--dev')) {
      djWindow.webContents.openDevTools({ mode: 'detach' });
    }
    const djWin = djWindow;
    djWindow.on('closed', () => {
      if (djWindow === djWin) {
        djWindow = null;
      }
    });
  }

  djWindow.loadURL(url);

  // Marcar como inactiva y preparar en silencio (tras cargar)
  try {
    djWindow.webContents.once('did-finish-load', () => {
      if (djWindow && !djWindow.isDestroyed()) {
        djWindow.webContents.send('dj-set-mode', { inactive: true });
        djWindow.webContents.send('youtube-control', 'volume', 0);
        djWindow.webContents.send('youtube-control', 'pause');
        djWindow.webContents.send('youtube-control', 'seek', 0);
      }
    });
  } catch (e) {}

  return { success: true };
} catch (e) {
    console.error('[DJ MIX] Error preload:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('dj-close', async () => {
  try {
    if (djWindow && !djWindow.isDestroyed()) {
      djWindow.close();
      djWindow = null;
    }
  } catch (e) {}
  return { success: true };
});

ipcMain.handle('dj-swap-active', async () => {
  try {
    if (!djWindow || djWindow.isDestroyed() || !youtubeWindow || youtubeWindow.isDestroyed()) {
      return { success: false, error: 'Ventanas no disponibles' };
    }

    // Pausar ventana actual antes de intercambiar
    youtubeWindow.webContents.send('youtube-control', 'pause');
    youtubeWindow.webContents.send('youtube-control', 'volume', 0);

    // Swap
    const temp = youtubeWindow;
    youtubeWindow = djWindow;
    djWindow = temp;

    // Marcar modos: nueva activa visible, vieja activa como inactiva
    try {
      if (youtubeWindow && !youtubeWindow.isDestroyed()) {
        youtubeWindow.webContents.send('dj-set-mode', { inactive: false });
      }
      if (djWindow && !djWindow.isDestroyed()) {
        djWindow.webContents.send('dj-set-mode', { inactive: true });
        djWindow.webContents.send('youtube-control', 'pause');
        djWindow.webContents.send('youtube-control', 'volume', 0);
      }
    } catch (e) {}

    return { success: true };
  } catch (e) {
    console.error('[DJ MIX] Error swap:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.on('dj-set-window-volume', (event, { target, volume }) => {
  const vol = Math.max(0, Math.min(1, volume));
  if (target === 'inactive') {
    const win = getDjYouTubeWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('youtube-control', 'volume', vol);
    }
    return;
  }
  // default active
  const win = getActiveYouTubeWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('youtube-control', 'volume', vol);
  }
});

ipcMain.on('dj-set-mode', (event, { target, inactive }) => {
  const win = target === 'inactive' ? getDjYouTubeWindow() : getActiveYouTubeWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('dj-set-mode', { inactive: !!inactive });
  }
});

// ===== Always on Top (PiP) =====
ipcMain.handle('set-always-on-top', (event, { enabled }) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    try {
      mainWindow.setAlwaysOnTop(!!enabled, 'screen-saver');
    } catch (e) {}
  }
  return { success: true, enabled: !!enabled };
});

// ===== PiP Window =====
ipcMain.handle('pip-open', async () => {
  createPipWindow();
  return { success: true };
});

ipcMain.handle('pip-close', async () => {
  if (pipWindow && !pipWindow.isDestroyed()) {
    pipWindow.close();
    return { success: true };
  }
  return { success: false };
});

ipcMain.on('pip-control', (event, { action, value }) => {
  if (!action) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('pip-control', { action, value });
    return;
  }
  if (action === 'seek') {
    const time = typeof value === 'number' ? value : 0;
    ipcMain.emit('seek-audio', event, time);
    return;
  }
  ipcMain.emit('audio-control', event, action, value);
});

ipcMain.on('dj-control-window', (event, { target, action, value }) => {
  const win = target === 'inactive' ? getDjYouTubeWindow() : getActiveYouTubeWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('youtube-control', action, value);
  }
});

// ===== Video Preview: stream del video en el panel de Now Playing =====
async function startVideoPreviewInternal() {
  const active = getActiveYouTubeWindow();
  if (!active || active.isDestroyed() || !mainWindow || mainWindow.isDestroyed()) {
    return { success: false, error: 'No hay ventana activa' };
  }

  if (videoPreviewTimer) {
    return { success: true };
  }

  await setVideoOnlyMode(active, true);
  active.webContents.send('youtube-control', 'fullscreen');

  // Asegurar render sin mostrar ventana en taskbar
  try {
    videoPreviewPrev = {
      bounds: active.getBounds(),
      visible: active.isVisible(),
      opacity: active.getOpacity ? active.getOpacity() : 1,
      skipTaskbar: active.isSkipTaskbar ? active.isSkipTaskbar() : true,
      focusable: active.isFocusable ? active.isFocusable() : true
    };
    active.setBounds({ x: -2000, y: -2000, width: 800, height: 450 });
    if (active.setOpacity) active.setOpacity(0.01);
    if (active.setSkipTaskbar) active.setSkipTaskbar(true);
    if (active.setFocusable) active.setFocusable(false);
    active.showInactive();
  } catch (e) {}

  active.webContents.send('video-preview-start');

  videoPreviewTimer = setInterval(async () => {
    try {
      if (!active || active.isDestroyed() || !mainWindow || mainWindow.isDestroyed()) return;
      const image = await active.webContents.capturePage();
      const dataUrl = image.toDataURL();
      mainWindow.webContents.send('video-preview-frame', dataUrl);
    } catch (e) {
      // Ignorar errores de captura
    }
  }, 45);

  return { success: true };
}

async function stopVideoPreviewInternal() {
  const active = getActiveYouTubeWindow();
  if (active && !active.isDestroyed()) {
    await setVideoOnlyMode(active, false);
    active.webContents.send('video-preview-stop');
    try {
      if (videoPreviewPrev) {
        if (active.setOpacity) active.setOpacity(videoPreviewPrev.opacity ?? 1);
        if (active.setSkipTaskbar) active.setSkipTaskbar(!!videoPreviewPrev.skipTaskbar);
        if (active.setFocusable) active.setFocusable(!!videoPreviewPrev.focusable);
        if (videoPreviewPrev.visible) {
          active.showInactive();
        } else {
          active.hide();
        }
        if (videoPreviewPrev.bounds) {
          active.setBounds(videoPreviewPrev.bounds);
        }
      }
    } catch (e) {}
  }
  if (videoPreviewTimer) {
    clearInterval(videoPreviewTimer);
    videoPreviewTimer = null;
  }
  videoPreviewPrev = null;
  return { success: true };
}

ipcMain.handle('start-video-preview', async () => {
  videoPreviewClients += 1;
  if (videoPreviewTimer) {
    return { success: true, clients: videoPreviewClients };
  }
  return startVideoPreviewInternal();
});

ipcMain.handle('stop-video-preview', async () => {
  videoPreviewClients = Math.max(0, videoPreviewClients - 1);
  if (videoPreviewClients > 0) {
    return { success: true, clients: videoPreviewClients };
  }
  return stopVideoPreviewInternal();
});

// Handle responses from backend player
ipcMain.on('backend-response', (event, { playerId, data }) => {
  if (!isEventFromActiveYouTube(event)) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('player-response', { playerId, data });
  }
});

// IPC Handler: Save user data
ipcMain.handle('save-user-data', async (event, userData) => {
  try {
    fs.writeFileSync(userDataPath, JSON.stringify(userData, null, 2));
    return { success: true };
  } catch (error) {
    console.error('Error saving user data:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handler: Load user data
ipcMain.handle('load-user-data', async () => {
  try {
    if (fs.existsSync(userDataPath)) {
      const data = fs.readFileSync(userDataPath, 'utf-8');
      return JSON.parse(data);
    }
    return null;
  } catch (error) {
    console.error('Error loading user data:', error);
    return null;
  }
});

// IPC Handler: Clear user data
ipcMain.handle('clear-user-data', async () => {
  try {
    if (fs.existsSync(userDataPath)) {
      fs.unlinkSync(userDataPath);
    }
    return { success: true };
  } catch (error) {
    console.error('Error clearing user data:', error);
    return { success: false, error: error.message };
  }
});

// ===== IPC HANDLERS DE AUTO-UPDATER =====
ipcMain.handle('check-for-updates', async () => {
  if (appUpdater) {
    try {
      const result = await appUpdater.checkForUpdates();
      return { success: true, result };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, error: 'Updater not initialized' };
});

ipcMain.handle('quit-and-install', async () => {
  if (appUpdater) {
    appUpdater.quitAndInstall();
    return { success: true };
  }
  return { success: false, error: 'Updater not initialized' };
});

ipcMain.handle('get-app-version', async () => {
  return app.getVersion();
});

// ===== IPC HANDLERS DE FAVORITOS =====
ipcMain.handle('get-favorites', async () => {
  const favorites = loadFavorites();
  console.log('[FAVORITES] Cargando favoritos:', favorites.length);
  return favorites;
});

ipcMain.handle('save-favorites', async (event, favorites) => {
  const success = saveFavorites(favorites);
  return { success };
});

ipcMain.handle('add-favorite', async (event, video) => {
  const favorites = loadFavorites();
  if (!favorites.some(v => v.videoId === video.videoId)) {
    favorites.unshift(video);
    saveFavorites(favorites);
    console.log('[FAVORITES] Agregado:', video.title);
    return { success: true, favorites };
  }
  return { success: false, message: 'Ya existe', favorites };
});

ipcMain.handle('remove-favorite', async (event, videoId) => {
  let favorites = loadFavorites();
  const index = favorites.findIndex(v => v.videoId === videoId);
  if (index !== -1) {
    favorites.splice(index, 1);
    saveFavorites(favorites);
    console.log('[FAVORITES] Eliminado videoId:', videoId);
    return { success: true, favorites };
  }
  return { success: false, message: 'No encontrado', favorites };
});

ipcMain.handle('toggle-favorite', async (event, payload) => {
  const favorites = loadFavorites();
  const videoId = typeof payload === 'string'
    ? payload
    : (payload && payload.videoId ? payload.videoId : null);

  if (!videoId) {
    return { success: false, message: 'videoId requerido', favorites };
  }

  const index = favorites.findIndex(v => v.videoId === videoId);
  if (index !== -1) {
    favorites.splice(index, 1);
    saveFavorites(favorites);
    console.log('[FAVORITES] Toggle: eliminado', videoId);
    return { success: true, action: 'removed', favorites };
  }

  if (typeof payload === 'object' && payload.videoId) {
    favorites.unshift(payload);
    saveFavorites(favorites);
    console.log('[FAVORITES] Toggle: agregado', payload.title || videoId);
    return { success: true, action: 'added', favorites };
  }

  return { success: false, message: 'No se puede agregar sin objeto de video', favorites };
});

// ===== HANDLERS DE CONTROL DE YOUTUBE =====

ipcMain.on('audio-control', (event, action, value) => {
  console.log(`[CONTROL] Audio Control Command: ${action}`, value);
  
  const active = getActiveYouTubeWindow();
  if (active && !active.isDestroyed()) {
    active.webContents.send('youtube-control', action, value);
    console.log(`[SENT] Sent to YouTube: ${action}`);
  } else {
    console.warn('[WARNING] YouTube window not available');
  }
});

ipcMain.on('retry-youtube-control', (event, { action, value }) => {
  console.log(`[RETRY] Retrying: ${action}`);
  if (event?.sender) {
    event.sender.send('youtube-control', action, value);
  }
});

ipcMain.on('play-audio', (event, { url, title, artist, playlistInfo }) => {
  console.log(`[PLAY] Playing: ${title} by ${artist}`);

  // ⭐ Guardar info de playlist si viene (o mantener la actual)
  const effectivePlaylist = playlistInfo || global.currentPlaylistInfo || null;
  if (effectivePlaylist) {
    global.currentPlaylistInfo = effectivePlaylist;
    console.log('[PLAY] Playing from playlist:', effectivePlaylist.name, '- Cover:', effectivePlaylist.cover);
  } else {
    global.currentPlaylistInfo = null;
  }
  
  // ⭐ Discord: Desbloquear cover para nueva canción
  discordRPC.unlockCover();
  
  // ⭐ Si hay playlist, mostrar info de playlist en Discord
  if (effectivePlaylist) {
    const coverForDiscord = effectivePlaylist.discordCover || effectivePlaylist.cover || null;
    discordRPC.setPlaylistActivity(effectivePlaylist.name, title, artist, coverForDiscord, 0);
  } else {
    discordRPC.setPlayingActivity(title, artist, null, 0);
  }
  
  const active = getActiveYouTubeWindow();
  if (active && !active.isDestroyed()) {
    // ⭐ Navegar directamente sin log extra
    active.loadURL(url);
  } else {
    console.warn('[WARNING] YouTube window not open');
  }
});

// ⭐ Establecer info de playlist actual
ipcMain.on('set-current-playlist', (event, playlistInfo) => {
  global.currentPlaylistInfo = playlistInfo;
  console.log('[PLAYLIST] Playlist info establecida:', playlistInfo?.name);
});

// ⭐ Limpiar info de playlist actual
ipcMain.on('clear-current-playlist', (event) => {
  global.currentPlaylistInfo = null;
  console.log('[PLAYLIST] Playlist info limpiada');
});

ipcMain.on('seek-audio', (event, time) => {
  console.log(`[SEEK] Seeking to: ${time}s`);
  
  const active = getActiveYouTubeWindow();
  if (active && !active.isDestroyed()) {
    active.webContents.send('youtube-control', 'seek', time);
  }
});

// ⭐ Throttle para evitar logs excesivos de volumen
let lastVolumeLogTime = 0;
const VOLUME_LOG_INTERVAL = 500; // Log máximo cada 500ms

ipcMain.on('update-volume', (event, volume) => {
  // ⭐ Guardar volumen actual para sincronizar al cambiar video
  currentAppVolume = volume;
  
  const now = Date.now();
  if (now - lastVolumeLogTime >= VOLUME_LOG_INTERVAL) {
    console.log(`[VOLUME] Volume: ${Math.round(volume * 100)}%`);
    lastVolumeLogTime = now;
  }
  
  const active = getActiveYouTubeWindow();
  if (active && !active.isDestroyed()) {
    active.webContents.send('youtube-control', 'volume', volume);
  }
});

ipcMain.on('force-play-current-video', () => {
  console.log('[FORCE] Force playing current video');
  
  const active = getActiveYouTubeWindow();
  if (active && !active.isDestroyed()) {
    active.webContents.send('youtube-control', 'play');
  }
});

// ⭐ Variables globales para modos de reproducción
let repeatMode = 'off'; // 'off', 'all', 'one'
let shuffleMode = false;
let currentVideoUrl = '';

// Handler para modo de repetición
ipcMain.on('set-repeat-mode', (event, mode) => {
  repeatMode = mode;
  console.log('[REPEAT] Modo de repetición:', mode);
  
  // Enviar el modo a YouTube window
  const active = getActiveYouTubeWindow();
  if (active && !active.isDestroyed()) {
    active.webContents.send('set-repeat-mode', mode);
  }
});

// Handler para modo shuffle
ipcMain.on('set-shuffle-mode', (event, enabled) => {
  shuffleMode = enabled;
  console.log('[SHUFFLE] Modo aleatorio:', enabled);
  
  // Enviar el modo a YouTube window
  const active = getActiveYouTubeWindow();
  if (active && !active.isDestroyed()) {
    active.webContents.send('set-shuffle-mode', enabled);
  }
});

// Handler para cuando termina un video
ipcMain.on('video-ended', (event) => {
  if (!isEventFromActiveYouTube(event)) return;
  console.log('[VIDEO] Video terminado - Repeat mode:', repeatMode);
  
  if (repeatMode === 'one' && currentVideoUrl) {
    // Repetir la misma canción
    console.log('[REPEAT] Repitiendo canción actual...');
    const active = getActiveYouTubeWindow();
    if (active && !active.isDestroyed()) {
      active.webContents.send('youtube-control', 'seek', 0);
      setTimeout(() => {
        active.webContents.send('youtube-control', 'play');
      }, 100);
    }
  }
  // ⭐ NO manejar automáticamente 'all' o shuffle aquí - dejar que la cola del renderer lo maneje
  
  // Siempre notificar al renderer (para la cola de reproducción)
  if (mainWindow && !mainWindow.isDestroyed()) {
    console.log('[VIDEO] Notificando video-ended al renderer para cola de reproducción');
    mainWindow.webContents.send('video-ended');
  }
});

ipcMain.on('autoplay-next', (event, { videoId, title, artist }) => {
  console.log(`[NEXT] Autoplay next: ${title}`);
  
  const active = getActiveYouTubeWindow();
  if (active && !active.isDestroyed()) {
    const nextUrl = `https://www.youtube.com/watch?v=${videoId}`;
    active.loadURL(nextUrl);
  }
});

ipcMain.on('update-video-info', (event, videoInfo) => {
  if (!isEventFromActiveYouTube(event)) return;
  lastVideoInfo = videoInfo;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-video-info', videoInfo);
  }
  if (pipWindow && !pipWindow.isDestroyed()) {
    pipWindow.webContents.send('update-video-info', videoInfo);
  }
  
  // ⭐ Actualizar Discord Rich Presence con la canción
  if (videoInfo.title) {
    const artist = videoInfo.channel || videoInfo.artist || 'YouTube';
    const sameVideoId = videoInfo.videoId && videoInfo.videoId === discordRPC.state.videoId;
    const sameTitleArtist = videoInfo.title === discordRPC.state.trackName && artist === discordRPC.state.trackArtist;
    const isSameTrack = sameVideoId || (sameTitleArtist && !videoInfo.videoId);

    if (!isSameTrack || !discordRPC.state.trackName) {
      // ⭐ Convertir duración a segundos si viene como string "MM:SS" o "H:MM:SS"
      let durationSeconds = 0;
      if (typeof videoInfo.duration === 'number') {
        durationSeconds = videoInfo.duration;
      } else if (typeof videoInfo.duration === 'string' && videoInfo.duration) {
        const parts = videoInfo.duration.split(':').map(Number);
        if (parts.length === 3) {
          durationSeconds = parts[0] * 3600 + parts[1] * 60 + parts[2];
        } else if (parts.length === 2) {
          durationSeconds = parts[0] * 60 + parts[1];
        } else if (parts.length === 1) {
          durationSeconds = parts[0];
        }
      }
      
      // ⭐ Si hay playlist activa, usar su cover y mostrar info de playlist
      const playlistInfo = global.currentPlaylistInfo;
      if (playlistInfo && playlistInfo.cover) {
        discordRPC.setPlaylistActivity(
          playlistInfo.name,
          videoInfo.title,
          artist,
          playlistInfo.cover,
          durationSeconds,
          videoInfo.videoId || null
        );
      } else {
        const thumbnail = getMaxResThumbnail(videoInfo.thumbnail, videoInfo.videoId);
        
        discordRPC.setPlayingActivity(
          videoInfo.title,
          artist,
          thumbnail,
          durationSeconds,
          videoInfo.videoId || null
        );
      }
    } else {
      console.log('[DISCORD] Mismo track detectado, no se actualiza la presencia');
    }
  }
});

ipcMain.on('update-time', (event, timeInfo) => {
  if (!isEventFromActiveYouTube(event)) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('audio-time-update', timeInfo);
  }
  if (pipWindow && !pipWindow.isDestroyed()) {
    pipWindow.webContents.send('audio-time-update', timeInfo);
  }
});

ipcMain.on('video-playing', (event) => {
  if (!isEventFromActiveYouTube(event)) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('audio-started');
  }
  if (pipWindow && !pipWindow.isDestroyed()) {
    pipWindow.webContents.send('video-playing');
  }
  
  // ⭐ Discord: Reanudar reproducción sin resetear el timestamp
  discordRPC.resumeActivity();
  
  // Eliminado: No sincronizar volumen automáticamente al cambiar de video. El volumen solo debe cambiar por acción explícita del usuario.
});

ipcMain.on('video-paused', (event) => {
  if (!isEventFromActiveYouTube(event)) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('audio-paused');
  }
  if (pipWindow && !pipWindow.isDestroyed()) {
    pipWindow.webContents.send('video-paused');
  }
  
  // ⭐ Discord: Mostrar estado pausado
  discordRPC.setPausedActivity();
});

ipcMain.on('video-url-changed', (event, url) => {
  if (!isEventFromActiveYouTube(event)) return;
  // ⭐ Ignorar URLs de login de Google
  if (url && (url.includes('accounts.google.com') || 
              url.includes('signin') || 
              url.includes('ServiceLogin') ||
              url.includes('Logout'))) {
    console.log('[VIDEO] Ignorando URL de login (no es video)');
    return;
  }
  console.log('[VIDEO] Video URL changed:', url);
  
  // ⭐ Desbloquear cover para la nueva canción
  discordRPC.unlockCover();
  
  // ⭐ Actualizar Discord con la URL del video
  discordRPC.state.videoUrl = url;
});

ipcMain.on('video-cover-updated', (event, coverUrl) => {
  if (!isEventFromActiveYouTube(event)) return;
  console.log('[COVER] Cover updated:', coverUrl);
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-album-cover', coverUrl);
    
    // ⭐ Actualizar historial cuando cambia de video
    // Esperar un poco para que YouTube registre la reproducción
    console.log('[HISTORY] Notificación para actualizar historial');
    mainWindow.webContents.send('refresh-history');
  }
  
  // ⭐ Solo establecer imagen inicial para Discord (no actualizar con versiones 4K)
  discordRPC.setInitialTrackImage(coverUrl);
  
  // ⭐ Sincronizar volumen cuando cambia de video
  // Esperar un poco para que el video nuevo esté listo
  setTimeout(() => {
    if (youtubeWindow && !youtubeWindow.isDestroyed()) {
      console.log('[VOLUME] Sincronizando volumen al cambiar video:', Math.round(currentAppVolume * 100) + '%');
      youtubeWindow.webContents.send('youtube-control', 'volume', currentAppVolume);
    }
  }, 500);
});

ipcMain.on('youtube-ready', () => {
  console.log('[OK] YouTube window is ready and communication established');
});

ipcMain.on('video-preview-frame', (event, dataUrl) => {
  if (!isEventFromActiveYouTube(event)) return;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('video-preview-frame', dataUrl);
  }
});

// ===== HANDLERS PARA VIDEOS DESTACADOS E HISTORIAL =====
// Variable global para el volumen actual de la app
let currentAppVolume = 0.7;

// Ventana auxiliar para cargar páginas sin afectar la reproducción
let auxYoutubeWindow = null;

// Función para crear ventana auxiliar
function createAuxYoutubeWindow() {
  const isDevMode = process.argv.includes('--dev');
  
  if (auxYoutubeWindow && !auxYoutubeWindow.isDestroyed()) {
    return auxYoutubeWindow;
  }
  
  auxYoutubeWindow = new BrowserWindow({
    width: 900,
    height: 700,
    show: isDevMode, // Mostrar en dev mode para debug
    title: 'SeaxMusic - Datos Auxiliar',
    webPreferences: {
      partition: 'persist:youtube', // Misma sesión que la principal (login)
      nodeIntegration: false,
      contextIsolation: true,
      // ⭐ IMPORTANTE: Usar preload ESPECÍFICO para ventana auxiliar
      // NO usar backend-preload.js porque envía eventos de video-info
      preload: path.join(__dirname, '../preload/aux-preload.js'),
      backgroundThrottling: false
    }
  });
  
  if (isDevMode) {
    auxYoutubeWindow.webContents.openDevTools();
  }
  
  auxYoutubeWindow.on('closed', () => {
    auxYoutubeWindow = null;
  });
  
  return auxYoutubeWindow;
}

// Script para extraer videos del DOM cargado
const extractVideosFromDOMScript = (maxCount) => `
  (function() {
    const videos = [];
    const maxVideos = ${maxCount};
    
    console.log('[EXTRACT] Buscando videos en DOM...');
    console.log('[EXTRACT] URL actual:', window.location.href);
    
    // Selectores específicos para diferentes páginas de YouTube
    const selectors = [
      // Página principal (Home)
      'ytd-rich-item-renderer',
      'ytd-rich-grid-media',
      // Historial y búsqueda
      'ytd-video-renderer',
      // Sidebar y listas
      'ytd-compact-video-renderer',
      'ytd-grid-video-renderer',
      'ytd-playlist-video-renderer',
      // Historial específico - secciones
      'ytd-video-renderer[class*="style-scope"]'
    ];
    
    const allSelector = selectors.join(', ');
    const videoElements = document.querySelectorAll(allSelector);
    
    console.log('[EXTRACT] Elementos encontrados en DOM:', videoElements.length);
    
    // Debug: mostrar qué tipos de elementos hay
    const types = {};
    videoElements.forEach(el => {
      const tag = el.tagName.toLowerCase();
      types[tag] = (types[tag] || 0) + 1;
    });
    console.log('[EXTRACT] Tipos de elementos:', JSON.stringify(types));
    
    for (const el of videoElements) {
      if (videos.length >= maxVideos) break;
      
      try {
        // Extraer título - múltiples selectores
        const titleEl = el.querySelector('#video-title, a#video-title, h3 a, yt-formatted-string#video-title, #video-title-link yt-formatted-string');
        let title = titleEl?.textContent?.trim() || titleEl?.getAttribute('title') || '';
        
        // Si no hay título, intentar otro selector
        if (!title) {
          const altTitleEl = el.querySelector('a[href*="watch"] yt-formatted-string, [id="video-title"]');
          title = altTitleEl?.textContent?.trim() || '';
        }
        
        // Extraer URL del video
        const linkEl = el.querySelector('a#thumbnail, a#video-title-link, a#video-title, a[href*="watch"], ytd-thumbnail a');
        const href = linkEl?.getAttribute('href') || '';
        
        // Extraer video ID
        const videoIdMatch = href.match(/(?:v=|shorts\\/)([a-zA-Z0-9_-]{11})/);
        const videoId = videoIdMatch ? videoIdMatch[1] : null;
        
        // Extraer canal - múltiples selectores
        const channelEl = el.querySelector(
          '#channel-name a, ' +
          'ytd-channel-name a, ' +
          '#text.ytd-channel-name, ' +
          'yt-formatted-string.ytd-channel-name, ' +
          '#byline-container a, ' +
          '#channel-info a, ' +
          'ytd-channel-name yt-formatted-string'
        );
        const channel = channelEl?.textContent?.trim() || '';
        
        // Extraer duración - múltiples selectores
        const durationEl = el.querySelector(
          'span.ytd-thumbnail-overlay-time-status-renderer, ' +
          '#time-status span, ' +
          'ytd-thumbnail-overlay-time-status-renderer span, ' +
          'span#text.ytd-thumbnail-overlay-time-status-renderer, ' +
          'ytd-thumbnail-overlay-time-status-renderer'
        );
        const duration = durationEl?.textContent?.trim() || '';
        
        if (title && videoId && !videos.some(v => v.videoId === videoId)) {
          videos.push({
            videoId: videoId,
            title: title,
            channel: channel,
            duration: duration,
            thumbnail: 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg',
            url: 'https://www.youtube.com/watch?v=' + videoId
          });
        }
      } catch (e) {
        console.error('[EXTRACT] Error:', e);
      }
    }
    
    console.log('[EXTRACT] Videos del DOM:', videos.length);
    
    // Método 2: Si no encontró suficientes, buscar en ytInitialData
    if (videos.length < maxVideos) {
      console.log('[EXTRACT] Buscando en ytInitialData...');
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent || '';
        if (text.includes('var ytInitialData')) {
          try {
            const match = text.match(/var ytInitialData\\s*=\\s*(\\{.+?\\});/);
            if (match) {
              const data = JSON.parse(match[1]);
              
              // Función recursiva para encontrar videos
              const findVideos = (obj) => {
                if (videos.length >= maxVideos) return;
                if (!obj || typeof obj !== 'object') return;
                
                // Detectar objeto de video
                if (obj.videoId && (obj.title || obj.headline)) {
                  const titleObj = obj.title || obj.headline;
                  const title = titleObj?.runs?.[0]?.text || titleObj?.simpleText || titleObj?.text || '';
                  
                  const channel = obj.shortBylineText?.runs?.[0]?.text || 
                                  obj.ownerText?.runs?.[0]?.text || 
                                  obj.longBylineText?.runs?.[0]?.text || '';
                                  
                  let duration = '';
                  if (obj.lengthText) {
                    duration = obj.lengthText.simpleText || obj.lengthText.runs?.[0]?.text || '';
                  }
                  if (!duration && obj.thumbnailOverlays) {
                    for (const overlay of obj.thumbnailOverlays) {
                      if (overlay.thumbnailOverlayTimeStatusRenderer) {
                        duration = overlay.thumbnailOverlayTimeStatusRenderer.text?.simpleText || '';
                        break;
                      }
                    }
                  }
                  
                  if (title && !videos.some(v => v.videoId === obj.videoId)) {
                    videos.push({
                      videoId: obj.videoId,
                      title: title,
                      channel: channel,
                      duration: duration,
                      thumbnail: 'https://i.ytimg.com/vi/' + obj.videoId + '/mqdefault.jpg',
                      url: 'https://www.youtube.com/watch?v=' + obj.videoId
                    });
                  }
                }
                
                // Recursión
                for (const key in obj) {
                  if (videos.length >= maxVideos) break;
                  if (Array.isArray(obj[key])) {
                    for (const item of obj[key]) {
                      if (videos.length >= maxVideos) break;
                      findVideos(item);
                    }
                  } else if (typeof obj[key] === 'object') {
                    findVideos(obj[key]);
                  }
                }
              };
              
              findVideos(data);
              break;
            }
          } catch (e) {
            console.error('[EXTRACT] Error parsing ytInitialData:', e);
          }
        }
      }
    }
    
    console.log('[EXTRACT] Total videos extraídos:', videos.length);
    return videos;
  })()
`;

// Script para extraer mixes de artistas de YouTube Music
const extractMixesScript = (maxCount) => `
  (function() {
    const mixes = [];
    const maxMixes = ${maxCount};
    
    console.log('[EXTRACT-MIXES] Buscando mixes de artistas...');
    console.log('[EXTRACT-MIXES] URL actual:', window.location.href);
    
    // Buscar la sección "Mixes de artistas para ti" o similar
    const shelfHeaders = document.querySelectorAll('ytd-rich-shelf-renderer, ytd-shelf-renderer, ytd-reel-shelf-renderer');
    
    console.log('[EXTRACT-MIXES] Secciones encontradas:', shelfHeaders.length);
    
    for (const shelf of shelfHeaders) {
      // Buscar el título de la sección
      const titleEl = shelf.querySelector('#title, span#title, h2 span#title');
      const title = titleEl?.textContent?.trim()?.toLowerCase() || '';
      
      console.log('[EXTRACT-MIXES] Sección encontrada:', title.substring(0, 50));
      
      // Verificar si es la sección de mixes
      if (title.includes('mix') || title.includes('artista') || title.includes('para ti')) {
        console.log('[EXTRACT-MIXES] ¡Sección de mixes encontrada!');
        
        // Buscar los items dentro de esta sección
        const items = shelf.querySelectorAll('ytd-rich-item-renderer, ytd-grid-video-renderer, ytd-video-renderer, ytd-compact-video-renderer');
        
        console.log('[EXTRACT-MIXES] Items en sección:', items.length);
        
        for (const item of items) {
          if (mixes.length >= maxMixes) break;
          
          try {
            // Extraer título del mix
            const mixTitleEl = item.querySelector('#video-title, a#video-title, yt-formatted-string#video-title');
            const mixTitle = mixTitleEl?.textContent?.trim() || mixTitleEl?.getAttribute('title') || '';
            
            // Extraer URL
            const linkEl = item.querySelector('a#thumbnail, a[href*="watch"], a[href*="playlist"]');
            const href = linkEl?.getAttribute('href') || '';
            
            // Extraer video/playlist ID
            let videoId = null;
            let playlistId = null;
            
            const videoMatch = href.match(/v=([a-zA-Z0-9_-]{11})/);
            const playlistMatch = href.match(/list=([a-zA-Z0-9_-]+)/);
            
            if (videoMatch) videoId = videoMatch[1];
            if (playlistMatch) playlistId = playlistMatch[1];
            
            // Para mixes, preferir el video ID
            const id = videoId || playlistId;
            
            // Extraer thumbnail
            const thumbEl = item.querySelector('img#img, img.yt-core-image, yt-img-shadow img');
            let thumbnail = thumbEl?.src || '';
            if (videoId && (!thumbnail || thumbnail.includes('data:'))) {
              thumbnail = 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg';
            }
            
            // Extraer descripción/subtítulo
            const subtitleEl = item.querySelector('#description, #subtitle, .subtitle');
            const subtitle = subtitleEl?.textContent?.trim() || '';
            
            if (mixTitle && id && !mixes.some(m => m.videoId === videoId)) {
              mixes.push({
                videoId: videoId,
                playlistId: playlistId,
                title: mixTitle,
                channel: 'YouTube Music',
                subtitle: subtitle,
                thumbnail: thumbnail,
                url: videoId 
                  ? 'https://www.youtube.com/watch?v=' + videoId + (playlistId ? '&list=' + playlistId : '')
                  : 'https://www.youtube.com/playlist?list=' + playlistId,
                duration: 'Mix'
              });
              console.log('[EXTRACT-MIXES] Mix encontrado:', mixTitle.substring(0, 30));
            }
          } catch (e) {
            console.error('[EXTRACT-MIXES] Error:', e);
          }
        }
        
        if (mixes.length >= maxMixes) break;
      }
    }
    
    // Si no encontró mixes en secciones específicas, buscar en ytInitialData
    if (mixes.length < maxMixes) {
      console.log('[EXTRACT-MIXES] Buscando en ytInitialData...');
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const text = script.textContent || '';
        if (text.includes('var ytInitialData')) {
          try {
            const match = text.match(/var ytInitialData\\s*=\\s*(\\{.+?\\});/);
            if (match) {
              const data = JSON.parse(match[1]);
              
              // Buscar secciones con "mix" en el título
              const findMixes = (obj) => {
                if (mixes.length >= maxMixes) return;
                if (!obj || typeof obj !== 'object') return;
                
                // Buscar shelfRenderer con título de mixes
                if (obj.title && (obj.title.simpleText?.toLowerCase().includes('mix') || 
                    obj.title.runs?.[0]?.text?.toLowerCase().includes('mix'))) {
                  // Buscar contenido
                  const contents = obj.contents || obj.items || [];
                  for (const item of contents) {
                    if (mixes.length >= maxMixes) break;
                    const renderer = item.richItemRenderer?.content?.videoRenderer ||
                                    item.gridVideoRenderer ||
                                    item.videoRenderer ||
                                    item.compactVideoRenderer;
                    if (renderer && renderer.videoId) {
                      const title = renderer.title?.runs?.[0]?.text || 
                                   renderer.title?.simpleText || '';
                      if (title && !mixes.some(m => m.videoId === renderer.videoId)) {
                        mixes.push({
                          videoId: renderer.videoId,
                          title: title,
                          channel: 'YouTube Music',
                          thumbnail: 'https://i.ytimg.com/vi/' + renderer.videoId + '/mqdefault.jpg',
                          url: 'https://www.youtube.com/watch?v=' + renderer.videoId,
                          duration: 'Mix'
                        });
                      }
                    }
                  }
                }
                
                // Recursión
                for (const key in obj) {
                  if (mixes.length >= maxMixes) break;
                  if (Array.isArray(obj[key])) {
                    for (const item of obj[key]) {
                      if (mixes.length >= maxMixes) break;
                      findMixes(item);
                    }
                  } else if (typeof obj[key] === 'object') {
                    findMixes(obj[key]);
                  }
                }
              };
              
              findMixes(data);
              break;
            }
          } catch (e) {
            console.error('[EXTRACT-MIXES] Error parsing ytInitialData:', e);
          }
        }
      }
    }
    
    console.log('[EXTRACT-MIXES] Total mixes encontrados:', mixes.length);
    return mixes;
  })()
`;

// Handler para solicitar videos destacados (mixes) de YouTube Music
ipcMain.handle('get-featured-videos', async () => {
  console.log('[FEATURED] Solicitando videos destacados de YouTube...');
  
  try {
    const auxWindow = createAuxYoutubeWindow();
    
    return new Promise((resolve) => {
      // Ir a la página principal de YouTube
      auxWindow.loadURL('https://www.youtube.com');
      
      auxWindow.webContents.once('did-finish-load', async () => {
        console.log('[FEATURED] YouTube cargado, esperando contenido...');
        
        // ⭐ OPTIMIZADO: Esperar menos tiempo
        await new Promise(r => setTimeout(r, 2500));
        
        // ⭐ OPTIMIZADO: Solo 2 scrolls rápidos
        await auxWindow.webContents.executeJavaScript(`
          (async function() {
            for (let i = 0; i < 2; i++) {
              window.scrollTo(0, window.scrollY + 800);
              await new Promise(r => setTimeout(r, 500));
            }
            window.scrollTo(0, 0);
          })()
        `);
        
        // Esperar a que termine de cargar
        await new Promise(r => setTimeout(r, 1000));
        
        try {
          // Script simplificado y más robusto para extraer videos
          const videos = await auxWindow.webContents.executeJavaScript(`
            (function() {
              const videos = [];
              const maxVideos = 6; // ⭐ AUMENTADO: 6 videos destacados
              
              console.log('[EXTRACT] ===== Inicio de extracción =====');
              console.log('[EXTRACT] URL:', window.location.href);
              console.log('[EXTRACT] DOM listo:', document.readyState);
              
              // Método 1: Buscar directamente en ytInitialData
              try {
                if (window.ytInitialData) {
                  console.log('[EXTRACT] ytInitialData encontrado en window');
                  
                  const findVideos = (obj, depth = 0) => {
                    if (videos.length >= maxVideos || depth > 20) return;
                    if (!obj || typeof obj !== 'object') return;
                    
                    // Si encontramos un videoRenderer, extraer datos
                    if (obj.videoRenderer && obj.videoRenderer.videoId) {
                      const vr = obj.videoRenderer;
                      const videoId = vr.videoId;
                      const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || '';
                      const channel = vr.ownerText?.runs?.[0]?.text || 
                                     vr.longBylineText?.runs?.[0]?.text || 
                                     vr.shortBylineText?.runs?.[0]?.text || '';
                      
                      if (title && !videos.some(v => v.videoId === videoId)) {
                        videos.push({
                          videoId: videoId,
                          title: title,
                          channel: channel || 'YouTube',
                          thumbnail: 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg',
                          url: 'https://www.youtube.com/watch?v=' + videoId,
                          duration: vr.lengthText?.simpleText || ''
                        });
                        console.log('[EXTRACT] Video encontrado:', title.substring(0, 40));
                      }
                    }
                    
                    // Recursión
                    for (const key in obj) {
                      if (videos.length >= maxVideos) break;
                      const val = obj[key];
                      if (Array.isArray(val)) {
                        for (const item of val) {
                          if (videos.length >= maxVideos) break;
                          findVideos(item, depth + 1);
                        }
                      } else if (typeof val === 'object') {
                        findVideos(val, depth + 1);
                      }
                    }
                  };
                  
                  findVideos(window.ytInitialData);
                }
              } catch (e) {
                console.error('[EXTRACT] Error con ytInitialData:', e);
              }
              
              // Método 2: Si no encontró videos, buscar en scripts
              if (videos.length < maxVideos) {
                console.log('[EXTRACT] Buscando en scripts del DOM...');
                const scripts = document.querySelectorAll('script');
                
                for (const script of scripts) {
                  if (videos.length >= maxVideos) break;
                  const text = script.textContent || '';
                  
                  // Buscar videoId con regex
                  const videoIdMatches = text.match(/"videoId":"([a-zA-Z0-9_-]{11})"/g);
                  if (videoIdMatches) {
                    for (const match of videoIdMatches) {
                      if (videos.length >= maxVideos) break;
                      const videoId = match.match(/"videoId":"([a-zA-Z0-9_-]{11})"/)?.[1];
                      
                      if (videoId && !videos.some(v => v.videoId === videoId)) {
                        // Intentar encontrar el título
                        const titleRegex = new RegExp('"videoId":"' + videoId + '"[^}]*"title":\\\\s*\\\\{[^}]*"text":\\\\s*"([^"]+)"', 's');
                        const titleMatch = text.match(titleRegex);
                        const title = titleMatch?.[1] || 'Video de YouTube';
                        
                        videos.push({
                          videoId: videoId,
                          title: title,
                          channel: 'YouTube',
                          thumbnail: 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg',
                          url: 'https://www.youtube.com/watch?v=' + videoId,
                          duration: ''
                        });
                        console.log('[EXTRACT] Video de script:', videoId);
                      }
                    }
                  }
                }
              }
              
              // Método 3: Buscar en el DOM renderizado
              if (videos.length < maxVideos) {
                console.log('[EXTRACT] Buscando en DOM renderizado...');
                
                // Buscar todos los elementos que puedan contener videos
                const selectors = [
                  'ytd-rich-item-renderer',
                  'ytd-video-renderer', 
                  'ytd-grid-video-renderer',
                  'ytd-compact-video-renderer'
                ];
                
                for (const selector of selectors) {
                  if (videos.length >= maxVideos) break;
                  const items = document.querySelectorAll(selector);
                  
                  for (const item of items) {
                    if (videos.length >= maxVideos) break;
                    
                    // Buscar el enlace al video
                    const link = item.querySelector('a[href*="/watch?v="]');
                    if (!link) continue;
                    
                    const href = link.getAttribute('href') || '';
                    const videoMatch = href.match(/v=([a-zA-Z0-9_-]{11})/);
                    if (!videoMatch) continue;
                    
                    const videoId = videoMatch[1];
                    if (videos.some(v => v.videoId === videoId)) continue;
                    
                    // Buscar título
                    const titleEl = item.querySelector('#video-title, [id="video-title"]');
                    const title = titleEl?.textContent?.trim() || 
                                 titleEl?.getAttribute('title') || 
                                 'Video';
                    
                    // Buscar canal
                    const channelEl = item.querySelector('#channel-name, .ytd-channel-name, #text.ytd-channel-name');
                    const channel = channelEl?.textContent?.trim() || 'YouTube';
                    
                    videos.push({
                      videoId: videoId,
                      title: title,
                      channel: channel,
                      thumbnail: 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg',
                      url: 'https://www.youtube.com/watch?v=' + videoId,
                      duration: ''
                    });
                    console.log('[EXTRACT] Video de DOM:', title.substring(0, 40));
                  }
                }
              }
              
              console.log('[EXTRACT] ===== Total videos:', videos.length, '=====');
              return videos;
            })()
          `);
          
          console.log('[FEATURED] Videos encontrados:', videos.length);
          resolve({ success: true, videos });
        } catch (error) {
          console.error('[FEATURED] Error extrayendo:', error);
          resolve({ success: false, videos: [] });
        }
      });
      
      // Timeout de seguridad
      setTimeout(() => {
        console.log('[FEATURED] Timeout alcanzado');
        resolve({ success: false, videos: [] });
      }, 35000);
    });
  } catch (error) {
    console.error('[FEATURED] Error:', error);
    return { success: false, videos: [] };
  }
});

// Handler para solicitar historial de YouTube
ipcMain.handle('get-history-videos', async () => {
  console.log('[HISTORY] Solicitando historial de YouTube...');
  
  try {
    const auxWindow = createAuxYoutubeWindow();
    
    return new Promise((resolve) => {
      auxWindow.loadURL('https://www.youtube.com/feed/history');
      
      auxWindow.webContents.once('did-finish-load', async () => {
        console.log('[HISTORY] Página de historial cargada, esperando contenido...');
        
        try {
          // Verificar si la ventana sigue existiendo
          if (auxWindow.isDestroyed()) {
            console.log('[HISTORY] Ventana cerrada antes de completar');
            resolve([]);
            return;
          }
          
          // ⭐ Esperar a que YouTube renderice el contenido inicial
          await new Promise(r => setTimeout(r, 3000));
          
          // Verificar de nuevo
          if (auxWindow.isDestroyed()) {
            resolve([]);
            return;
          }
          
          // ⭐ Hacer 4 scrolls para cargar suficiente contenido del historial
          for (let i = 0; i < 4; i++) {
            if (auxWindow.isDestroyed()) {
              resolve([]);
              return;
            }
            await auxWindow.webContents.executeJavaScript('window.scrollTo(0, document.body.scrollHeight)');
            await new Promise(r => setTimeout(r, 1200));
          }
          
          // Verificar de nuevo
          if (auxWindow.isDestroyed()) {
            resolve([]);
            return;
          }
          
          // Esperar a que se cargue el nuevo contenido
          await new Promise(r => setTimeout(r, 1500));
        
        // Script para extraer videos del historial usando DOM específico del historial
        const extractHistoryScript = `
          (function() {
            const maxVideos = 10;
            const videos = [];
            
            console.log('[HISTORY] Extrayendo videos del historial...');
            
            // Si redirige a login, no hay sesión
            if (window.location.href.includes('accounts.google.com') || 
                window.location.href.includes('ServiceLogin')) {
              console.log('[HISTORY] Redirigido a login');
              return { error: 'not-logged-in', videos: [] };
            }
            
            // ⭐ MÉTODO PRINCIPAL: Buscar en el DOM con selectores específicos del historial
            // El historial de YouTube usa una estructura diferente con yt-lockup-metadata-view-model
            
            const cleanText = (text) => {
              if (!text) return '';
              return text.toString().replace(/\s+/g, ' ').trim();
            };

            const isDurationLike = (text) => {
              if (!text) return false;
              return /^\d{1,2}:\d{2}$/.test(text) || /^\d+\s*(minutos?|segundos?)/i.test(text);
            };

            const getTitleFromLink = (link) => {
              if (!link) return '';
              const rawTitle = cleanText(link.getAttribute('title') || link.textContent);
              if (rawTitle && !isDurationLike(rawTitle) && rawTitle.toLowerCase() !== 'youtube') {
                return rawTitle;
              }
              return cleanText(link.querySelector('yt-formatted-string, span')?.textContent);
            };

            const getChannelFromContainer = (container) => {
              if (!container) return 'YouTube';
              const selectors = [
                '#upload-info ytd-channel-name yt-formatted-string#text a',
                'ytd-channel-name a',
                'ytd-channel-name yt-formatted-string#text a',
                'a.yt-simple-endpoint.style-scope.yt-formatted-string',
                '#owner-name a',
                'ytd-channel-name span',
                '.yt-formatted-string.ytd-channel-name'
              ];
              for (const selector of selectors) {
                const el = container.querySelector(selector);
                const text = cleanText(el?.textContent);
                if (text && text.toLowerCase() !== 'youtube') {
                  return text.split('•')[0].trim();
                }
              }
              return 'YouTube';
            };

            // Buscar todos los elementos de historial con el nuevo DOM de YouTube
            const historyItems = Array.from(document.querySelectorAll(
              '.ytLockupViewModelMetadata, .ytLockupMetadataViewModelTextContainer, yt-lockup-metadata-view-model'
            ));
            console.log('[HISTORY] Items de historial encontrados:', historyItems.length);

            for (const item of historyItems) {
              if (videos.length >= maxVideos) break;

              const link = item.querySelector('a.ytLockupMetadataViewModelTitle[href*="/watch?v="]');
              if (!link) continue;

              const href = link.getAttribute('href') || '';
              const videoMatch = href.match(/v=([a-zA-Z0-9_-]{11})/);
              if (!videoMatch) continue;

              const videoId = videoMatch[1];
              if (videos.some(v => v.videoId === videoId)) continue;

              let title = cleanText(link.querySelector('.ytAttributedStringHost')?.textContent || link.textContent);
              if (!title || isDurationLike(title)) {
                title = cleanText(link.getAttribute('aria-label') || '');
                if (title.includes('•')) {
                  title = title.split('•')[0].trim();
                }
              }
              if (!title || isDurationLike(title) || title.toLowerCase() === 'youtube') {
                continue;
              }

              const metadataContainer = item.closest('.ytLockupViewModelMetadata, .ytLockupMetadataViewModelTextContainer, yt-lockup-metadata-view-model') || item;
              let channel = 'YouTube';
              const channelEl = metadataContainer.querySelector(
                '.ytContentMetadataViewModelMetadataText, .ytAttributedStringHost.ytContentMetadataViewModelMetadataText, .ytLockupMetadataViewModelMetadataText'
              );
              if (channelEl) {
                channel = cleanText(channelEl.textContent || channelEl.getAttribute('title') || 'YouTube');
                channel = channel.split('•')[0].trim();
              }

              const ariaLabel = link.getAttribute('aria-label') || '';
              const durationMatch = ariaLabel.match(/(\d+)\s*minutos?\s*y?\s*(\d+)?\s*segundos?/i);
              let duration = '';
              if (durationMatch) {
                const mins = parseInt(durationMatch[1]) || 0;
                const secs = parseInt(durationMatch[2]) || 0;
                duration = mins + ':' + secs.toString().padStart(2, '0');
              }

              videos.push({
                videoId: videoId,
                title: title,
                channel: channel,
                thumbnail: 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg',
                url: 'https://www.youtube.com/watch?v=' + videoId,
                duration: duration
              });
              console.log('[HISTORY] Video:', title.substring(0, 40), '|', channel);
            }
            
            // Método 2: Fallback - Buscar en ytInitialData si no encontró suficientes
            if (videos.length < maxVideos) {
              console.log('[HISTORY] Buscando en ytInitialData...');
              try {
                if (window.ytInitialData) {
                  const getTextFromRuns = (textObj) => {
                    if (!textObj) return '';
                    if (typeof textObj === 'string') return textObj.trim();
                    if (Array.isArray(textObj)) {
                      return textObj.map(t => t?.text || t).filter(Boolean).join('').trim();
                    }
                    if (textObj.runs?.length) {
                      return textObj.runs.map(r => r.text).join('').trim();
                    }
                    return textObj.simpleText?.trim() || textObj.text?.trim() || '';
                  };

                  const getChannelText = (obj) => {
                    if (!obj) return 'YouTube';
                    const candidates = [
                      obj.ownerText,
                      obj.longBylineText,
                      obj.shortBylineText,
                      obj.channelName,
                      obj.ownerText?.runs,
                      obj.shortBylineText?.runs,
                      obj.longBylineText?.runs,
                      obj.serviceEndpoint?.watchEndpoint?.videoId
                    ];
                    for (const candidate of candidates) {
                      const text = getTextFromRuns(candidate);
                      if (text) return text;
                    }
                    return 'YouTube';
                  };

                  const getVideoData = (item) => {
                    const videoId = item.videoId || item.videoId?.videoId;
                    if (!videoId) return null;

                    let title = '';
                    if (item.title) title = getTextFromRuns(item.title);
                    if (!title && item.headline) title = getTextFromRuns(item.headline);
                    if (!title && item.titleText) title = getTextFromRuns(item.titleText);
                    if (!title && item.name) title = getTextFromRuns(item.name);

                    let channel = getChannelText(item);
                    if (!channel && item.shortBylineText) channel = getTextFromRuns(item.shortBylineText);

                    let duration = item.lengthText?.simpleText || getTextFromRuns(item.lengthText) || '';
                    if (!duration && item.thumbnailOverlays) {
                      for (const overlay of item.thumbnailOverlays) {
                        const timeRenderer = overlay.thumbnailOverlayTimeStatusRenderer;
                        if (timeRenderer) {
                          duration = getTextFromRuns(timeRenderer.text);
                          if (duration) break;
                        }
                      }
                    }

                    if (!title) return null;
                    return { videoId, title, channel: channel || 'YouTube', duration };
                  };

                  const findVideos = (obj, depth = 0) => {
                    if (videos.length >= maxVideos || depth > 25) return;
                    if (!obj || typeof obj !== 'object') return;

                    const rendererKeys = [
                      'videoRenderer',
                      'compactVideoRenderer',
                      'playlistVideoRenderer',
                      'gridVideoRenderer',
                      'richItemRenderer'
                    ];

                    for (const key of rendererKeys) {
                      if (obj[key]) {
                        const data = getVideoData(obj[key]);
                        if (data && !videos.some(v => v.videoId === data.videoId)) {
                          videos.push({
                            videoId: data.videoId,
                            title: data.title,
                            channel: data.channel,
                            thumbnail: 'https://i.ytimg.com/vi/' + data.videoId + '/mqdefault.jpg',
                            url: 'https://www.youtube.com/watch?v=' + data.videoId,
                            duration: data.duration
                          });
                          console.log('[HISTORY] ytInitialData Video:', data.title.substring(0, 40));
                          if (videos.length >= maxVideos) return;
                        }
                      }
                    }

                    for (const key in obj) {
                      if (videos.length >= maxVideos) break;
                      const val = obj[key];
                      if (Array.isArray(val)) {
                        for (const item of val) {
                          if (videos.length >= maxVideos) break;
                          findVideos(item, depth + 1);
                        }
                      } else if (typeof val === 'object') {
                        findVideos(val, depth + 1);
                      }
                    }
                  };

                  findVideos(window.ytInitialData);
                }
              } catch (e) {
                console.error('[HISTORY] Error ytInitialData:', e);
              }
            }
            
            // Método 3: Fallback final - buscar cualquier link a video
            if (videos.length < maxVideos) {
              console.log('[HISTORY] Fallback: buscando links generales...');
              
              const allLinks = document.querySelectorAll('a[href*="/watch?v="]');
              
              for (const link of allLinks) {
                if (videos.length >= maxVideos) break;
                
                const href = link.getAttribute('href') || '';
                const videoMatch = href.match(/v=([a-zA-Z0-9_-]{11})/);
                if (!videoMatch) continue;
                
                const videoId = videoMatch[1];
                if (videos.some(v => v.videoId === videoId)) continue;
                
                let title = link.getAttribute('title') || link.textContent?.trim() || '';
                // Limpiar título si es muy largo o tiene basura
                if (title.length > 200) title = title.substring(0, 100);
                
                if (title && title.length > 3) {
                  videos.push({
                    videoId: videoId,
                    title: title,
                    channel: 'YouTube',
                    thumbnail: 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg',
                    url: 'https://www.youtube.com/watch?v=' + videoId,
                    duration: ''
                  });
                }
              }
            }
            
            console.log('[HISTORY] Total encontrados:', videos.length);;
            return { videos: videos.slice(0, maxVideos) };
          })()
        `;
        
        try {
          // Verificar si la ventana sigue existiendo antes de ejecutar
          if (auxWindow.isDestroyed()) {
            console.log('[HISTORY] Ventana cerrada antes de extraer');
            resolve({ success: false, videos: [] });
            return;
          }
          
          const result = await auxWindow.webContents.executeJavaScript(extractHistoryScript);
          
          if (result.error === 'not-logged-in') {
            console.log('[HISTORY] Usuario no logueado');
            resolve({ success: false, videos: [], error: 'not-logged-in' });
          } else {
            console.log('[HISTORY] Videos del historial:', result.videos.length);
            resolve({ success: true, videos: result.videos });
          }
        } catch (error) {
          // Ignorar error si es porque la ventana fue destruida
          if (error.message && error.message.includes('destroyed')) {
            console.log('[HISTORY] Ventana cerrada durante extracción');
            resolve({ success: false, videos: [] });
          } else {
            console.error('[HISTORY] Error extrayendo:', error);
            resolve({ success: false, videos: [] });
          }
        }
        } catch (error) {
          // Catch del try principal del did-finish-load
          if (error.message && error.message.includes('destroyed')) {
            console.log('[HISTORY] Ventana cerrada durante carga');
          } else {
            console.error('[HISTORY] Error en carga:', error);
          }
          resolve({ success: false, videos: [] });
        }
      });
      
      // Timeout de seguridad
      setTimeout(() => {
        console.log('[HISTORY] Timeout alcanzado');
        resolve({ success: false, videos: [] });
      }, 45000);
    });
  } catch (error) {
    console.error('[HISTORY] Error:', error);
    return { success: false, videos: [] };
  }
});

// ⭐ Flag para evitar loops de login
let loginProcessed = false;

// ===== BÚSQUEDA DE YOUTUBE =====
// Handler para buscar videos en YouTube
ipcMain.handle('search-youtube', async (event, query) => {
  console.log('[SEARCH] Buscando en YouTube:', query);
  
  try {
    const auxWindow = createAuxYoutubeWindow();
    const searchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
    
    return new Promise((resolve) => {
      auxWindow.loadURL(searchUrl);
      
      auxWindow.webContents.once('did-finish-load', async () => {
        console.log('[SEARCH] Página de búsqueda cargada, esperando contenido...');
        
        // Esperar a que YouTube renderice los resultados
        await new Promise(r => setTimeout(r, 3000));
        
        // Hacer scroll para cargar más resultados
        for (let i = 0; i < 5; i++) {
          await auxWindow.webContents.executeJavaScript('window.scrollTo(0, document.body.scrollHeight)');
          await new Promise(r => setTimeout(r, 800));
        }
        await new Promise(r => setTimeout(r, 1000));
        
        // Script para extraer videos de los resultados de búsqueda
        const extractSearchScript = `
          (function() {
            const maxVideos = 50;
            const videos = [];
            
            console.log('[SEARCH] Extrayendo resultados de búsqueda...');
            
            // Método 1: Usar ytInitialData que YouTube expone
            try {
              if (window.ytInitialData) {
                const findVideos = (obj, depth = 0) => {
                  if (videos.length >= maxVideos || depth > 25) return;
                  if (!obj || typeof obj !== 'object') return;
                  
                  // Buscar videoRenderer (videos normales)
                  if (obj.videoRenderer && obj.videoRenderer.videoId) {
                    const vr = obj.videoRenderer;
                    const videoId = vr.videoId;
                    
                    if (!videos.some(v => v.videoId === videoId)) {
                      const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || '';
                      const channel = vr.ownerText?.runs?.[0]?.text || 
                                     vr.longBylineText?.runs?.[0]?.text || 
                                     vr.shortBylineText?.runs?.[0]?.text || 'YouTube';
                      const duration = vr.lengthText?.simpleText || '';
                      const thumbnail = vr.thumbnail?.thumbnails?.[0]?.url || 
                                       'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg';
                      
                      // Verificar si es artista verificado
                      const isVerified = !!(vr.ownerBadges?.some(b => 
                        b.metadataBadgeRenderer?.style === 'BADGE_STYLE_TYPE_VERIFIED_ARTIST' ||
                        b.metadataBadgeRenderer?.style === 'BADGE_STYLE_TYPE_VERIFIED'
                      ));
                      
                      if (title && title.length > 0) {
                        videos.push({
                          videoId: videoId,
                          title: title,
                          channel: channel,
                          artist: channel,
                          thumbnail: thumbnail.startsWith('//') ? 'https:' + thumbnail : thumbnail,
                          url: 'https://www.youtube.com/watch?v=' + videoId,
                          duration: duration,
                          isVerified: isVerified
                        });
                        console.log('[SEARCH] Video:', title.substring(0, 40));
                      }
                    }
                  }
                  
                  // Recursión
                  for (const key in obj) {
                    if (videos.length >= maxVideos) break;
                    const val = obj[key];
                    if (Array.isArray(val)) {
                      for (const item of val) {
                        if (videos.length >= maxVideos) break;
                        findVideos(item, depth + 1);
                      }
                    } else if (typeof val === 'object') {
                      findVideos(val, depth + 1);
                    }
                  }
                };
                
                findVideos(window.ytInitialData);
              }
            } catch (e) {
              console.error('[SEARCH] Error ytInitialData:', e);
            }
            
            // Método 2: Fallback - buscar en el DOM
            if (videos.length < 5) {
              console.log('[SEARCH] Fallback: buscando en DOM...');
              
              const videoElements = document.querySelectorAll('ytd-video-renderer, ytd-compact-video-renderer');
              
              for (const el of videoElements) {
                if (videos.length >= maxVideos) break;
                
                const linkEl = el.querySelector('a#video-title, a.yt-simple-endpoint[href*="/watch?v="]');
                if (!linkEl) continue;
                
                const href = linkEl.getAttribute('href') || '';
                const videoMatch = href.match(/v=([a-zA-Z0-9_-]{11})/);
                if (!videoMatch) continue;
                
                const videoId = videoMatch[1];
                if (videos.some(v => v.videoId === videoId)) continue;
                
                const title = linkEl.getAttribute('title') || linkEl.textContent?.trim() || '';
                const channelEl = el.querySelector('a.yt-simple-endpoint.style-scope.yt-formatted-string, ytd-channel-name a');
                const channel = channelEl?.textContent?.trim() || 'YouTube';
                const durationEl = el.querySelector('span.ytd-thumbnail-overlay-time-status-renderer, #text.ytd-thumbnail-overlay-time-status-renderer');
                const duration = durationEl?.textContent?.trim() || '';
                
                if (title && title.length > 0) {
                  videos.push({
                    videoId: videoId,
                    title: title,
                    channel: channel,
                    artist: channel,
                    thumbnail: 'https://i.ytimg.com/vi/' + videoId + '/hqdefault.jpg',
                    url: 'https://www.youtube.com/watch?v=' + videoId,
                    duration: duration,
                    isVerified: false
                  });
                }
              }
            }
            
            console.log('[SEARCH] Total encontrados:', videos.length);
            return { videos: videos.slice(0, 50) };
          })()
        `;
        
        try {
          const result = await auxWindow.webContents.executeJavaScript(extractSearchScript);
          console.log('[SEARCH] Resultados extraídos:', result.videos?.length || 0);
          resolve({ success: true, videos: result.videos || [] });
        } catch (error) {
          console.error('[SEARCH] Error extrayendo:', error);
          resolve({ success: false, videos: [] });
        }
      });
      
      // Timeout de seguridad
      setTimeout(() => {
        console.log('[SEARCH] Timeout alcanzado');
        resolve({ success: false, videos: [] });
      }, 30000);
    });
  } catch (error) {
    console.error('[SEARCH] Error:', error);
    return { success: false, videos: [] };
  }
});

// ===== TOP 100 GLOBAL - YOUTUBE CHARTS OFICIAL =====
// Handler para obtener el Top 100 de https://charts.youtube.com/charts/TopSongs/global/weekly
ipcMain.handle('get-youtube-charts', async () => {
  console.log('[CHARTS] Obteniendo Top 100 Global de YouTube Charts...');
  
  try {
    const auxWindow = createAuxYoutubeWindow();
    const chartsUrl = 'https://charts.youtube.com/charts/TopSongs/global/weekly';
    
    return new Promise((resolve) => {
      auxWindow.loadURL(chartsUrl);
      
      auxWindow.webContents.once('did-finish-load', async () => {
        console.log('[CHARTS] Página de YouTube Charts cargada, esperando renderizado...');
        
        // Esperar más tiempo para que la SPA cargue completamente
        await new Promise(r => setTimeout(r, 8000));
        
        // Hacer múltiples scrolls para asegurar que carga todo
        for (let i = 0; i < 25; i++) {
          await auxWindow.webContents.executeJavaScript('window.scrollTo(0, document.body.scrollHeight)');
          await new Promise(r => setTimeout(r, 400));
        }
        await new Promise(r => setTimeout(r, 3000));
        
        // Script de extracción mejorado para charts.youtube.com
        const extractChartsScript = `
          (function() {
            const songs = [];
            const maxSongs = 100;
            
            console.log('[CHARTS] Iniciando extracción...');
            console.log('[CHARTS] URL:', window.location.href);
            
            // ========== MÉTODO 1: Buscar ytmc-entry-row (estructura oficial de YouTube Charts) ==========
            try {
              const rows = document.querySelectorAll('ytmc-entry-row');
              console.log('[CHARTS] ytmc-entry-row encontrados:', rows.length);
              
              for (const row of rows) {
                if (songs.length >= maxSongs) break;
                
                // Buscar thumbnail que tiene el endpoint con la URL del video
                const thumbnail = row.querySelector('img.tracks-thumbnail, img#thumbnail');
                let videoId = null;
                
                // Intentar obtener videoId del endpoint del thumbnail
                if (thumbnail) {
                  const endpoint = thumbnail.getAttribute('endpoint');
                  if (endpoint) {
                    try {
                      const endpointData = JSON.parse(endpoint);
                      const url = endpointData?.urlEndpoint?.url || '';
                      const match = url.match(/v=([a-zA-Z0-9_-]{11})/);
                      if (match) videoId = match[1];
                    } catch(e) {}
                  }
                }
                
                // Si no, buscar en cualquier link
                if (!videoId) {
                  const link = row.querySelector('a[href*="watch?v="]');
                  if (link) {
                    const href = link.getAttribute('href') || '';
                    const match = href.match(/v=([a-zA-Z0-9_-]{11})/);
                    if (match) videoId = match[1];
                  }
                }
                
                // También buscar en el div#entity-title que tiene endpoint
                if (!videoId) {
                  const titleDiv = row.querySelector('#entity-title[endpoint]');
                  if (titleDiv) {
                    const endpoint = titleDiv.getAttribute('endpoint');
                    try {
                      const endpointData = JSON.parse(endpoint);
                      const url = endpointData?.urlEndpoint?.url || '';
                      const match = url.match(/v=([a-zA-Z0-9_-]{11})/);
                      if (match) videoId = match[1];
                    } catch(e) {}
                  }
                }
                
                if (!videoId || songs.some(s => s.videoId === videoId)) continue;
                
                // Extraer título del div.title#entity-title
                let title = '';
                const titleEl = row.querySelector('#entity-title, .title');
                if (titleEl) {
                  title = titleEl.textContent?.trim() || '';
                }
                
                // Extraer artista del div.subtitle#artist-names
                let artist = '';
                const artistEl = row.querySelector('#artist-names, .subtitle, .artistName');
                if (artistEl) {
                  // Puede haber múltiples artistas con clase .artistName
                  const artistNames = artistEl.querySelectorAll('.artistName');
                  if (artistNames.length > 0) {
                    artist = Array.from(artistNames).map(a => a.textContent?.trim()).filter(a => a).join(', ');
                  } else {
                    artist = artistEl.textContent?.trim() || '';
                  }
                }
                
                // Obtener thumbnail de mayor calidad
                let thumbnailUrl = 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg';
                if (thumbnail && thumbnail.src) {
                  // La thumbnail de charts suele ser de mejor calidad
                  thumbnailUrl = thumbnail.src.replace(/=w\\d+-h\\d+/, '=w480-h480');
                }
                
                if (title && title.length > 1) {
                  songs.push({
                    rank: songs.length + 1,
                    videoId: videoId,
                    title: title.substring(0, 150),
                    artist: artist || 'YouTube Music',
                    channel: artist || 'YouTube Music',
                    thumbnail: thumbnailUrl,
                    url: 'https://www.youtube.com/watch?v=' + videoId
                  });
                }
              }
            } catch (e) {
              console.log('[CHARTS] Error método 1:', e.message);
            }
            
            // ========== MÉTODO 2: Buscar en title-container si método 1 falló ==========
            if (songs.length < 20) {
              console.log('[CHARTS] Método 2: Buscando en title-container...');
              try {
                const containers = document.querySelectorAll('.title-container');
                
                for (const container of containers) {
                  if (songs.length >= maxSongs) break;
                  
                  const titleEl = container.querySelector('#entity-title');
                  const artistEl = container.querySelector('#artist-names');
                  
                  if (!titleEl) continue;
                  
                  // Buscar videoId en endpoint
                  let videoId = null;
                  const endpoint = titleEl.getAttribute('endpoint');
                  if (endpoint) {
                    try {
                      const endpointData = JSON.parse(endpoint);
                      const url = endpointData?.urlEndpoint?.url || '';
                      const match = url.match(/v=([a-zA-Z0-9_-]{11})/);
                      if (match) videoId = match[1];
                    } catch(e) {}
                  }
                  
                  if (!videoId || songs.some(s => s.videoId === videoId)) continue;
                  
                  const title = titleEl.textContent?.trim() || '';
                  let artist = '';
                  if (artistEl) {
                    const artistNames = artistEl.querySelectorAll('.artistName');
                    if (artistNames.length > 0) {
                      artist = Array.from(artistNames).map(a => a.textContent?.trim()).filter(a => a).join(', ');
                    } else {
                      artist = artistEl.textContent?.trim() || '';
                    }
                  }
                  
                  if (title) {
                    songs.push({
                      rank: songs.length + 1,
                      videoId: videoId,
                      title: title.substring(0, 150),
                      artist: artist || 'YouTube Music',
                      channel: artist || 'YouTube Music',
                      thumbnail: 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg',
                      url: 'https://www.youtube.com/watch?v=' + videoId
                    });
                  }
                }
              } catch (e) {
                console.log('[CHARTS] Error método 2:', e.message);
              }
            }
            
            // ========== MÉTODO 3: Fallback - buscar todos los links con watch?v= ==========
            if (songs.length < 20) {
              console.log('[CHARTS] Método 3: Fallback links...');
              try {
                const allLinks = document.querySelectorAll('a[href*="watch?v="], [endpoint*="watch?v="]');
                
                for (const el of allLinks) {
                  if (songs.length >= maxSongs) break;
                  
                  let videoId = null;
                  const href = el.getAttribute('href') || '';
                  const endpoint = el.getAttribute('endpoint') || '';
                  
                  let match = href.match(/v=([a-zA-Z0-9_-]{11})/);
                  if (!match && endpoint) {
                    match = endpoint.match(/v=([a-zA-Z0-9_-]{11})/);
                  }
                  
                  if (!match) continue;
                  videoId = match[1];
                  
                  if (songs.some(s => s.videoId === videoId)) continue;
                  
                  songs.push({
                    rank: songs.length + 1,
                    videoId: videoId,
                    title: 'Top ' + (songs.length + 1),
                    artist: 'YouTube Music',
                    channel: 'YouTube Music',
                    thumbnail: 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg',
                    url: 'https://www.youtube.com/watch?v=' + videoId
                  });
                }
              } catch (e) {
                console.log('[CHARTS] Error método 3:', e.message);
              }
            }
            
            console.log('[CHARTS] Total extraídos:', songs.length);
            return { songs: songs.slice(0, maxSongs) };
          })()
        `;
        
        try {
          const result = await auxWindow.webContents.executeJavaScript(extractChartsScript);
          console.log('[CHARTS] Top extraído:', result.songs?.length || 0, 'canciones');
          
          // Si charts.youtube.com no funciona, usar fallback de búsqueda
          if (!result.songs || result.songs.length < 10) {
            console.log('[CHARTS] Pocos resultados de Charts, usando fallback de búsqueda...');
            
            // Fallback: usar búsqueda de YouTube
            const searchUrl = 'https://www.youtube.com/results?search_query=top+100+global+songs+2025&sp=EgIQAQ%253D%253D';
            
            await new Promise(r => {
              auxWindow.loadURL(searchUrl);
              auxWindow.webContents.once('did-finish-load', async () => {
                await new Promise(wait => setTimeout(wait, 3000));
                
                for (let i = 0; i < 10; i++) {
                  await auxWindow.webContents.executeJavaScript('window.scrollTo(0, document.body.scrollHeight)');
                  await new Promise(wait => setTimeout(wait, 400));
                }
                
                const fallbackScript = `
                  (function() {
                    const songs = [];
                    try {
                      if (window.ytInitialData) {
                        const findVideos = (obj, depth = 0) => {
                          if (songs.length >= 100 || depth > 25) return;
                          if (!obj || typeof obj !== 'object') return;
                          
                          if (obj.videoRenderer && obj.videoRenderer.videoId) {
                            const vr = obj.videoRenderer;
                            const videoId = vr.videoId;
                            
                            if (!songs.some(s => s.videoId === videoId)) {
                              songs.push({
                                rank: songs.length + 1,
                                videoId: videoId,
                                title: vr.title?.runs?.[0]?.text || 'Top ' + (songs.length + 1),
                                artist: vr.ownerText?.runs?.[0]?.text || 'YouTube Music',
                                channel: vr.ownerText?.runs?.[0]?.text || 'YouTube Music',
                                thumbnail: 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg',
                                url: 'https://www.youtube.com/watch?v=' + videoId,
                                duration: vr.lengthText?.simpleText || ''
                              });
                            }
                          }
                          
                          for (const key in obj) {
                            if (songs.length >= 100) break;
                            const val = obj[key];
                            if (Array.isArray(val)) {
                              for (const item of val) findVideos(item, depth + 1);
                            } else if (typeof val === 'object') {
                              findVideos(val, depth + 1);
                            }
                          }
                        };
                        findVideos(window.ytInitialData);
                      }
                    } catch(e) {}
                    return { songs };
                  })()
                `;
                
                try {
                  const fbResult = await auxWindow.webContents.executeJavaScript(fallbackScript);
                  console.log('[CHARTS] Fallback extraído:', fbResult.songs?.length || 0);
                  resolve({ success: true, songs: fbResult.songs || [] });
                } catch(e) {
                  resolve({ success: true, songs: result.songs || [] });
                }
                r();
              });
            });
            return;
          }
          
          resolve({ success: true, songs: result.songs });
        } catch (error) {
          console.error('[CHARTS] Error extrayendo:', error);
          resolve({ success: false, songs: [] });
        }
      });
      
      // Timeout de seguridad
      setTimeout(() => {
        console.log('[CHARTS] Timeout alcanzado');
        resolve({ success: false, songs: [] });
      }, 60000);
    });
  } catch (error) {
    console.error('[CHARTS] Error:', error);
    return { success: false, songs: [] };
  }
});

// ⭐ Handler de login - usar datos ya extraídos por backend-preload.js
ipcMain.on('youtube-login-success', (event, userInfo) => {
  // Evitar procesar múltiples veces
  if (loginProcessed) {
    console.log('[LOGIN] Login ya procesado, ignorando...');
    return;
  }
  
  console.log('[LOGIN] YouTube login detectado:', userInfo);
  loginProcessed = true;
  
  // Los datos ya vienen extraídos desde backend-preload.js
  // No necesitamos volver a extraer, solo enviar al renderer
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('youtube-user-logged-in', {
      success: true,
      user: {
        id: Date.now(),
        name: userInfo.userName || 'YouTube User',
        handle: userInfo.userHandle || '',
        email: userInfo.userHandle || '', // Usar handle como "email" ya que YouTube no expone email
        avatar: userInfo.userAvatar || '',
        youtubeConnected: true,
        loginDate: new Date().toISOString()
      }
    });
    
    console.log('[NOTIFY] Notificación enviada a la app principal');
    
    // ⭐ NO refrescar historial aquí - ya se carga automáticamente al inicio
    // Esto evita peticiones duplicadas que sobrescriben el historial con menos videos
  }
  
  // ⭐ Cerrar loginWindow después del login exitoso (siempre, excepto en DEV)
  const isDevMode = process.argv.includes('--dev');
  
  console.log('[LOGIN] Verificando cierre de ventana - isDevMode:', isDevMode, 'loginWindow existe:', !!loginWindow);
  
  if (!isDevMode && loginWindow && !loginWindow.isDestroyed()) {
    console.log('[LOGIN] Programando cierre de ventana de login en 1 segundo...');
    setTimeout(() => {
      if (loginWindow && !loginWindow.isDestroyed()) {
        console.log('[LOGIN] Cerrando ventana de login automáticamente');
        try {
          loginWindow.close();
        } catch (e) {
          console.error('[LOGIN] Error cerrando ventana:', e);
        }
        loginWindow = null;
      } else {
        console.log('[LOGIN] La ventana ya no existe o fue destruida');
      }
    }, 1000);
  } else if (isDevMode) {
    console.log('[DEV] Login window permanece abierta para debug');
  } else {
    console.log('[LOGIN] No hay loginWindow para cerrar');
  }
  
  // Reset flag después de un tiempo MUY largo para evitar loops
  setTimeout(() => {
    loginProcessed = false;
  }, 120000); // 2 minutos
});

ipcMain.on('youtube-logout-success', (event) => {
  console.log('[LOGOUT] YouTube logout detectado');
  
  // ⭐ Resetear flag de login para permitir nuevo login
  loginProcessed = false;
  console.log('[LOGOUT] Flag loginProcessed reseteado');
  
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('youtube-user-logged-out', {
      success: true,
      timestamp: new Date().toISOString()
    });
    
    console.log('[NOTIFY] Notificación de logout enviada a la app principal');
  }
});

// IPC Handler: Open YouTube window
ipcMain.handle('open-youtube-window', async (event, { videoUrl, title, artist }) => {
  try {
    if (youtubeWindow && !youtubeWindow.isDestroyed()) {
      console.log('[REUSE] Reutilizando ventana de YouTube existente');
      youtubeWindow.loadURL(videoUrl);
      // ⭐ NO mostrar la ventana - mantenerla oculta para reproducción en background
      // youtubeWindow.show();
      // youtubeWindow.focus();
      return { success: true, reused: true };
    }

    youtubeWindow = createYouTubeWindow(false);

    console.log('[URL] Abriendo YouTube en nueva ventana:', videoUrl);

    youtubeWindow.loadURL(videoUrl);

    // ⭐ NO mostrar la ventana - mantenerla oculta
    // youtubeWindow.once('ready-to-show', () => {
    //   youtubeWindow.show();
    // });

    // ⭐ CORRECCIÓN: Script de detección sin acceso a sessionStorage
    youtubeWindow.webContents.on('did-finish-load', () => {
      console.log('[WINDOW] YouTube cargado - Inyectando script de monitoreo');
      
      const detectionScript = `
        (function() {
          console.log('[SCRIPT] YouTube monitoring script injected');
          
          let lastLoginStatus = null;
          let loginCheckInterval = null;
          
          function getLoginStatus() {
            try {
              const loginBtn = document.querySelector('a[aria-label="Acceder"], a[href*="ServiceLogin"], a[href*="signin"]');
              const logoutBtn = document.querySelector('a[href="/logout"], a[href*="logout"]');
              const userMenu = document.querySelector('button[aria-label*="Create a post"], a[href="/channel/"]');
              const userIcon = document.querySelector('ytd-topbar-menu-button-renderer button img');
              const menuSection = document.querySelector('yt-multi-page-menu-section-renderer a[href="/logout"]');
              
              const isLoggedIn = !!(logoutBtn || menuSection || userMenu || userIcon);
              const isLoggedOut = !!loginBtn && !logoutBtn && !menuSection;
              
              return { isLoggedIn, isLoggedOut };
            } catch (error) {
              console.error('Error getting login status:', error);
              return { isLoggedIn: false, isLoggedOut: false };
            }
          }
          
          function checkYouTubeStatus() {
            try {
              const status = getLoginStatus();
              const currentStatus = status.isLoggedIn;
              
              if (currentStatus !== lastLoginStatus && lastLoginStatus !== null) {
                lastLoginStatus = currentStatus;
                
                if (currentStatus === true) {
                  console.log('[OK] Usuario LOGUEADO en YouTube');
                  if (window.youtubeAPI && window.youtubeAPI.notifyLogin) {
                    window.youtubeAPI.notifyLogin({
                      isLoggedIn: true,
                      timestamp: new Date().toISOString(),
                      userName: 'YouTube User',
                      userEmail: 'user@youtube.com'
                    });
                  }
                } else if (currentStatus === false) {
                  console.log('[LOGOUT] Usuario DESLOGUEADO en YouTube');
                  if (window.youtubeAPI && window.youtubeAPI.notifyLogout) {
                    window.youtubeAPI.notifyLogout({
                      isLoggedIn: false,
                      timestamp: new Date().toISOString()
                    });
                  }
                }
              } else if (lastLoginStatus === null) {
                lastLoginStatus = currentStatus;
                console.log('[INIT] Estado inicial:', currentStatus ? 'LOGGED IN' : 'NOT LOGGED IN');
              }
            } catch (error) {
              console.error('Error checking YouTube status:', error);
            }
          }
          
          let observer;
          try {
            const config = {
              childList: true,
              subtree: true
            };
            
            const observeTarget = document.body || document.documentElement;
            
            if (observeTarget) {
              observer = new MutationObserver(() => {
                checkYouTubeStatus();
              });
              
              observer.observe(observeTarget, config);
              console.log('[OBSERVER] MutationObserver iniciado');
            }
          } catch (error) {
            console.error('Error creating MutationObserver:', error);
          }
          
          setTimeout(() => {
            loginCheckInterval = setInterval(() => {
              checkYouTubeStatus();
            }, 2000);
            
            checkYouTubeStatus();
          }, 2000);
          
          window.addEventListener('beforeunload', () => {
            if (observer) observer.disconnect();
            if (loginCheckInterval) clearInterval(loginCheckInterval);
          });
          
          console.log('[OK] YouTube monitoring completamente iniciado');
        })();
      `;
      
      youtubeWindow.webContents.executeJavaScript(detectionScript)
        .then(() => console.log('[OK] Script de monitoreo inyectado'))
        .catch(err => console.error('Error inyectando script:', err));
    });

    if (process.argv.includes('--dev')) {
      youtubeWindow.webContents.openDevTools();
    }

    const ytWin = youtubeWindow;
    youtubeWindow.on('closed', () => {
      if (youtubeWindow === ytWin) {
        youtubeWindow = null;
      }
    });

    return { success: true, created: true };
  } catch (error) {
    console.error('Error opening YouTube window:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handler: Close YouTube window
ipcMain.handle('close-youtube-window', async () => {
  if (youtubeWindow && !youtubeWindow.isDestroyed()) {
    youtubeWindow.close();
    youtubeWindow = null;
    return { success: true };
  }
  return { success: false, error: 'YouTube window not found' };
});

// ⭐ CORRECCIÓN: Logout mejorado
ipcMain.handle('logout-youtube', async () => {
  try {
    console.log('[LOGOUT] Iniciando logout de YouTube...');
    
    const ytSession = getYouTubeSession();
    
    try {
      await ytSession.clearStorageData({
        storages: ['cookies', 'localstorage', 'sessionstorage', 'indexdb', 'websql', 'serviceworkers', 'cachestorage']
      });
      console.log('[LOGOUT] Storage y cookies limpiadas correctamente');
    } catch (e) {
      console.error('[LOGOUT] Error limpiando storage:', e);
    }
    
    if (youtubeWindow && !youtubeWindow.isDestroyed()) {
      console.log('[LOGOUT] Navegando a logout en ventana existente...');
      
      youtubeWindow.loadURL('https://accounts.google.com/Logout');
      
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      if (youtubeWindow && !youtubeWindow.isDestroyed()) {
        youtubeWindow.loadURL('https://www.youtube.com');
        console.log('[LOGOUT] YouTube recargado después del logout');
      }
    }
    
    if (loginWindow && !loginWindow.isDestroyed()) {
      loginWindow.close();
      loginWindow = null;
    }
    
    return { success: true };
  } catch (error) {
    console.error('[LOGOUT] Error en logout:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handler: Get YouTube login status
ipcMain.handle('get-youtube-login-status', async () => {
  try {
    if (youtubeWindow && !youtubeWindow.isDestroyed()) {
      const loginStatusScript = `
        (function() {
          const topbarMenuButton = document.querySelector('ytd-topbar-menu-button-renderer');
          const hasAvatarImg = topbarMenuButton?.querySelector('img[src*="ggpht"]') || 
                               topbarMenuButton?.querySelector('img[src*="lh3"]');
          const profileImage = hasAvatarImg || 
                              document.querySelector('#avatar-button img[src*="ggpht"]') || 
                              document.querySelector('button img[src*="lh3"]');
          
          return !!(profileImage || (hasAvatarImg));
        })();
      `;
      
      const isLoggedIn = await youtubeWindow.webContents.executeJavaScript(loginStatusScript);
      
      return { 
        success: true, 
        isLoggedIn: isLoggedIn,
        timestamp: new Date().toISOString()
      };
    }
    
    return { 
      success: false, 
      isLoggedIn: false,
      error: 'YouTube window not available' 
    };
  } catch (error) {
    console.error('[GET-STATUS] Error getting YouTube status:', error);
    return { 
      success: false, 
      isLoggedIn: false,
      error: error.message 
    };
  }
});

// IPC Handler: Force check login status
ipcMain.handle('force-check-youtube-login', async () => {
  try {
    if (youtubeWindow && !youtubeWindow.isDestroyed()) {
      const checkScript = `
        if (typeof checkYouTubeStatus === 'function') {
          checkYouTubeStatus();
        }
      `;
      
      await youtubeWindow.webContents.executeJavaScript(checkScript);
      return { success: true };
    }
    
    return { success: false, error: 'YouTube window not available' };
  } catch (error) {
    console.error('[FORCE-CHECK] Error forcing check:', error);
    return { success: false, error: error.message };
  }
});

// ⭐ CORRECCIÓN CRÍTICA: Ventana de login separada que comparte sesión
ipcMain.handle('open-youtube-login-window', async () => {
  try {
    console.log('[LOGIN] Abriendo ventana de login de YouTube...');
    
    // ⭐ Resetear flag para permitir nuevo login
    loginProcessed = false;
    
    // No cerrar youtubeWindow, solo crear loginWindow
    if (loginWindow && !loginWindow.isDestroyed()) {
      console.log('[LOGIN] Cerrando ventana de login anterior');
      loginWindow.close();
      loginWindow = null;
    }

    // Crear ventana pequeña modal para login
    loginWindow = new BrowserWindow({
      width: 500,
      height: 700,
      minWidth: 400,
      minHeight: 600,
      show: false,
      backgroundColor: '#000000',
      icon: path.join(__dirname, '../renderer/assets/icons/icon.ico'),
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        // ⭐ IMPORTANTE: Usar preload ESPECÍFICO para login
        // NO usar backend-preload.js porque envía eventos de video-info
        preload: path.join(__dirname, '../preload/login-preload.js'),
        partition: 'persist:youtube', // ⭐ Misma partition = misma sesión
        backgroundThrottling: false
      },
      autoHideMenuBar: true,
      parent: mainWindow,
      modal: true
    });
    
    console.log('[LOGIN] Ventana pequeña de login creada (compartiendo sesión)');
    
    // URL directa de login de Google para YouTube
    loginWindow.loadURL('https://accounts.google.com/ServiceLogin?service=youtube&hl=es&continue=https://www.youtube.com/signin?action_handle_signin=true&next=%2F');

    loginWindow.once('ready-to-show', () => {
      console.log('[LOGIN] Ventana lista, mostrando...');
      loginWindow.show();
      loginWindow.focus();
    });

    if (process.argv.includes('--dev')) {
      loginWindow.webContents.openDevTools({ mode: 'detach' });
    }

    // Inyectar script de detección de login
    loginWindow.webContents.on('did-finish-load', () => {
      console.log('[LOGIN] Página de login cargada, inyectando detector...');
      
      const loginDetectionScript = `
        (function() {
          console.log('[LOGIN-DETECT] Script de detección iniciado');
          
          let checkInterval = null;
          
          function checkIfLoggedIn() {
            try {
              const isYouTube = window.location.hostname.includes('youtube.com');
              const hasUserButton = !!document.querySelector('ytd-topbar-menu-button-renderer img[src*="ggpht"], #avatar img[src*="ggpht"]');
              
              if (isYouTube && hasUserButton) {
                console.log('[LOGIN-DETECT] Login exitoso detectado!');
                
                // ⭐ Abrir menú de usuario para extraer datos correctos
                const userButton = document.querySelector('ytd-topbar-menu-button-renderer button, #avatar-btn');
                
                if (userButton) {
                  userButton.click();
                  
                  setTimeout(() => {
                    const accountHeader = document.querySelector('ytd-active-account-header-renderer');
                    let userName = 'YouTube User';
                    let userHandle = '';
                    let avatarUrl = '';
                    
                    if (accountHeader) {
                      const nameEl = accountHeader.querySelector('#account-name');
                      if (nameEl) userName = nameEl.textContent?.trim() || nameEl.getAttribute('title') || 'YouTube User';
                      
                      const handleEl = accountHeader.querySelector('#channel-handle');
                      if (handleEl) userHandle = handleEl.textContent?.trim() || handleEl.getAttribute('title') || '';
                      
                      const avatarImg = accountHeader.querySelector('#avatar img');
                      if (avatarImg && avatarImg.src) avatarUrl = avatarImg.src;
                    }
                    
                    // Fallback avatar
                    if (!avatarUrl) {
                      const topbarImg = document.querySelector('ytd-topbar-menu-button-renderer img[src*="ggpht"]');
                      if (topbarImg) avatarUrl = topbarImg.src;
                    }
                    
                    // Cerrar menú
                    userButton.click();
                    
                    console.log('[LOGIN-DETECT] Datos:', userName, userHandle, avatarUrl ? 'avatar OK' : 'sin avatar');
                    
                    // Usar loginAPI (del login-preload.js) o youtubeAPI (fallback)
                    const api = window.loginAPI || window.youtubeAPI;
                    if (api && api.notifyLogin) {
                      api.notifyLogin({
                        isLoggedIn: true,
                        userName: userName,
                        userHandle: userHandle,
                        userAvatar: avatarUrl,
                        timestamp: new Date().toISOString()
                      });
                    } else {
                      console.error('[LOGIN-DETECT] No API disponible para notificar login');
                    }
                  }, 500);
                }
                
                if (checkInterval) {
                  clearInterval(checkInterval);
                  checkInterval = null;
                }
              }
            } catch (e) {
              console.error('[LOGIN-DETECT] Error:', e);
            }
          }
          
          checkInterval = setInterval(checkIfLoggedIn, 500);
          
          window.addEventListener('load', checkIfLoggedIn);
          
          window.addEventListener('beforeunload', () => {
            if (checkInterval) clearInterval(checkInterval);
          });
          
          console.log('[LOGIN-DETECT] Detector configurado');
        })();
      `;
      
      loginWindow.webContents.executeJavaScript(loginDetectionScript)
        .then(() => console.log('[LOGIN] Script de detección inyectado'))
        .catch(err => console.error('[LOGIN] Error inyectando script:', err));
    });

    loginWindow.on('closed', () => {
      console.log('[LOGIN] Ventana de login cerrada');
      loginWindow = null;
      
      // Recargar youtubeWindow para actualizar sesión
      if (youtubeWindow && !youtubeWindow.isDestroyed()) {
        console.log('[LOGIN] Recargando ventana de YouTube para actualizar sesión...');
        const currentUrl = youtubeWindow.webContents.getURL();
        youtubeWindow.loadURL(currentUrl);
      }
    });

    return { success: true };
  } catch (error) {
    console.error('[LOGIN] Error abriendo ventana de login:', error);
    return { success: false, error: error.message };
  }
});

// App lifecycle


app.whenReady().then(() => {
  createMainWindow();

  // Mantener reproducción estable en segundo plano (evita suspensión del sistema)
  if (powerSaveBlocker && !powerSaveBlocker.isStarted(powerSaveBlockerId || -1)) {
    powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
    console.log('[POWER] powerSaveBlocker started:', powerSaveBlockerId);
  }

  // ⭐ Inicializar Auto-Updater
  appUpdater = new AppUpdater();

  // ⭐ Inicializar Discord Rich Presence
  discordRPC.initialize();

  // Crear YouTube window automáticamente al iniciar
  setTimeout(() => {
    if (!youtubeWindow || youtubeWindow.isDestroyed()) {
      youtubeWindow = createYouTubeWindow(false);

      console.log('[YOUTUBE] YouTube window creada al iniciar (compartiendo sesión persistente)');
      youtubeWindow.loadURL('https://www.youtube.com');

      // Mostrar y abrir DevTools en dev mode
      if (process.argv.includes('--dev')) {
        youtubeWindow.show(); // Mostrar inmediatamente
        youtubeWindow.webContents.openDevTools({ mode: 'detach' });
        console.log('[DEV] YouTube window visible con DevTools');
      }

      // Inyectar script de monitoreo cuando cargue
      youtubeWindow.webContents.on('did-finish-load', () => {
        console.log('[YOUTUBE] YouTube cargado - Inyectando script de monitoreo');

        const monitoringScript = `
          (function() {
            console.log('[MONITOR] YouTube monitoring iniciado');

            window.checkYouTubeStatus = function() {
              try {
                const hasAvatar = !!document.querySelector('#avatar img, ytd-topbar-menu-button-renderer img');
                const hasLogout = !!document.querySelector('a[href*="logout"]');
                const isLoggedIn = hasAvatar || hasLogout;

                console.log('[MONITOR] Estado actual:', isLoggedIn ? 'LOGGED IN' : 'NOT LOGGED IN');

                return isLoggedIn;
              } catch (e) {
                console.error('[MONITOR] Error:', e);
                return false;
              }
            };

            setTimeout(() => {
              window.checkYouTubeStatus();
            }, 2000);
          })();
        `;

        youtubeWindow.webContents.executeJavaScript(monitoringScript)
          .catch(err => console.error('[YOUTUBE] Error inyectando monitor:', err));
      });

      const ytWin = youtubeWindow;
      youtubeWindow.on('closed', () => {
        if (youtubeWindow === ytWin) {
          youtubeWindow = null;
        }
      });
    }
  }, 500);

  // Forzar ventana de update en modo desarrollo DESPUÉS de que mainWindow esté completamente visible
  // Forzar ventana de update SOLO en modo desarrollo explícito (--dev flag)
  const isDevMode = process.argv.includes('--dev');
  const isPackaged = app.isPackaged;
  
  console.log('========================================');
  console.log('🔍 DIAGNÓSTICO DE ENTORNO:');
  console.log('   app.isPackaged:', isPackaged);
  console.log('   isDevMode (--dev flag):', isDevMode);
  console.log('   process.argv:', process.argv);
  console.log('   Versión:', app.getVersion());
  console.log('========================================');
  
  if (isDevMode) {
    console.log('🔧 Modo desarrollo detectado - forzando modal de update');
    
    // Notificar INMEDIATAMENTE al renderer que se va a abrir el modal
    // para que bloquee el loader desde el inicio
    setTimeout(() => {
      if (mainWindow && !mainWindow.isDestroyed()) {
        mainWindow.webContents.send('update-modal-opened');
      }
    }, 500);
    
    // Función para mostrar el modal de update
    const showDevUpdateModal = () => {
      setTimeout(() => {
        if (appUpdater && typeof appUpdater.promptInstallUpdate === 'function') {
          console.log('🔧 Mostrando modal de update en modo dev');
          appUpdater.promptInstallUpdate({
            version: '2.0.99-dev',
            releaseNotes: [
              { version: '2.0.99-dev', notes: '<ul><li>🚀 Modo desarrollador: ventana forzada</li><li>✨ Prueba de UI de updates</li><li>📝 Notas largas para probar el layout y el scroll en la ventana de actualización.</li></ul>', date: new Date().toISOString().slice(0, 10) },
              { version: '2.0.98-dev', notes: '<ul><li>🐛 Corrección de bugs menores</li><li>⚡ Mejoras de rendimiento</li></ul>', date: '2026-01-30' },
              { version: '2.0.97-dev', notes: '<ul><li>🎨 Nuevo diseño del modal</li><li>🔧 Ajustes de sincronización</li></ul>', date: '2026-01-29' }
            ]
          });
        }
      }, 3500);
    };
    
    // Esperar a que mainWindow esté visible
    if (mainWindow) {
      if (mainWindow.webContents.isLoading()) {
        mainWindow.webContents.once('did-finish-load', showDevUpdateModal);
      } else {
        showDevUpdateModal();
      }
    }
  } else {
    // PRODUCCIÓN: Verificar actualizaciones pendientes o buscar nuevas
    console.log('🚀 MODO PRODUCCIÓN - Iniciando verificación de actualizaciones...');
    
    // Enviar log al renderer
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('update-log', '🚀 MODO PRODUCCIÓN - Verificando actualizaciones...');
    }
    
    setTimeout(async () => {
      if (appUpdater) {
        console.log('📦 appUpdater existe, verificando...');
        
        // Enviar log al renderer
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update-log', '📦 Verificando actualizaciones pendientes...');
        }
        
        // Primero verificar si hay actualización pendiente guardada
        const hasPending = await appUpdater.checkAndShowPendingUpdate();
        console.log('📦 ¿Hay actualización pendiente?', hasPending);
        
        // Si no hay pendiente, buscar nuevas actualizaciones
        if (!hasPending) {
          console.log('🔍 No hay pendiente, buscando nuevas actualizaciones...');
          if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-log', '🔍 Buscando nuevas actualizaciones en GitHub...');
          }
          
          try {
            // Log versión actual
            const { app: electronApp } = require('electron');
            const https = require('https');
            const currentVer = electronApp.getVersion();
            console.log('📌 [MAIN] Versión actual de la app:', currentVer);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('update-log', '📌 Versión instalada: ' + currentVer);
            }
            
            console.log('🔍 [MAIN] Llamando appUpdater.checkForUpdatesAndNotify()...');
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('update-log', '🔍 Iniciando verificación con appUpdater...');
            }

            await appUpdater.checkForUpdatesAndNotify();
            
          } catch (err) {
            console.error('❌ [MAIN] Error general:', err);
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('update-log', '❌ Error: ' + err.message);
            }
          }
        }
      } else {
        console.log('❌ appUpdater es NULL!');
        if (mainWindow && !mainWindow.isDestroyed()) {
          mainWindow.webContents.send('update-log', '❌ ERROR: appUpdater es NULL');
        }
      }
    }, 1500);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  const isDevMode = process.argv.includes('--dev');
  
  // ⭐ Limpiar Discord Rich Presence
  discordRPC.destroy();
  
  if (process.platform !== 'darwin') {
    if (isDevMode) {
      // DEV: Mantener app viva para debug
      console.log('[DEV] Todas las ventanas cerradas - app continúa para debug');
    } else {
      // PROD: Cerrar app
      app.quit();
    }
  }
});
// ===== Video Source Id =====
ipcMain.handle('get-video-source-id', () => {
  const active = getActiveYouTubeWindow();
  if (!active || active.isDestroyed()) return null;
  if (typeof active.webContents.getMediaSourceId === 'function') {
    try {
      if (active.webContents.getMediaSourceId.length >= 1) {
        return new Promise((resolve) => {
          try {
            active.webContents.getMediaSourceId((id) => resolve(id || null));
          } catch (e) {
            resolve(null);
          }
        });
      }
      return active.webContents.getMediaSourceId();
    } catch (e) {
      return null;
    }
  }
  return null;
});

app.on('before-quit', () => {
  if (powerSaveBlockerId !== null && powerSaveBlocker.isStarted(powerSaveBlockerId)) {
    powerSaveBlocker.stop(powerSaveBlockerId);
    powerSaveBlockerId = null;
  }
});
