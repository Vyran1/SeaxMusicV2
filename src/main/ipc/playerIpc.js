const { ipcMain, app } = require('electron');
const path = require('path');
const state = require('../state');
const discordRPC = require('../services/discordRPC');
const {
  createYouTubeWindow,
  createBackendWindow,
  createAuxYoutubeWindow,
  setVideoOnlyMode
} = require('../windows/youtubeWindow');
const { createPipWindow } = require('../windows/pipWindow');

// Helper to get max resolution thumbnail
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

// Recibir volumen real del backend y reenviar al renderer
ipcMain.on('video-volume-updated', (event, realVolume) => {
  if (!state.isEventFromActiveYouTube(event)) return;
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('video-volume-updated', realVolume);
  }
  if (typeof realVolume === 'number') {
    state.currentAppVolume = realVolume;
  }
});

// Create a new backend YouTube window
ipcMain.handle('create-backend-player', async (event, playerId) => {
  if (state.youtubeWindow && !state.youtubeWindow.isDestroyed()) {
    console.log('[REUSE] Reutilizando ventana de YouTube existente');
    state.youtubeWindow.focus();
    return { success: true, playerId, reused: true };
  }

  state.youtubeWindow = createYouTubeWindow(false);

  console.log('[YOUTUBE] YouTube window creada por create-backend-player');
  state.youtubeWindow.loadURL('https://www.youtube.com');

  // En modo dev, mostrar ventana y DevTools inmediatamente
  if (process.argv.includes('--dev')) {
    state.youtubeWindow.show();
    state.youtubeWindow.webContents.openDevTools({ mode: 'detach' });
    console.log('[DEV] YouTube window visible con DevTools');
  }

  const ytWin = state.youtubeWindow;
  state.youtubeWindow.on('closed', () => {
    if (state.youtubeWindow === ytWin) {
      state.youtubeWindow = null;
    }
  });

  return { success: true, playerId };
});

// ===== DJ MIX: Preload en ventana secundaria =====
ipcMain.handle('dj-preload-next', async (event, { url }) => {
  try {
    if (!url) return { success: false, error: 'URL requerida' };

    if (!state.djWindow || state.djWindow.isDestroyed()) {
      state.djWindow = createYouTubeWindow(false);
      if (process.argv.includes('--dev')) {
        state.djWindow.webContents.openDevTools({ mode: 'detach' });
      }
      const djWin = state.djWindow;
      state.djWindow.on('closed', () => {
        if (state.djWindow === djWin) {
          state.djWindow = null;
        }
      });
    }

    state.djWindow.loadURL(url);

    // Marcar como inactiva y preparar en silencio (tras cargar)
    try {
      state.djWindow.webContents.once('did-finish-load', () => {
        if (state.djWindow && !state.djWindow.isDestroyed()) {
          state.djWindow.webContents.send('dj-set-mode', { inactive: true });
          state.djWindow.webContents.send('youtube-control', 'volume', 0);
          state.djWindow.webContents.send('youtube-control', 'pause');
          state.djWindow.webContents.send('youtube-control', 'seek', 0);
        }
      });
    } catch (e) { }

    return { success: true };
  } catch (e) {
    console.error('[DJ MIX] Error preload:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.handle('dj-close', async () => {
  try {
    if (state.djWindow && !state.djWindow.isDestroyed()) {
      state.djWindow.close();
      state.djWindow = null;
    }
  } catch (e) { }
  return { success: true };
});

ipcMain.handle('dj-swap-active', async () => {
  try {
    if (!state.djWindow || state.djWindow.isDestroyed() || !state.youtubeWindow || state.youtubeWindow.isDestroyed()) {
      return { success: false, error: 'Ventanas no disponibles' };
    }

    // Pausar ventana actual antes de intercambiar
    state.youtubeWindow.webContents.send('youtube-control', 'pause');
    state.youtubeWindow.webContents.send('youtube-control', 'volume', 0);
    try {
      state.youtubeWindow.webContents.setAudioMuted(true);
    } catch (e) { }

    // Swap
    const temp = state.youtubeWindow;
    state.youtubeWindow = state.djWindow;
    state.djWindow = temp;

    // Marcar modos: nueva activa visible, vieja activa como inactiva
    try {
      if (state.youtubeWindow && !state.youtubeWindow.isDestroyed()) {
        if (state.youtubeWindow.webContents.isAudioMuted()) {
          state.youtubeWindow.webContents.setAudioMuted(false);
          console.log('[DJ] Unmuted new active YouTube window during swap');
        }
        state.youtubeWindow.webContents.send('dj-set-mode', { inactive: false });
      }
      if (state.djWindow && !state.djWindow.isDestroyed()) {
        state.djWindow.webContents.setAudioMuted(true);
        state.djWindow.webContents.send('dj-set-mode', { inactive: true });
        state.djWindow.webContents.send('youtube-control', 'pause');
        state.djWindow.webContents.send('youtube-control', 'volume', 0);
      }
    } catch (e) { }

    return { success: true };
  } catch (e) {
    console.error('[DJ MIX] Error swap:', e);
    return { success: false, error: e.message };
  }
});

ipcMain.on('dj-set-window-volume', (event, { target, volume }) => {
  const vol = Math.max(0, Math.min(1, volume));
  if (target === 'inactive') {
    const win = state.getDjYouTubeWindow();
    if (win && !win.isDestroyed()) {
      win.webContents.send('youtube-control', 'volume', vol);
    }
    return;
  }
  // default active
  const win = state.getActiveYouTubeWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('youtube-control', 'volume', vol);
  }
});

ipcMain.on('dj-set-mode', (event, { target, inactive }) => {
  const win = target === 'inactive' ? state.getDjYouTubeWindow() : state.getActiveYouTubeWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('dj-set-mode', { inactive: !!inactive });
  }
});

// ===== PiP Window IPC =====
ipcMain.handle('pip-open', async () => {
  createPipWindow();
  return { success: true };
});

ipcMain.handle('pip-close', async () => {
  if (state.pipWindow && !state.pipWindow.isDestroyed()) {
    state.pipWindow.close();
    return { success: true };
  }
  return { success: false };
});

ipcMain.on('pip-control', (event, { action, value }) => {
  if (!action) return;

  if (action === 'collapse') {
    const { collapsePip } = require('../windows/pipWindow');
    collapsePip();
    return;
  }
  if (action === 'expand') {
    const { expandPip } = require('../windows/pipWindow');
    expandPip();
    return;
  }

  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('pip-control', { action, value });
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
  const win = target === 'inactive' ? state.getDjYouTubeWindow() : state.getActiveYouTubeWindow();
  if (win && !win.isDestroyed()) {
    win.webContents.send('youtube-control', action, value);
  }
});

// Sincronizar colores dinámicos de Aura Engine con la ventana de Picture-in-Picture
ipcMain.on('aura-color-update', (event, rgb) => {
  state.lastAuraColor = rgb;
  if (state.pipWindow && !state.pipWindow.isDestroyed()) {
    state.pipWindow.webContents.send('pip-accent-color', rgb);
  }
});

ipcMain.on('pip-hover-update', (event, isHovering) => {
  const { handlePipHover } = require('../windows/pipWindow');
  handlePipHover(isHovering);
});

// ===== Video Preview Helper & IPC =====
async function startVideoPreviewInternal() {
  const active = state.getActiveYouTubeWindow();
  if (!active || active.isDestroyed() || !state.mainWindow || state.mainWindow.isDestroyed()) {
    return { success: false, error: 'No hay ventana activa' };
  }

  if (state.videoPreviewTimer) {
    return { success: true };
  }

  await setVideoOnlyMode(active, true);
  active.webContents.send('youtube-control', 'fullscreen');

  // Asegurar render sin mostrar ventana en taskbar
  try {
    state.videoPreviewPrev = {
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
  } catch (e) { }

  active.webContents.send('video-preview-start');

  state.videoPreviewTimer = setInterval(async () => {
    try {
      if (!active || active.isDestroyed() || !state.mainWindow || state.mainWindow.isDestroyed()) return;
      const image = await active.webContents.capturePage();
      const dataUrl = image.toDataURL();
      state.mainWindow.webContents.send('video-preview-frame', dataUrl);
    } catch (e) {
      // Ignorar errores de captura
    }
  }, 45);

  return { success: true };
}

async function stopVideoPreviewInternal() {
  const active = state.getActiveYouTubeWindow();
  if (active && !active.isDestroyed()) {
    await setVideoOnlyMode(active, false);
    active.webContents.send('video-preview-stop');
    try {
      if (state.videoPreviewPrev) {
        if (active.setOpacity) active.setOpacity(state.videoPreviewPrev.opacity ?? 1);
        if (active.setSkipTaskbar) active.setSkipTaskbar(!!state.videoPreviewPrev.skipTaskbar);
        if (active.setFocusable) active.setFocusable(!!state.videoPreviewPrev.focusable);
        if (state.videoPreviewPrev.visible) {
          active.showInactive();
        } else {
          active.hide();
        }
        if (state.videoPreviewPrev.bounds) {
          active.setBounds(state.videoPreviewPrev.bounds);
        }
      }
    } catch (e) { }
  }
  if (state.videoPreviewTimer) {
    clearInterval(state.videoPreviewTimer);
    state.videoPreviewTimer = null;
  }
  state.videoPreviewPrev = null;
  return { success: true };
}

ipcMain.handle('start-video-preview', async () => {
  state.videoPreviewClients += 1;
  if (state.videoPreviewTimer) {
    return { success: true, clients: state.videoPreviewClients };
  }
  return startVideoPreviewInternal();
});

ipcMain.handle('stop-video-preview', async () => {
  state.videoPreviewClients = Math.max(0, state.videoPreviewClients - 1);
  if (state.videoPreviewClients > 0) {
    return { success: true, clients: state.videoPreviewClients };
  }
  return stopVideoPreviewInternal();
});

// Handle responses from backend player
ipcMain.on('backend-response', (event, { playerId, data }) => {
  if (!state.isEventFromActiveYouTube(event)) return;
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('player-response', { playerId, data });
  }
});

// Forward audio visualizer data (High Frequency Visualizer Optimization maintained)
ipcMain.on('audio-frequency-data', (event, data) => {
  if (!state.isEventFromActiveYouTube(event)) return;
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('audio-frequency-data', data);
  }
});

// ===== AUDIO CONTROLS AND PLAYBACK CONFIGS =====

ipcMain.on('audio-control', (event, action, value) => {
  console.log(`[CONTROL] Audio Control Command: ${action}`, value);

  const active = state.getActiveYouTubeWindow();
  if (active && !active.isDestroyed()) {
    if (action === 'play' && active.webContents.isAudioMuted()) {
      active.webContents.setAudioMuted(false);
      console.log('[VOLUME] Unmuted active YouTube window for audio-control play');
    }
    active.webContents.send('youtube-control', action, value);
    console.log(`[SENT] Sent to YouTube: ${action}`);
  } else {
    console.warn('[WARNING] YouTube window not available');
  }
});

ipcMain.on('retry-youtube-control', (event, { action, value }) => {
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

  const active = state.getActiveYouTubeWindow();
  if (active && !active.isDestroyed()) {
    if (active.webContents.isAudioMuted()) {
      active.webContents.setAudioMuted(false);
      console.log('[VOLUME] Unmuted active YouTube window for play-audio');
    }
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

  const active = state.getActiveYouTubeWindow();
  if (active && !active.isDestroyed()) {
    active.webContents.send('youtube-control', 'seek', time);
  }
});

// ⭐ Throttle para evitar logs excesivos de volumen
let lastVolumeLogTime = 0;
const VOLUME_LOG_INTERVAL = 500; // Log máximo cada 500ms

ipcMain.on('update-volume', (event, volume) => {
  // ⭐ Guardar volumen actual para sincronizar al cambiar video
  state.currentAppVolume = volume;

  const now = Date.now();
  if (now - lastVolumeLogTime >= VOLUME_LOG_INTERVAL) {
    console.log(`[VOLUME] Volume: ${Math.round(volume * 100)}%`);
    lastVolumeLogTime = now;
  }

  const active = state.getActiveYouTubeWindow();
  if (active && !active.isDestroyed()) {
    active.webContents.send('youtube-control', 'volume', volume);
  }
});

ipcMain.on('force-play-current-video', () => {
  console.log('[FORCE] Force playing current video');

  const active = state.getActiveYouTubeWindow();
  if (active && !active.isDestroyed()) {
    if (active.webContents.isAudioMuted()) {
      active.webContents.setAudioMuted(false);
      console.log('[VOLUME] Unmuted active YouTube window for force-play-current-video');
    }
    active.webContents.send('youtube-control', 'play');
  }
});

// Handler para modo de repetición
ipcMain.on('set-repeat-mode', (event, mode) => {
  state.repeatMode = mode;
  console.log('[REPEAT] Modo de repetición:', mode);

  // Enviar el modo a YouTube window
  const active = state.getActiveYouTubeWindow();
  if (active && !active.isDestroyed()) {
    active.webContents.send('set-repeat-mode', mode);
  }
});

// Handler para modo shuffle
ipcMain.on('set-shuffle-mode', (event, enabled) => {
  state.shuffleMode = enabled;
  console.log('[SHUFFLE] Modo aleatorio:', enabled);

  // Enviar el modo a YouTube window
  const active = state.getActiveYouTubeWindow();
  if (active && !active.isDestroyed()) {
    active.webContents.send('set-shuffle-mode', enabled);
  }
});

// Handler para cuando termina un video
ipcMain.on('video-ended', (event) => {
  if (!state.isEventFromActiveYouTube(event)) return;
  console.log('[VIDEO] Video terminado - Repeat mode:', state.repeatMode);

  if (state.repeatMode === 'one' && state.currentVideoUrl) {
    // Repetir la misma canción
    console.log('[REPEAT] Repitiendo canción actual...');
    const active = state.getActiveYouTubeWindow();
    if (active && !active.isDestroyed()) {
      active.webContents.send('youtube-control', 'seek', 0);
      setTimeout(() => {
        active.webContents.send('youtube-control', 'play');
      }, 100);
    }
  }

  // Siempre notificar al renderer (para la cola de reproducción)
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    console.log('[VIDEO] Notificando video-ended al renderer para cola de reproducción');
    state.mainWindow.webContents.send('video-ended');
  }
});

ipcMain.on('autoplay-next', (event, { videoId, title, artist }) => {
  console.log(`[NEXT] Autoplay next: ${title}`);

  const active = state.getActiveYouTubeWindow();
  if (active && !active.isDestroyed()) {
    const nextUrl = `https://www.youtube.com/watch?v=${videoId}`;
    active.loadURL(nextUrl);
  }
});

ipcMain.on('update-video-info', (event, videoInfo) => {
  if (!state.isEventFromActiveYouTube(event)) return;
  state.lastVideoInfo = videoInfo;
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('update-video-info', videoInfo);
  }
  if (state.pipWindow && !state.pipWindow.isDestroyed()) {
    state.pipWindow.webContents.send('update-video-info', videoInfo);
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
    }
  }
});

ipcMain.on('update-time', (event, timeInfo) => {
  if (!state.isEventFromActiveYouTube(event)) return;
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('audio-time-update', timeInfo);
  }
  if (state.pipWindow && !state.pipWindow.isDestroyed()) {
    state.pipWindow.webContents.send('audio-time-update', timeInfo);
  }
});

ipcMain.on('video-playing', (event) => {
  if (!state.isEventFromActiveYouTube(event)) return;
  state.isPlaying = true;
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('audio-started');
  }
  if (state.pipWindow && !state.pipWindow.isDestroyed()) {
    state.pipWindow.webContents.send('video-playing');
  }

  // ⭐ Discord: Reanudar reproducción sin resetear el timestamp
  discordRPC.resumeActivity();
});

ipcMain.on('video-paused', (event) => {
  if (!state.isEventFromActiveYouTube(event)) return;
  state.isPlaying = false;
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('audio-paused');
  }
  if (state.pipWindow && !state.pipWindow.isDestroyed()) {
    state.pipWindow.webContents.send('video-paused');
  }

  // ⭐ Discord: Mostrar estado pausado
  discordRPC.setPausedActivity();
});

ipcMain.on('video-url-changed', (event, url) => {
  if (!state.isEventFromActiveYouTube(event)) return;
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
  if (!state.isEventFromActiveYouTube(event)) return;
  console.log('[COVER] Cover updated:', coverUrl);

  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('update-album-cover', coverUrl);

    // ⭐ Actualizar historial cuando cambia de video
    console.log('[HISTORY] Notificación para actualizar historial');
    state.mainWindow.webContents.send('refresh-history');
  }

  // ⭐ Solo establecer imagen inicial para Discord (no actualizar con versiones 4K)
  discordRPC.setInitialTrackImage(coverUrl);

  // ⭐ Sincronizar volumen cuando cambia de video
  setTimeout(() => {
    if (state.youtubeWindow && !state.youtubeWindow.isDestroyed()) {
      console.log('[VOLUME] Sincronizando volumen al cambiar video:', Math.round(state.currentAppVolume * 100) + '%');
      state.youtubeWindow.webContents.send('youtube-control', 'volume', state.currentAppVolume);
    }
  }, 500);
});

ipcMain.on('youtube-ready', () => {
  console.log('[OK] YouTube window is ready and communication established');
});

ipcMain.on('video-preview-frame', (event, dataUrl) => {
  if (!state.isEventFromActiveYouTube(event)) return;
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('video-preview-frame', dataUrl);
  }
});

// ===== HANDLERS PARA VIDEOS DESTACADOS, HISTORIAL, BÚSQUEDA Y CHARTS =====

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
          if (auxWindow.isDestroyed()) {
            console.log('[HISTORY] Ventana cerrada antes de completar');
            resolve([]);
            return;
          }

          // ⭐ Esperar a que YouTube renderice el contenido inicial
          await new Promise(r => setTimeout(r, 3000));

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

          if (auxWindow.isDestroyed()) {
            resolve([]);
            return;
          }

          await new Promise(r => setTimeout(r, 1500));

          if (auxWindow.isDestroyed()) {
            resolve([]);
            return;
          }

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
            
            const cleanText = (text) => {
              if (!text) return '';
              return text.toString().replace(/\\s+/g, ' ').trim();
            };
 
            const isDurationLike = (text) => {
              if (!text) return false;
              return /^\\d{1,2}:\\d{2}$/.test(text) || /^\\d+\\s*(minutos?|segundos?)/i.test(text);
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
              const durationMatch = ariaLabel.match(/(\\d+)\\s*minutos?\\s*y?\\s*(\\d+)?\\s*segundos?/i);
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
            
            // Fallback - Buscar en ytInitialData si no encontró suficientes
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
            
            // Fallback final - buscar cualquier link a video
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
            if (error.message && error.message.includes('destroyed')) {
              console.log('[HISTORY] Ventana cerrada durante extracción');
              resolve({ success: false, videos: [] });
            } else {
              console.error('[HISTORY] Error extrayendo:', error);
              resolve({ success: false, videos: [] });
            }
          }
        } catch (error) {
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

// ===== BÚSQUEDA DE YOUTUBE =====
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
            
            try {
              if (window.ytInitialData) {
                const findVideos = (obj, depth = 0) => {
                  if (videos.length >= maxVideos || depth > 25) return;
                  if (!obj || typeof obj !== 'object') return;
                  
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
            
            try {
              const rows = document.querySelectorAll('ytmc-entry-row');
              console.log('[CHARTS] ytmc-entry-row encontrados:', rows.length);
              
              for (const row of rows) {
                if (songs.length >= maxSongs) break;
                
                const thumbnail = row.querySelector('img.tracks-thumbnail, img#thumbnail');
                let videoId = null;
                
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
                
                if (!videoId) {
                  const link = row.querySelector('a[href*="watch?v="]');
                  if (link) {
                    const href = link.getAttribute('href') || '';
                    const match = href.match(/v=([a-zA-Z0-9_-]{11})/);
                    if (match) videoId = match[1];
                  }
                }
                
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
                
                let title = '';
                const titleEl = row.querySelector('#entity-title, .title');
                if (titleEl) {
                  title = titleEl.textContent?.trim() || '';
                }
                
                let artist = '';
                const artistEl = row.querySelector('#artist-names, .subtitle, .artistName');
                if (artistEl) {
                  const artistNames = artistEl.querySelectorAll('.artistName');
                  if (artistNames.length > 0) {
                    artist = Array.from(artistNames).map(a => a.textContent?.trim()).filter(a => a).join(', ');
                  } else {
                    artist = artistEl.textContent?.trim() || '';
                  }
                }
                
                let thumbnailUrl = 'https://i.ytimg.com/vi/' + videoId + '/mqdefault.jpg';
                if (thumbnail && thumbnail.src) {
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
            
            if (songs.length < 20) {
              console.log('[CHARTS] Método 2: Buscando en title-container...');
              try {
                const containers = document.querySelectorAll('.title-container');
                
                for (const container of containers) {
                  if (songs.length >= maxSongs) break;
                  
                  const titleEl = container.querySelector('#entity-title');
                  const artistEl = container.querySelector('#artist-names');
                  
                  if (!titleEl) continue;
                  
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
                } catch (e) {
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

// IPC Handler: Open YouTube window (keep hidden for playbacks)
ipcMain.handle('open-youtube-window', async (event, { videoUrl, title, artist }) => {
  try {
    if (state.youtubeWindow && !state.youtubeWindow.isDestroyed()) {
      if (state.youtubeWindow.webContents.isAudioMuted()) {
        state.youtubeWindow.webContents.setAudioMuted(false);
        console.log('[VOLUME] Unmuted active YouTube window for open-youtube-window (reused)');
      }
      console.log('[REUSE] Reutilizando ventana de YouTube existente');
      state.youtubeWindow.loadURL(videoUrl);
      return { success: true, reused: true };
    }

    state.youtubeWindow = createYouTubeWindow(false);

    if (state.youtubeWindow && !state.youtubeWindow.isDestroyed()) {
      if (state.youtubeWindow.webContents.isAudioMuted()) {
        state.youtubeWindow.webContents.setAudioMuted(false);
        console.log('[VOLUME] Unmuted active YouTube window for open-youtube-window (new)');
      }
    }

    console.log('[URL] Abriendo YouTube en nueva ventana:', videoUrl);
    state.youtubeWindow.loadURL(videoUrl);

    state.youtubeWindow.webContents.on('did-finish-load', () => {
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

      state.youtubeWindow.webContents.executeJavaScript(detectionScript)
        .then(() => console.log('[OK] Script de monitoreo inyectado'))
        .catch(err => console.error('Error inyectando script:', err));
    });

    if (process.argv.includes('--dev')) {
      state.youtubeWindow.webContents.openDevTools();
    }

    const ytWin = state.youtubeWindow;
    state.youtubeWindow.on('closed', () => {
      if (state.youtubeWindow === ytWin) {
        state.youtubeWindow = null;
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
  if (state.youtubeWindow && !state.youtubeWindow.isDestroyed()) {
    state.youtubeWindow.close();
    state.youtubeWindow = null;
    return { success: true };
  }
  return { success: false, error: 'YouTube window not found' };
});

// ===== Video Source Id =====
ipcMain.handle('get-video-source-id', () => {
  const active = state.getActiveYouTubeWindow();
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
