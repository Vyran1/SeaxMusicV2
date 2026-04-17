const { contextBridge, ipcRenderer } = require('electron');
const { desktopCapturer } = require('electron');

// Expose protected methods to the renderer process
contextBridge.exposeInMainWorld('electronAPI', {
  // Backend YouTube window
  createBackendPlayer: (playerId) => ipcRenderer.invoke('create-backend-player', playerId),

  // User authentication
  openYouTubeLoginWindow: () => ipcRenderer.invoke('open-youtube-login-window'),
  
  saveUserData: (userData) => ipcRenderer.invoke('save-user-data', userData),
  
  loadUserData: () => ipcRenderer.invoke('load-user-data'),
  
  clearUserData: () => ipcRenderer.invoke('clear-user-data'),

  // YouTube window management (for search and specific videos)
  openYouTubeWindow: (videoUrl, title, artist) => 
    ipcRenderer.invoke('open-youtube-window', { videoUrl, title, artist }),

  closeYouTubeWindow: () => ipcRenderer.invoke('close-youtube-window'),
  
  logoutYouTube: () => ipcRenderer.invoke('logout-youtube'),
  
  // YouTube sync/status handlers
  getYouTubeLoginStatus: () => ipcRenderer.invoke('get-youtube-login-status'),
  
  forceCheckYouTubeLogin: () => ipcRenderer.invoke('force-check-youtube-login'),
  
  // ⭐ CRÍTICO: Enviar comandos IPC a YouTube
  send: (channel, ...args) => {
    ipcRenderer.send(channel, ...args);
  },
  
  // YouTube login listener
  onYouTubeUserLoggedIn: (callback) => {
    ipcRenderer.on('youtube-user-logged-in', (event, data) => {
      callback(data);
    });
  },
  
  // YouTube logout listener
  onYouTubeUserLoggedOut: (callback) => {
    ipcRenderer.on('youtube-user-logged-out', (event, data) => {
      callback(data);
    });
  },
  
  // Escuchar actualizaciones de tiempo desde YouTube
  onAudioTimeUpdate: (callback) => {
    ipcRenderer.on('audio-time-update', (event, timeInfo) => {
      callback(timeInfo);
    });
  },

  // Escuchar volumen real reportado por el backend (YouTube)
  onVideoVolumeUpdated: (callback) => {
    ipcRenderer.on('video-volume-updated', (event, realVolume) => {
      callback(realVolume);
    });
  },
  
  // Escuchar cuando la música comienza
  onAudioStarted: (callback) => {
    ipcRenderer.on('audio-started', (event, data) => {
      callback(data);
    });
  },
  
  // Escuchar cuando la música se pausa
  onAudioPaused: (callback) => {
    ipcRenderer.on('audio-paused', (event, data) => {
      callback(data);
    });
  },
  
  // Escuchar cambios de cover
  onUpdateAlbumCover: (callback) => {
    ipcRenderer.on('update-album-cover', (event, coverUrl) => {
      callback(coverUrl);
    });
  },
  
  // Escuchar actualizaciones de info del video (título, artista)
  onUpdateVideoInfo: (callback) => {
    ipcRenderer.on('update-video-info', (event, videoInfo) => {
      callback(videoInfo);
    });
  },
  
  // ===== APIs para videos destacados e historial =====
  // Obtener videos destacados de YouTube Home
  getFeaturedVideos: () => ipcRenderer.invoke('get-featured-videos'),
  
  // Obtener historial de YouTube
  getHistoryVideos: () => ipcRenderer.invoke('get-history-videos'),
  
  // Escuchar cuando se debe actualizar el historial (nueva canción)
  onRefreshHistory: (callback) => {
    ipcRenderer.on('refresh-history', () => {
      callback();
    });
  },
  
  // Reproducir un video específico (usa la ventana oculta de YouTube)
  playVideo: (videoId, title, channel) => {
    const url = `https://www.youtube.com/watch?v=${videoId}`;
    // Usar play-audio que carga en la ventana oculta existente
    ipcRenderer.send('play-audio', { url, title, artist: channel });
  },
  
  // Reproducir audio directamente con URL
  playAudio: (url, title, artist) => {
    ipcRenderer.send('play-audio', { url, title, artist });
  },
  
  // ⭐ Reproducir audio con info de playlist (para cover y Discord)
  playAudioWithPlaylist: (url, title, artist, playlistInfo) => {
    ipcRenderer.send('play-audio', { url, title, artist, playlistInfo });
  },
  
  // ⭐ Establecer info de playlist actual (para Discord)
  setCurrentPlaylist: (playlistInfo) => {
    ipcRenderer.send('set-current-playlist', playlistInfo);
  },
  
  // ⭐ Limpiar info de playlist actual
  clearCurrentPlaylist: () => {
    ipcRenderer.send('clear-current-playlist');
  },
  
  // ⭐ Escuchar cuando termina un video (para cola de reproducción)
  onVideoEnded: (callback) => {
    ipcRenderer.on('video-ended', () => {
      callback();
    });
  },
  
  // ===== BÚSQUEDA DE YOUTUBE =====
  searchYouTube: (query) => ipcRenderer.invoke('search-youtube', query),

  // ===== SISTEMA DE FAVORITOS (persistente en archivo) =====
  getFavorites: () => ipcRenderer.invoke('get-favorites'),
  saveFavorites: (favorites) => ipcRenderer.invoke('save-favorites', favorites),
  addFavorite: (video) => ipcRenderer.invoke('add-favorite', video),
  removeFavorite: (videoId) => ipcRenderer.invoke('remove-favorite', videoId),
  toggleFavorite: (videoOrId) => ipcRenderer.invoke('toggle-favorite', videoOrId),
  
  // ===== AUTO-UPDATER =====
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // ===== DJ MIX (dual windows) =====
  djPreloadNext: (url) => ipcRenderer.invoke('dj-preload-next', { url }),
  djSwapActive: () => ipcRenderer.invoke('dj-swap-active'),
  djClose: () => ipcRenderer.invoke('dj-close'),
  djSetMode: (target, inactive) => ipcRenderer.send('dj-set-mode', { target, inactive }),
  djSetWindowVolume: (target, volume) => ipcRenderer.send('dj-set-window-volume', { target, volume }),
  djControlWindow: (target, action, value) => ipcRenderer.send('dj-control-window', { target, action, value }),

  // ===== Always on Top =====
  setAlwaysOnTop: (enabled) => ipcRenderer.invoke('set-always-on-top', { enabled: !!enabled }),

  // ===== PiP Window =====
  openPipWindow: () => ipcRenderer.invoke('pip-open'),
  closePipWindow: () => ipcRenderer.invoke('pip-close'),
  onPipClosed: (callback) => ipcRenderer.on('pip-closed', () => callback()),
  onPipControl: (callback) => ipcRenderer.on('pip-control', (event, data) => callback(data)),

  // ===== Video View =====
  startVideoPreview: () => ipcRenderer.invoke('start-video-preview'),
  stopVideoPreview: () => ipcRenderer.invoke('stop-video-preview'),
  getVideoSourceId: () => ipcRenderer.invoke('get-video-source-id'),
  onVideoPreviewFrame: (callback) => {
    ipcRenderer.on('video-preview-frame', (event, dataUrl) => {
      callback(dataUrl);
    });
  },

  getDesktopSources: (options = {}) => desktopCapturer.getSources({
    types: options.types || ['window'],
    thumbnailSize: options.thumbnailSize || { width: 0, height: 0 },
    fetchWindowIcons: false
  }),
  
  // Escuchar estado de actualizaciones
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (event, data) => {
      callback(data);
    });
  },
  
  // Escuchar logs del updater (debug)
  onUpdateLog: (callback) => {
    ipcRenderer.on('update-log', (event, message) => {
      console.log('[UPDATE-MAIN]', message);
      callback(message);
    });
  },
  
  // Escuchar notificaciones de actualización
  onUpdateNotification: (callback) => {
    ipcRenderer.on('update-notification', (event, data) => {
      callback(data);
    });
  },
  
  // Escuchar cuando el modal de actualización se cierra
  onUpdateModalClosed: (callback) => {
    ipcRenderer.on('update-modal-closed', () => {
      callback();
    });
  },
  
  // Escuchar cuando el modal de actualización se abre
  onUpdateModalOpened: (callback) => {
    ipcRenderer.on('update-modal-opened', () => {
      callback();
    });
  }
});

