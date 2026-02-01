const { contextBridge, ipcRenderer } = require('electron');

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
  
  // ⭐ Escuchar cuando termina un video (para cola de reproducción)
  onVideoEnded: (callback) => {
    ipcRenderer.on('video-ended', () => {
      callback();
    });
  },
  
  // ===== BÚSQUEDA DE YOUTUBE =====
  searchYouTube: (query) => ipcRenderer.invoke('search-youtube', query),
  
  // ===== TOP 100 GLOBAL YOUTUBE CHARTS =====
  getYouTubeCharts: () => ipcRenderer.invoke('get-youtube-charts'),

  // ===== SISTEMA DE FAVORITOS (persistente en archivo) =====
  getFavorites: () => ipcRenderer.invoke('get-favorites'),
  saveFavorites: (favorites) => ipcRenderer.invoke('save-favorites', favorites),
  addFavorite: (video) => ipcRenderer.invoke('add-favorite', video),
  removeFavorite: (videoId) => ipcRenderer.invoke('remove-favorite', videoId),
  
  // ===== AUTO-UPDATER =====
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  quitAndInstall: () => ipcRenderer.invoke('quit-and-install'),
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),
  
  // Escuchar estado de actualizaciones
  onUpdateStatus: (callback) => {
    ipcRenderer.on('update-status', (event, data) => {
      callback(data);
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

