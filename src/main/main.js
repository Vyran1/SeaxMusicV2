const { app, BrowserWindow, ipcMain, session } = require('electron');
const path = require('path');
const fs = require('fs');
const discordRPC = require('./discordRPC');
const AppUpdater = require('./autoUpdater');

// ⭐ Auto-updater instance
let appUpdater = null;

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
let youtubeWindow = null;  // ⭐ CRÍTICO: Variable global para controlar YouTube
let loginWindow = null;    // ⭐ Variable para ventana de login separada
let backendWindows = [];

// User data file path
const userDataPath = path.join(app.getPath('userData'), 'user-data.json');
// ⭐ Favorites file path (persistencia real)
const favoritesPath = path.join(app.getPath('userData'), 'favorites.json');

// ===== SISTEMA DE FAVORITOS PERSISTENTE =====
function loadFavorites() {
  try {
    if (fs.existsSync(favoritesPath)) {
      const data = fs.readFileSync(favoritesPath, 'utf8');
      return JSON.parse(data);
    }
  } catch (e) {
    console.error('[FAVORITES] Error cargando favoritos:', e);
  }
  return [];
}

function saveFavorites(favorites) {
  try {
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
      preload: path.join(__dirname, '../preload/preload.js')
    },
    autoHideMenuBar: true
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  // Open DevTools in development mode
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
      partition: 'persist:youtube' // ⭐ CORRECCIÓN: Usar partition
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
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      partition: 'persist:youtube' // ⭐ CORRECCIÓN: partition en vez de session
    },
    autoHideMenuBar: true,
    ...(isLoginWindow && {
      parent: mainWindow,
      modal: true
    })
  };
  
  return new BrowserWindow(windowConfig);
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
  
  youtubeWindow.on('closed', () => {
    youtubeWindow = null;
  });
  
  return { success: true, playerId };
});

// Handle responses from backend player
ipcMain.on('backend-response', (event, { playerId, data }) => {
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

// ===== HANDLERS DE CONTROL DE YOUTUBE =====

ipcMain.on('audio-control', (event, action, value) => {
  console.log(`[CONTROL] Audio Control Command: ${action}`, value);
  
  if (youtubeWindow && !youtubeWindow.isDestroyed()) {
    youtubeWindow.webContents.send('youtube-control', action, value);
    console.log(`[SENT] Sent to YouTube: ${action}`);
  } else {
    console.warn('[WARNING] YouTube window not available');
  }
});

ipcMain.on('retry-youtube-control', (event, { action, value }) => {
  console.log(`[RETRY] Retrying: ${action}`);
  if (youtubeWindow && !youtubeWindow.isDestroyed()) {
    youtubeWindow.webContents.send('youtube-control', action, value);
  }
});

ipcMain.on('play-audio', (event, { url, title, artist }) => {
  console.log(`[PLAY] Playing: ${title} by ${artist}`);
  
  // ⭐ Discord: Desbloquear cover para nueva canción y mostrar que está cargando
  discordRPC.unlockCover();
  discordRPC.setPlayingActivity(title, artist, null, 0);
  
  if (youtubeWindow && !youtubeWindow.isDestroyed()) {
    // ⭐ Navegar directamente sin log extra
    youtubeWindow.loadURL(url);
  } else {
    console.warn('[WARNING] YouTube window not open');
  }
});

ipcMain.on('seek-audio', (event, time) => {
  console.log(`[SEEK] Seeking to: ${time}s`);
  
  if (youtubeWindow && !youtubeWindow.isDestroyed()) {
    youtubeWindow.webContents.send('youtube-control', 'seek', time);
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
  
  if (youtubeWindow && !youtubeWindow.isDestroyed()) {
    youtubeWindow.webContents.send('youtube-control', 'volume', volume);
  }
});

ipcMain.on('force-play-current-video', () => {
  console.log('[FORCE] Force playing current video');
  
  if (youtubeWindow && !youtubeWindow.isDestroyed()) {
    youtubeWindow.webContents.send('youtube-control', 'play');
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
  if (youtubeWindow && !youtubeWindow.isDestroyed()) {
    youtubeWindow.webContents.send('set-repeat-mode', mode);
  }
});

// Handler para modo shuffle
ipcMain.on('set-shuffle-mode', (event, enabled) => {
  shuffleMode = enabled;
  console.log('[SHUFFLE] Modo aleatorio:', enabled);
  
  // Enviar el modo a YouTube window
  if (youtubeWindow && !youtubeWindow.isDestroyed()) {
    youtubeWindow.webContents.send('set-shuffle-mode', enabled);
  }
});

// Handler para cuando termina un video
ipcMain.on('video-ended', (event) => {
  console.log('[VIDEO] Video terminado - Repeat mode:', repeatMode);
  
  if (repeatMode === 'one' && currentVideoUrl) {
    // Repetir la misma canción
    console.log('[REPEAT] Repitiendo canción actual...');
    if (youtubeWindow && !youtubeWindow.isDestroyed()) {
      youtubeWindow.webContents.send('youtube-control', 'seek', 0);
      setTimeout(() => {
        youtubeWindow.webContents.send('youtube-control', 'play');
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
  
  if (youtubeWindow && !youtubeWindow.isDestroyed()) {
    const nextUrl = `https://www.youtube.com/watch?v=${videoId}`;
    youtubeWindow.loadURL(nextUrl);
  }
});

ipcMain.on('update-video-info', (event, videoInfo) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('update-video-info', videoInfo);
  }
  
  // ⭐ Actualizar Discord Rich Presence con la canción
  if (videoInfo.title) {
    const thumbnail = videoInfo.videoId 
      ? `https://i.ytimg.com/vi/${videoInfo.videoId}/hqdefault.jpg`
      : null;
    
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
    
    discordRPC.setPlayingActivity(
      videoInfo.title,
      videoInfo.channel || videoInfo.artist || 'YouTube',
      thumbnail,
      durationSeconds
    );
  }
});

ipcMain.on('update-time', (event, timeInfo) => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('audio-time-update', timeInfo);
  }
});

ipcMain.on('video-playing', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('audio-started');
  }
  
  // ⭐ Discord: Reanudar reproducción
  if (discordRPC.state.trackName) {
    discordRPC.setPlayingActivity(
      discordRPC.state.trackName,
      discordRPC.state.trackArtist,
      discordRPC.state.trackImage,
      discordRPC.state.duration
    );
  }
  
  // ⭐ Sincronizar volumen múltiples veces para evitar que YouTube lo sobrescriba
  const syncVolume = () => {
    if (youtubeWindow && !youtubeWindow.isDestroyed()) {
      youtubeWindow.webContents.send('youtube-control', 'volume', currentAppVolume);
    }
  };
  
  // Sincronizar inmediatamente y luego a los 500ms, 1s, 2s y 3s
  syncVolume();
  setTimeout(syncVolume, 500);
  setTimeout(syncVolume, 1000);
  setTimeout(syncVolume, 2000);
  setTimeout(syncVolume, 3000);
});

ipcMain.on('video-paused', () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('audio-paused');
  }
  
  // ⭐ Discord: Mostrar estado pausado
  discordRPC.setPausedActivity();
});

ipcMain.on('video-url-changed', (event, url) => {
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
      preload: path.join(__dirname, '../preload/aux-preload.js')
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
            
            // Buscar todos los links de videos en el historial
            const videoLinks = document.querySelectorAll('a.yt-lockup-metadata-view-model__title[href*="/watch?v="]');
            console.log('[HISTORY] Links de historial encontrados:', videoLinks.length);
            
            for (const link of videoLinks) {
              if (videos.length >= maxVideos) break;
              
              const href = link.getAttribute('href') || '';
              const videoMatch = href.match(/v=([a-zA-Z0-9_-]{11})/);
              if (!videoMatch) continue;
              
              const videoId = videoMatch[1];
              if (videos.some(v => v.videoId === videoId)) continue;
              
              // ⭐ Extraer título del span dentro del link
              const titleSpan = link.querySelector('span.yt-core-attributed-string');
              const title = titleSpan?.textContent?.trim() || link.getAttribute('aria-label')?.split(' - ')[0] || '';
              
              // ⭐ Extraer artista/canal del contenedor de metadata
              let channel = 'YouTube';
              const metadataContainer = link.closest('.yt-lockup-metadata-view-model');
              if (metadataContainer) {
                // El canal está en el primer span de metadata-text dentro de metadata-row
                const channelEl = metadataContainer.querySelector('.yt-content-metadata-view-model__metadata-row span.yt-content-metadata-view-model__metadata-text');
                if (channelEl) {
                  // El texto del canal puede incluir íconos, así que tomamos solo el texto principal
                  const channelText = channelEl.textContent?.trim() || '';
                  // Quitar partes como " • 9 M de visualizaciones"
                  channel = channelText.split('•')[0].trim() || channel;
                }
              }
              
              // ⭐ Extraer duración del aria-label si está disponible
              const ariaLabel = link.getAttribute('aria-label') || '';
              const durationMatch = ariaLabel.match(/(\\d+)\\s*minutos?\\s*y?\\s*(\\d+)?\\s*segundos?/i);
              let duration = '';
              if (durationMatch) {
                const mins = parseInt(durationMatch[1]) || 0;
                const secs = parseInt(durationMatch[2]) || 0;
                duration = mins + ':' + secs.toString().padStart(2, '0');
              }
              
              if (title && title.length > 0) {
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
            }
            
            // Método 2: Fallback - Buscar en ytInitialData si no encontró suficientes
            if (videos.length < maxVideos) {
              console.log('[HISTORY] Buscando en ytInitialData...');
              try {
                if (window.ytInitialData) {
                  const findVideos = (obj, depth = 0) => {
                    if (videos.length >= maxVideos || depth > 20) return;
                    if (!obj || typeof obj !== 'object') return;
                    
                    // Buscar videoRenderer
                    if (obj.videoRenderer && obj.videoRenderer.videoId) {
                      const vr = obj.videoRenderer;
                      const videoId = vr.videoId;
                      
                      if (!videos.some(v => v.videoId === videoId)) {
                        const title = vr.title?.runs?.[0]?.text || vr.title?.simpleText || '';
                        const channel = vr.ownerText?.runs?.[0]?.text || 
                                       vr.longBylineText?.runs?.[0]?.text || 
                                       vr.shortBylineText?.runs?.[0]?.text || 'YouTube';
                        const duration = vr.lengthText?.simpleText || '';
                        
                        if (title) {
                          videos.push({
                            videoId: videoId,
                            title: title,
                            channel: channel,
                            thumbnail: 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg',
                            url: 'https://www.youtube.com/watch?v=' + videoId,
                            duration: duration
                          });
                          console.log('[HISTORY] ytInitialData Video:', title.substring(0, 40));
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
  
  // ⭐ En DEV mode: NO cerrar loginWindow automáticamente para debug
  // ⭐ En PROD mode: Cerrar loginWindow después del login exitoso
  const isDevMode = process.argv.includes('--dev');
  const sourceWindow = BrowserWindow.fromWebContents(event.sender);
  
  if (!isDevMode && loginWindow && !loginWindow.isDestroyed() && sourceWindow === loginWindow) {
    setTimeout(() => {
      if (loginWindow && !loginWindow.isDestroyed()) {
        console.log('[LOGIN] Cerrando ventana de login automáticamente');
        loginWindow.close();
        loginWindow = null;
      }
    }, 1500);
  } else if (isDevMode) {
    console.log('[DEV] Login window permanece abierta para debug');
  }
  
  // Reset flag después de un tiempo MUY largo para evitar loops
  setTimeout(() => {
    loginProcessed = false;
  }, 120000); // 2 minutos
});

ipcMain.on('youtube-logout-success', (event) => {
  console.log('[LOGOUT] YouTube logout detectado');
  
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

    youtubeWindow.on('closed', () => {
      youtubeWindow = null;
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
        partition: 'persist:youtube' // ⭐ Misma partition = misma sesión
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
                    
                    if (window.youtubeAPI && window.youtubeAPI.notifyLogin) {
                      window.youtubeAPI.notifyLogin({
                        isLoggedIn: true,
                        userName: userName,
                        userHandle: userHandle,
                        userAvatar: avatarUrl,
                        timestamp: new Date().toISOString()
                      });
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

      youtubeWindow.on('closed', () => {
        youtubeWindow = null;
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
            
            // ⭐ DIAGNÓSTICO DIRECTO EN MAIN.JS
            console.log('🔬 [MAIN] Iniciando diagnóstico directo...');
            if (mainWindow && !mainWindow.isDestroyed()) {
              mainWindow.webContents.send('update-log', '🔬 Diagnóstico directo de GitHub...');
            }
            
            // Verificar GitHub API directamente
            const githubToken = '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';
            const options = {
              hostname: 'api.github.com',
              path: '/repos/Vyran1/SeaxMusicV2/releases/latest',
              method: 'GET',
              headers: {
                'User-Agent': 'SeaxMusic-Updater',
                'Accept': 'application/vnd.github.v3+json',
                'Authorization': `token ${githubToken}`
              }
            };
            
            const req = https.request(options, (res) => {
              let data = '';
              res.on('data', chunk => data += chunk);
              res.on('end', () => {
                console.log('📡 [MAIN] GitHub respondió con status:', res.statusCode);
                if (mainWindow && !mainWindow.isDestroyed()) {
                  mainWindow.webContents.send('update-log', '📡 GitHub status: ' + res.statusCode);
                }
                
                if (res.statusCode === 200) {
                  try {
                    const release = JSON.parse(data);
                    const latestVer = release.tag_name.replace(/^v/, '');
                    console.log('📦 [MAIN] Última versión en GitHub:', latestVer);
                    if (mainWindow && !mainWindow.isDestroyed()) {
                      mainWindow.webContents.send('update-log', '📦 Última versión GitHub: ' + latestVer);
                      mainWindow.webContents.send('update-log', '📊 Comparando: ' + currentVer + ' vs ' + latestVer);
                    }
                    
                    // Ahora llamar al updater DIRECTAMENTE
                    console.log('⏳ [MAIN] Llamando electron-updater directamente...');
                    if (mainWindow && !mainWindow.isDestroyed()) {
                      mainWindow.webContents.send('update-log', '⏳ Llamando electron-updater directamente...');
                    }
                    
                    // Importar autoUpdater de electron-updater
                    const { autoUpdater } = require('electron-updater');
                    
                    // Configurar para GitHub privado
                    autoUpdater.setFeedURL({
                      provider: 'github',
                      owner: 'Vyran1',
                      repo: 'SeaxMusicV2',
                      private: true,
                      token: githubToken
                    });
                    
                    // Escuchar eventos
                    autoUpdater.on('checking-for-update', () => {
                      console.log('🔍 [ELECTRON-UPDATER] Verificando...');
                      if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('update-log', '🔍 electron-updater: Verificando...');
                      }
                    });
                    
                    autoUpdater.on('update-available', (info) => {
                      console.log('✅ [ELECTRON-UPDATER] Update disponible:', info.version);
                      if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('update-log', '✅ Update disponible: ' + info.version);
                      }
                    });
                    
                    autoUpdater.on('update-not-available', (info) => {
                      console.log('ℹ️ [ELECTRON-UPDATER] No hay updates');
                      if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('update-log', 'ℹ️ No hay actualizaciones disponibles');
                      }
                    });
                    
                    autoUpdater.on('error', (err) => {
                      console.error('❌ [ELECTRON-UPDATER] Error:', err.message);
                      if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('update-log', '❌ Error electron-updater: ' + err.message);
                      }
                    });
                    
                    autoUpdater.on('download-progress', (progress) => {
                      console.log('📥 [ELECTRON-UPDATER] Descargando:', Math.round(progress.percent) + '%');
                      if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('update-log', '📥 Descargando: ' + Math.round(progress.percent) + '%');
                      }
                    });
                    
                    autoUpdater.on('update-downloaded', (info) => {
                      console.log('✅ [ELECTRON-UPDATER] Descargado:', info.version);
                      if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('update-log', '✅ Descargado: ' + info.version + ' - Mostrando modal...');
                      }
                      // Mostrar modal usando appUpdater
                      appUpdater.promptInstallUpdate(info);
                    });
                    
                    // Llamar checkForUpdatesAndNotify
                    autoUpdater.checkForUpdatesAndNotify().then((result) => {
                      console.log('✅ [MAIN] checkForUpdatesAndNotify completado');
                      if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('update-log', '✅ checkForUpdatesAndNotify completado');
                      }
                    }).catch(err => {
                      console.error('❌ [MAIN] Error:', err);
                      if (mainWindow && !mainWindow.isDestroyed()) {
                        mainWindow.webContents.send('update-log', '❌ Error: ' + err.message);
                      }
                    });
                    
                  } catch (e) {
                    console.error('❌ [MAIN] Error parseando JSON:', e);
                    if (mainWindow && !mainWindow.isDestroyed()) {
                      mainWindow.webContents.send('update-log', '❌ Error JSON: ' + e.message);
                    }
                  }
                } else {
                  console.error('❌ [MAIN] GitHub error:', res.statusCode, data);
                  if (mainWindow && !mainWindow.isDestroyed()) {
                    mainWindow.webContents.send('update-log', '❌ GitHub error: ' + res.statusCode);
                  }
                }
              });
            });
            
            req.on('error', (e) => {
              console.error('❌ [MAIN] Error de red:', e);
              if (mainWindow && !mainWindow.isDestroyed()) {
                mainWindow.webContents.send('update-log', '❌ Error de red: ' + e.message);
              }
            });
            
            req.end();
            
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