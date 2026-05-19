const { app, session } = require('electron');
const path = require('path');
const fs = require('fs');
const Store = require('electron-store');

// Esquema de validación estricto para los datos de sesión del usuario
const userDataSchema = {
  id: { type: 'number' },
  name: { type: 'string' },
  handle: { type: 'string' },
  email: { type: 'string' },
  avatar: { type: 'string' },
  youtubeConnected: { type: 'boolean' },
  loginDate: { type: 'string' }
};

// Ruta del archivo de sesión legacy
const userDataPath = path.join(app.getPath('userData'), 'user-data.json');

// ⭐ MIGRACIÓN TRANSPARENTE: Detectar archivo de sesión anterior sin encriptar
let initialSessionData = null;
if (fs.existsSync(userDataPath)) {
  try {
    const rawData = fs.readFileSync(userDataPath, 'utf8').trim();
    if (rawData.startsWith('{')) {
      console.log('[MIGRATION] Sesión anterior detectada en texto plano. Preparando encriptación segura...');
      initialSessionData = JSON.parse(rawData);
      fs.unlinkSync(userDataPath); // Eliminar archivo viejo para evitar conflictos de lectura con el Store encriptado
    }
  } catch (e) {
    console.error('[MIGRATION] Error leyendo sesión legacy para encriptación:', e);
  }
}

// Inicializar el almacén seguro de sesión con encriptación premium
const sessionStore = new Store({
  name: 'user-data',
  encryptionKey: 'seaxmusic-secure-session-key-v2', // Encriptación AES-256 para datos sensibles del perfil
  schema: userDataSchema,
  clearInvalidConfig: true // Previene caídas por archivos corruptos reiniciando de forma segura
});

// Guardar datos iniciales si se detectó una migración
if (initialSessionData) {
  try {
    sessionStore.set(initialSessionData);
    console.log('[MIGRATION] Sesión migrada y encriptada exitosamente.');
  } catch (e) {
    console.error('[MIGRATION] Error al guardar sesión migrada en el store:', e);
  }
}

const state = {
  mainWindow: null,
  youtubeWindow: null,
  djWindow: null,
  loginWindow: null,
  auxYoutubeWindow: null,
  pipWindow: null,
  backendWindows: [],
  
  videoViewVisible: false,
  videoViewPrevBounds: null,
  videoViewCssKey: null,
  videoPreviewTimer: null,
  videoPreviewPrev: null,
  videoPreviewClients: 0,
  lastVideoInfo: null,
  currentAppVolume: 0.7,
  powerSaveBlockerId: null,
  appUpdater: null,
  
  loginProcessed: false,
  isPlaying: false,
  repeatMode: 'off', // 'off', 'all', 'one'
  shuffleMode: false,
  currentVideoUrl: '',
  pipCollapsed: false,
  pipRestoreBounds: null,

  // Almacén de sesión centralizado
  sessionStore,

  // Paths
  userDataPath,
  legacyFavoritesPath: path.join(app.getPath('userData'), 'favorites.json'),
  favoritesMigrationFlagPath: path.join(app.getPath('userData'), 'favorites.migrated'),

  // Sessions
  getYouTubeSession() {
    return session.fromPartition('persist:youtube');
  },

  getActiveYouTubeWindow() {
    return state.youtubeWindow && !state.youtubeWindow.isDestroyed() ? state.youtubeWindow : null;
  },

  getDjYouTubeWindow() {
    return state.djWindow && !state.djWindow.isDestroyed() ? state.djWindow : null;
  },

  isEventFromActiveYouTube(event) {
    const active = state.getActiveYouTubeWindow();
    return !!(active && event && event.sender === active.webContents);
  }
};

module.exports = state;
