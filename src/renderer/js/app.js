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
  contentLoaded: {
    favorites: false,
    history: false
  },
  // ⭐ Cola de reproducción
  playQueue: [],
  playQueueIndex: -1,
  // ⭐ Historial de canciones (para Now Playing)
  recentHistory: []
};

// ⭐ Exponer appState globalmente
window.appState = appState;

// ===== SISTEMA DE COLA DE REPRODUCCIÓN =====

function setPlayQueue(tracks, startIndex = 0) {
  appState.playQueue = tracks;
  appState.playQueueIndex = startIndex;
  console.log('[QUEUE] Cola establecida:', tracks.length, 'canciones, iniciando en índice', startIndex);
}

function playNextInQueue() {
  if (appState.playQueue.length === 0) {
    console.log('[QUEUE] Cola vacía');
    return false;
  }
  
  appState.playQueueIndex++;
  
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
  
  if (window.electronAPI && window.electronAPI.playAudio) {
    window.electronAPI.playAudio(
      `https://www.youtube.com/watch?v=${track.videoId}`,
      track.title || 'Sin título',
      track.artist || track.channel || 'Artista desconocido'
    );
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
  
  if (window.electronAPI && window.electronAPI.playAudio) {
    window.electronAPI.playAudio(
      `https://www.youtube.com/watch?v=${track.videoId}`,
      track.title || 'Sin título',
      track.artist || track.channel || 'Artista desconocido'
    );
  }
  
  return true;
}

function clearPlayQueue() {
  appState.playQueue = [];
  appState.playQueueIndex = -1;
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

function hideLoader() {
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
  }
}

// Initialize the application
async function initApp() {
  console.log('🚀 Initializing SeaxMusic...');
  
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
    // En desarrollo, abre YouTube automáticamente
    if (window.location.href.includes('localhost') || window.location.href.includes('file://')) {
      // Dev mode - abrir YouTube automáticamente
      console.log('🎬 Dev mode: Abriendo YouTube backend...');
      const result = await window.electronAPI.createBackendPlayer('youtube-backend');
      if (result.success) {
        appState.currentPlayerId = result.playerId;
        console.log('✅ YouTube Backend window opened:', result.playerId);
      }
    } else {
      // Production mode - YouTube solo cuando se necesita
      console.log('✅ YouTube backend will open when needed');
    }
  } catch (error) {
    console.error('❌ Error during initialization:', error);
  }
  
  // ===== LISTENERS IPC DE YOUTUBE =====
  // Escuchar actualizaciones de tiempo (progress bar)
  if (window.electronAPI && window.electronAPI.onAudioTimeUpdate) {
    window.electronAPI.onAudioTimeUpdate((timeInfo) => {
      if (window.musicPlayer) {
        window.musicPlayer.updateTime(timeInfo.currentTime, timeInfo.duration);
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
      }
    });
  }
  
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
      // Intentar reproducir siguiente en la cola
      if (appState.playQueue && appState.playQueue.length > 0) {
        playNextInQueue();
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
        thumbnail: videoInfo.thumbnail || appState.currentTrack?.thumbnail
      };
      
      // Actualizar UI
      document.getElementById('trackName').textContent = videoInfo.title;
      document.getElementById('trackArtist').textContent = videoInfo.channel || videoInfo.artist;
      
      // Actualizar el botón de like
      updateLikeButton();
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

// ⭐ Load favorites content from localStorage
function loadFavoritesContent() {
  const favoritesGrid = document.getElementById('favoritesGrid');
  if (!favoritesGrid) return;
  
  // Si hay favoritos, mostrarlos
  if (appState.favorites.length > 0) {
    displayFavoritesInGrid(favoritesGrid, appState.favorites);
  } else {
    displayFavoritesPlaceholder(favoritesGrid);
  }
  
  appState.contentLoaded.favorites = true;
  checkAllContentLoaded();
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
      })
      .catch(err => {
        console.error('Error cargando historial:', err);
        appState.contentLoaded.history = true;
        displayPlaceholderContent(recentGrid, 'recent');
        checkAllContentLoaded();
      });
  } else {
    appState.contentLoaded.history = true;
    displayPlaceholderContent(recentGrid, 'recent');
    checkAllContentLoaded();
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

// ⭐ Exponer favoritesManager para sincronización global
window.favoritesManager = {
  isFavorite: (videoId) => isFavorite(videoId),
  addFavorite: (video) => addToFavorites(video),
  removeFavorite: (videoId) => removeFromFavorites(videoId),
  toggleFavorite: async (video) => {
    if (!video || !video.videoId) return false;
    
    if (isFavorite(video.videoId)) {
      await removeFromFavorites(video.videoId);
      return false; // Ya no es favorito
    } else {
      await addToFavorites(video);
      return true; // Ahora es favorito
    }
  },
  getFavorites: () => appState.favorites
};
