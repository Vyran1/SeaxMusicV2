// ===== NOW PLAYING MANAGER =====
// Gestiona la vista de reproducción en pantalla completa

class NowPlayingManager {
  constructor() {
    this.page = null;
    this.isActive = false;
    this.currentSong = null;
    this.prevSong = null;
    this.nextSong = null;
    
    this.init();
  }
  
  async init() {
    // Esperar a que el DOM esté listo
    await this.loadHTML();
    this.cacheElements();
    this.bindEvents();
    
    console.log('[NOW PLAYING] Manager inicializado');
  }
  
  async loadHTML() {
    // El HTML ya está incluido en index.html, solo buscamos el elemento
    this.page = document.getElementById('nowPlayingPage');
    
    if (!this.page) {
      console.error('[NOW PLAYING] No se encontró #nowPlayingPage en el DOM');
    } else {
      console.log('[NOW PLAYING] Página encontrada en DOM');
    }
  }
  
  cacheElements() {
    if (!this.page) return;
    
    // Background
    this.bgImage = document.getElementById('nowPlayingBgImage');
    
    // Cover y título
    this.cover = document.getElementById('nowPlayingCover');
    this.title = document.getElementById('nowPlayingTitle');
    this.artist = document.getElementById('nowPlayingArtist');
    this.channelAvatar = document.getElementById('nowPlayingChannelAvatar');
    
    // Prev/Next (solo imágenes de fondo)
    this.prevCover = document.getElementById('prevCover');
    this.nextCover = document.getElementById('nextCover');
    this.prevContainer = document.getElementById('nowPlayingPrev');
    this.nextContainer = document.getElementById('nowPlayingNext');
    
    // Prev/Next títulos y artistas
    this.prevTitle = document.getElementById('prevTitle');
    this.prevArtist = document.getElementById('prevArtist');
    this.nextTitle = document.getElementById('nextTitle');
    this.nextArtist = document.getElementById('nextArtist');
    
    // Progreso
    this.currentTime = document.getElementById('npCurrentTime');
    this.durationEl = document.getElementById('npDuration');
    this.progressFill = document.getElementById('npProgressFill');
    this.progressHandle = document.getElementById('npProgressHandle');
    this.progressBar = document.getElementById('npProgressBar');
    
    // Botones
    this.playBtn = document.getElementById('npPlayBtn');
    this.prevBtn = document.getElementById('npPrevBtn');
    this.nextBtn = document.getElementById('npNextBtn');
    this.shuffleBtn = document.getElementById('npShuffle');
    this.repeatBtn = document.getElementById('npRepeat');
    this.likeBtn = document.getElementById('npLike');
    this.closeBtn = document.getElementById('npClose');
    
    // Visualizer
    this.visualizer = document.getElementById('nowPlayingVisualizer');
  }
  
  bindEvents() {
    if (!this.page) return;
    
    // Cerrar
    this.closeBtn?.addEventListener('click', () => this.hide());
    
    // ⭐ Cerrar al hacer click fuera del contenido central
    this.page?.addEventListener('click', (e) => {
      // Si el click es directamente en la página (fondo) o en nowplaying-bg
      if (e.target === this.page || 
          e.target.classList.contains('nowplaying-bg') ||
          e.target.classList.contains('nowplaying-bg-image') ||
          e.target.classList.contains('nowplaying-bg-overlay')) {
        this.hide();
      }
    });
    
    // Cerrar con ESC
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.isActive) {
        this.hide();
      }
    });
    
    // Controles de reproducción - sincronizados con player bar
    this.playBtn?.addEventListener('click', () => {
      if (window.musicPlayer) {
        window.musicPlayer.togglePlay();
        this.syncPlayButton();
      }
    });
    
    this.prevBtn?.addEventListener('click', () => {
      if (window.musicPlayer) {
        window.musicPlayer.previous();
      }
    });
    
    this.nextBtn?.addEventListener('click', () => {
      if (window.musicPlayer) {
        window.musicPlayer.next();
      }
    });
    
    // ⭐ Progress bar - click y drag
    this.setupProgressBar();
    
    // Like button
    this.likeBtn?.addEventListener('click', () => {
      if (this.currentSong && window.favoritesManager) {
        window.favoritesManager.toggleFavorite(this.currentSong);
        this.updateLikeButton();
      }
    });
    
    // Shuffle - sincronizado con player bar
    this.shuffleBtn?.addEventListener('click', () => {
      if (window.musicPlayer) {
        window.musicPlayer.toggleShuffle();
        this.syncShuffleButton();
      }
    });
    
    // Repeat - sincronizado con player bar
    this.repeatBtn?.addEventListener('click', () => {
      if (window.musicPlayer) {
        window.musicPlayer.toggleRepeat();
        this.syncRepeatButton();
      }
    });
  }
  
  // ⭐ Configurar barra de progreso con drag
  setupProgressBar() {
    if (!this.progressBar) return;
    
    let isDragging = false;
    
    const updateProgress = (e) => {
      const rect = this.progressBar.getBoundingClientRect();
      let percent = (e.clientX - rect.left) / rect.width;
      percent = Math.max(0, Math.min(1, percent));
      
      // Actualizar visual
      if (this.progressFill) this.progressFill.style.width = `${percent * 100}%`;
      if (this.progressHandle) this.progressHandle.style.left = `${percent * 100}%`;
      
      return percent;
    };
    
    const seekTo = (percent) => {
      if (window.musicPlayer && window.musicPlayer.duration > 0) {
        const targetTime = percent * window.musicPlayer.duration;
        window.electronAPI?.send('audio-seek', targetTime);
        
        // También actualizar barra principal
        if (window.musicPlayer.updateProgress) {
          window.musicPlayer.updateProgress(percent * 100);
        }
      }
    };
    
    // Click
    this.progressBar.addEventListener('click', (e) => {
      const percent = updateProgress(e);
      seekTo(percent);
    });
    
    // Drag start
    this.progressBar.addEventListener('mousedown', (e) => {
      isDragging = true;
      updateProgress(e);
      e.preventDefault();
    });
    
    // Drag move
    document.addEventListener('mousemove', (e) => {
      if (isDragging) {
        updateProgress(e);
      }
    });
    
    // Drag end
    document.addEventListener('mouseup', (e) => {
      if (isDragging) {
        isDragging = false;
        const rect = this.progressBar.getBoundingClientRect();
        let percent = (e.clientX - rect.left) / rect.width;
        percent = Math.max(0, Math.min(1, percent));
        seekTo(percent);
      }
    });
  }
  
  // ⭐ Sincronizar estado de botones con player bar
  syncButtons() {
    this.syncPlayButton();
    this.syncShuffleButton();
    this.syncRepeatButton();
  }
  
  syncPlayButton() {
    if (!this.playBtn || !window.musicPlayer) return;
    const icon = this.playBtn.querySelector('i');
    if (window.musicPlayer.isPlaying) {
      icon.className = 'fas fa-pause';
    } else {
      icon.className = 'fas fa-play';
    }
  }
  
  syncShuffleButton() {
    if (!this.shuffleBtn || !window.musicPlayer) return;
    this.shuffleBtn.classList.toggle('active', window.musicPlayer.isShuffle);
  }
  
  syncRepeatButton() {
    if (!this.repeatBtn || !window.musicPlayer) return;
    this.repeatBtn.classList.toggle('active', window.musicPlayer.repeatMode !== 'off');
  }
  
  show(song = null) {
    if (!this.page) return;
    
    // ⭐ Si hay canción, actualizar
    if (song) {
      this.updateSong(song);
    } else {
      // Si no hay canción, intentar usar la actual del player
      const currentTrack = window.musicPlayer?.currentTrack;
      if (currentTrack) {
        this.updateSong(currentTrack);
      } else {
        // Primera vez sin canción - mostrar defaults
        this.showDefaultState();
      }
    }
    
    // ⭐ Sincronizar botones al abrir
    this.syncButtons();
    
    // ⭐ Actualizar imágenes laterales (prev del historial, next default)
    this.updateSideImages();
    
    this.page.classList.add('active');
    this.isActive = true;
    
    // Animar visualizer si está reproduciendo
    if (window.musicPlayer?.isPlaying) {
      this.startVisualizer();
    }
    
    console.log('[NOW PLAYING] Mostrando vista');
  }
  
updateSideImages() {
  const defaultImg = './assets/img/icon.png';
  const queue = window.appState?.playQueue || [];
  const currentIndex = window.appState?.playQueueIndex ?? -1;
  const currentVideoId = this.currentSong?.videoId;
  
  console.log('[NOW PLAYING] Actualizando imágenes laterales - Cola:', queue.length, 'Índice:', currentIndex, 'VideoID actual:', currentVideoId);
  
  // ========== ANTERIOR ==========
  // Prioridad: 1) Anterior en cola, 2) Historial (excluyendo canción actual)
  if (currentIndex > 0 && queue[currentIndex - 1]) {
    // Hay canción anterior en la cola
    const prev = queue[currentIndex - 1];
    
    // ⭐ NO mostrar si es la misma canción que está sonando
    if (prev.videoId !== currentVideoId) {
      console.log('[NOW PLAYING] Anterior de cola:', prev.title);
      this.setSideImage(this.prevCover, prev, defaultImg);
      if (this.prevTitle) this.prevTitle.textContent = prev.title || '-';
      if (this.prevArtist) this.prevArtist.textContent = prev.artist || prev.channel || '-';
      this.prevContainer?.classList.remove('hidden');
    } else {
      // Es la misma, buscar en historial
      this.setPrevFromHistory(currentVideoId, defaultImg);
    }
  } else {
    // No hay anterior en cola, buscar en historial
    this.setPrevFromHistory(currentVideoId, defaultImg);
  }
  
  // ========== SIGUIENTE ==========
  // Usar siguiente de la cola
  if (currentIndex >= 0 && currentIndex < queue.length - 1 && queue[currentIndex + 1]) {
    const next = queue[currentIndex + 1];
    console.log('[NOW PLAYING] Siguiente de cola:', next.title);
    
    // ⭐ Obtener la mejor calidad de imagen
    let nextImgUrl = defaultImg;
    if (next.videoId) {
      nextImgUrl = `https://img.youtube.com/vi/${next.videoId}/maxresdefault.jpg`;
    } else if (next.thumbnail) {
      nextImgUrl = this.getHQThumbnail(next.thumbnail, next.videoId);
    }
    
    // Establecer imagen con fallbacks
    if (this.nextCover) {
      this.nextCover.src = nextImgUrl;
      this.nextCover.onerror = () => {
        if (next.videoId) {
          this.nextCover.src = `https://img.youtube.com/vi/${next.videoId}/hqdefault.jpg`;
          this.nextCover.onerror = () => {
            this.nextCover.src = next.thumbnail || defaultImg;
          };
        } else {
          this.nextCover.src = next.thumbnail || defaultImg;
        }
      };
    }
    
    if (this.nextTitle) this.nextTitle.textContent = next.title || '-';
    if (this.nextArtist) this.nextArtist.textContent = next.artist || next.channel || '-';
    this.nextContainer?.classList.remove('hidden');
  } else {
    // Sin siguiente en cola, mostrar default
    if (this.nextCover) this.nextCover.src = defaultImg;
    if (this.nextTitle) this.nextTitle.textContent = '-';
    if (this.nextArtist) this.nextArtist.textContent = '-';
    this.nextContainer?.classList.remove('hidden');
  }
}

// ⭐ Helper: Establecer anterior desde historial (excluyendo canción actual)
setPrevFromHistory(currentVideoId, defaultImg) {
  const history = window.appState?.recentHistory || [];
  
  // Buscar la primera canción del historial que NO sea la actual
  const prevFromHistory = history.find(h => h.videoId !== currentVideoId);
  
  if (prevFromHistory) {
    console.log('[NOW PLAYING] Anterior de historial:', prevFromHistory.title);
    this.setSideImage(this.prevCover, prevFromHistory, defaultImg);
    if (this.prevTitle) this.prevTitle.textContent = prevFromHistory.title || '-';
    if (this.prevArtist) this.prevArtist.textContent = prevFromHistory.artist || prevFromHistory.channel || '-';
    this.prevContainer?.classList.remove('hidden');
  } else {
    // Sin historial válido, mostrar default
    if (this.prevCover) this.prevCover.src = defaultImg;
    if (this.prevTitle) this.prevTitle.textContent = '-';
    if (this.prevArtist) this.prevArtist.textContent = '-';
    this.prevContainer?.classList.remove('hidden');
  }
}

  // ⭐ Helper para setear imagen con fallback
  setSideImage(imgElement, song, defaultImg) {
    if (!imgElement || !song) return;
    
    let imgUrl = defaultImg;
    
    if (song.videoId) {
      imgUrl = `https://img.youtube.com/vi/${song.videoId}/maxresdefault.jpg`;
    } else if (song.thumbnail) {
      imgUrl = this.getHQThumbnail(song.thumbnail);
    }
    
    imgElement.src = imgUrl;
    imgElement.onerror = () => {
      if (song.videoId) {
        imgElement.src = `https://img.youtube.com/vi/${song.videoId}/hqdefault.jpg`;
        imgElement.onerror = () => {
          imgElement.src = song.thumbnail || defaultImg;
        };
      } else {
        imgElement.src = song.thumbnail || defaultImg;
      }
    };
  }
  
  hide() {
    if (!this.page) return;
    
    this.page.classList.remove('active');
    this.isActive = false;
    
    this.stopVisualizer();
    
    console.log('[NOW PLAYING] Ocultando vista');
  }
  
  toggle(song = null) {
    if (this.isActive) {
      this.hide();
    } else {
      this.show(song);
    }
  }
  
  // Animación de carrusel
  animateCarousel(direction = 'next') {
    if (!this.page) return;
    
    const content = this.page.querySelector('.nowplaying-content');
    const cover = this.cover;
    const bgImage = this.bgImage;
    
    // Agregar clase de animación según dirección
    const animClass = direction === 'next' ? 'slide-left' : 'slide-right';
    
    content?.classList.add(animClass);
    cover?.classList.add('changing');
    bgImage?.classList.add('changing');
    
    // Remover clases después de la animación
    setTimeout(() => {
      content?.classList.remove(animClass);
      cover?.classList.remove('changing');
      bgImage?.classList.remove('changing');
    }, 500);
  }
  
  // Obtener thumbnail en máxima calidad (4K / maxresdefault)
  getHQThumbnail(thumbnail, videoId = null) {
    const defaultImg = './assets/img/icon.png';
    
    // Si tenemos videoId, construir URL directamente (mejor calidad)
    if (videoId) {
      return `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    }
    
    // Si no hay thumbnail válido
    if (!thumbnail) return defaultImg;
    
    // Extraer videoId de la URL del thumbnail si es posible
    // Formato: https://i.ytimg.com/vi/VIDEO_ID/mqdefault.jpg
    const match = thumbnail.match(/\/vi\/([a-zA-Z0-9_-]+)\//);
    if (match && match[1]) {
      return `https://img.youtube.com/vi/${match[1]}/maxresdefault.jpg`;
    }
    
    // Fallback: intentar reemplazar calidad en la URL
    return thumbnail
      .replace(/\/default\.jpg/, '/maxresdefault.jpg')
      .replace(/\/mqdefault\.jpg/, '/maxresdefault.jpg')
      .replace(/\/hqdefault\.jpg/, '/maxresdefault.jpg')
      .replace(/\/sddefault\.jpg/, '/maxresdefault.jpg')
      .replace('mqdefault', 'maxresdefault')
      .replace('hqdefault', 'maxresdefault')
      .replace('sddefault', 'maxresdefault');
  }
  
  updateSong(song, direction = null) {
    if (!song) return;
    
    const defaultImg = './assets/img/icon.png';
    
    console.log('[NOW PLAYING] Actualizando canción:', song.title, 'VideoID:', song.videoId, 'Thumbnail:', song.thumbnail);
    
    // Si hay dirección y estamos activos, animar
    if (direction && this.isActive) {
      this.animateCarousel(direction);
    }
    
    this.currentSong = song;
    
    // ⭐ Obtener thumbnail - priorizar videoId para máxima calidad
    let thumbnailUrl = defaultImg;
    
    if (song.videoId) {
      // Usar videoId para obtener maxresdefault directamente
      thumbnailUrl = `https://img.youtube.com/vi/${song.videoId}/maxresdefault.jpg`;
    } else if (song.thumbnail) {
      // Intentar mejorar la calidad del thumbnail existente
      thumbnailUrl = this.getHQThumbnail(song.thumbnail);
    }
    
    console.log('[NOW PLAYING] URL final del cover:', thumbnailUrl);
    
    // Actualizar cover principal
    if (this.cover) {
      this.cover.src = thumbnailUrl;
      this.cover.onerror = () => {
        console.log('[NOW PLAYING] Error cargando maxres, probando hqdefault...');
        // Fallback a hqdefault
        if (song.videoId) {
          this.cover.src = `https://img.youtube.com/vi/${song.videoId}/hqdefault.jpg`;
          this.cover.onerror = () => {
            // Último fallback
            this.cover.src = song.thumbnail || defaultImg;
          };
        } else {
          this.cover.src = song.thumbnail || defaultImg;
        }
      };
    }
    
    // Actualizar fondo difuminado
    if (this.bgImage) {
      this.bgImage.style.backgroundImage = `url(${thumbnailUrl})`;
    }
    
    // Actualizar info
    if (this.title) this.title.textContent = song.title || 'Sin título';
    if (this.artist) this.artist.textContent = song.artist || song.channel || 'Artista desconocido';
    
    // ⭐ Actualizar avatar del canal
    if (this.channelAvatar) {
      if (song.channelAvatar && song.channelAvatar.length > 0) {
        this.channelAvatar.src = song.channelAvatar;
        this.channelAvatar.style.display = 'block';
      } else {
        // Si no hay avatar, ocultarlo
        this.channelAvatar.style.display = 'none';
      }
    }
    
    // Actualizar like button
    this.updateLikeButton();
    
    // ⭐ Sincronizar botones
    this.syncButtons();
    
    // Actualizar imágenes laterales
    this.updateSideImages();
  }
  
  // ⭐ Función legacy para compatibilidad
  updateQueueInfo() {
    this.updateSideImages();
  }
  
  updateLikeButton() {
    if (!this.likeBtn || !this.currentSong) return;
    
    const isLiked = window.favoritesManager?.isFavorite(this.currentSong.videoId);
    
    if (isLiked) {
      this.likeBtn.innerHTML = '<i class="fas fa-heart"></i>';
      this.likeBtn.classList.add('liked');
    } else {
      this.likeBtn.innerHTML = '<i class="far fa-heart"></i>';
      this.likeBtn.classList.remove('liked');
    }
  }
  
  updateProgress(currentTime, duration) {
    if (!this.isActive) return;
    
    const percent = duration > 0 ? (currentTime / duration) * 100 : 0;
    
    if (this.progressFill) {
      this.progressFill.style.width = `${percent}%`;
    }
    if (this.progressHandle) {
      this.progressHandle.style.left = `${percent}%`;
    }
    if (this.currentTime) {
      this.currentTime.textContent = this.formatTime(currentTime);
    }
    if (this.durationEl) {
      this.durationEl.textContent = this.formatTime(duration);
    }
  }
  
  updatePlayState(isPlaying) {
    if (!this.playBtn) return;
    
    if (isPlaying) {
      this.playBtn.innerHTML = '<i class="fas fa-pause"></i>';
      this.startVisualizer();
    } else {
      this.playBtn.innerHTML = '<i class="fas fa-play"></i>';
      this.stopVisualizer();
    }
  }
  
  startVisualizer() {
    if (this.visualizer) {
      this.visualizer.classList.add('playing');
    }
  }
  
  stopVisualizer() {
    if (this.visualizer) {
      this.visualizer.classList.remove('playing');
    }
  }
  
  formatTime(seconds) {
    if (!seconds || isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  window.nowPlayingManager = new NowPlayingManager();
});
