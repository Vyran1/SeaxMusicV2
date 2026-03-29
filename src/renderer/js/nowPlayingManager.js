// ===== NOW PLAYING MANAGER =====
// Gestiona la vista de reproducción en pantalla completa

class NowPlayingManager {
  constructor() {
    this.page = null;
    this.isActive = false;
    this.currentSong = null;
    this.prevSong = null;
    this.nextSong = null;
    this.isAnimating = false; // Prevenir múltiples animaciones
    
    // Lyrics state
    this.lyricsAnimationId = null;
    this.currentPlaybackTime = 0;
    this.lastHighlightedLine = -1;
    this.lyricsLoadingForSong = null; // Track qué canción está cargando letras
    this._framePreviewActive = false;
    this._lastFrameAt = 0;
    this._videoStream = null;
    
    this.init();
  }
  
  async init() {
    // Esperar a que el DOM esté listo
    await this.loadHTML();
    this.cacheElements();
    this.bindEvents();
    this.bindVideoPreview();
    // Restaurar volumen guardado en la vista Now Playing
    if (window.musicPlayer) {
      const user = (() => {
        try {
          const userData = localStorage.getItem('seaxmusic_user');
          return userData ? JSON.parse(userData) : null;
        } catch (e) {
          return null;
        }
      })();
      window.musicPlayer.refreshVolumeForUser?.(user);
    }
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
    
    // Carrusel
    this.carouselTrack = document.getElementById('carouselTrack');
    this.carouselPrev = document.getElementById('carouselPrev');
    this.carouselCenter = document.getElementById('carouselCenter');
    this.carouselNext = document.getElementById('carouselNext');
    
    // Cover y título
    this.cover = document.getElementById('nowPlayingCover');
    this.title = document.getElementById('nowPlayingTitle');
    this.artist = document.getElementById('nowPlayingArtist');
    this.channelAvatar = document.getElementById('nowPlayingChannelAvatar');
    
    // Prev/Next covers
    this.prevCover = document.getElementById('prevCover');
    this.nextCover = document.getElementById('nextCover');
    
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
    this.queueBtn = document.getElementById('npQueue');
    this.lyricsBtn = document.getElementById('npLyrics');
    this.videoBtn = document.getElementById('npVideoBtn');
    
    // Volumen
    this.volumeBtn = document.getElementById('npVolumeBtn');
    this.volumePopup = document.getElementById('npVolumePopup');
    this.volumeBar = document.getElementById('npVolumeBar');
    this.volumeFill = document.getElementById('npVolumeFill');
    this.volumeHandle = document.getElementById('npVolumeHandle');
    this.volumePercent = document.getElementById('npVolumePercent');
    this.djMixBtn = document.getElementById('npDjMixBtn');
    
    // Visualizer
    this.visualizer = document.getElementById('nowPlayingVisualizer');
    
    // Info container para animaciones
    this.infoContainer = this.page?.querySelector('.nowplaying-info');
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
    
    this.prevBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[NOW PLAYING] Botón Previous clickeado');
      if (window.musicPlayer) {
        window.musicPlayer.previous();
      } else {
        console.error('[NOW PLAYING] musicPlayer no disponible');
      }
    });
    
    this.nextBtn?.addEventListener('click', () => {
      if (window.musicPlayer) {
        window.musicPlayer.next();
      }
    });
    
    // ⭐ Progress bar - click y drag
    this.setupProgressBar();
    
    // Like button - con prevención de propagación y logs
    this.likeBtn?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[NOW PLAYING] Botón Like clickeado', this.currentSong);
      
      if (!this.currentSong) {
        console.warn('[NOW PLAYING] No hay canción actual para dar like');
        return;
      }
      
      if (window.favoritesManager) {
        const result = window.favoritesManager.toggleFavorite(this.currentSong);
        console.log('[NOW PLAYING] Resultado toggleFavorite:', result);
        this.updateLikeButton();
        
        // También actualizar el botón de like en la barra principal
        const mainLikeBtn = document.getElementById('likeBtn');
        if (mainLikeBtn) {
          const isLiked = window.favoritesManager.isFavorite(this.currentSong.videoId);
          const icon = mainLikeBtn.querySelector('i');
          if (isLiked) {
            icon.className = 'fas fa-heart';
            mainLikeBtn.classList.add('liked');
          } else {
            icon.className = 'far fa-heart';
            mainLikeBtn.classList.remove('liked');
          }
        }
      } else {
        console.error('[NOW PLAYING] favoritesManager no disponible');
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
    
    // Queue - abrir panel de cola
    this.queueBtn?.addEventListener('click', () => {
      console.log('[NOW PLAYING] Queue button clicked');
      // TODO: Implementar panel de cola
    });
    
    // Lyrics - toggle panel de letras
    this.lyricsBtn?.addEventListener('click', () => {
      console.log('[NOW PLAYING] Lyrics button clicked');
      this.toggleLyricsMode();
    });

    this.videoBtn?.addEventListener('click', () => {
      console.log('[NOW PLAYING] Video button clicked');
      this.toggleVideoMode();
    });
    
    // ⭐ Click en items del carrusel
    this.carouselPrev?.addEventListener('click', () => {
      if (this.prevSong && window.musicPlayer) {
        window.musicPlayer.previous();
      }
    });
    
    this.carouselNext?.addEventListener('click', () => {
      if (this.nextSong && window.musicPlayer) {
        window.musicPlayer.next();
      }
    });
    
    // ⭐ Control de volumen
    this.setupVolumeControl();
  }
  
  // ⭐ Configurar control de volumen
  setupVolumeControl() {
    if (!this.volumeBar) return;
    let isDragging = false;
    
    const updateVolume = (e) => {
      const rect = this.volumeBar.getBoundingClientRect();
      // Volumen vertical: arriba = 100%, abajo = 0%
      let percent = 1 - ((e.clientY - rect.top) / rect.height);
      percent = Math.max(0, Math.min(1, percent));
      
      // Actualizar visual
      if (this.volumeFill) this.volumeFill.style.height = `${percent * 100}%`;
      if (this.volumeHandle) this.volumeHandle.style.bottom = `${percent * 100}%`;
      if (this.volumePercent) this.volumePercent.textContent = `${Math.round(percent * 100)}%`;
      
      return percent;
    };
    
    const setVolume = (percent) => {
      console.log('[NOW PLAYING] Estableciendo volumen:', Math.round(percent * 100) + '%');

      // Actualizar el player principal y enviar a YouTube
      if (window.musicPlayer) {
        window.musicPlayer.persistVolume?.(percent);
        window.musicPlayer.updateVolumeUI();
      }
      
      if (window.electronAPI && window.electronAPI.send) {
        window.electronAPI.send('update-volume', percent);
      }
      
      // Sincronizar con la barra principal
      const mainVolumeFill = document.getElementById('volumeFill');
      const mainVolumeHandle = document.getElementById('volumeHandle');
      const mainVolumePercent = document.getElementById('volumePercent');
      
      if (mainVolumeFill) mainVolumeFill.style.width = `${percent * 100}%`;
      if (mainVolumeHandle) mainVolumeHandle.style.left = `${percent * 100}%`;
      if (mainVolumePercent) mainVolumePercent.textContent = `${Math.round(percent * 100)}%`;
      
      // Actualizar icono según nivel
      this.updateVolumeIcon(percent);
    };
    
    // Click en la barra
    this.volumeBar.addEventListener('click', (e) => {
      const percent = updateVolume(e);
      setVolume(percent);
    });
    
    // Drag start
    this.volumeBar.addEventListener('mousedown', (e) => {
      isDragging = true;
      this.volumePopup?.classList.add('active');
      const percent = updateVolume(e);
      setVolume(percent);
      e.preventDefault();
    });
    
    // También en el handle
    this.volumeHandle?.addEventListener('mousedown', (e) => {
      isDragging = true;
      this.volumePopup?.classList.add('active');
      e.preventDefault();
    });
    
    // Drag move
    document.addEventListener('mousemove', (e) => {
      if (isDragging && this.volumeBar) {
        const percent = updateVolume(e);
        setVolume(percent);
      }
    });
    
    // Drag end
    document.addEventListener('mouseup', (e) => {
      if (isDragging) {
        isDragging = false;
        if (this.volumeBar) {
          const rect = this.volumeBar.getBoundingClientRect();
          let percent = 1 - ((e.clientY - rect.top) / rect.height);
          percent = Math.max(0, Math.min(1, percent));
          setVolume(percent);
        }
        setTimeout(() => {
          this.volumePopup?.classList.remove('active');
        }, 500);
      }
    });
    
    // Click en botón de volumen para mute/unmute
    this.volumeBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      // Toggle mute usando el player
      if (window.musicPlayer) {
        window.musicPlayer.toggleMute();
        // Sincronizar la UI de now playing después del toggle
        const newVolume = window.musicPlayer.volume;
        this.syncVolume(newVolume);
      }
    });

    // DJ Mix toggle
    this.djMixBtn?.addEventListener('click', () => {
      if (window.musicPlayer) {
        window.musicPlayer.toggleDjMix();
      }
    });
  }
  
  // Actualizar icono de volumen según nivel
  updateVolumeIcon(percent) {
    const icon = this.volumeBtn?.querySelector('i');
    const mainIcon = document.getElementById('volumeBtn')?.querySelector('i');
    
    let iconClass = 'fas fa-volume-up';
    if (percent === 0) {
      iconClass = 'fas fa-volume-mute';
    } else if (percent < 0.5) {
      iconClass = 'fas fa-volume-down';
    }
    
    if (icon) icon.className = iconClass;
    if (mainIcon) mainIcon.className = iconClass;
  }
  
  // Sincronizar volumen desde la barra principal
  syncVolume(percent) {
    if (this.volumeFill) this.volumeFill.style.height = `${percent * 100}%`;
    if (this.volumeHandle) this.volumeHandle.style.bottom = `${percent * 100}%`;
    if (this.volumePercent) this.volumePercent.textContent = `${Math.round(percent * 100)}%`;
    this.updateVolumeIcon(percent);
    
    // Añadir/quitar clase muted para animación visual
    const volumeWrapper = document.querySelector('.np-volume-wrapper');
    if (volumeWrapper) {
      if (percent === 0) {
        volumeWrapper.classList.add('muted');
      } else {
        volumeWrapper.classList.remove('muted');
      }
    }
  }
  
  // Obtener volumen de la barra principal y sincronizar
  syncVolumeFromMain() {
    if (window.musicPlayer) {
      this.syncVolume(window.musicPlayer.volume);
    } else {
      const mainVolumePercent = document.getElementById('volumePercent');
      if (mainVolumePercent) {
        const percentText = mainVolumePercent.textContent;
        const percent = parseInt(percentText) / 100;
        if (!isNaN(percent)) {
          this.syncVolume(percent);
        }
      }
    }
  }

  syncDjMixButton(enabled) {
    if (!this.djMixBtn) return;
    this.djMixBtn.classList.toggle('dj-active', !!enabled);
    this.djMixBtn.title = enabled ? 'DJ Mix: Activado' : 'DJ Mix: Desactivado';
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
        window.electronAPI?.send('seek-audio', targetTime);
        
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
    this.syncDjMixButton?.(window.appState?.djMixEnabled);
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
    
    // ⭐ Sincronizar volumen al abrir
    this.syncVolumeFromMain();
    
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
  
updateSideImages(nextVideoInfo = null, prevVideoInfo = null) {
  const defaultImg = './assets/img/icon.png';
  const queue = window.appState?.playQueue || [];
  const currentIndex = window.appState?.playQueueIndex ?? -1;
  const currentVideoId = this.currentSong?.videoId;
  const isLibraryActive = window.libraryManager?.isLibraryActive || false;
  const hasQueue = queue.length > 0 && currentIndex >= 0;
  
  console.log('[NOW PLAYING] Actualizando carrusel - Cola:', queue.length, 'Índice:', currentIndex, 'Biblioteca activa:', isLibraryActive);
  
  // ========== ANTERIOR ==========
  let prevSong = null;
  
  // ⭐ Si hay cola activa (biblioteca), PRIORIZAR la cola sobre YouTube
  if (hasQueue && currentIndex > 0 && queue[currentIndex - 1]) {
    const prev = queue[currentIndex - 1];
    if (prev.videoId !== currentVideoId) {
      prevSong = prev;
      console.log('[NOW PLAYING] Anterior de cola:', prevSong.title);
    }
  }
  
  // Si no hay cola, usar YouTube
  if (!prevSong && prevVideoInfo && prevVideoInfo.videoId) {
    prevSong = prevVideoInfo;
    console.log('[NOW PLAYING] Anterior de YouTube:', prevSong.title);
  }
  
  // Si no hay prevSong, buscar en historial
  if (!prevSong) {
    const history = window.appState?.recentHistory || [];
    prevSong = history.find(h => h.videoId !== currentVideoId);
    if (prevSong) console.log('[NOW PLAYING] Anterior de historial:', prevSong.title);
  }
  
  // Actualizar prev cover
  this.prevSong = prevSong;
  if (prevSong) {
    this.setSideImage(this.prevCover, prevSong, defaultImg);
    if (this.prevTitle) this.prevTitle.textContent = prevSong.title || '-';
    if (this.prevArtist) this.prevArtist.textContent = prevSong.artist || prevSong.channel || '-';
  } else {
    if (this.prevCover) this.prevCover.src = defaultImg;
    if (this.prevTitle) this.prevTitle.textContent = '-';
    if (this.prevArtist) this.prevArtist.textContent = '-';
  }
  
  // ========== SIGUIENTE ==========
  let nextSong = null;
  
  // ⭐ Si hay cola activa (biblioteca), PRIORIZAR la cola sobre YouTube
  if (hasQueue && currentIndex < queue.length - 1 && queue[currentIndex + 1]) {
    nextSong = queue[currentIndex + 1];
    console.log('[NOW PLAYING] Siguiente de cola:', nextSong.title);
  }
  
  // Si no hay cola, usar YouTube
  if (!nextSong && nextVideoInfo && nextVideoInfo.videoId) {
    nextSong = nextVideoInfo;
    console.log('[NOW PLAYING] Siguiente de YouTube:', nextSong.title);
  }
  
  // Actualizar next cover
  this.nextSong = nextSong;
  if (nextSong) {
    this.setSideImage(this.nextCover, nextSong, defaultImg);
    if (this.nextTitle) this.nextTitle.textContent = nextSong.title || '-';
    if (this.nextArtist) this.nextArtist.textContent = nextSong.artist || nextSong.channel || '-';
  } else {
    if (this.nextCover) this.nextCover.src = defaultImg;
    if (this.nextTitle) this.nextTitle.textContent = '-';
    if (this.nextArtist) this.nextArtist.textContent = '-';
  }
}

// ⭐ Helper: (Eliminado - ahora updateSideImages maneja todo)

  // ⭐ Helper para setear imagen con fallback
  setSideImage(imgElement, song, defaultImg) {
    if (!imgElement || !song) return;
    
    let imgUrl = defaultImg;
    
    // Intentar extraer videoId si no existe
    let videoId = song.videoId;
    if (!videoId && song.thumbnail) {
      const match = song.thumbnail.match(/\/vi\/([a-zA-Z0-9_-]{11})\//)
                 || song.thumbnail.match(/vi%2F([a-zA-Z0-9_-]{11})%2F/)
                 || song.url?.match(/v=([a-zA-Z0-9_-]{11})/);
      if (match && match[1]) {
        videoId = match[1];
      }
    }
    
    // ⭐ Usar maxresdefault igual que el cover central para consistencia visual
    if (videoId) {
      imgUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
    } else if (song.thumbnail) {
      imgUrl = song.thumbnail;
    }
    
    imgElement.src = imgUrl;
    imgElement.onerror = () => {
      // Fallback a hqdefault si maxres no existe
      if (videoId) {
        imgElement.src = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
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
  
  // Animación de carrusel real - las imágenes se mueven entre posiciones
  animateCarousel(direction = 'next') {
    if (!this.page || !this.carouselTrack || this.isAnimating) return;
    
    this.isAnimating = true;
    const animClass = direction === 'next' ? 'slide-left' : 'slide-right';
    
    // Animar el track del carrusel
    this.carouselTrack.classList.add(animClass);
    
    // Animar también el info
    this.infoContainer?.classList.add(animClass);
    
    // Animar el fondo
    this.bgImage?.classList.add('changing');
    
    // Remover clases después de la animación (500ms como en CSS)
    setTimeout(() => {
      this.carouselTrack.classList.remove(animClass);
      this.infoContainer?.classList.remove(animClass);
      this.bgImage?.classList.remove('changing');
      this.isAnimating = false;
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
    
    // ⭐ Intentar extraer videoId del thumbnail si no existe
    let videoId = song.videoId;
    if (!videoId && song.thumbnail) {
      const match = song.thumbnail.match(/\/vi\/([a-zA-Z0-9_-]{11})\//)
                 || song.thumbnail.match(/vi%2F([a-zA-Z0-9_-]{11})%2F/)
                 || song.thumbnail.match(/\/([a-zA-Z0-9_-]{11})\//)
                 || song.url?.match(/v=([a-zA-Z0-9_-]{11})/);
      if (match && match[1]) {
        videoId = match[1];
        song.videoId = videoId; // Guardar para uso futuro
      }
    }
    
    console.log('[NOW PLAYING] Actualizando canción:', song.title, 'VideoID:', videoId, 'Thumbnail:', song.thumbnail);
    
    // Si hay dirección y estamos activos, animar
    if (direction && this.isActive) {
      this.animateCarousel(direction);
    }
    
    this.currentSong = song;
    
    // ⭐ Obtener thumbnail - priorizar videoId para máxima calidad
    let thumbnailUrl = defaultImg;
    
    if (videoId) {
      // Usar videoId para obtener maxresdefault directamente
      thumbnailUrl = `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`;
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
    
    // ⭐ Actualizar letras si el modo está activo
    const content = document.getElementById('nowPlayingContent');
    if (content?.classList.contains('lyrics-active')) {
      this.updateMiniCarousel();
      this.loadLyrics();
    }
  }
  
  // ⭐ Función legacy para compatibilidad
  updateQueueInfo() {
    this.updateSideImages();
  }
  
  updateLikeButton() {
    if (!this.likeBtn) {
      console.warn('[NOW PLAYING] likeBtn no encontrado');
      return;
    }
    if (!this.currentSong) {
      console.warn('[NOW PLAYING] currentSong no disponible para actualizar like');
      return;
    }
    
    const isLiked = window.favoritesManager?.isFavorite(this.currentSong.videoId);
    console.log('[NOW PLAYING] Actualizando like button - isLiked:', isLiked, 'videoId:', this.currentSong.videoId);
    
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
    
    // Guardar tiempo para sincronización de letras
    this.currentPlaybackTime = currentTime;
    
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
  
  // ===== LYRICS MODE =====
  
  /**
   * Toggle modo letras
   */
  toggleLyricsMode() {
    const content = document.getElementById('nowPlayingContent');
    const page = this.page;
    const lyricsBtn = this.lyricsBtn;
    const videoBtn = this.videoBtn;
    
    if (!content) return;
    
    const isLyricsActive = content.classList.contains('lyrics-active');
    
    if (isLyricsActive) {
      // Desactivar modo letras
      content.classList.remove('lyrics-active');
      lyricsBtn?.classList.remove('active');
      videoBtn?.classList.remove('active');
      page?.classList.remove('video-active');
      this.stopLyricsSync();
      window.lyricsService?.cancel();
      this.lyricsLoadingForSong = null;
      console.log('[NOW PLAYING] Modo letras desactivado');
    } else {
      // Activar modo letras
      content.classList.remove('video-active');
      page?.classList.remove('video-active');
      content.classList.add('lyrics-active');
      lyricsBtn?.classList.add('active');
      videoBtn?.classList.remove('active');
      this.stopVideoPreview();
      this.loadLyrics();
      this.updateMiniCarousel();
      console.log('[NOW PLAYING] Modo letras activado');
    }
  }

  bindVideoPreview() {
    if (window.electronAPI?.onVideoPreviewFrame) {
      window.electronAPI.onVideoPreviewFrame((dataUrl) => {
        if (!this._framePreviewActive) return;
        const now = Date.now();
        if (now - this._lastFrameAt < 80) return; // ~12 fps
        this._lastFrameAt = now;
        const frame = document.getElementById('videoFrame');
        if (frame) {
          frame.src = dataUrl;
          const panel = document.getElementById('videoPanel');
          panel?.classList.add('has-frame');
        }
        const pipFrame = document.getElementById('pipVideoFrame');
        if (pipFrame) {
          pipFrame.src = dataUrl;
          const pipOverlay = document.getElementById('pipOverlay');
          pipOverlay?.classList.add('has-frame');
        }
      });
    }
  }

  // ===== VIDEO MODE =====
  toggleVideoMode() {
    const content = document.getElementById('nowPlayingContent');
    const page = this.page;
    const lyricsBtn = this.lyricsBtn;
    const videoBtn = this.videoBtn;
    if (!content) return;

    const isVideoActive = content.classList.contains('video-active');

    if (isVideoActive) {
      content.classList.remove('video-active');
      page?.classList.remove('video-active');
      videoBtn?.classList.remove('active');
      this.stopVideoPreview();
    } else {
      content.classList.remove('lyrics-active');
      lyricsBtn?.classList.remove('active');
      content.classList.add('video-active');
      page?.classList.add('video-active');
      videoBtn?.classList.add('active');
      this.stopLyricsSync();
      this.startVideoPreview();
    }
  }

  async startVideoPreview() {
    this._framePreviewActive = true;
    const ok = await this.startDesktopVideoCapture();
    if (!ok && window.electronAPI?.startVideoPreview) {
      window.electronAPI.startVideoPreview();
    }
  }

  stopVideoPreview() {
    this._framePreviewActive = false;
    if (window.electronAPI?.stopVideoPreview) {
      window.electronAPI.stopVideoPreview();
    }
    this.stopDesktopVideoCapture();
    const video = document.getElementById('videoLive');
    if (video) video.srcObject = null;
    const frame = document.getElementById('videoFrame');
    if (frame) frame.removeAttribute('src');
    const panel = document.getElementById('videoPanel');
    panel?.classList.remove('has-frame');
    const pipOverlay = document.getElementById('pipOverlay');
    pipOverlay?.classList.remove('has-frame');
  }

  async startDesktopVideoCapture() {
    try {
      const candidates = [];
      if (window.electronAPI?.getVideoSourceId) {
        const preferred = await window.electronAPI.getVideoSourceId();
        if (preferred) candidates.push(preferred);
      }

      if (window.electronAPI?.getDesktopSources) {
        const sources = await window.electronAPI.getDesktopSources({ types: ['window'] });
        const byName = (needle) =>
          sources.filter(s => (s.name || '').toLowerCase().includes(needle));
        const ordered = [
          ...byName('seaxmusic video'),
          ...byName('seaxmusic'),
          ...byName('youtube'),
          ...sources
        ];
        for (const s of ordered) {
          if (s?.id && !candidates.includes(s.id)) candidates.push(s.id);
        }
      }

      if (!candidates.length) return false;

      const trySource = async (sourceId) => {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: false,
          video: {
            mandatory: {
              chromeMediaSource: 'desktop',
              chromeMediaSourceId: sourceId,
              maxFrameRate: 30
            }
          }
        });

        const video = document.getElementById('videoLive');
        if (!video) return null;

        video.srcObject = stream;
        video.muted = true;
        await video.play().catch(() => {});

        const isReady = await new Promise((resolve) => {
          let resolved = false;
          const timer = setTimeout(() => {
            if (!resolved) resolve(false);
          }, 1400);
          const check = () => {
            if (video.videoWidth > 0 && video.videoHeight > 0) {
              resolved = true;
              clearTimeout(timer);
              resolve(true);
            }
          };
          video.onloadedmetadata = check;
          video.onloadeddata = check;
          requestAnimationFrame(check);
        });

        if (!isReady) {
          stream.getTracks().forEach(t => t.stop());
          return null;
        }

        return stream;
      };

      let activeStream = null;
      for (const id of candidates) {
        try {
          activeStream = await trySource(id);
          if (activeStream) break;
        } catch (e) {
          // intentar siguiente fuente
        }
      }

      if (!activeStream) return false;

      const panel = document.getElementById('videoPanel');
      panel?.classList.add('has-video');
      this._videoStream = activeStream;
      if (window.electronAPI?.stopVideoPreview) {
        window.electronAPI.stopVideoPreview();
      }
      return true;
    } catch (e) {
      this.stopDesktopVideoCapture();
      if (window.electronAPI?.startVideoPreview) {
        window.electronAPI.startVideoPreview();
      }
      return false;
    }
  }

  stopDesktopVideoCapture() {
    if (this._videoStream) {
      this._videoStream.getTracks().forEach(t => t.stop());
      this._videoStream = null;
    }
    const panel = document.getElementById('videoPanel');
    panel?.classList.remove('has-video');
  }
  
  /**
   * Cargar letras para la canción actual
   */
  async loadLyrics() {
    if (!this.currentSong) return;
    
    const songId = this.currentSong.videoId;
    
    // Si ya estamos cargando letras para esta canción, no hacer nada
    if (this.lyricsLoadingForSong === songId) {
      console.log('[LYRICS] Ya cargando para esta canción');
      return;
    }
    
    // Cancelar búsqueda anterior
    window.lyricsService?.cancel();
    this.stopLyricsSync();
    this.lastHighlightedLine = -1;
    
    // Marcar que estamos cargando para esta canción
    this.lyricsLoadingForSong = songId;
    
    const lyricsLoading = document.getElementById('lyricsLoading');
    const lyricsContent = document.getElementById('lyricsContent');
    const lyricsNotFound = document.getElementById('lyricsNotFound');
    
    // Reset UI
    lyricsLoading?.classList.add('active');
    if (lyricsContent) lyricsContent.innerHTML = '';
    lyricsNotFound?.classList.remove('active');
    
    try {
      const trackName = this.currentSong.title || '';
      const artistName = this.currentSong.artist || this.currentSong.channel || '';
      
      console.log('[LYRICS] Buscando:', trackName, '-', artistName);
      
      const lyrics = await window.lyricsService?.searchLyrics(trackName, artistName, songId);
      
      // Verificar que seguimos en la misma canción
      if (this.currentSong?.videoId !== songId) {
        console.log('[LYRICS] Canción cambió, ignorando resultado');
        return;
      }
      
      // Limpiar flag de carga
      this.lyricsLoadingForSong = null;
      
      // Ocultar loading
      lyricsLoading?.classList.remove('active');
      
      if (lyrics && window.lyricsService?.parsedLyrics?.length > 0) {
        this.renderLyrics();
        this.startLyricsSync();
        
        // ⭐ Precargar letras de la siguiente canción
        this.preloadNextLyrics();
      } else {
        lyricsNotFound?.classList.add('active');
      }
    } catch (error) {
      console.error('[LYRICS] Error:', error);
      if (this.currentSong?.videoId === songId) {
        this.lyricsLoadingForSong = null;
        lyricsLoading?.classList.remove('active');
        lyricsNotFound?.classList.add('active');
      }
    }
  }
  
  /**
   * Precargar letras de la siguiente canción
   */
  preloadNextLyrics() {
    if (!this.nextSong || !window.lyricsService) return;
    
    const trackName = this.nextSong.title || '';
    const artistName = this.nextSong.artist || this.nextSong.channel || '';
    
    if (trackName) {
      window.lyricsService.preloadLyrics(trackName, artistName);
    }
  }
  
  /**
   * Renderizar letras en el panel
   */
  renderLyrics() {
    const lyricsContent = document.getElementById('lyricsContent');
    if (!lyricsContent || !window.lyricsService) return;
    
    const lyrics = window.lyricsService.getAllLyrics();
    const hasSynced = window.lyricsService.hasSyncedLyrics();
    
    lyricsContent.innerHTML = '';
    lyricsContent.classList.toggle('plain', !hasSynced);
    
    lyrics.forEach((line, index) => {
      const lineEl = document.createElement('div');
      lineEl.className = 'lyrics-line';
      lineEl.dataset.index = index;
      lineEl.dataset.time = line.time;
      lineEl.textContent = line.text;
      
      // Click para saltar a esa línea (solo si tiene tiempo)
      if (hasSynced && line.time >= 0) {
        lineEl.addEventListener('click', () => {
          this.seekToLyricLine(line.time);
        });
      }
      
      lyricsContent.appendChild(lineEl);
    });
    
    console.log('[LYRICS] Renderizadas', lyrics.length, 'líneas', hasSynced ? '(sincronizadas)' : '(planas)');
  }
  
  /**
   * Saltar a una línea específica
   */
  seekToLyricLine(time) {
    if (window.electronAPI?.seekTo) {
      window.electronAPI.seekTo(time);
    }
  }
  
  /**
   * Iniciar sincronización de letras
   */
  startLyricsSync() {
    // Detener sync anterior primero
    this.stopLyricsSync();
    
    if (!window.lyricsService?.hasSyncedLyrics()) {
      console.log('[LYRICS] Sin letras sincronizadas');
      return;
    }
    
    this.lastHighlightedLine = -1;
    this.lyricsAnimationId = requestAnimationFrame(() => this.updateLyricsHighlight());
    console.log('[LYRICS] Sincronización iniciada');
  }
  
  /**
   * Detener sincronización de letras
   */
  stopLyricsSync() {
    if (this.lyricsAnimationId) {
      cancelAnimationFrame(this.lyricsAnimationId);
      this.lyricsAnimationId = null;
    }
    this.lastHighlightedLine = -1;
  }
  
  /**
   * Actualizar highlight de la línea actual
   */
  updateLyricsHighlight() {
    const content = document.getElementById('nowPlayingContent');
    
    // Verificar que seguimos en modo letras
    if (!content?.classList.contains('lyrics-active')) {
      this.stopLyricsSync();
      return;
    }
    
    // Usar el tiempo guardado (más preciso)
    const currentTime = this.currentPlaybackTime || 0;
    
    // Obtener línea actual
    window.lyricsService?.getCurrentLine(currentTime);
    const currentIndex = window.lyricsService?.currentLineIndex ?? -1;
    
    // Solo actualizar si cambió la línea (optimización)
    if (currentIndex !== this.lastHighlightedLine) {
      this.lastHighlightedLine = currentIndex;
      
      const lyricsContent = document.getElementById('lyricsContent');
      const lines = lyricsContent?.querySelectorAll('.lyrics-line');
      
      lines?.forEach((line, index) => {
        line.classList.remove('active', 'passed', 'upcoming');
        
        if (index === currentIndex) {
          line.classList.add('active');
          this.scrollToLyricLine(line);
        } else if (index < currentIndex) {
          line.classList.add('passed');
        } else if (index === currentIndex + 1) {
          line.classList.add('upcoming');
        }
      });
    }
    
    // Continuar loop
    this.lyricsAnimationId = requestAnimationFrame(() => this.updateLyricsHighlight());
  }
  
  /**
   * Scroll suave a la línea activa - Estilo Spotify
   */
  scrollToLyricLine(lineEl) {
    const container = document.getElementById('lyricsContainer');
    if (!container || !lineEl) return;
    
    // Calcular posición para centrar la línea
    const containerHeight = container.clientHeight;
    const lineOffset = lineEl.offsetTop;
    const lineHeight = lineEl.offsetHeight;
    
    // Centrar la línea en el contenedor
    const scrollTarget = lineOffset - (containerHeight / 2) + (lineHeight / 2);
    
    // Scroll suave
    container.scrollTo({
      top: scrollTarget,
      behavior: 'smooth'
    });
  }
  
  /**
   * Actualizar mini carrusel en modo letras
   */
  updateMiniCarousel() {
    // Actualizar covers
    const miniPrevCover = document.getElementById('miniPrevCover');
    const miniCurrentCover = document.getElementById('miniCurrentCover');
    const miniNextCover = document.getElementById('miniNextCover');
    
    // Actualizar títulos
    const miniPrevTitle = document.getElementById('miniPrevTitle');
    const miniPrevArtist = document.getElementById('miniPrevArtist');
    const miniCurrentTitle = document.getElementById('miniCurrentTitle');
    const miniCurrentArtist = document.getElementById('miniCurrentArtist');
    const miniNextTitle = document.getElementById('miniNextTitle');
    const miniNextArtist = document.getElementById('miniNextArtist');
    
    // Prev
    if (this.prevSong) {
      if (miniPrevCover) miniPrevCover.src = this.prevSong.thumbnail || './assets/img/icon.png';
      if (miniPrevTitle) miniPrevTitle.textContent = this.prevSong.title || '-';
      if (miniPrevArtist) miniPrevArtist.textContent = this.prevSong.artist || '-';
    }
    
    // Current
    if (this.currentSong) {
      if (miniCurrentCover) miniCurrentCover.src = this.currentSong.thumbnail || './assets/img/icon.png';
      if (miniCurrentTitle) miniCurrentTitle.textContent = this.currentSong.title || '-';
      if (miniCurrentArtist) miniCurrentArtist.textContent = this.currentSong.artist || '-';
    }
    
    // Next
    if (this.nextSong) {
      if (miniNextCover) miniNextCover.src = this.nextSong.thumbnail || './assets/img/icon.png';
      if (miniNextTitle) miniNextTitle.textContent = this.nextSong.title || '-';
      if (miniNextArtist) miniNextArtist.textContent = this.nextSong.artist || '-';
    }
    
    // Click handlers para mini carrusel
    document.getElementById('miniPrev')?.addEventListener('click', () => {
      if (this.prevSong && window.musicPlayer) {
        window.musicPlayer.previous();
      }
    });
    
    document.getElementById('miniNext')?.addEventListener('click', () => {
      if (this.nextSong && window.musicPlayer) {
        window.musicPlayer.next();
      }
    });
  }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  window.nowPlayingManager = new NowPlayingManager();
});
