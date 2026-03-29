// Main application logic
console.log('🎵 SeaxMusic initializing...');

// Check if Electron API is available
if (!window.electronAPI) {
  console.error('❌ Electron API not available');
}

// Application state
const appState = {
  currentPlayerId: null,
  isPlaying: false,
  currentTrack: null,
  playlists: [],
  favorites: [], // ⭐ Lista de favoritos
  isLoggedIn: false,
  isSwitchingAccount: false,
  loaderAllowed: true,
  contentLoaded: {
    favorites: false,
    history: false
  },
  // ⭐ Cola de reproducción
  playQueue: [],
  playQueueIndex: -1,
  // ⭐ Historial de canciones (para Now Playing)
  recentHistory: [],
  // ⭐ DJ Mix
  djMixEnabled: false,
  djMixInProgress: false,
  djMixMs: 600,
  djMixLeadSec: 180,
  djMixCrossfadeMs: 10000,
  djMixLeadStartSec: 4,
  djMixTriggeredFor: null,
  djMixPreloadedFor: null,
  djMixNextTrack: null,
  djMixInactiveStartedFor: null
};

// ⭐ Exponer appState globalmente
window.appState = appState;

// Restaurar estado DJ Mix
try {
  appState.djMixEnabled = localStorage.getItem('seaxmusic_djmix') === '1';
} catch (e) {
  appState.djMixEnabled = false;
}

// ===== DJ MIX TRANSITIONS =====
function runDjMixTransition(playFn) {
  if (!appState.djMixEnabled || !window.musicPlayer || appState.djMixInProgress) {
    playFn();
    return;
  }

  appState.djMixInProgress = true;

  const targetVolume = window.musicPlayer.volume;
  const fadeOutMs = Math.max(250, Math.floor(appState.djMixMs * 0.45));
  const fadeInMs = Math.max(300, appState.djMixMs);

  window.musicPlayer.suppressVolumePersist = true;

  window.musicPlayer.fadeVolumeTo(0, fadeOutMs, () => {
    playFn();
    setTimeout(() => {
      if (window.electronAPI?.send) {
        window.electronAPI.send('force-play-current-video');
      }
    }, 1200);
    setTimeout(() => {
      window.musicPlayer.fadeVolumeTo(targetVolume, fadeInMs, () => {
        window.musicPlayer.suppressVolumePersist = false;
        appState.djMixInProgress = false;
      });
    }, 250);
  });
}

window.runDjMixTransition = runDjMixTransition;

function ensurePlaybackKick() {
  if (window.electronAPI?.send) {
    window.electronAPI.send('force-play-current-video');
  }
}

function getNextTrackForDjMix() {
  const queue = appState.playQueue || [];
  const idx = appState.playQueueIndex ?? -1;
  if (queue.length && idx >= 0 && idx + 1 < queue.length) {
    const next = queue[idx + 1];
    const currentId = appState.currentTrack?.videoId || null;
    if (next && currentId && next.videoId === currentId) {
      return null;
    }
    return next;
  }
  return null;
}

async function preloadNextForDjMix(track) {
  if (!track || !window.electronAPI?.djPreloadNext) return false;
  const url = `https://www.youtube.com/watch?v=${track.videoId}`;
  const result = await window.electronAPI.djPreloadNext(url);
  return !!result?.success;
}

function runDjCrossfadeToNext(track) {
  if (!track || !window.electronAPI?.djSetWindowVolume || !window.electronAPI?.djSwapActive) return;
  if (appState.djMixInProgress) return;

  appState.djMixInProgress = true;
  const targetVolume = window.musicPlayer?.volume ?? 0.7;
  const duration = appState.djMixCrossfadeMs || 12000;
  const startTime = performance.now();

  if (window.musicPlayer) {
    window.musicPlayer.suppressVolumeUpdates = true;
  }

  // Asegurar ventana inactiva reproduciendo en silencio
  if (window.electronAPI?.djControlWindow) {
    window.electronAPI.djControlWindow('inactive', 'play');
  }
  window.electronAPI.djSetWindowVolume('inactive', 0);

  const step = (now) => {
    const t = Math.min(1, (now - startTime) / duration);
    const eased = t < 1 ? (t * (2 - t)) : 1; // easeOut
    const activeVol = targetVolume * (1 - eased);
    const inactiveVol = targetVolume * eased;

    window.electronAPI.djSetWindowVolume('active', activeVol);
    window.electronAPI.djSetWindowVolume('inactive', inactiveVol);

    if (t < 1) {
      requestAnimationFrame(step);
    } else {
      window.electronAPI.djSwapActive().finally(() => {
        // Asegurar volumen correcto en nueva activa
        window.electronAPI.djSetWindowVolume('active', targetVolume);
        // Forzar play por seguridad
        ensurePlaybackKick();
        if (window.musicPlayer) {
          window.musicPlayer.suppressVolumeUpdates = false;
        }
        appState.djMixInProgress = false;
        appState.djMixPreloadedFor = null;
        appState.djMixNextTrack = null;
        appState.djMixInactiveStartedFor = null;
      });
    }
  };

  requestAnimationFrame(step);
}

function initDjMixWrappers() {
  if (!window.electronAPI || window.electronAPI.__djMixWrapped) return;

  const originalPlayAudio = window.electronAPI.playAudio?.bind(window.electronAPI);
  const originalPlayAudioWithPlaylist = window.electronAPI.playAudioWithPlaylist?.bind(window.electronAPI);

  if (originalPlayAudio) {
    window.electronAPI.playAudio = (...args) => {
      const playFn = () => originalPlayAudio(...args);
      if (window.runDjMixTransition) {
        window.runDjMixTransition(playFn);
      } else {
        playFn();
      }
    };
  }

  if (originalPlayAudioWithPlaylist) {
    window.electronAPI.playAudioWithPlaylist = (...args) => {
      const playFn = () => originalPlayAudioWithPlaylist(...args);
      if (window.runDjMixTransition) {
        window.runDjMixTransition(playFn);
      } else {
        playFn();
      }
    };
  }

  window.electronAPI.__djMixWrapped = true;
}

// ===== SISTEMA DE COLA DE REPRODUCCIÓN =====

function setPlayQueue(tracks, startIndex = 0) {
  appState.playQueue = tracks;
  appState.playQueueIndex = startIndex;
  console.log('[QUEUE] ✅ Cola establecida:', tracks.length, 'canciones, iniciando en índice', startIndex);
  console.log('[QUEUE] Tracks:', tracks.map(t => t.title).join(', '));

  if (window.musicPlayer?.updateSkipPreviews) {
    window.musicPlayer.updateSkipPreviews();
  }
}

function playNextInQueue() {
  console.log('[QUEUE] playNextInQueue llamado. Cola:', appState.playQueue?.length, 'Índice actual:', appState.playQueueIndex);
  
  if (!appState.playQueue || appState.playQueue.length === 0) {
    console.log('[QUEUE] Cola vacía');
    return false;
  }
  
  appState.playQueueIndex++;
  console.log('[QUEUE] Nuevo índice:', appState.playQueueIndex, '/', appState.playQueue.length);
  
  if (appState.playQueueIndex >= appState.playQueue.length) {
    console.log('[QUEUE] Fin de la cola');
    appState.playQueueIndex = -1;
    appState.playQueue = [];
    return false;
  }
  
  const track = appState.playQueue[appState.playQueueIndex];
  console.log('[QUEUE] Reproduciendo siguiente:', track.title, '(' + (appState.playQueueIndex + 1) + '/' + appState.playQueue.length + ')');
  
  // ⭐ Actualizar UI con dirección 'next' para animación carrusel
  if (window.updateTrackInfo) {
    window.updateTrackInfo(track, 'next');
  }
  if (window.musicPlayer?.updateSkipPreviews) {
    window.musicPlayer.updateSkipPreviews();
  }
  
  // ⭐ Si hay playlist activa, actualizar UI y Discord con cover de playlist
  const playlistManager = window.playlistManager;
  const playFn = () => {
    if (playlistManager?.currentPlayingPlaylist) {
      const playlistInfo = {
        name: playlistManager.currentPlayingPlaylist.name,
        cover: playlistManager.getPlaylistCover(playlistManager.currentPlayingPlaylist),
        discordCover: playlistManager.getPlaylistDiscordCover(playlistManager.currentPlayingPlaylist),
        id: playlistManager.currentPlayingPlaylist.id || playlistManager.currentPlayingPlaylist.globalId
      };
      playlistManager.updatePlayerUIForPlaylist(track, playlistInfo);
      
      // ⭐ Usar playAudioWithPlaylist para que Discord muestre la playlist
      if (window.electronAPI?.playAudioWithPlaylist) {
        window.electronAPI.playAudioWithPlaylist(
          `https://www.youtube.com/watch?v=${track.videoId}`,
          track.title || 'Sin título',
          track.artist || track.channel || 'Artista desconocido',
          playlistInfo
        );
      }
    } else {
      // Sin playlist activa, reproducir normal
      if (window.electronAPI?.playAudio) {
        window.electronAPI.playAudio(
          `https://www.youtube.com/watch?v=${track.videoId}`,
          track.title || 'Sin título',
          track.artist || track.channel || 'Artista desconocido'
        );
      }
    }
  };

  if (window.runDjMixTransition) {
    window.runDjMixTransition(playFn);
  } else {
    playFn();
  }
  
  return true;
}

function playPrevInQueue() {
  if (appState.playQueue.length === 0) {
    console.log('[QUEUE] Cola vacía');
    return false;
  }
  
  appState.playQueueIndex--;
  
  if (appState.playQueueIndex < 0) {
    console.log('[QUEUE] Inicio de la cola');
    appState.playQueueIndex = 0;
    return false;
  }
  
  const track = appState.playQueue[appState.playQueueIndex];
  console.log('[QUEUE] Reproduciendo anterior:', track.title, '(' + (appState.playQueueIndex + 1) + '/' + appState.playQueue.length + ')');
  
  // ⭐ Actualizar UI con dirección 'prev' para animación carrusel
  if (window.updateTrackInfo) {
    window.updateTrackInfo(track, 'prev');
  }
  if (window.musicPlayer?.updateSkipPreviews) {
    window.musicPlayer.updateSkipPreviews();
  }
  
  // ⭐ Si hay playlist activa, actualizar UI y Discord con cover de playlist
  const playlistManager = window.playlistManager;
  const playFn = () => {
    if (playlistManager?.currentPlayingPlaylist) {
      const playlistInfo = {
        name: playlistManager.currentPlayingPlaylist.name,
        cover: playlistManager.getPlaylistCover(playlistManager.currentPlayingPlaylist),
        discordCover: playlistManager.getPlaylistDiscordCover(playlistManager.currentPlayingPlaylist),
        id: playlistManager.currentPlayingPlaylist.id || playlistManager.currentPlayingPlaylist.globalId
      };
      playlistManager.updatePlayerUIForPlaylist(track, playlistInfo);
      
      // ⭐ Usar playAudioWithPlaylist para que Discord muestre la playlist
      if (window.electronAPI?.playAudioWithPlaylist) {
        window.electronAPI.playAudioWithPlaylist(
          `https://www.youtube.com/watch?v=${track.videoId}`,
          track.title || 'Sin título',
          track.artist || track.channel || 'Artista desconocido',
          playlistInfo
        );
      }
    } else {
      // Sin playlist activa, reproducir normal
      if (window.electronAPI?.playAudio) {
        window.electronAPI.playAudio(
          `https://www.youtube.com/watch?v=${track.videoId}`,
          track.title || 'Sin título',
          track.artist || track.channel || 'Artista desconocido'
        );
      }
    }
  };

  if (window.runDjMixTransition) {
    window.runDjMixTransition(playFn);
  } else {
    playFn();
  }
  
  return true;
}

function clearPlayQueue() {
  appState.playQueue = [];
  appState.playQueueIndex = -1;
  // ⭐ Limpiar playlist actual
  if (window.playlistManager) {
    window.playlistManager.currentPlayingPlaylist = null;
  }
  console.log('[QUEUE] Cola limpiada');
}

// Exponer funciones de cola globalmente
window.setPlayQueue = setPlayQueue;
window.playNextInQueue = playNextInQueue;
window.playPrevInQueue = playPrevInQueue;
window.clearPlayQueue = clearPlayQueue;

// ===== SISTEMA DE FAVORITOS (usa IPC para persistencia real) =====

async function loadFavoritesFromStorage() {
  try {
    const userData = localStorage.getItem('seaxmusic_user');
    if (!userData) {
      appState.favorites = [];
      appState.contentLoaded.favorites = true;
      checkAllContentLoaded();
      renderHomeModules();
      return;
    }
    if (window.electronAPI && window.electronAPI.getFavorites) {
      appState.favorites = await window.electronAPI.getFavorites();
      console.log('💖 Favoritos cargados:', appState.favorites.length);
      loadFavoritesContent(); // Actualizar UI
    }
  } catch (e) {
    console.error('Error cargando favoritos:', e);
    appState.favorites = [];
  }
}

async function addToFavorites(video) {
  if (!appState.favorites.some(v => v.videoId === video.videoId)) {
    try {
      if (window.electronAPI && window.electronAPI.addFavorite) {
        const result = await window.electronAPI.addFavorite(video);
        if (result.success) {
          appState.favorites = result.favorites;
          loadFavoritesContent(); // Actualizar UI
          return true;
        }
      }
    } catch (e) {
      console.error('Error agregando favorito:', e);
    }
  }
  return false;
}

async function removeFromFavorites(videoId) {
  try {
    if (window.electronAPI && window.electronAPI.removeFavorite) {
      const result = await window.electronAPI.removeFavorite(videoId);
      if (result.success) {
        appState.favorites = result.favorites;
        loadFavoritesContent(); // Actualizar UI
        return true;
      }
    }
  } catch (e) {
    console.error('Error eliminando favorito:', e);
  }
  return false;
}

function isFavorite(videoId) {
  return appState.favorites.some(v => v.videoId === videoId);
}

// Actualizar el botón de corazón del player
function updateLikeButton() {
  const likeBtn = document.getElementById('likeBtn');
  if (!likeBtn || !appState.currentTrack) return;
  
  const icon = likeBtn.querySelector('i');
  if (isFavorite(appState.currentTrack.videoId)) {
    icon.classList.remove('far');
    icon.classList.add('fas');
    likeBtn.classList.add('liked');
  } else {
    icon.classList.remove('fas');
    icon.classList.add('far');
    likeBtn.classList.remove('liked');
  }
}

// ===== LOADING OVERLAY FUNCTIONS =====
function showLoader(message = 'Cargando tu música...') {
  if (window.appState && !window.appState.loaderAllowed && !window.appState.isSwitchingAccount) {
    console.log('⏭️ Loader ignorado: no permitido en este estado');
    return;
  }
  const overlay = document.getElementById('loadingOverlay');
  const statusText = document.getElementById('loadingStatus');
  if (overlay) {
    overlay.style.display = 'flex';
    overlay.classList.remove('fade-out');
  }
  if (statusText) {
    statusText.textContent = message;
  }
}

function updateLoaderStatus(message) {
  const statusText = document.getElementById('loadingStatus');
  if (statusText) {
    statusText.textContent = message;
  }
}

// ⭐ Flag para bloquear el loader mientras el modal de update esté abierto
let updateModalOpen = false;

function hideLoader() {
  // No ocultar el loader si el modal de update está abierto
  if (updateModalOpen) {
    console.log('⏳ Loader bloqueado: modal de actualización abierto');
    return;
  }
  
  const overlay = document.getElementById('loadingOverlay');
  if (overlay) {
    overlay.classList.add('fade-out');
    setTimeout(() => {
      overlay.style.display = 'none';
    }, 500);
  }
}

function checkAllContentLoaded() {
  if (appState.contentLoaded.favorites && appState.contentLoaded.history) {
    console.log('✅ Todo el contenido cargado');
    setTimeout(() => hideLoader(), 300);
    if (appState.isSwitchingAccount) {
      appState.isSwitchingAccount = false;
    }
    appState.loaderAllowed = false;
  }
}

// Initialize the application
async function initApp() {
  console.log('🚀 Initializing SeaxMusic...');
  
  // ⭐ Mostrar versión de la app
  const appVersionElement = document.getElementById('appVersion');
  if (appVersionElement && window.electronAPI && window.electronAPI.getAppVersion) {
    try {
      const version = await window.electronAPI.getAppVersion();
      appVersionElement.textContent = `v${version}`;
    } catch (e) {
      appVersionElement.textContent = 'v?.?.?';
    }
  }
  
  // ⭐ Escuchar logs del auto-updater para debug
  if (window.electronAPI && window.electronAPI.onUpdateLog) {
    window.electronAPI.onUpdateLog((message) => {
      console.log('[AUTO-UPDATE]', message);
    });
  }
  
  // ⭐ Actualizar saludo del banner según la hora
  const homeGreeting = document.getElementById('homeGreeting');
  if (homeGreeting) {
    const hour = new Date().getHours();
    if (hour >= 5 && hour < 12) {
      homeGreeting.textContent = '☀️ Buenos días,';
    } else if (hour >= 12 && hour < 19) {
      homeGreeting.textContent = '🌤️ Buenas tardes,';
    } else {
      homeGreeting.textContent = '🌙 Buenas noches,';
    }
  }
  
  try {
    // Siempre abrir YouTube backend al iniciar (necesario para reproducción)
    console.log('🎬 Abriendo YouTube backend...');
    const result = await window.electronAPI.createBackendPlayer('youtube-backend');
    if (result.success) {
      appState.currentPlayerId = result.playerId;
      console.log('✅ YouTube Backend window opened:', result.playerId);
    }
  } catch (error) {
    console.error('❌ Error during initialization:', error);
  }
  
  // ⭐ Restaurar última canción (pausada)
  restoreLastTrack();
  
  // ===== LISTENERS IPC DE YOUTUBE =====
  // Escuchar actualizaciones de tiempo (progress bar)
  if (window.electronAPI && window.electronAPI.onAudioTimeUpdate) {
    window.electronAPI.onAudioTimeUpdate((timeInfo) => {
      if (window.musicPlayer) {
        window.musicPlayer.updateTime(timeInfo.currentTime, timeInfo.duration);
      }

      // ===== DJ MIX: lanzar transición al 98% =====
      if (appState.djMixEnabled && !appState.djMixInProgress) {
        const duration = timeInfo.duration || 0;
        const current = timeInfo.currentTime || 0;
        const currentId = appState.currentTrack?.videoId || null;
        const remainingTriggerSec = Math.min(30, Math.max(10, duration * 0.05));
        const remaining = duration - current;

        // Preload 3 minutos antes del final
        if (currentId && appState.djMixPreloadedFor !== currentId) {
          if (duration > 10 && remaining > 0 && remaining <= (appState.djMixLeadSec || 180)) {
            const nextTrack = getNextTrackForDjMix();
            if (nextTrack) {
              appState.djMixPreloadedFor = currentId;
              appState.djMixNextTrack = nextTrack;
              preloadNextForDjMix(nextTrack).catch(() => {});
            } else {
              appState.djMixNextTrack = null;
            }
          }
        }

        // Arrancar la siguiente en silencio unos segundos antes del cruce
        if (currentId && appState.djMixNextTrack && appState.djMixInactiveStartedFor !== currentId) {
          if (appState.djMixNextTrack.videoId === currentId) {
            appState.djMixNextTrack = null;
            return;
          }
          if (duration > 10 && remaining > 0 && remaining <= (appState.djMixLeadStartSec || 4)) {
            appState.djMixInactiveStartedFor = currentId;
            if (window.electronAPI?.djControlWindow) {
              window.electronAPI.djControlWindow('inactive', 'play');
              window.electronAPI.djSetWindowVolume?.('inactive', 0);
            }
          }
        }

        if (currentId && appState.djMixTriggeredFor !== currentId) {
          if (duration > 10 && remaining <= remainingTriggerSec) {
            appState.djMixTriggeredFor = currentId;

            // Si se pre-cargó, mezclar con ventana secundaria
            if (appState.djMixNextTrack && appState.djMixNextTrack.videoId !== currentId) {
              runDjCrossfadeToNext(appState.djMixNextTrack);
            } else {
              appState.djMixNextTrack = null;
              // Intentar precargar rápido si no estaba listo
              const nextTrack = getNextTrackForDjMix();
              if (nextTrack) {
                appState.djMixNextTrack = nextTrack;
                preloadNextForDjMix(nextTrack).catch(() => {});
              }
              // Fallback al mix simple
              const playNext = () => {
                let played = false;
                if (appState.playQueue && appState.playQueue.length > 0) {
                  played = playNextInQueue();
                }
                if (!played && window.playlistManager) {
                  window.playlistManager.playNextPlaylistInSequence();
                }
              };

              if (window.runDjMixTransition) {
                window.runDjMixTransition(playNext);
              } else {
                playNext();
              }
            }
          }
        }
      }
    });
  }
  
  // Escuchar cuando se comienza la reproducción
  if (window.electronAPI && window.electronAPI.onAudioStarted) {
    window.electronAPI.onAudioStarted((data) => {
      appState.isPlaying = true;
      if (window.musicPlayer) {
        window.musicPlayer.isPlaying = true;
        window.musicPlayer.updatePlayButton();
        window.musicPlayer.syncDjMixButtons?.();
      }
    });
  }

  // ⭐ Envolver reproducción para DJ Mix
  initDjMixWrappers();
  
  // Escuchar cuando se pausa la reproducción
  if (window.electronAPI && window.electronAPI.onAudioPaused) {
    window.electronAPI.onAudioPaused((data) => {
      appState.isPlaying = false;
      if (window.musicPlayer) {
        window.musicPlayer.isPlaying = false;
        window.musicPlayer.updatePlayButton();
      }
    });
  }
  
  // ⭐ Escuchar cuando termina un video para reproducir siguiente de la cola
  if (window.electronAPI && window.electronAPI.onVideoEnded) {
    window.electronAPI.onVideoEnded(() => {
      console.log('[QUEUE] Video terminado, verificando cola...');
      // Fallback DJ: si hay track precargado y no se mezcló, intentar ahora
      if (appState.djMixEnabled && !appState.djMixInProgress && appState.djMixNextTrack) {
        const currentId = appState.currentTrack?.videoId || null;
        if (currentId && appState.djMixNextTrack.videoId === currentId) {
          appState.djMixNextTrack = null;
        } else {
          runDjCrossfadeToNext(appState.djMixNextTrack);
          return;
        }
      }
      // Intentar reproducir siguiente en la cola
      let playedNext = false;
      if (appState.playQueue && appState.playQueue.length > 0) {
        playedNext = playNextInQueue();
      }
      if (!playedNext && window.playlistManager) {
        const playFn = () => window.playlistManager.playNextPlaylistInSequence();
        if (window.runDjMixTransition) {
          window.runDjMixTransition(playFn);
        } else {
          playFn();
        }
      }
    });
  }
  
  // Escuchar cambios de cover
  if (window.electronAPI && window.electronAPI.onUpdateAlbumCover) {
    window.electronAPI.onUpdateAlbumCover((coverUrl) => {
      const trackImage = document.getElementById('trackImage');
      if (trackImage) {
        trackImage.src = coverUrl;
        trackImage.style.display = 'block';
      }
      // ⭐ Actualizar thumbnail en currentTrack
      if (appState.currentTrack) {
        appState.currentTrack.thumbnail = coverUrl;
      }
    });
  }
  
  // ⭐ Escuchar actualizaciones de info del video (para favoritos)
  if (window.electronAPI && window.electronAPI.onUpdateVideoInfo) {
    window.electronAPI.onUpdateVideoInfo((videoInfo) => {
      console.log('📺 Video info actualizada:', videoInfo);
      
      // Actualizar currentTrack con la info del video
      appState.currentTrack = {
        videoId: videoInfo.videoId,
        title: videoInfo.title,
        artist: videoInfo.channel || videoInfo.artist,
        channel: videoInfo.channel || videoInfo.artist,
        thumbnail: videoInfo.thumbnail || appState.currentTrack?.thumbnail,
        channelAvatar: videoInfo.channelAvatar || appState.currentTrack?.channelAvatar
      };

      appState.nextVideoInfo = videoInfo.nextVideo || null;
      appState.prevVideoInfo = videoInfo.prevVideo || null;

      // Resetear trigger DJ cuando cambia la canción
      if (appState.djMixTriggeredFor && appState.djMixTriggeredFor !== appState.currentTrack.videoId) {
        appState.djMixTriggeredFor = null;
      }
      if (appState.djMixPreloadedFor && appState.djMixPreloadedFor !== appState.currentTrack.videoId) {
        appState.djMixPreloadedFor = null;
        appState.djMixNextTrack = null;
      }
      
      // Actualizar UI
      document.getElementById('trackName').textContent = videoInfo.title;
      document.getElementById('trackArtist').textContent = videoInfo.channel || videoInfo.artist;

      if (window.scheduleMarqueeRefresh) {
        window.scheduleMarqueeRefresh();
      }

      if (window.musicPlayer?.updateSkipPreviews) {
        window.musicPlayer.updateSkipPreviews();
      }
      
      // Actualizar el botón de like
      updateLikeButton();
      
      // ⭐ Actualizar NowPlaying con info de next/prev de YouTube
      if (window.nowPlayingManager?.isActive) {
        window.nowPlayingManager.updateSideImages(videoInfo.nextVideo, videoInfo.prevVideo);
      }
    });
  }
  
  // Escuchar login de YouTube
  if (window.electronAPI && window.electronAPI.onYouTubeUserLoggedIn) {
    window.electronAPI.onYouTubeUserLoggedIn((data) => {
      console.log('✅ YouTube user logged in:', data);
      appState.youtubeUser = data.user;
      appState.isLoggedIn = true;
      
      // ⭐ NO recargar contenido aquí - ya se está cargando en checkInitialSession
      updateLoaderStatus('Sesión iniciada, cargando contenido...');
    });
  }
  
  // Escuchar logout de YouTube
  if (window.electronAPI && window.electronAPI.onYouTubeUserLoggedOut) {
    window.electronAPI.onYouTubeUserLoggedOut((data) => {
      console.log('❌ YouTube user logged out');
      appState.youtubeUser = null;
      appState.isLoggedIn = false;
    });
  }
  
  // ⭐ Escuchar cuando se debe actualizar el historial (nueva canción)
  if (window.electronAPI && window.electronAPI.onRefreshHistory) {
    window.electronAPI.onRefreshHistory(() => {
      console.log('🔄 Actualizando historial por cambio de canción...');
      // Esperar para que YouTube registre la reproducción
      setTimeout(() => {
        loadRecentlyPlayed(true); // true = silencioso
      }, 5000); // 5 segundos para que YouTube actualice
    });
  }
  
  // ⭐ Configurar el botón de like del player
  setupLikeButton();
  
  // ⭐ Cargar favoritos del storage
  loadFavoritesFromStorage();
  
  // ⭐ Conectar acciones del Home
  wireHomeActions();
  
  // ⭐ Escuchar cuando se abre el modal de actualización
  if (window.electronAPI && window.electronAPI.onUpdateModalOpened) {
    window.electronAPI.onUpdateModalOpened(() => {
      console.log('🔒 Modal de actualización abierto, bloqueando loader');
      updateModalOpen = true;
    });
  }
  
  // ⭐ Escuchar cuando se cierra el modal de actualización
  if (window.electronAPI && window.electronAPI.onUpdateModalClosed) {
    window.electronAPI.onUpdateModalClosed(() => {
      console.log('✅ Modal de actualización cerrado, desbloqueando loader');
      updateModalOpen = false;
      hideLoader();
    });
  }
  
  // ⭐ Cargar contenido inicial
  checkInitialSession();
  
  console.log('✨ SeaxMusic ready!');
}

// ⭐ Configurar el botón de like para agregar/quitar favoritos
function setupLikeButton() {
  const likeBtn = document.getElementById('likeBtn');
  if (likeBtn) {
    likeBtn.addEventListener('click', async (e) => {
      e.stopPropagation();

      if (appState.isSwitchingAccount) {
        console.log('⏳ Cambio de cuenta en progreso, evitando like');
        return;
      }
      
      if (!appState.currentTrack || !appState.currentTrack.videoId) {
        console.log('❌ No hay canción actual para agregar a favoritos');
        return;
      }
      
      if (isFavorite(appState.currentTrack.videoId)) {
        // Quitar de favoritos
        await removeFromFavorites(appState.currentTrack.videoId);
        console.log('💔 Quitado de favoritos:', appState.currentTrack.title);
      } else {
        // Agregar a favoritos
        await addToFavorites(appState.currentTrack);
        console.log('💖 Agregado a favoritos:', appState.currentTrack.title);
      }
      
      updateLikeButton();
    });
  }
}

// ⭐ Verificar si hay sesión guardada para mostrar loader
async function checkInitialSession() {
  // ⭐ Siempre mostrar loader al iniciar
  if (window.appState) {
    window.appState.loaderAllowed = true;
  }
  showLoader('Cargando tu música...');
  updateLoaderStatus('Conectando con YouTube...');
  
  try {
    const userData = await window.electronAPI.loadUserData();
    if (userData && userData.isLoggedIn) {
      appState.isLoggedIn = true;
      updateLoaderStatus('Bienvenido de vuelta...');
    }
  } catch (e) {
    console.log('No hay sesión previa');
  }
  
  // Cargar contenido
  loadFavoritesContent();
  loadRecentlyPlayed();
}

// ⭐ Load favorites content from storage (home modules)
function loadFavoritesContent() {
  const userPlaylistGrid = document.getElementById('userPlaylistGrid');
  if (userPlaylistGrid) {
    renderUserPlaylist();
  }
  
  appState.contentLoaded.favorites = true;
  checkAllContentLoaded();
  
  renderHomeModules();
}

// ⭐ Mostrar favoritos en el grid (con botón de quitar)
function displayFavoritesInGrid(gridElement, videos) {
  gridElement.innerHTML = '';
  
  videos.forEach(video => {
    const card = document.createElement('div');
    card.className = 'music-card favorite-card';
    card.setAttribute('data-video-id', video.videoId);
    
    const artistName = video.channel || video.artist || 'YouTube';
    const videoTitle = video.title || 'Sin título';
    
    card.innerHTML = `
      <div class="card-image">
        ${createImageWithFallback(video)}
        <div class="card-overlay">
          <button class="play-card-btn"><i class="fas fa-play"></i></button>
        </div>
        <button class="remove-favorite-btn" title="Quitar de favoritos">
          <i class="fas fa-heart-broken"></i>
        </button>
        ${video.duration ? `<span class="card-duration">${video.duration}</span>` : ''}
      </div>
      <div class="card-info">
        <p class="card-title" title="${videoTitle}">${videoTitle}</p>
        <p class="card-artist" title="${artistName}">${artistName}</p>
      </div>
    `;
    
    // Click en botón de quitar favorito
    const removeBtn = card.querySelector('.remove-favorite-btn');
    removeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      removeFromFavorites(video.videoId);
      console.log('💔 Quitado de favoritos:', videoTitle);
    });
    
    // Click para reproducir
    card.addEventListener('click', () => {
      console.log('🎵 Reproduciendo favorito:', videoTitle);
      
      // Actualizar track actual
      appState.currentTrack = {
        videoId: video.videoId,
        title: videoTitle,
        artist: artistName,
        thumbnail: video.thumbnail
      };
      
      // Actualizar UI
      document.getElementById('trackName').textContent = videoTitle;
      document.getElementById('trackArtist').textContent = artistName;
      document.getElementById('trackImage').src = video.thumbnail;
      
      // Actualizar botón like
      updateLikeButton();
      
      // Reproducir en YouTube
      if (window.electronAPI && window.electronAPI.playVideo) {
        window.electronAPI.playVideo(video.videoId, videoTitle, artistName);
      }
    });
    
    gridElement.appendChild(card);
  });
}

// ⭐ Placeholder para cuando no hay favoritos
function displayFavoritesPlaceholder(gridElement) {
  gridElement.innerHTML = `
    <div class="music-card placeholder-card empty-favorites">
      <div class="card-image" style="background: linear-gradient(135deg, #282828, #E13838);">
        <i class="fas fa-heart" style="font-size: 48px; color: rgba(255,255,255,0.3);"></i>
      </div>
      <div class="card-info">
        <p class="card-title">Sin favoritos aún</p>
        <p class="card-artist">Dale ❤️ a una canción</p>
      </div>
    </div>
  `;
}

// Load recently played
function loadRecentlyPlayed(silent = false) {
  const recentGrid = document.getElementById('recentGrid');
  
  const userData = localStorage.getItem('seaxmusic_user');
  if (!userData) {
    if (!silent && recentGrid) {
      recentGrid.innerHTML = `
        <div class="skeleton-card"><div class="skeleton-line"></div></div>
        <div class="skeleton-card"><div class="skeleton-line"></div></div>
        <div class="skeleton-card"><div class="skeleton-line"></div></div>
        <div class="skeleton-card"><div class="skeleton-line"></div></div>
      `;
    }
    appState.recentHistory = [];
    appState.contentLoaded.history = true;
    checkAllContentLoaded();
    renderHomeModules();
    return;
  }

  if (!silent) {
    // Skeleton cards directamente en el grid (hereda el display grid del .card-grid)
    recentGrid.innerHTML = `
      <div class="skeleton-card"><div class="skeleton-line"></div></div>
      <div class="skeleton-card"><div class="skeleton-line"></div></div>
      <div class="skeleton-card"><div class="skeleton-line"></div></div>
      <div class="skeleton-card"><div class="skeleton-line"></div></div>
      <div class="skeleton-card"><div class="skeleton-line"></div></div>
      <div class="skeleton-card"><div class="skeleton-line"></div></div>
    `;
    updateLoaderStatus('Cargando tu historial...');
  }
  
  // Intentar obtener historial de YouTube
  if (window.electronAPI && window.electronAPI.getHistoryVideos) {
    window.electronAPI.getHistoryVideos()
      .then(response => {
        appState.contentLoaded.history = true;
        if (response.success && response.videos.length > 0) {
          console.log('📺 Historial recibido:', response.videos.length, 'videos');
          
          // ⭐ Guardar historial en appState para Now Playing
          appState.recentHistory = response.videos.map(v => ({
            videoId: v.videoId,
            title: v.title,
            artist: v.artist || v.channel,
            channel: v.channel,
            thumbnail: v.thumbnail,
            duration: v.duration
          }));
          
          displayVideosInGrid(recentGrid, response.videos);
        } else {
          displayPlaceholderContent(recentGrid, 'recent');
        }
        checkAllContentLoaded();
        renderHomeModules();
      })
      .catch(err => {
        console.error('Error cargando historial:', err);
        appState.contentLoaded.history = true;
        displayPlaceholderContent(recentGrid, 'recent');
        checkAllContentLoaded();
        renderHomeModules();
      });
  } else {
    appState.contentLoaded.history = true;
    displayPlaceholderContent(recentGrid, 'recent');
    checkAllContentLoaded();
    renderHomeModules();
  }
}

// Mostrar videos en un grid (para historial)
// ⭐ Obtener mejor thumbnail con fallbacks
function getBestThumbnail(video) {
  const videoId = video.videoId || '';
  const defaultImg = './assets/img/icon.png';
  
  // Si ya tiene thumbnail, usarlo
  if (video.thumbnail && video.thumbnail.startsWith('http')) {
    return video.thumbnail;
  }
  
  // Intentar obtener maxresdefault de YouTube
  if (videoId) {
    return `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
  }
  
  return defaultImg;
}

// ⭐ Crear HTML de imagen con fallbacks
function createImageWithFallback(video) {
  const videoId = video.videoId || '';
  const defaultImg = './assets/img/icon.png';
  
  // Orden de prioridad: thumbnail original → maxresdefault → hqdefault → icon
  const primarySrc = video.thumbnail && video.thumbnail.startsWith('http') 
    ? video.thumbnail 
    : (videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : defaultImg);
  
  return `
    <img class="card-img" src="${primarySrc}" 
         onerror="this.onerror=null; this.src='https://i.ytimg.com/vi/${videoId}/hqdefault.jpg'; this.onerror=function(){this.src='./assets/img/icon.png'};"
         alt="" loading="lazy">
  `;
}

function displayVideosInGrid(gridElement, videos) {
  gridElement.innerHTML = '';
  
  videos.forEach(video => {
    const card = document.createElement('div');
    card.className = 'music-card';
    card.setAttribute('data-video-id', video.videoId);
    
    // ⭐ Asegurar que siempre haya un canal/artista
    const artistName = video.channel || video.artist || 'YouTube';
    const videoTitle = video.title || 'Sin título';
    
    card.innerHTML = `
      <div class="card-image">
        ${createImageWithFallback(video)}
        <div class="card-overlay">
          <button class="play-card-btn"><i class="fas fa-play"></i></button>
        </div>
        ${video.duration ? `<span class="card-duration">${video.duration}</span>` : ''}
      </div>
      <div class="card-info">
        <p class="card-title" title="${videoTitle}">${videoTitle}</p>
        <p class="card-artist" title="${artistName}">${artistName}</p>
      </div>
    `;
    
    // Click para reproducir
    card.addEventListener('click', () => {
      console.log('🎵 Reproduciendo:', videoTitle);
      
      // ⭐ Actualizar track actual (para favoritos)
      appState.currentTrack = {
        videoId: video.videoId,
        title: videoTitle,
        artist: artistName,
        thumbnail: video.thumbnail,
        channel: artistName
      };
      
      // Actualizar UI
      document.getElementById('trackName').textContent = videoTitle;
      document.getElementById('trackArtist').textContent = artistName;
      document.getElementById('trackImage').src = video.thumbnail;
      
      // ⭐ Actualizar botón like
      updateLikeButton();
      
      // Reproducir en YouTube
      if (window.electronAPI && window.electronAPI.playVideo) {
        window.electronAPI.playVideo(video.videoId, videoTitle, artistName);
      } else if (window.electronAPI && window.electronAPI.send) {
        window.electronAPI.send('play-audio', {
          url: video.url,
          title: videoTitle,
          artist: artistName
        });
      }
    });
    
    gridElement.appendChild(card);
  });
}

// Mostrar contenido placeholder
function displayPlaceholderContent(gridElement, type) {
  gridElement.innerHTML = '';
  
  const placeholderItems = type === 'featured' 
    ? [
        { title: 'Mix Diario 1', icon: 'fa-music' },
        { title: 'Top Hits', icon: 'fa-fire' },
        { title: 'Descubrimiento', icon: 'fa-compass' }
      ]
    : [
        { title: 'Tu historial aparecerá aquí', icon: 'fa-history' }
      ];
  
  placeholderItems.forEach(item => {
    const card = document.createElement('div');
    card.className = 'music-card placeholder-card';
    card.innerHTML = `
      <div class="card-image" style="background: linear-gradient(135deg, #282828, #E13838);">
        <i class="fas ${item.icon}" style="font-size: 48px; color: rgba(255,255,255,0.3);"></i>
      </div>
      <p class="card-title">${item.title}</p>
    `;
    gridElement.appendChild(card);
  });
}

// ===== HOME MODULES (Inicio) =====
function getUniqueTracks(tracks = []) {
  const seen = new Set();
  return tracks.filter(track => {
    if (!track || !track.videoId || seen.has(track.videoId)) return false;
    seen.add(track.videoId);
    return true;
  });
}

function hashStringToSeed(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function mulberry32(seed) {
  return function() {
    let t = seed += 0x6D2B79F5;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function seededShuffle(list, seed) {
  const rng = mulberry32(seed);
  const arr = [...list];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function getSeaxVibesMix() {
  // Usar DJ Engine si está disponible
  if (window.djEngine) {
    const djMix = window.djEngine.generateSeaxVibes();
    if (djMix?.tracks?.length >= 5) {
      console.log('[SEAX VIBES] 🔥 Usando DJ Engine mix:', djMix.tracks.length, 'canciones');
      return djMix.tracks.slice(0, 12);
    }
  }
  
  // Fallback: historial reciente si DJ Engine no tiene suficientes datos
  const base = getUniqueTracks(appState.recentHistory || []);
  const seed = hashStringToSeed(new Date().toISOString().slice(0, 10));
  const shuffled = seededShuffle(base, seed);
  return shuffled.slice(0, 12);
}

function playTrack(track, queue = null, startIndex = 0) {
  if (!track || !track.videoId || !window.electronAPI) return;
  
  // ⭐ Limpiar info de playlist cuando se reproduce canción suelta
  if (window.electronAPI.clearCurrentPlaylist) {
    window.electronAPI.clearCurrentPlaylist();
  }
  if (window.playlistManager) {
    window.playlistManager.currentPlayingPlaylist = null;
  }
  
  if (queue && window.setPlayQueue) {
    window.setPlayQueue(queue, startIndex);
  }
  
  window.electronAPI.playAudio(
    `https://www.youtube.com/watch?v=${track.videoId}`,
    track.title || 'Sin título',
    track.artist || track.channel || 'Artista desconocido'
  );
}

function renderHomeMusicGrid(gridEl, videos, emptyLabel) {
  if (!gridEl) return;
  gridEl.innerHTML = '';
  
  if (!videos || videos.length === 0) {
    gridEl.innerHTML = `
      <div class="music-card placeholder-card home-empty-card">
        <div class="card-image">
          <i class="fas fa-music" style="font-size: 40px; color: rgba(255,255,255,0.25);"></i>
        </div>
        <div class="card-info">
          <p class="card-title">${emptyLabel}</p>
          <p class="card-artist">Explora y vuelve aquÃ­</p>
        </div>
      </div>
    `;
    return;
  }
  
  videos.forEach(video => {
    const card = document.createElement('div');
    card.className = 'music-card';
    
    const artistName = video.channel || video.artist || 'YouTube';
    const videoTitle = video.title || 'Sin tÃ­tulo';
    
    card.innerHTML = `
      <div class="card-image">
        ${createImageWithFallback(video)}
        <div class="card-overlay">
          <button class="play-card-btn"><i class="fas fa-play"></i></button>
        </div>
        ${video.duration ? `<span class="card-duration">${video.duration}</span>` : ''}
      </div>
      <div class="card-info">
        <p class="card-title" title="${videoTitle}">${videoTitle}</p>
        <p class="card-artist" title="${artistName}">${artistName}</p>
      </div>
    `;
    
    card.addEventListener('click', () => {
      playTrack(video);
    });
    
    gridEl.appendChild(card);
  });
}

function renderUserPlaylist() {
  const grid = document.getElementById('userPlaylistGrid');
  if (!grid) return;
  
  const userData = localStorage.getItem('seaxmusic_user');
  if (!userData) {
    grid.innerHTML = `<div class="empty-state-card">
      <i class="fas fa-user-lock"></i>
      <p>Inicia sesión para ver tus playlists</p>
    </div>`;
    return;
  }
  
  // ⭐ Obtener playlists del usuario
  const userPlaylists = window.playlistManager?.playlists || [];
  
  if (userPlaylists.length === 0) {
    grid.innerHTML = `<div class="empty-state-card">
      <i class="fas fa-plus-circle"></i>
      <p>Crea tu primera playlist</p>
      <button class="create-playlist-cta" onclick="window.playlistManager?.openModal()">
        <i class="fas fa-plus"></i> Nueva playlist
      </button>
    </div>`;
    return;
  }
  
  // Mostrar las playlists del usuario
  grid.innerHTML = '';
  userPlaylists.slice(0, 6).forEach(playlist => {
    const card = document.createElement('div');
    card.className = 'music-card playlist-home-card';
    
    const trackCount = (playlist.tracks || []).length;
    const coverHtml = window.playlistManager?.getPlaylistCoverHtml(playlist, 'medium') || '<i class="fas fa-music"></i>';
    
    card.innerHTML = `
      <div class="card-image playlist-card-cover">
        ${coverHtml}
        <div class="card-overlay">
          <button class="play-card-btn"><i class="fas fa-play"></i></button>
        </div>
        <span class="card-badge">${trackCount} canciones</span>
      </div>
      <div class="card-info">
        <p class="card-title" title="${playlist.name}">${playlist.name}</p>
        <p class="card-artist">${playlist.description || 'Tu playlist'}</p>
      </div>
    `;
    
    // Play button
    card.querySelector('.play-card-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      window.playlistManager?.playPlaylist(playlist, false);
    });
    
    // Click para abrir playlist
    card.addEventListener('click', () => {
      window.playlistManager?.showPlaylist(playlist.id);
    });
    
    grid.appendChild(card);
  });
}

function renderSeaxVibes() {
  const grid = document.getElementById('seaxVibesGrid');
  if (!grid) return;
  const mix = getSeaxVibesMix();
  renderHomeMusicGrid(grid, mix, 'Seax Vibes espera tus primeros plays');
}

// ⭐ Renderizar playlists del DJ automático
function renderDJPlaylists() {
  const grid = document.getElementById('djPlaylistsGrid');
  if (!grid) return;
  
  // Si djEngine no está listo, mostrar loading y reintentar
  if (!window.djEngine) {
    grid.innerHTML = `<div class="dj-loading">
      <i class="fas fa-spinner fa-spin"></i>
      <span>Analizando tu música...</span>
    </div>`;
    // Reintentar en 500ms
    setTimeout(renderDJPlaylists, 500);
    return;
  }
  
  const playlists = window.djEngine.getAutoPlaylists();

  // ⭐ Publicar automáticamente en comunidad si aplica
  if (window.djEngine.autoPublishIfNeeded) {
    window.djEngine.autoPublishIfNeeded();
  }
  
  if (!playlists || playlists.length === 0) {
    grid.innerHTML = `<div class="dj-empty">
      <i class="fas fa-headphones-alt"></i>
      <h3>DJ Seax te está conociendo</h3>
      <p>Escucha más música para que pueda crear playlists personalizadas para ti</p>
    </div>`;
    return;
  }
  
  grid.innerHTML = '';
  
  playlists.forEach(playlist => {
    const card = document.createElement('div');
    card.className = 'dj-playlist-card';
    card.style.setProperty('--accent-color', playlist.color || '#E13838');
    
    // Obtener hasta 4 thumbnails para el collage
    const thumbs = playlist.tracks.slice(0, 4).map(t => 
      t.thumbnail || `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg`
    );
    
    const coverHtml = thumbs.length >= 4 
      ? `<div class="dj-cover-collage">
          ${thumbs.map(src => `<img src="${src}" alt="">`).join('')}
        </div>`
      : thumbs.length > 0 
        ? `<img src="${thumbs[0]}" alt="" class="dj-cover-single">`
        : `<div class="dj-cover-icon"><i class="fas ${playlist.icon || 'fa-music'}"></i></div>`;
    
    card.innerHTML = `
      <div class="dj-card-cover">
        ${coverHtml}
        <div class="dj-card-overlay">
          <button class="dj-play-btn"><i class="fas fa-play"></i></button>
        </div>
        <div class="dj-card-badge">
          <i class="fas ${playlist.icon || 'fa-magic'}"></i>
        </div>
      </div>
      <div class="dj-card-info">
        <h4>${playlist.name}</h4>
        <p>${playlist.description}</p>
        <span class="dj-track-count">${playlist.tracks.length} canciones</span>
      </div>
    `;
    
    // Play button
    card.querySelector('.dj-play-btn')?.addEventListener('click', (e) => {
      e.stopPropagation();
      window.djEngine.playAutoPlaylist(playlist, false);
    });
    
    // Click en card - abrir playlist DJ
    card.addEventListener('click', () => {
      const id = window.djEngine.ensureLocalDJPlaylist(playlist);
      if (id && window.playlistManager) {
        window.playlistManager.showPlaylist(id);
      } else {
        window.djEngine.playAutoPlaylist(playlist, true);
      }
    });
    
    grid.appendChild(card);
  });
}

function renderDynamicCards() {
  const container = document.getElementById('homeActionCards');
  if (!container) return;
  
  const unique = getUniqueTracks(appState.recentHistory || []);
  const resume = unique[0];
  const topPick = unique[2] || unique[1] || unique[0];
  const discover = unique[4] || unique[3] || unique[1];
  
  const cards = [
    {
      id: 'resume',
      title: 'Reanudar',
      subtitle: resume ? resume.title : 'Sin reproducciÃ³n reciente',
      hint: resume ? (resume.artist || resume.channel || 'YouTube') : 'Pon una canciÃ³n',
      icon: 'fa-play',
      accent: 'accent',
      track: resume
    },
    {
      id: 'top',
      title: 'Top del dÃ­a',
      subtitle: topPick ? topPick.title : 'Tu ranking personal',
      hint: topPick ? (topPick.artist || topPick.channel || 'YouTube') : 'Historial vacÃ­o',
      icon: 'fa-bolt',
      accent: 'sun',
      track: topPick
    },
    {
      id: 'discover',
      title: 'Descubre',
      subtitle: discover ? discover.title : 'Busca algo nuevo',
      hint: discover ? (discover.artist || discover.channel || 'YouTube') : 'Recomendaciones listas',
      icon: 'fa-compass',
      accent: 'night',
      track: discover
    }
  ];
  
  container.innerHTML = cards.map(card => `
    <button class="home-action-card ${card.accent}" data-action="${card.id}" ${card.track ? '' : 'data-empty=\"true\"'}>
      <div class="action-card-icon"><i class="fas ${card.icon}"></i></div>
      <div class="action-card-text">
        <span class="action-card-title">${card.title}</span>
        <span class="action-card-subtitle">${card.subtitle}</span>
        <span class="action-card-hint">${card.hint}</span>
      </div>
      <div class="action-card-cta">
        <i class="fas fa-arrow-right"></i>
      </div>
    </button>
  `).join('');
  
  container.querySelectorAll('.home-action-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const action = btn.dataset.action;
      if (action === 'resume' && resume) playTrack(resume);
      if (action === 'top' && topPick) playTrack(topPick);
      if (action === 'discover' && discover) playTrack(discover);
      if (!resume && action === 'resume') openSearchPage();
      if (!topPick && action === 'top') openSearchPage();
      if (!discover && action === 'discover') openSearchPage();
    });
  });
}

function renderMoments() {
  const grid = document.getElementById('momentsGrid');
  const subtitle = document.getElementById('momentsSubtitle');
  if (!grid) return;
  
  const hour = new Date().getHours();
  const momentLabel = hour < 12 ? 'MaÃ±ana' : hour < 19 ? 'Tarde' : 'Noche';
  if (subtitle) subtitle.textContent = `Mood perfecto para la ${momentLabel.toLowerCase()}`;
  
  const moments = [
    { id: 'morning', title: 'Aurora', subtitle: 'Sube la energÃ­a', icon: 'fa-sun', accent: 'sun' },
    { id: 'afternoon', title: 'Rojo Vivo', subtitle: 'Ritmo continuo', icon: 'fa-fire', accent: 'accent' },
    { id: 'night', title: 'Medianoche', subtitle: 'Vibe nocturna', icon: 'fa-moon', accent: 'night' }
  ];
  
  grid.innerHTML = moments.map(item => `
    <button class="moment-card ${item.accent}" data-moment="${item.id}">
      <div class="moment-card-icon"><i class="fas ${item.icon}"></i></div>
      <div class="moment-card-text">
        <span class="moment-title">${item.title}</span>
        <span class="moment-subtitle">${item.subtitle}</span>
      </div>
      <div class="moment-card-glow"></div>
    </button>
  `).join('');
  
  grid.querySelectorAll('.moment-card').forEach(btn => {
    btn.addEventListener('click', () => {
      const mix = getSeaxVibesMix();
      if (mix.length > 0) {
        playTrack(mix[0], mix, 0);
      } else {
        openSearchPage();
      }
    });
  });
}

function renderHeroResume() {
  const card = document.getElementById('heroResumeCard');
  if (!card) return;
  
  const cover = document.getElementById('heroResumeCover');
  const titleEl = document.getElementById('heroResumeTitle');
  const artistEl = document.getElementById('heroResumeArtist');
  const resumeBtn = document.getElementById('heroResumeBtn');
  
  const track = getUniqueTracks(appState.recentHistory || [])[0];
  
  if (track) {
    if (cover) cover.src = track.thumbnail || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`;
    if (titleEl) titleEl.textContent = track.title || 'Sin tÃ­tulo';
    if (artistEl) artistEl.textContent = track.artist || track.channel || 'YouTube';
    if (resumeBtn) resumeBtn.disabled = false;
    card.dataset.videoId = track.videoId;
  } else {
    if (titleEl) titleEl.textContent = 'Sin reproducciÃ³n';
    if (artistEl) artistEl.textContent = 'Pon algo para empezar';
    if (resumeBtn) resumeBtn.disabled = true;
    card.dataset.videoId = '';
  }
}

function openSearchPage() {
  const navItems = document.querySelectorAll('.nav-item');
  navItems.forEach(item => {
    if (item.textContent.includes('Buscar')) {
      item.click();
    }
  });
}

function wireHomeActions() {
  const playMixBtn = document.getElementById('heroPlayMix');
  const exploreBtn = document.getElementById('heroExplore');
  const resumeBtn = document.getElementById('heroResumeBtn');
  const djPublishBtn = document.getElementById('djPublishBtn');
  
  if (playMixBtn) {
    playMixBtn.onclick = () => {
      const mix = getSeaxVibesMix();
      if (mix.length > 0) {
        playTrack(mix[0], mix, 0);
      } else {
        openSearchPage();
      }
    };
  }
  
  if (exploreBtn) {
    exploreBtn.onclick = () => {
      openSearchPage();
    };
  }
  
  if (resumeBtn) {
    resumeBtn.onclick = () => {
      const track = getUniqueTracks(appState.recentHistory || [])[0];
      if (track) playTrack(track);
    };
  }
  
  // ⭐ Botón publicar playlists del DJ en comunidad
  if (djPublishBtn) {
    djPublishBtn.onclick = () => {
      if (!window.djEngine) {
        console.log('[DJ] No hay DJ Engine disponible');
        return;
      }
      
      djPublishBtn.classList.add('publishing');
      djPublishBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Publicando...';
      
      setTimeout(() => {
        const created = window.djEngine.publishDJPlaylists();
        
        djPublishBtn.classList.remove('publishing');
        
        if (created && created.length > 0) {
          djPublishBtn.innerHTML = `<i class="fas fa-check"></i> ${created.length} publicada${created.length > 1 ? 's' : ''}`;
          
          // Refrescar sidebar de playlists
          if (window.playlistManager?.refreshSidebar) {
            window.playlistManager.refreshSidebar();
          }
          
          // Restaurar botón después de 3 segundos
          setTimeout(() => {
            djPublishBtn.innerHTML = '<i class="fas fa-share"></i> Publicar';
          }, 3000);
        } else {
          djPublishBtn.innerHTML = '<i class="fas fa-info-circle"></i> Ya publicadas hoy';
          setTimeout(() => {
            djPublishBtn.innerHTML = '<i class="fas fa-share"></i> Publicar';
          }, 2000);
        }
      }, 500);
    };
  }
}

function renderHomeModules() {
  if (typeof renderDJPlaylists === 'function') {
    renderDJPlaylists();
  }
  const hasUser = !!localStorage.getItem('seaxmusic_user');
  const hasHistory = (appState.recentHistory || []).length > 0;
  const hasFavorites = (appState.favorites || []).length > 0;
  if (!hasUser && !hasHistory && !hasFavorites) {
    renderHomeSkeletons();
    return;
  }
  renderHeroResume();
  renderDynamicCards();
  renderSeaxVibes();
  renderDJPlaylists(); // ⭐ DJ Engine playlists
  renderMoments();
  renderUserPlaylist();
}

function renderHomeSkeletons() {
  const vibesGrid = document.getElementById('seaxVibesGrid');
  const djGrid = document.getElementById('djPlaylistsGrid');
  const playlistGrid = document.getElementById('userPlaylistGrid');
  const actionCards = document.getElementById('homeActionCards');
  const momentsGrid = document.getElementById('momentsGrid');

  renderSkeletonGrid(vibesGrid, 6);
  renderSkeletonGrid(djGrid, 4);
  renderSkeletonGrid(playlistGrid, 6);
  renderSkeletonCards(actionCards, 3);
  renderSkeletonCards(momentsGrid, 3);
  renderHeroResume();
}

function renderSkeletonGrid(container, count) {
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.className = 'music-card skeleton-card';
    card.innerHTML = `
      <div class="card-image skeleton-box"></div>
      <div class="card-info">
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
      </div>
    `;
    container.appendChild(card);
  }
}

function renderSkeletonCards(container, count) {
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < count; i++) {
    const card = document.createElement('div');
    card.className = 'home-action-card skeleton-card';
    card.innerHTML = `
      <div class="action-card-icon skeleton-box"></div>
      <div class="action-card-text">
        <div class="skeleton-line"></div>
        <div class="skeleton-line short"></div>
      </div>
      <div class="action-card-cta skeleton-box"></div>
    `;
    container.appendChild(card);
  }
}

// ===== PERSISTIR CANCIÓN AL CERRAR =====
const LAST_TRACK_KEY = 'seaxmusic_last_track';

function saveCurrentTrack() {
  if (appState.currentTrack?.videoId) {
    try {
      localStorage.setItem(LAST_TRACK_KEY, JSON.stringify({
        ...appState.currentTrack,
        savedAt: new Date().toISOString()
      }));
      console.log('[PERSIST] 💾 Canción guardada:', appState.currentTrack.title);
    } catch (e) {
      console.error('[PERSIST] Error guardando canción:', e);
    }
  }
}

function restoreLastTrack() {
  try {
    const saved = localStorage.getItem(LAST_TRACK_KEY);
    if (saved) {
      const track = JSON.parse(saved);
      if (track?.videoId) {
        appState.currentTrack = track;
        
        // Actualizar UI sin reproducir
        const trackNameEl = document.getElementById('trackName');
        const trackArtistEl = document.getElementById('trackArtist');
        const trackImageEl = document.getElementById('trackImage');
        
        if (trackNameEl) trackNameEl.textContent = track.title || 'Sin título';
        if (trackArtistEl) trackArtistEl.textContent = track.artist || 'Artista desconocido';
        if (trackImageEl) trackImageEl.src = track.thumbnail || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`;
        
        // Actualizar botón like
        if (window.updateLikeButton) {
          window.updateLikeButton();
        }
        
        console.log('[PERSIST] 🔄 Canción restaurada (pausada):', track.title);
        
        // Limpiar localStorage después de restaurar
        localStorage.removeItem(LAST_TRACK_KEY);
        return true;
      }
    }
  } catch (e) {
    console.error('[PERSIST] Error restaurando canción:', e);
  }
  return false;
}

// Guardar canción al cerrar ventana
window.addEventListener('beforeunload', () => {
  saveCurrentTrack();
});

// Guardar cada vez que cambia la canción (por si la app crashea)
window.saveCurrentTrack = saveCurrentTrack;

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

// Export state and functions for other modules
window.appState = appState;
window.loadHistoryContent = loadRecentlyPlayed;
window.loadRecentlyPlayed = loadRecentlyPlayed;
window.renderHomeModules = renderHomeModules;
window.wireHomeActions = wireHomeActions;

// ⭐ Exponer favoritesManager para sincronización global
window.favoritesManager = {
  isFavorite: (videoId) => {
    if (!videoId) return false;
    // Asegurarse de que favorites es un array
    const favorites = appState.favorites || [];
    return favorites.some(v => v && v.videoId === videoId);
  },
  addFavorite: (video) => addToFavorites(video),
  removeFavorite: (videoId) => removeFromFavorites(videoId),
  toggleFavorite: async (video) => {
    if (!video || !video.videoId) return false;
    if (appState.isSwitchingAccount) return false;
    
    const favorites = appState.favorites || [];
    const isCurrentlyFavorite = favorites.some(v => v && v.videoId === video.videoId);
    
    if (isCurrentlyFavorite) {
      await removeFromFavorites(video.videoId);
      return false; // Ya no es favorito
    } else {
      await addToFavorites(video);
      return true; // Ahora es favorito
    }
  },
  getFavorites: () => appState.favorites || [],
  // Forzar recarga de favoritos
  reload: async () => {
    await loadFavoritesFromStorage();
    return appState.favorites || [];
  }
};
