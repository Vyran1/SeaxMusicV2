const { contextBridge, ipcRenderer } = require('electron');

// ===== Mantener reproducción en segundo plano (anti-throttle) =====
try {
  const forceVisible = () => {
    const doc = document;
    const props = {
      hidden: { get: () => false },
      visibilityState: { get: () => 'visible' },
      webkitVisibilityState: { get: () => 'visible' }
    };
    for (const key of Object.keys(props)) {
      try { Object.defineProperty(doc, key, props[key]); } catch (e) {}
    }
  };

  forceVisible();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && !window.__seaxUserPaused) {
      const v = document.querySelector('video');
      v?.play?.().catch(() => {});
    }
  });
} catch (e) {}

// ===== BLOQUEADOR DE ANUNCIOS DE YOUTUBE (basado en kananinirav/Youtube-AdBlocker) =====
(function() {
  const debugMessages = false;
  let isAdFound = false;
  let adLoop = 0;
  let videoPlayback = 1;

  function log(message, level = 'l') {
    if (!debugMessages) return;
    const prefix = '[AdBlocker]';
    switch (level) {
      case 'e': console.error(prefix, message); break;
      case 'w': console.warn(prefix, message); break;
      default: console.log(prefix, message);
    }
  }

  // Función principal para remover anuncios
  function removeAds() {
    log('Iniciando bloqueador de anuncios...');

    setInterval(() => {
      const video = document.querySelector('video');
      const ad = document.querySelector('.ad-showing');

      if (ad) {
        isAdFound = true;
        adLoop++;

        // Método 1: Click en skip button
        if (adLoop < 10) {
          const openAdCenterButton = document.querySelector('.ytp-ad-button-icon');
          openAdCenterButton?.click();

          const blockAdButton = document.querySelector('[label="Block ad"]');
          blockAdButton?.click();

          const blockAdButtonConfirm = document.querySelector('.Eddif [label="CONTINUE"] button');
          blockAdButtonConfirm?.click();

          const closeAdCenterButton = document.querySelector('.zBmRhe-Bz112c');
          closeAdCenterButton?.click();
        }

        // Método 2: Speed skip - acelerar y saltar al final
        const skipButtons = [
          'ytp-ad-skip-button-container',
          'ytp-ad-skip-button-modern', 
          '.videoAdUiSkipButton',
          '.ytp-ad-skip-button',
          '.ytp-ad-skip-button-slot',
          '.ytp-skip-ad-button'
        ];

        if (video) {
          video.playbackRate = 16; // Acelerar
          video.volume = 0; // Silenciar

          skipButtons.forEach(selector => {
            const elements = document.querySelectorAll(selector);
            elements.forEach(el => el?.click());
          });

          // Saltar al final del anuncio
          if (video.duration) {
            video.currentTime = video.duration + 0.1;
          }
          
          video.play();
          log('Anuncio saltado ✔️');
        }
      } else {
        // Sin anuncio - restaurar velocidad normal
        if (video && video.playbackRate === 16) {
          video.playbackRate = videoPlayback;
        }

        if (isAdFound) {
          isAdFound = false;
          if (videoPlayback === 16) videoPlayback = 1;
          if (video && isFinite(videoPlayback)) video.playbackRate = videoPlayback;
          adLoop = 0;
        } else {
          if (video) videoPlayback = video.playbackRate;
        }
      }
    }, 100);

    removePageAds();
  }

  // Remover anuncios de la página (banners, etc)
  function removePageAds() {
    const style = document.createElement('style');
    style.textContent = `
      ytd-action-companion-ad-renderer,
      ytd-display-ad-renderer,
      ytd-video-masthead-ad-advertiser-info-renderer,
      ytd-video-masthead-ad-primary-video-renderer,
      ytd-in-feed-ad-layout-renderer,
      ytd-ad-slot-renderer,
      yt-about-this-ad-renderer,
      yt-mealbar-promo-renderer,
      ytd-statement-banner-renderer,
      ytd-banner-promo-renderer-background,
      .ytd-video-masthead-ad-v3-renderer,
      div#root.style-scope.ytd-display-ad-renderer.yt-simple-endpoint,
      div#sparkles-container.style-scope.ytd-promoted-sparkles-web-renderer,
      div#main-container.style-scope.ytd-promoted-video-renderer,
      div#player-ads.style-scope.ytd-watch-flexy,
      ad-slot-renderer,
      ytm-promoted-sparkles-web-renderer,
      masthead-ad,
      tp-yt-iron-overlay-backdrop,
      #masthead-ad,
      ytd-promoted-sparkles-web-renderer,
      .ytp-ad-module,
      .video-ads.ytp-ad-module {
        display: none !important;
      }
    `;
    document.head.appendChild(style);
    log('Estilos anti-anuncios aplicados ✔️');
  }

  // Remover popups molestos
  function popupRemover() {
    setInterval(() => {
      const modalOverlay = document.querySelector('tp-yt-iron-overlay-backdrop');
      const popup = document.querySelector('.style-scope.ytd-enforcement-message-view-model');
      const popupButton = document.getElementById('dismiss-button');
      const video = document.querySelector('video');

      document.body.style.setProperty('overflow-y', 'auto', 'important');

      if (modalOverlay) {
        modalOverlay.removeAttribute('opened');
        modalOverlay.remove();
      }

      if (popup) {
        log('Popup detectado, removiendo...');
        if (popupButton) popupButton.click();
        popup.remove();
        if (video) {
          video.play();
          setTimeout(() => video.play(), 500);
        }
        log('Popup removido ✔️');
      }
    }, 1000);
  }

  // Iniciar cuando el DOM esté listo
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      removeAds();
      popupRemover();
    });
  } else {
    removeAds();
    popupRemover();
  }

  console.log('[SeaxMusic] 🛡️ Bloqueador de anuncios activado');
})();

// ===== API DE CONTROL DE YOUTUBE =====
contextBridge.exposeInMainWorld('youtubeControls', {
  // Escuchar comandos del proceso principal
  onControl: (callback) => {
    ipcRenderer.on('youtube-control', (event, action, value) => {
      callback(action, value);
    });
  }
});

// ===== API PARA CAPTURAR VIDEO STREAM =====
contextBridge.exposeInMainWorld('videoStreamAPI', {
  requestVideoStream: () => {
    ipcRenderer.send('capture-video-stream');
  }
});

// ===== Video Preview Stream =====
let previewActive = false;
let previewRaf = null;
let previewCanvas = null;
let previewCtx = null;

function getVideoElement() {
  return document.querySelector('video');
}

function stopPreview() {
  previewActive = false;
  if (previewRaf) {
    cancelAnimationFrame(previewRaf);
    previewRaf = null;
  }
}

function startPreview() {
  if (previewActive) return;
  previewActive = true;
  if (!previewCanvas) {
    previewCanvas = document.createElement('canvas');
    previewCtx = previewCanvas.getContext('2d');
  }

  const loop = () => {
    if (!previewActive) return;
    const video = getVideoElement();
    if (video && video.videoWidth && video.videoHeight && previewCtx) {
      try {
        previewCanvas.width = video.videoWidth;
        previewCanvas.height = video.videoHeight;
        previewCtx.drawImage(video, 0, 0, previewCanvas.width, previewCanvas.height);
        const dataUrl = previewCanvas.toDataURL('image/jpeg', 0.7);
        ipcRenderer.send('video-preview-frame', dataUrl);
      } catch (e) {
        // Si el canvas se tainta, ignorar
      }
    }
    previewRaf = requestAnimationFrame(loop);
  };

  previewRaf = requestAnimationFrame(loop);
}

ipcRenderer.on('video-preview-start', () => startPreview());
ipcRenderer.on('video-preview-stop', () => stopPreview());

// ===== API PARA RECOMENDACIONES DE YOUTUBE =====
contextBridge.exposeInMainWorld('youtubeRecommendations', {
  getRelevantVideoId: (currentArtist, currentVideoId) => {
    const relatedVideos = document.querySelectorAll('ytd-compact-video-renderer');
    let skippedCurrent = false;

    for (const video of relatedVideos) {
      const titleElement = video.querySelector('#video-title');
      const thumbnailElement = video.querySelector('a#thumbnail');
      const videoUrl = thumbnailElement ? thumbnailElement.getAttribute('href') : null;

      if (titleElement && videoUrl && videoUrl.includes('/watch')) {
        const videoTitle = titleElement.textContent.trim();
        const urlParams = new URLSearchParams(videoUrl.split('?')[1]);
        const videoId = urlParams.get('v');

        // Skip the currently playing video
        if (videoId === currentVideoId) {
          skippedCurrent = true;
          continue;
        }

        // Skip the first video if it's the same as the current one
        if (!skippedCurrent) {
          skippedCurrent = true;
          continue;
        }

        // Return the next valid video ID
        if (videoTitle && videoTitle.length > 0) {
          return videoId;
        }
      }
    }

    return null;
  }
});

// ===== API PARA CONTROL DE REPRODUCCIÓN =====
contextBridge.exposeInMainWorld('youtubePlayback', {
  resetInactivity: () => {
    const mouseMoveEvent = new MouseEvent('mousemove', {
      bubbles: true,
      cancelable: true,
      view: window
    });
    document.dispatchEvent(mouseMoveEvent);
    console.log('[Bypass] Simulated mouse movement to reset inactivity timer.');
  },
  forcePlay: () => {
    const video = document.querySelector('video');
    if (video) {
      video.play().then(() => {
        console.log('[Transition] Comando play forzado enviado.');
      }).catch((error) => {
        console.error('[Error] No se pudo forzar la reproducción:', error);
      });
    }
  }
});

// ===== API PARA BÚSQUEDA EN YOUTUBE =====
contextBridge.exposeInMainWorld('youtubeSearch', {
  resetInput: () => {
    const searchInput = document.querySelector('input#search');
    if (searchInput) {
      searchInput.value = '';
      const inputEvent = new Event('input', { bubbles: true });
      searchInput.dispatchEvent(inputEvent);
      console.log('[Reset] Search input field cleared.');
    }
  }
});

// ===== API DE LOGIN/LOGOUT =====
contextBridge.exposeInMainWorld('youtubeAPI', {
  notifyLogin: (userInfo) => {
    ipcRenderer.send('youtube-login-success', userInfo);
  },
  
  notifyLogout: (logoutInfo) => {
    ipcRenderer.send('youtube-logout-success', logoutInfo);
  },
  
  // Obtener el estado actual de login
  getLoginStatus: () => {
    return isLoggedIn;
  },
  
  onMessage: (callback) => {
    ipcRenderer.on('message-from-app', (event, data) => {
      callback(data);
    });
  },
  
  log: (message) => {
    console.log('[YouTube]', message);
  }
});

// ===== API PARA OBTENER VIDEOS DE YOUTUBE HOME Y HISTORIAL =====
// Función para extraer videos de la página actual
function extractVideosFromPage(maxCount = 10) {
  const videos = [];
  
  // Selectores para videos en YouTube
  const videoSelectors = [
    'ytd-rich-item-renderer',           // Home page
    'ytd-video-renderer',               // Search results / History
    'ytd-compact-video-renderer',       // Sidebar
    'ytd-grid-video-renderer'           // Grids
  ];
  
  for (const selector of videoSelectors) {
    const videoElements = document.querySelectorAll(selector);
    
    for (const el of videoElements) {
      if (videos.length >= maxCount) break;
      
      try {
        // Extraer título
        const titleEl = el.querySelector('#video-title, #video-title-link, a#video-title');
        const title = titleEl?.textContent?.trim() || titleEl?.getAttribute('title') || '';
        
        // Extraer URL del video
        const linkEl = el.querySelector('a#thumbnail, a#video-title-link, a#video-title');
        const href = linkEl?.getAttribute('href') || '';
        
        // Extraer video ID
        const videoIdMatch = href.match(/(?:v=|shorts\/)([a-zA-Z0-9_-]{11})/);
        const videoId = videoIdMatch ? videoIdMatch[1] : null;
        
        // Extraer thumbnail
        const thumbEl = el.querySelector('img#img, img.yt-core-image');
        const thumbnail = thumbEl?.src || (videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : '');
        
        // Extraer canal
        const channelEl = el.querySelector('#channel-name a, #text-container yt-formatted-string a, ytd-channel-name a');
        const channel = channelEl?.textContent?.trim() || '';
        
        // Extraer duración
        const durationEl = el.querySelector('span.ytd-thumbnail-overlay-time-status-renderer, #time-status span');
        const duration = durationEl?.textContent?.trim() || '';
        
        // Extraer vistas
        const viewsEl = el.querySelector('#metadata-line span:first-child, span.ytd-video-meta-block');
        const views = viewsEl?.textContent?.trim() || '';
        
        if (title && videoId && !videos.some(v => v.videoId === videoId)) {
          videos.push({
            title,
            videoId,
            thumbnail: thumbnail.startsWith('http') ? thumbnail : `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
            channel,
            duration,
            views,
            url: `https://www.youtube.com/watch?v=${videoId}`
          });
        }
      } catch (e) {
        console.error('[EXTRACT] Error extrayendo video:', e);
      }
    }
    
    if (videos.length >= maxCount) break;
  }
  
  return videos;
}

// Escuchar peticiones de videos destacados
ipcRenderer.on('get-featured-videos', (event, maxCount) => {
  console.log('[FEATURED] Solicitando videos destacados...');
  const videos = extractVideosFromPage(maxCount || 3);
  console.log('[FEATURED] Videos encontrados:', videos.length);
  ipcRenderer.send('featured-videos-response', videos);
});

// Escuchar peticiones de historial
ipcRenderer.on('get-history-videos', (event, maxCount) => {
  console.log('[HISTORY] Solicitando historial...');
  const videos = extractVideosFromPage(maxCount || 10);
  console.log('[HISTORY] Videos encontrados:', videos.length);
  ipcRenderer.send('history-videos-response', videos);
});

// ===== LISTENER PRINCIPAL: ESCUCHAR CONTROLES DE LA APP =====
// Esto es lo MÁS IMPORTANTE - Sin esto, YouTube no responde a los controles
ipcRenderer.on('youtube-control', (event, action, value) => {
  // ⭐ ESPERAR a que el video element esté disponible si no existe aún
  const findVideoElement = () => {
    let video = document.querySelector('video');
    
    if (!video) {
      // Si no existe video element, buscar en iframes (YouTube podría usar iframes)
      const iframes = document.querySelectorAll('iframe');
      for (let iframe of iframes) {
        try {
          const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
          video = iframeDoc.querySelector('video');
          if (video) break;
        } catch (e) {
          // CORS no permite acceso a iframes de YouTube
        }
      }
    }
    
    if (!video) {
      console.warn('⚠️ Video element not found yet, retrying...');
      // Reintentar en 100ms
      setTimeout(() => ipcRenderer.send('retry-youtube-control', { action, value }), 100);
      return null;
    }
    return video;
  };
  
  const video = findVideoElement();
  if (!video) {
    return;
  }

  console.log(`[CONTROL] YouTube Control Received: ${action}`, value);

  switch (action) {
    case 'play':
      if (window.__seaxDjInactive) {
        console.log('[DJ MIX] Bloqueando play en ventana inactiva');
        break;
      }
      window.__seaxUserPaused = false;
      video.play().catch(err => console.error('Play error:', err));
      console.log('[PLAY] Play command executed');
      break;
    case 'pause':
      window.__seaxUserPaused = true;
      video.pause();
      console.log('[PAUSE] Pause command executed');
      break;
    case 'volume':
      // Guardar el volumen del usuario para que el ad blocker lo use
      window._seaxUserVolume = Math.max(0, Math.min(1, value));
      video.volume = window._seaxUserVolume;
      // Reportar el volumen real al main process
      ipcRenderer.send('video-volume-updated', video.volume);
      break;
    case 'seek':
      video.currentTime = value;
      console.log(`[SEEK] Seek to: ${value}s`);
      break;
    case 'next':
      const nextButton = document.querySelector('.ytp-next-button');
      if (nextButton) {
        nextButton.click();
        console.log('[NEXT] Next button clicked');
      } else {
        console.warn('Next button not found');
      }
      break;
    case 'previous':
      const prevButton = document.querySelector('.ytp-prev-button');
      if (prevButton && prevButton.offsetParent !== null && !prevButton.disabled) {
        // El botón existe y está visible
        prevButton.click();
        console.log('[PREV] Previous button clicked');
      } else {
        // No hay botón prev disponible - reiniciar al inicio del video
        // Si el video tiene menos de 3 segundos reproducidos, intentar ir al anterior
        // Si tiene más, reiniciar al inicio
        if (video.currentTime > 3) {
          video.currentTime = 0;
          console.log('[PREV] Reiniciando video al inicio (no hay historial)');
        } else {
          // Intentar usar history.back o simplemente reiniciar
          video.currentTime = 0;
          console.log('[PREV] Video reiniciado (ya estaba al inicio)');
        }
      }
      break;
    case 'fullscreen': {
      const player = document.querySelector('.html5-video-player');
      const fullscreenBtn = document.querySelector('.ytp-fullscreen-button');
      const isFullscreen = !!document.fullscreenElement || player?.classList?.contains('ytp-fullscreen');
      if (!isFullscreen && fullscreenBtn) {
        fullscreenBtn.click();
        console.log('[FULLSCREEN] Fullscreen button clicked');
      }
      break;
    }
    default:
      console.warn(`Unknown action: ${action}`);
  }
});

// ===== DJ MIX: modo inactivo (evitar reproducción fantasma) =====
ipcRenderer.on('dj-set-mode', (event, { inactive }) => {
  window.__seaxDjInactive = !!inactive;
  const video = document.querySelector('video');
  if (window.__seaxDjInactive && video) {
    video.volume = 0;
    video.pause();
  }
});

setInterval(() => {
  if (!window.__seaxDjInactive) return;
  const video = document.querySelector('video');
  if (video) {
    if (!video.paused) {
      video.pause();
    }
    if (video.volume !== 0) {
      video.volume = 0;
    }
  }
}, 500);

// ===== OBSERVAR CAMBIOS DE VOLUMEN EN EL VIDEO =====
function attachVolumeObserver() {
  const video = document.querySelector('video');
  if (!video) return;

  if (video.dataset.seaxVolumeObserverAttached === '1') return;
  video.dataset.seaxVolumeObserverAttached = '1';

  video.addEventListener('volumechange', () => {
    // Si la app ya definió un volumen, mantenerlo como fuente de verdad
    if (typeof window._seaxUserVolume === 'number') {
      if (Math.abs(video.volume - window._seaxUserVolume) > 0.01) {
        video.volume = window._seaxUserVolume;
        return;
      }
      ipcRenderer.send('video-volume-updated', video.volume);
    }
  });

  // Si la app ya tiene volumen, aplicarlo inmediatamente
  if (typeof window._seaxUserVolume === 'number') {
    video.volume = window._seaxUserVolume;
    ipcRenderer.send('video-volume-updated', video.volume);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', attachVolumeObserver);
} else {
  attachVolumeObserver();
}

// ===== VARIABLES PARA MODOS DE REPRODUCCIÓN =====
let repeatMode = 'off';
let shuffleMode = false;
let lastRepeatTriggered = 0; // Timestamp para evitar repeticiones múltiples

// Escuchar cambios de modo desde main process
ipcRenderer.on('set-repeat-mode', (event, mode) => {
  repeatMode = mode;
  console.log('[PRELOAD] Repeat mode actualizado:', mode);
});

ipcRenderer.on('set-shuffle-mode', (event, enabled) => {
  shuffleMode = enabled;
  console.log('[PRELOAD] Shuffle mode actualizado:', enabled);
});

// ===== SISTEMA DE REPEAT MEJORADO =====
let videoEndedNotified = false;
let repeatCooldown = false;

// ⭐ Función para repetir el video actual
function repeatCurrentVideo() {
  const video = document.querySelector('video');
  if (!video) return;
  
  const now = Date.now();
  // Cooldown de 2 segundos para evitar triggers múltiples
  if (now - lastRepeatTriggered < 2000) {
    console.log('[REPEAT] Cooldown activo, ignorando...');
    return;
  }
  
  lastRepeatTriggered = now;
  console.log('[REPEAT] 🔁 Repitiendo canción...');
  
  // Método robusto: seek + play con múltiples intentos
  video.currentTime = 0;
  video.pause();
  
  setTimeout(() => {
    video.currentTime = 0;
    video.play().then(() => {
      console.log('[REPEAT] ✅ Video reiniciado correctamente');
    }).catch(e => {
      console.error('[REPEAT] Error al reproducir, reintentando...', e);
      setTimeout(() => {
        video.currentTime = 0;
        video.play().catch(e2 => console.error('[REPEAT] Segundo intento fallido:', e2));
      }, 500);
    });
  }, 100);
}

// ===== ENVIAR ACTUALIZACIONES DE TIEMPO CADA 500MS =====
setInterval(() => {
  const video = document.querySelector('video');
  if (video && !isNaN(video.currentTime) && !isNaN(video.duration) && video.duration > 0) {
    ipcRenderer.send('update-time', {
      currentTime: video.currentTime,
      duration: video.duration
    });
    
    // ⭐ DETECCIÓN ROBUSTA DE FIN DE VIDEO
    const timeRemaining = video.duration - video.currentTime;
    const isNearEnd = timeRemaining < 0.5 && timeRemaining >= 0;
    const isAtEnd = video.ended || (video.currentTime >= video.duration - 0.1);
    
    if ((isNearEnd || isAtEnd) && !videoEndedNotified && !repeatCooldown) {
      videoEndedNotified = true;
      repeatCooldown = true;
      
      console.log('[VIDEO] 🏁 Video terminado - Repeat mode:', repeatMode);
      
      if (repeatMode === 'one') {
        repeatCurrentVideo();
      } else {
        ipcRenderer.send('video-ended');
      }
      
      // Reset cooldown después de 3 segundos
      setTimeout(() => {
        repeatCooldown = false;
      }, 3000);
    }
    
    // Resetear flag cuando el video está en progreso (más del 5% y menos del 95%)
    if (video.currentTime > video.duration * 0.05 && video.currentTime < video.duration * 0.95) {
      videoEndedNotified = false;
    }
  }
}, 300);

// ⭐ Escuchar evento 'ended' del video (backup)
setTimeout(() => {
  const setupVideoEndListener = () => {
    const video = document.querySelector('video');
    if (video && !video._seaxEndListenerAdded) {
      video._seaxEndListenerAdded = true;
      
      video.addEventListener('ended', () => {
        console.log('[VIDEO] Evento ended disparado - Repeat mode:', repeatMode);
        
        if (repeatMode === 'one' && !repeatCooldown) {
          repeatCooldown = true;
          repeatCurrentVideo();
          setTimeout(() => { repeatCooldown = false; }, 3000);
        } else if (repeatMode !== 'one' && !videoEndedNotified) {
          videoEndedNotified = true;
          ipcRenderer.send('video-ended');
        }
      });
      
      // También escuchar pause al final del video
      video.addEventListener('pause', () => {
        if (video.currentTime >= video.duration - 0.5 && repeatMode === 'one' && !repeatCooldown) {
          console.log('[VIDEO] Video pausado al final, activando repeat...');
          repeatCooldown = true;
          setTimeout(() => {
            repeatCurrentVideo();
            setTimeout(() => { repeatCooldown = false; }, 3000);
          }, 100);
        }
      });
      
      console.log('[PRELOAD] ✅ Listeners de video configurados');
    }
  };
  
  // Configurar inmediatamente y también observar cambios
  setupVideoEndListener();
  setInterval(setupVideoEndListener, 2000);
}, 1000);

// ===== DETECTAR CAMBIOS DE VIDEO Y ENVIARLO AL MAIN PROCESS =====
let lastVideoUrl = '';

// ⭐ Función para verificar si es URL de login (NO procesar como video)
function isLoginUrl(url) {
  if (!url) return false;
  return url.includes('accounts.google.com') ||
         url.includes('signin') ||
         url.includes('ServiceLogin') ||
         url.includes('Logout') ||
         url.includes('login') ||
         url.includes('auth');
}

setInterval(() => {
  const currentVideoUrl = window.location.href;

  if (currentVideoUrl !== lastVideoUrl) {
    lastVideoUrl = currentVideoUrl;

    // ⭐ IGNORAR URLs de login de Google - NO son videos
    if (isLoginUrl(currentVideoUrl)) {
      console.log('[VIDEO] Ignorando URL de login (no es video):', currentVideoUrl.substring(0, 50) + '...');
      return;
    }

    // Extraer el ID del video
    const videoIdMatch = currentVideoUrl.match(/(?:v=|\.be\/)([a-zA-Z0-9_-]{11})/);
    const videoId = videoIdMatch ? videoIdMatch[1] : null;

    if (videoId) {
      const coverUrl = `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg`;
      console.log('[VIDEO] Video URL changed:', currentVideoUrl);
      ipcRenderer.send('video-url-changed', currentVideoUrl);
      ipcRenderer.send('video-cover-updated', coverUrl);

      // Aplicar SIEMPRE el volumen de la app al cargar un nuevo video
      const applyAppVolume = () => {
        const video = document.querySelector('video');
        if (video && typeof window._seaxUserVolume === 'number') {
          video.volume = window._seaxUserVolume;
          ipcRenderer.send('video-volume-updated', video.volume);
          console.log(`[VOLUME] 🎚️ Volumen de la app aplicado al nuevo video: ${Math.round(window._seaxUserVolume * 100)}%`);
        }
      };
      // Intentar varias veces para asegurar que el video esté listo
      setTimeout(applyAppVolume, 100);
      setTimeout(applyAppVolume, 300);
      setTimeout(applyAppVolume, 600);
      setTimeout(applyAppVolume, 1000);
      setTimeout(applyAppVolume, 2000);
    }
  }

  // Detectar cambios de estado play/pause
  const video = document.querySelector('video');
  if (video) {
    // Asegurar observer de volumen para el video actual
    attachVolumeObserver();

    // ===== Watchdog anti-bloqueo de reproducción =====
    try {
      const player = document.querySelector('#movie_player');
      const isAd = !!(player && player.classList.contains('ad-showing'));
      const now = Date.now();
      const currentTime = video.currentTime || 0;

      if (window.__seaxLastPlaybackTime === undefined) {
        window.__seaxLastPlaybackTime = currentTime;
        window.__seaxLastPlaybackTs = now;
      }

      const timeAdvanced = currentTime > window.__seaxLastPlaybackTime + 0.01;
      if (timeAdvanced) {
        window.__seaxLastPlaybackTime = currentTime;
        window.__seaxLastPlaybackTs = now;
      }

      const stalledMs = now - (window.__seaxLastPlaybackTs || now);
      const canRecover = !isAd && !window.__seaxUserPaused;

      // Evitar micro-cortes: solo recuperar si está pausado o realmente congelado
      if (canRecover && stalledMs > 8000 && (video.paused || video.readyState < 2)) {
        const lastRecover = window.__seaxLastRecoverTs || 0;
        if (now - lastRecover > 10000) {
          window.__seaxLastRecoverTs = now;
          video.play().catch(() => {});
        }
      }
    } catch (e) {
      // Evitar ruido en consola
    }
    const isPaused = video.paused;
    if (isPaused !== window.lastVideoPausedState) {
      window.lastVideoPausedState = isPaused;
      console.log(`[PLAYBACK] Playback state: ${isPaused ? 'paused' : 'playing'}`);
      ipcRenderer.send(isPaused ? 'video-paused' : 'video-playing');
    }
  }
}, 1000);

// ===== DETECTAR INFORMACIÓN DEL VIDEO CADA SEGUNDO =====
setInterval(() => {
  const video = document.querySelector('video');
  
  let thumbUrl = '';
  let playerResponse = null;
  try {
    if (window.ytInitialPlayerResponse) {
      playerResponse = window.ytInitialPlayerResponse;
    } else if (window.ytplayer?.config?.args?.player_response) {
      const raw = window.ytplayer.config.args.player_response;
      playerResponse = typeof raw === 'string' ? JSON.parse(raw) : raw;
    }
  } catch (e) {}

  const videoDetails = playerResponse?.videoDetails;
  const micro = playerResponse?.microformat?.playerMicroformatRenderer;

  // ⭐ Título: buscar en h1.ytd-watch-metadata o yt-formatted-string con title
  let videoTitle = '';
  const titleElement = document.querySelector('h1.ytd-watch-metadata yt-formatted-string') ||
                       document.querySelector('ytd-watch-metadata h1 yt-formatted-string') ||
                       document.querySelector('h1 yt-formatted-string.ytd-watch-metadata');
  if (titleElement) {
    videoTitle = titleElement.getAttribute('title') || titleElement.textContent?.trim() || '';
  }
  // Fallback
  if (!videoTitle) {
    videoTitle = document.querySelector('h1.title yt-formatted-string')?.textContent?.trim() ||
                 document.querySelector('.title.ytd-video-primary-info-renderer')?.textContent?.trim() || '';
  }
  if (!videoTitle && document.title) {
    videoTitle = document.title.replace(' - YouTube', '').trim();
  }
  if (!videoTitle) {
    const ogTitle = document.querySelector('meta[property="og:title"]')?.getAttribute('content') ||
                   document.querySelector('meta[itemprop="name"]')?.getAttribute('content');
    if (ogTitle) videoTitle = ogTitle.trim();
  }
  if (!videoTitle && videoDetails?.title) {
    videoTitle = videoDetails.title;
  }
  if (!videoTitle && micro?.title?.simpleText) {
    videoTitle = micro.title.simpleText;
  }
  
  // ⭐ Artista/Canal: buscar en ytd-channel-name #text
  let videoChannel = '';
  const channelElement = document.querySelector('ytd-channel-name #text a') ||
                         document.querySelector('ytd-channel-name #text yt-formatted-string a') ||
                         document.querySelector('ytd-channel-name yt-formatted-string#text a');
  if (channelElement) {
    videoChannel = channelElement.textContent?.trim() || '';
  }
  // Fallback: usar el atributo title del contenedor
  if (!videoChannel) {
    const channelContainer = document.querySelector('ytd-channel-name #text') ||
                             document.querySelector('ytd-channel-name yt-formatted-string#text');
    if (channelContainer) {
      videoChannel = channelContainer.getAttribute('title') || channelContainer.textContent?.trim() || '';
    }
  }
  if (!videoChannel) {
    const metaAuthor = document.querySelector('meta[name="author"]')?.getAttribute('content') ||
                      document.querySelector('meta[itemprop="author"]')?.getAttribute('content');
    if (metaAuthor) {
      videoChannel = metaAuthor.trim();
    }
  }
  if (!videoChannel && videoDetails?.author) {
    videoChannel = videoDetails.author;
  }
  if (!videoChannel && micro?.ownerChannelName) {
    videoChannel = micro.ownerChannelName;
  }
  
  // Extraer avatar del canal
  const channelAvatar = document.querySelector('ytd-video-owner-renderer #avatar img')?.src ||
                       document.querySelector('#owner #avatar img')?.src ||
                       document.querySelector('yt-img-shadow#avatar img')?.src || '';
  
  const duration = video ? Math.floor(video.duration) : 0;
  
  // ⭐ Extraer videoId de la URL
  const urlParams = new URLSearchParams(window.location.search);
  let videoId = urlParams.get('v') || '';
  if (!videoId && videoDetails?.videoId) {
    videoId = videoDetails.videoId;
  }

  if (videoDetails?.thumbnail?.thumbnails?.length) {
    thumbUrl = videoDetails.thumbnail.thumbnails.slice(-1)[0]?.url || '';
  } else if (micro?.thumbnail?.thumbnails?.length) {
    thumbUrl = micro.thumbnail.thumbnails.slice(-1)[0]?.url || '';
  }
  
  // ⭐ Extraer información del siguiente video desde ytp-next-button
  let nextVideoInfo = null;
  const nextButton = document.querySelector('.ytp-next-button');
  if (nextButton) {
    const nextPreview = nextButton.getAttribute('data-preview') || '';
    const nextTitle = nextButton.getAttribute('data-tooltip-text') || '';
    const nextHref = nextButton.getAttribute('href') || '';
    
    // Extraer videoId del href o data-preview
    let nextVideoId = '';
    const hrefMatch = nextHref.match(/v=([a-zA-Z0-9_-]{11})/);
    const previewMatch = nextPreview.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
    
    if (hrefMatch) nextVideoId = hrefMatch[1];
    else if (previewMatch) nextVideoId = previewMatch[1];
    
    if (nextVideoId || nextTitle) {
      nextVideoInfo = {
        videoId: nextVideoId,
        title: nextTitle,
        thumbnail: nextPreview || (nextVideoId ? `https://i.ytimg.com/vi/${nextVideoId}/mqdefault.jpg` : ''),
        channel: ''
      };
    }
  }
  
  // ⭐ Extraer información del video anterior desde ytp-prev-button
  let prevVideoInfo = null;
  const prevButton = document.querySelector('.ytp-prev-button');
  if (prevButton) {
    const prevTitle = prevButton.getAttribute('title') || prevButton.getAttribute('data-tooltip-text') || '';
    const prevHref = prevButton.getAttribute('href') || '';
    const prevPreview = prevButton.getAttribute('data-preview') || '';
    
    let prevVideoId = '';
    const hrefMatch = prevHref.match(/v=([a-zA-Z0-9_-]{11})/);
    const previewMatch = prevPreview.match(/\/vi\/([a-zA-Z0-9_-]{11})\//);
    
    if (hrefMatch) prevVideoId = hrefMatch[1];
    else if (previewMatch) prevVideoId = previewMatch[1];
    
    if (prevVideoId || prevTitle) {
      prevVideoInfo = {
        videoId: prevVideoId,
        title: prevTitle.replace('Ver de nuevo', '').trim() || 'Anterior',
        thumbnail: prevPreview || (prevVideoId ? `https://i.ytimg.com/vi/${prevVideoId}/mqdefault.jpg` : ''),
        channel: ''
      };
    }
  }

  if (videoTitle || videoChannel || videoId) {
    ipcRenderer.send('update-video-info', {
      videoId: videoId,
      title: videoTitle,
      artist: videoChannel,
      channel: videoChannel,
      channelAvatar: channelAvatar,
      duration: duration,
      thumbnail: thumbUrl || (videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : ''),
      nextVideo: nextVideoInfo,
      prevVideo: prevVideoInfo
    });
  }
}, 1000);

// ===== SISTEMA DE BLOQUEO DE ANUNCIOS =====
// Ad blocker integrado directamente (Electron preload no soporta require() para archivos locales)

class YouTubeAdBlocker {
  constructor() {
    this.isEnabled = true;
    this.adsSkipped = 0;
    this.adsMuted = 0;
    this.adsAccelerated = 0;
    this.originalVolume = 0.7;
    this.originalPlaybackRate = 1;
    this.originalMuted = false;
    this.isInAdMode = false;
    this.checkInterval = null;
    this.observerSetup = false;
    
    // Selectores de YouTube para anuncios
    this.selectors = {
      // Botones de saltar anuncio
      skipButtons: [
        '.ytp-ad-skip-button',
        '.ytp-ad-skip-button-modern',
        '.ytp-skip-ad-button',
        'button.ytp-ad-skip-button',
        '.ytp-ad-skip-button-container button',
        '[class*="skip-button"]',
        '.videoAdUiSkipButton',
        '.ytp-ad-skip-button-slot button'
      ],
      
      // Indicadores de anuncio reproduciéndose
      adPlaying: [
        '.ad-showing',
        '.ytp-ad-player-overlay',
        '.ytp-ad-player-overlay-layout',
        '.ytp-ad-module',
        '[class*="ad-interrupting"]'
      ],
      
      // Overlays y banners
      adOverlays: [
        '.ytp-ad-overlay-container',
        '.ytp-ad-overlay-slot',
        '.ytp-ad-text-overlay',
        '.ytp-ad-image-overlay',
        '.ytp-ad-overlay-close-button',
        '.video-ads',
        '.ytp-ad-overlay-ad-info-button-container',
        '.ytp-ad-info-dialog-container',
        'ytd-promoted-sparkles-web-renderer',
        'ytd-display-ad-renderer',
        'ytd-companion-slot-renderer',
        'ytd-action-companion-ad-renderer',
        'ytd-in-feed-ad-layout-renderer',
        'ytd-ad-slot-renderer',
        '.ytd-banner-promo-renderer',
        'ytd-promoted-video-renderer',
        'ytd-movie-offer-module-renderer',
        '.masthead-ad-control'
      ],
      
      // Contenedores de anuncios de video
      videoAdContainers: [
        '.ytp-ad-player-overlay-instream-info',
        '.ytp-ad-simple-ad-badge',
        '.ytp-ad-preview-container',
        '.ytp-ad-message-container'
      ],
      
      // Botón de cerrar overlay
      closeButtons: [
        '.ytp-ad-overlay-close-button',
        '.ytp-ad-overlay-close-container button',
        '[aria-label="Close"]',
        '[aria-label="Cerrar"]'
      ]
    };
    
    console.log('🛡️ [AD-BLOCKER] Sistema de bloqueo de anuncios inicializado');
  }

  start() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    // Verificar anuncios cada 50ms para respuesta rápida
    this.checkInterval = setInterval(() => this.checkAndBlockAds(), 50);
    
    // Configurar MutationObserver para detectar cambios en el DOM
    this.setupMutationObserver();
    
    // Inyectar CSS para ocultar elementos de anuncios
    this.injectAdBlockingCSS();
    
    console.log('🛡️ [AD-BLOCKER] Sistema activado');
  }

  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isEnabled = false;
    console.log('🛡️ [AD-BLOCKER] Sistema desactivado');
  }

  checkAndBlockAds() {
    if (!this.isEnabled) return;
    
    try {
      this.trySkipAd();
      this.handleActiveAd();
      this.closeAdOverlays();
      this.hideAdBanners();
    } catch (error) {
      // Silenciar errores para no spamear la consola
    }
  }

  trySkipAd() {
    for (const selector of this.selectors.skipButtons) {
      const skipButton = document.querySelector(selector);
      
      if (skipButton && this.isElementVisible(skipButton)) {
        skipButton.click();
        this.adsSkipped++;
        console.log(`⏭️ [AD-BLOCKER] Anuncio saltado! (Total: ${this.adsSkipped})`);
        return true;
      }
    }
    return false;
  }

  handleActiveAd() {
    const video = document.querySelector('video');
    if (!video) return;
    
    const isAdPlaying = this.isAdCurrentlyPlaying();
    
    if (isAdPlaying) {
      // Guardar valores originales SOLO si no estamos ya en modo anuncio
      if (!this.isInAdMode) {
        this.isInAdMode = true;
        // Usar el volumen del usuario si está disponible
        this.originalVolume = window._seaxUserVolume || (video.volume > 0 ? video.volume : 0.7);
        this.originalPlaybackRate = video.playbackRate === 1 ? 1 : video.playbackRate;
        this.originalMuted = video.muted;
        console.log(`🛡️ [AD-BLOCKER] Guardando estado original: vol=${this.originalVolume}, rate=${this.originalPlaybackRate}`);
      }
      
      // Silenciar y acelerar el anuncio
      video.volume = 0;
      video.muted = true;
      video.playbackRate = 16;
      this.adsMuted++;
      
      // Intentar saltar al final
      if (video.duration && isFinite(video.duration) && video.duration > 0 && video.duration < 120) {
        video.currentTime = video.duration - 0.1;
      }
      
    } else if (this.isInAdMode) {
      // Restaurar valores originales cuando termina el anuncio
      this.isInAdMode = false;
      video.playbackRate = 1;
      video.muted = false;
      // ⭐ SIEMPRE usar el volumen del usuario guardado (prioridad máxima)
      if (typeof window._seaxUserVolume === 'number') {
        video.volume = window._seaxUserVolume;
        console.log(`🛡️ [AD-BLOCKER] Restaurando volumen del usuario: ${window._seaxUserVolume}`);
      }
      // NO restaurar si no hay volumen guardado - dejar como está
    }
  }

  isAdCurrentlyPlaying() {
    // ⭐ MÉTODO MÁS CONFIABLE: Solo verificar la clase 'ad-showing' en el player
    // Esta clase SOLO está presente cuando hay un anuncio de video reproduciéndose
    const player = document.querySelector('#movie_player');
    if (player && player.classList.contains('ad-showing')) {
      return true;
    }
    
    // Verificar también el texto de "Anuncio" o "Ad" visible
    const adText = document.querySelector('.ytp-ad-text');
    if (adText && this.isElementVisible(adText)) {
      return true;
    }
    
    return false;
  }

  closeAdOverlays() {
    for (const selector of this.selectors.closeButtons) {
      const closeBtn = document.querySelector(selector);
      if (closeBtn && this.isElementVisible(closeBtn)) {
        closeBtn.click();
        console.log('❌ [AD-BLOCKER] Overlay cerrado');
      }
    }
  }

  hideAdBanners() {
    for (const selector of this.selectors.adOverlays) {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        if (el && el.style.display !== 'none') {
          el.style.display = 'none';
          el.style.visibility = 'hidden';
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
        }
      });
    }
  }

  isElementVisible(element) {
    if (!element) return false;
    
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      rect.width > 0 &&
      rect.height > 0 &&
      element.offsetParent !== null
    );
  }

  setupMutationObserver() {
    if (this.observerSetup) return;
    
    const observer = new MutationObserver((mutations) => {
      this.checkAndBlockAds();
    });
    
    const targetNode = document.body || document.documentElement;
    if (targetNode) {
      observer.observe(targetNode, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'src']
      });
      this.observerSetup = true;
      console.log('👁️ [AD-BLOCKER] MutationObserver configurado');
    }
  }

  injectAdBlockingCSS() {
    const styleId = 'seaxmusic-ad-blocker-style';
    
    if (document.getElementById(styleId)) return;
    
    const css = `
      .ytp-ad-overlay-container,
      .ytp-ad-overlay-slot,
      .ytp-ad-text-overlay,
      .ytp-ad-image-overlay,
      .video-ads,
      ytd-promoted-sparkles-web-renderer,
      ytd-display-ad-renderer,
      ytd-companion-slot-renderer,
      ytd-action-companion-ad-renderer,
      ytd-in-feed-ad-layout-renderer,
      ytd-ad-slot-renderer,
      .ytd-banner-promo-renderer,
      ytd-promoted-video-renderer,
      ytd-movie-offer-module-renderer,
      .masthead-ad-control,
      #masthead-ad,
      ytd-primetime-promo-renderer,
      .ytd-mealbar-promo-renderer,
      ytd-statement-banner-renderer,
      .ytp-ad-info-dialog-container {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        height: 0 !important;
        width: 0 !important;
        overflow: hidden !important;
      }
      
      ytd-rich-item-renderer:has(ytd-ad-slot-renderer),
      ytd-rich-section-renderer:has(ytd-ad-slot-renderer) {
        display: none !important;
      }
      
      ytd-search-pyv-renderer,
      ytd-promoted-sparkles-text-search-renderer {
        display: none !important;
      }
      
      .ytp-ad-skip-button,
      .ytp-ad-skip-button-modern,
      .ytp-skip-ad-button {
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
      }
    `;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    
    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(style);
      console.log('🎨 [AD-BLOCKER] CSS de bloqueo inyectado');
    }
  }

  getStats() {
    return {
      enabled: this.isEnabled,
      adsSkipped: this.adsSkipped,
      adsMuted: this.adsMuted,
      adsAccelerated: this.adsAccelerated
    };
  }
}

// Crear instancia global del bloqueador
const adBlocker = new YouTubeAdBlocker();

// Iniciar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => adBlocker.start());
} else {
  adBlocker.start();
}

// También iniciar cuando la ventana cargue completamente
window.addEventListener('load', () => {
  setTimeout(() => {
    adBlocker.checkAndBlockAds();
    console.log('🛡️ [AD-BLOCKER] Verificación completa realizada');
  }, 1000);
});

// Exponer al contexto global para debugging
window.seaxAdBlocker = adBlocker;

console.log('[PRELOAD] AdBlocker integrado correctamente');

// ===== DETECTAR Y MONITOREAR LOGIN DE YOUTUBE =====
// Este sistema detecta cuando el usuario completa el login en YouTube
let isLoggedIn = false;
let loginCheckInterval = null;
let mutationObserver = null;

function checkYouTubeLoginStatus() {
  try {
    // Detectar login en YouTube buscando el elemento ytd-topbar-menu-button-renderer
    // Este elemento contiene el avatar y nombre del usuario logueado
    
    // 1. El selector más confiable: ytd-topbar-menu-button-renderer con el avatar IMG dentro
    const topbarMenuButton = document.querySelector('ytd-topbar-menu-button-renderer');
    const hasAvatarImg = topbarMenuButton?.querySelector('img[src*="ggpht"]') || 
                         topbarMenuButton?.querySelector('img[src*="lh3"]');
    
    // 2. Buscar el botón de usuario en la barra superior (topbar)
    const userButton = document.querySelector('button[aria-label*="Cuenta"], button[aria-label*="gusto"], button[aria-label*="perfil"]');
    
    // 3. Buscar elemento con información del usuario
    const userMenu = document.querySelector('yt-simple-endpoint#endpoint[href*="accounts.google"]');
    
    // 4. Buscar el img del avatar (del topbar button) - SOLO si tiene src
    const profileImage = hasAvatarImg || 
                        document.querySelector('#avatar-button img[src*="ggpht"]') || 
                        document.querySelector('button img[src*="lh3"]');
    
    // 5. Verificar si hay un elemento de logout visible (link con href="/logout")
    const logoutLink = document.querySelector('a[href="/logout"]') ||
                      document.querySelector('a[href*="Logout"]');
    
    // 6. Verificar localStorage/sessionStorage para datos de sesión
    const hasSessionData = !!sessionStorage.getItem('_GA_SESSION_ID') || 
                          !!localStorage.getItem('SAPISID') ||
                          !!document.cookie.includes('SAPISID');
    
    // LOGIN se detecta si hay: avatar con src válido, OR logout link visible, OR session data
    // Pero el avatar DEBE tener una URL válida (src que no esté vacío)
    const loginDetected = !!(profileImage || (logoutLink && hasSessionData) || (topbarMenuButton && hasAvatarImg));

    if (loginDetected && !isLoggedIn) {
      isLoggedIn = true;
      console.log('[LOGIN] YOUTUBE LOGIN DETECTADO');
      
      // ⭐ Función para extraer datos del usuario
      const extractUserData = () => {
        let userName = 'YouTube User';
        let userHandle = '';
        let userAvatar = '';
        
        // 1. Buscar en ytd-active-account-header-renderer (menú de perfil desplegado)
        const accountHeader = document.querySelector('ytd-active-account-header-renderer');
        if (accountHeader) {
          // Nombre: #account-name
          const nameEl = accountHeader.querySelector('#account-name');
          if (nameEl) {
            userName = nameEl.textContent?.trim() || nameEl.getAttribute('title') || 'YouTube User';
          }
          
          // Handle: #channel-handle
          const handleEl = accountHeader.querySelector('#channel-handle');
          if (handleEl) {
            userHandle = handleEl.textContent?.trim() || handleEl.getAttribute('title') || '';
          }
          
          // Avatar: #avatar img
          const avatarImg = accountHeader.querySelector('#avatar img') || 
                           accountHeader.querySelector('yt-img-shadow#avatar img') ||
                           accountHeader.querySelector('yt-img-shadow img');
          if (avatarImg && avatarImg.src && avatarImg.src.startsWith('http')) {
            userAvatar = avatarImg.src;
          }
        }
        
        // 2. Fallback: avatar del topbar
        if (!userAvatar) {
          const topbarImg = document.querySelector('ytd-topbar-menu-button-renderer img[src*="ggpht"]');
          if (topbarImg && topbarImg.src) {
            userAvatar = topbarImg.src;
          }
        }
        
        return { userName, userHandle, userAvatar };
      };
      
      // ⭐ Intentar abrir el menú de usuario para obtener los datos
      const userButton = document.querySelector('ytd-topbar-menu-button-renderer button, #avatar-btn, button[aria-label*="Cuenta"]');
      
      if (userButton) {
        console.log('[LOGIN] Abriendo menú de usuario para extraer datos...');
        userButton.click();
        
        // Esperar a que el menú se abra y extraer datos
        setTimeout(() => {
          const data = extractUserData();
          console.log('[LOGIN] Datos extraídos - Nombre:', data.userName, 'Handle:', data.userHandle, 'Avatar:', data.userAvatar ? 'OK' : 'EMPTY');
          
          // Cerrar el menú haciendo clic fuera o en el botón de nuevo
          userButton.click();
          
          // Enviar notificación de login
          ipcRenderer.send('youtube-login-success', {
            isLoggedIn: true,
            timestamp: new Date().toISOString(),
            userName: data.userName,
            userHandle: data.userHandle,
            userAvatar: data.userAvatar
          });
        }, 500);
      } else {
        // Sin botón, enviar con datos básicos
        const data = extractUserData();
        console.log('[LOGIN] Datos extraídos (sin menú) - Nombre:', data.userName, 'Handle:', data.userHandle);
        
        ipcRenderer.send('youtube-login-success', {
          isLoggedIn: true,
          timestamp: new Date().toISOString(),
          userName: data.userName,
          userHandle: data.userHandle,
          userAvatar: data.userAvatar
        });
      }
      
    } else if (!loginDetected && isLoggedIn) {
      isLoggedIn = false;
      console.log('[LOGOUT] YOUTUBE LOGOUT DETECTADO');
      
      // Enviar notificación de logout
      ipcRenderer.send('youtube-logout-success', {
        isLoggedIn: false,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error checking login status:', error);
  }
}

// Monitorear cambios en el DOM
// Esperar a que document esté listo
setTimeout(() => {
  try {
    const config = {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label', 'src'],
      characterData: false
    };
    
    // Usar document.documentElement en lugar de document.body para mayor compatibilidad
    const observeTarget = document.body || document.documentElement;
    
    if (!observeTarget) {
      console.log('[WARNING] No se puede observar: document.body y documentElement no disponibles');
      return;
    }
    
    mutationObserver = new MutationObserver(() => {
      checkYouTubeLoginStatus();
    });
    
    mutationObserver.observe(observeTarget, config);
    console.log('[OBSERVER] MutationObserver iniciado para detectar login');
  } catch (error) {
    console.error('Error creating MutationObserver:', error);
  }
}, 1000);

// Check periódico cada 2 segundos
loginCheckInterval = setInterval(() => {
  checkYouTubeLoginStatus();
}, 2000);

// Check inicial después de 2 segundos para asegurar que YouTube cargó
setTimeout(() => {
  checkYouTubeLoginStatus();
}, 2000);

// Limpiar al cerrar
window.addEventListener('beforeunload', () => {
  if (mutationObserver) mutationObserver.disconnect();
  if (loginCheckInterval) clearInterval(loginCheckInterval);
});

console.log('[READY] Sistema de detección de login iniciado');
