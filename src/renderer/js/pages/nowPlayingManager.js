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

    this.init();
  }

  async init() {
    // Esperar a que el DOM esté listo
    await this.loadHTML();
    this.cacheElements();
    this.bindEvents();
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
    this.bgPulseWrapper = document.getElementById('nowPlayingBgPulseWrapper');

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

    // Panel de Cola
    this.queuePanel = document.getElementById('npQueuePanel');
    this.queueList = document.getElementById('npQueueList');
    this.queueCloseBtn = document.getElementById('npQueueCloseBtn');
    this.queueClearBtn = document.getElementById('npQueueClearBtn');
    this.queueCount = document.getElementById('npQueueCount');

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
    this.visualizerBars = this.visualizer ? this.visualizer.querySelectorAll('.visualizer-bar') : [];

    // Info container para animaciones
    this.infoContainer = this.page?.querySelector('.nowplaying-info');

    // Lyrics elements (cache para hot path)
    this.lyricsContent = document.getElementById('lyricsContent');
    this.nowPlayingContent = document.getElementById('nowPlayingContent');
    this.lyricsContainer = document.getElementById('lyricsContainer');
  }

  bindEvents() {
    if (!this.page) return;

    // Cerrar
    this.closeBtn?.addEventListener('click', () => this.hide());

    // ⭐ Cerrar al hacer click fuera del contenido central o del panel de cola
    this.page?.addEventListener('click', (e) => {
      // Si el click es en el fondo de nowPlayingPage, cerrar panel de cola si está abierto
      if (this.queuePanel?.classList.contains('active')) {
        if (!this.queuePanel.contains(e.target) && e.target !== this.queueBtn && !this.queueBtn?.contains(e.target)) {
          this.hideQueuePanel();
          return;
        }
      }

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
    this.likeBtn?.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      console.log('[NOW PLAYING] Botón Like clickeado', this.currentSong);

      if (!this.currentSong) {
        console.warn('[NOW PLAYING] No hay canción actual para dar like');
        return;
      }

      if (window.favoritesManager) {
        const isLiked = await window.favoritesManager.toggleFavorite(this.currentSong);
        console.log('[NOW PLAYING] Resultado toggleFavorite:', isLiked);
        this.updateLikeButton();

        // También actualizar el botón de like en la barra principal
        const mainLikeBtn = document.getElementById('likeBtn');
        if (mainLikeBtn) {
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
    this.queueBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      console.log('[NOW PLAYING] Queue button clicked');
      this.toggleQueuePanel();
    });

    // Cerrar panel de cola
    this.queueCloseBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.hideQueuePanel();
    });

    // Limpiar cola
    this.queueClearBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.clearQueue();
    });

    // Lyrics - toggle panel de letras
    this.lyricsBtn?.addEventListener('click', () => {
      console.log('[NOW PLAYING] Lyrics button clicked');
      this.toggleLyricsMode();
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

    // ⭐ Escuchar datos de audio en tiempo real
    if (window.electronAPI?.onAudioFrequencyData) {
      window.electronAPI.onAudioFrequencyData((data) => {
        this.updateRealVisualizer(data);
        this.updateAmbientPulse(data);
      });
    }
  }

  // ⭐ Actualizar visualizador real con datos de audio
  updateRealVisualizer(data) {
    if (!this.isActive || !this.visualizer || !data || data.length === 0) return;
    
    // Si la canción está pausada, no animar (o animar a 0)
    if (window.musicPlayer && !window.musicPlayer.isPlaying) {
      data = new Array(12).fill(0);
    }
    
    // Aplicar clase para desactivar la animación CSS y usar transformaciones reales
    if (!this.visualizer.classList.contains('real-visualizer-active')) {
      this.visualizer.classList.add('real-visualizer-active');
    }
    
    const bars = this.visualizerBars || [];
    if (bars.length === 0) return;
    
    // Mapear los datos (0-255) a una escala de Y (0.1 - 1.5)
    for (let i = 0; i < bars.length && i < data.length; i++) {
      const value = data[i];
      // 255 es el max de byte frequency, lo mapeamos a scaleY
      const scale = 0.2 + (value / 255) * 1.3; 
      
      // Aplicar directamente
      bars[i].style.transform = `scaleY(${scale})`;
      // Opcional: ajustar el color ligeramente basado en la intensidad
      // bars[i].style.opacity = 0.5 + (value / 255) * 0.5;
    }
  }

  // ⭐ Actualizar la respiración reactiva del fondo (Aura Reactiva)
  updateAmbientPulse(data) {
    if (!this.isActive || !this.bgImage || !data || data.length === 0) return;

    // Si la canción está pausada, atenuar suavemente a valores por defecto
    const isPlaying = window.musicPlayer && window.musicPlayer.isPlaying;

    // Extraer la intensidad de las frecuencias bajas (bajo/bass).
    // Usamos los primeros 4 bins del ecualizador (frecuencias graves)
    const lowFreqs = data.slice(0, 4);
    const averageBass = lowFreqs.reduce((sum, val) => sum + val, 0) / lowFreqs.length;

    // Normalizar la intensidad (0 a 1)
    const intensity = isPlaying ? averageBass / 255 : 0;

    // Suavizado tipo LERP (Linear Interpolation) para una respiración orgánica
    if (this.lastAmbientPulse === undefined) this.lastAmbientPulse = 1.0;
    if (this.lastAmbientBrightness === undefined) this.lastAmbientBrightness = 0.3;

    // Destinos:
    // Escala: de 1.0 (sin bajo) a 1.05 (bajo al máximo)
    const targetPulse = 1.0 + intensity * 0.05;
    // Brillo: de 0.3 (sin bajo) a 0.40 (bajo al máximo)
    const targetBrightness = 0.3 + intensity * 0.10;

    // LERP factor (0.12 para una respiración orgánica y fluida)
    this.lastAmbientPulse = this.lastAmbientPulse + (targetPulse - this.lastAmbientPulse) * 0.12;
    this.lastAmbientBrightness = this.lastAmbientBrightness + (targetBrightness - this.lastAmbientBrightness) * 0.12;

    // Aplicar las variables CSS
    if (this.bgPulseWrapper) {
      this.bgPulseWrapper.style.setProperty('--ambient-scale', this.lastAmbientPulse.toFixed(4));
    }
    this.bgImage.style.setProperty('--ambient-brightness', this.lastAmbientBrightness.toFixed(4));
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
    const isShuffle = window.musicPlayer.isShuffle;
    this.shuffleBtn.classList.toggle('active', isShuffle);
    this.shuffleBtn.style.color = isShuffle ? 'var(--accent-primary)' : 'var(--text-secondary)';
    this.shuffleBtn.title = isShuffle ? 'Aleatorio: Activado' : 'Aleatorio: Desactivado';
  }

  syncRepeatButton() {
    if (!this.repeatBtn || !window.musicPlayer) return;
    
    const mode = window.musicPlayer.repeatMode || 'off';
    
    if (mode === 'off') {
      this.repeatBtn.classList.remove('active');
      this.repeatBtn.style.color = 'var(--text-secondary)';
      this.repeatBtn.title = 'Repetir: Desactivado';
      this.repeatBtn.innerHTML = '<i class="fas fa-redo"></i>';
    } else if (mode === 'all') {
      this.repeatBtn.classList.add('active');
      this.repeatBtn.style.color = 'var(--accent-primary)';
      this.repeatBtn.title = 'Repetir: Todas';
      this.repeatBtn.innerHTML = '<i class="fas fa-redo"></i>';
    } else if (mode === 'one') {
      this.repeatBtn.classList.add('active');
      this.repeatBtn.style.color = 'var(--accent-primary)';
      this.repeatBtn.title = 'Repetir: Una canción';
      this.repeatBtn.innerHTML = '<i class="fas fa-redo"></i><span style="font-size: 8px; position: absolute; bottom: 2px; right: 2px;">1</span>';
      this.repeatBtn.style.position = 'relative';
    }
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

    // ⭐ Si hay cola activa (biblioteca), PRIORIZAR la cola
    if (hasQueue && currentIndex > 0 && queue[currentIndex - 1]) {
      prevSong = queue[currentIndex - 1];
      console.log('[NOW PLAYING] Anterior de cola:', prevSong.title);
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

    // Remover clases después de la animación (500ms como en CSS)
    setTimeout(() => {
      this.carouselTrack.classList.remove(animClass);
      this.infoContainer?.classList.remove(animClass);
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
    if (this.cover && this.cover.src !== thumbnailUrl) {
      this.cover.src = thumbnailUrl;
      this.cover.onerror = () => {
        console.log('[NOW PLAYING] Error cargando maxres, probando hqdefault...');
        if (song.videoId) {
          const fallback = `https://img.youtube.com/vi/${song.videoId}/hqdefault.jpg`;
          if (this.cover.src !== fallback) this.cover.src = fallback;
          this.cover.onerror = () => {
            const lastFallback = song.thumbnail || defaultImg;
            if (this.cover.src !== lastFallback) this.cover.src = lastFallback;
          };
        } else {
          const lastFallback = song.thumbnail || defaultImg;
          if (this.cover.src !== lastFallback) this.cover.src = lastFallback;
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

    // ⭐ Re-renderizar cola si el panel está activo
    if (this.queuePanel?.classList.contains('active')) {
      this.renderQueue();
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
    const lyricsBtn = this.lyricsBtn;

    if (!content) return;

    const isLyricsActive = content.classList.contains('lyrics-active');

    if (isLyricsActive) {
      // Desactivar modo letras
      content.classList.remove('lyrics-active');
      lyricsBtn?.classList.remove('active');
      this.stopLyricsSync();
      window.lyricsService?.cancel();
      this.lyricsLoadingForSong = null;
      console.log('[NOW PLAYING] Modo letras desactivado');
    } else {
      // Activar modo letras
      content.classList.add('lyrics-active');
      lyricsBtn?.classList.add('active');
      this.loadLyrics();
      this.updateMiniCarousel();
      console.log('[NOW PLAYING] Modo letras activado');
    }
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
   * Saltar a una línea específica - Click interactivo
   */
  seekToLyricLine(time) {
    if (window.electronAPI && window.electronAPI.send) {
      window.electronAPI.send('seek-audio', time);

      // Actualizar visualmente de inmediato
      this.currentPlaybackTime = time;
      this.updateLyricsHighlight();
    }
  }

  /**
   * Iniciar sincronización de letras con rAF
   */
  startLyricsSync() {
    this.stopLyricsSync();

    if (!window.lyricsService?.hasSyncedLyrics()) {
      console.log('[LYRICS] Sin letras sincronizadas');
      return;
    }

    this.lastHighlightedLine = -1;
    this._lastScrollTime = 0;

    const syncLoop = () => {
      if (!this.nowPlayingContent?.classList.contains('lyrics-active')) {
        this.stopLyricsSync();
        return;
      }
      this.updateLyricsHighlight();
      this.lyricsAnimationId = requestAnimationFrame(syncLoop);
    };

    this.lyricsAnimationId = requestAnimationFrame(syncLoop);
    console.log('[LYRICS] Sincronización iniciada (rAF)');
  }

  /**
   * Detener sincronización de letras
   */
  stopLyricsSync() {
    if (this.lyricsAnimationId !== null) {
      cancelAnimationFrame(this.lyricsAnimationId);
      this.lyricsAnimationId = null;
    }
    this.lastHighlightedLine = -1;
    this._lastScrollTime = 0;
  }

  /**
   * Actualizar highlight de la línea actual
   */
  updateLyricsHighlight() {
    if (!this.nowPlayingContent?.classList.contains('lyrics-active')) {
      this.stopLyricsSync();
      return;
    }

    const currentTime = this.currentPlaybackTime || 0;

    window.lyricsService?.getCurrentLine(currentTime);
    const currentIndex = window.lyricsService?.currentLineIndex ?? -1;

    if (currentIndex !== this.lastHighlightedLine) {
      this.lastHighlightedLine = currentIndex;

      const lines = this.lyricsContent?.querySelectorAll('.lyrics-line');

      lines?.forEach((line, index) => {
        line.classList.remove('active', 'passed', 'upcoming');

        if (index === currentIndex) {
          line.classList.add('active');
        } else if (index < currentIndex) {
          line.classList.add('passed');
        } else if (index === currentIndex + 1) {
          line.classList.add('upcoming');
        }
      });

      // Scroll con debounce (máximo 1 scroll cada 300ms)
      const now = Date.now();
      if (now - this._lastScrollTime > 300 && lines && lines[currentIndex]) {
        this._lastScrollTime = now;
        this.scrollToLyricLine(lines[currentIndex]);
      }
    }
  }

  /**
   * Scroll suave a la línea activa - solo si no está visible
   */
  scrollToLyricLine(lineEl) {
    if (!this.lyricsContainer || !lineEl) return;
    const container = this.lyricsContainer;

    const containerRect = container.getBoundingClientRect();
    const lineRect = lineEl.getBoundingClientRect();

    // Si la línea ya está visible y centrada, no hacer scroll
    const margin = containerRect.height * 0.15;
    if (lineRect.top >= containerRect.top + margin && lineRect.bottom <= containerRect.bottom - margin) {
      return;
    }

    // Calcular posición para centrar la línea
    const lineOffset = lineEl.offsetTop;
    const lineHeight = lineEl.offsetHeight;
    const scrollTarget = lineOffset - (container.clientHeight / 2) + (lineHeight / 2);

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
      const prevUrl = this.prevSong.thumbnail || './assets/img/icon.png';
      if (miniPrevCover && miniPrevCover.src !== prevUrl) miniPrevCover.src = prevUrl;
      if (miniPrevTitle) miniPrevTitle.textContent = this.prevSong.title || '-';
      if (miniPrevArtist) miniPrevArtist.textContent = this.prevSong.artist || '-';
    }

    // Current
    if (this.currentSong) {
      const currUrl = this.currentSong.thumbnail || './assets/img/icon.png';
      if (miniCurrentCover && miniCurrentCover.src !== currUrl) miniCurrentCover.src = currUrl;
      if (miniCurrentTitle) miniCurrentTitle.textContent = this.currentSong.title || '-';
      if (miniCurrentArtist) miniCurrentArtist.textContent = this.currentSong.artist || '-';
    }

    // Next
    if (this.nextSong) {
      const nextUrl = this.nextSong.thumbnail || './assets/img/icon.png';
      if (miniNextCover && miniNextCover.src !== nextUrl) miniNextCover.src = nextUrl;
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

  // ===== COLA DE REPRODUCCIÓN - SLIDING QUEUE PANEL =====

  toggleQueuePanel() {
    if (this.queuePanel?.classList.contains('active')) {
      this.hideQueuePanel();
    } else {
      this.showQueuePanel();
    }
  }

  showQueuePanel() {
    if (!this.queuePanel) return;
    this.queuePanel.classList.add('active');
    this.queueBtn?.classList.add('active');
    this.renderQueue();
  }

  hideQueuePanel() {
    if (!this.queuePanel) return;
    this.queuePanel.classList.remove('active');
    this.queueBtn?.classList.remove('active');
  }

  renderQueue() {
    if (!this.queueList) return;

    const queue = window.appState?.playQueue || [];
    const currentIndex = window.appState?.playQueueIndex ?? -1;

    // Actualizar contador
    if (this.queueCount) {
      this.queueCount.textContent = `${queue.length} ${queue.length === 1 ? 'canción' : 'canciones'}`;
    }

    // Vaciar lista
    this.queueList.innerHTML = '';

    if (queue.length === 0) {
      // Estado vacío
      this.queueList.innerHTML = `
        <div class="np-queue-empty">
          <div class="np-queue-empty-icon">
            <i class="fas fa-list-ul"></i>
          </div>
          <p>La cola está vacía</p>
          <span>Añade canciones desde la biblioteca para comenzar a escuchar.</span>
        </div>
      `;
      return;
    }

    const defaultImg = './assets/img/icon.png';

    // Renderizar cada track
    queue.forEach((track, index) => {
      const isActive = index === currentIndex;
      const itemEl = document.createElement('div');
      itemEl.className = `np-queue-item ${isActive ? 'active' : ''}`;
      itemEl.dataset.index = index;

      // Intentar obtener una imagen bonita
      const videoId = track.videoId;
      let imgUrl = defaultImg;
      if (videoId) {
        imgUrl = `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`;
      } else if (track.thumbnail) {
        imgUrl = track.thumbnail;
      }

      itemEl.innerHTML = `
        <div class="np-queue-cover-wrapper">
          <img class="np-queue-cover" src="${imgUrl}" alt="Cover" onerror="this.src='${defaultImg}'">
        </div>
        <div class="np-queue-item-info">
          <div class="np-queue-item-title">${track.title || 'Sin título'}</div>
          <div class="np-queue-item-artist">${track.artist || track.channel || 'Artista desconocido'}</div>
        </div>
        <button class="np-queue-item-remove" title="Eliminar de la cola">
          <i class="fas fa-times"></i>
        </button>
      `;

      // Click en el item para reproducir
      itemEl.addEventListener('click', (e) => {
        // Ignorar click si fue en el botón de eliminar
        if (e.target.closest('.np-queue-item-remove')) return;
        this.playQueueItem(index);
      });

      // Click en el botón de eliminar
      const removeBtn = itemEl.querySelector('.np-queue-item-remove');
      removeBtn?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeQueueItem(index);
      });

      this.queueList.appendChild(itemEl);
    });
  }

  playQueueItem(index) {
    const queue = window.appState?.playQueue || [];
    if (index < 0 || index >= queue.length) return;

    const oldIndex = window.appState?.playQueueIndex ?? -1;
    window.appState.playQueueIndex = index;
    const track = queue[index];

    console.log('[NOW PLAYING] Reproduciendo item de cola de índice:', index, track.title);

    // Calcular dirección de animación
    const direction = index >= oldIndex ? 'next' : 'prev';

    // Actualizar UI
    if (window.updateTrackInfo) {
      window.updateTrackInfo(track, direction);
    }
    if (window.musicPlayer?.updateSkipPreviews) {
      window.musicPlayer.updateSkipPreviews();
    }

    // Reproducir audio con soporte de playlist y transiciones
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

        if (window.electronAPI?.playAudioWithPlaylist) {
          window.electronAPI.playAudioWithPlaylist(
            `https://www.youtube.com/watch?v=${track.videoId}`,
            track.title || 'Sin título',
            track.artist || track.channel || 'Artista desconocido',
            playlistInfo
          );
        }
      } else {
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

    // Re-renderizar la cola para actualizar el active state
    this.renderQueue();
  }

  removeQueueItem(index) {
    const queue = window.appState?.playQueue || [];
    if (index < 0 || index >= queue.length) return;

    console.log('[NOW PLAYING] Eliminando item de cola de índice:', index);

    const currentIndex = window.appState?.playQueueIndex ?? -1;

    if (index === currentIndex) {
      // Es el item actual
      queue.splice(index, 1);
      
      if (queue.length === 0) {
        // Si quedó vacía
        window.clearPlayQueue();
        if (window.musicPlayer) {
          window.musicPlayer.pause?.();
        }
      } else {
        // Si el índice quedó fuera de rango tras borrar, volver al inicio
        if (window.appState.playQueueIndex >= queue.length) {
          window.appState.playQueueIndex = 0;
        }
        this.playQueueItem(window.appState.playQueueIndex);
      }
    } else {
      queue.splice(index, 1);
      if (index < currentIndex) {
        window.appState.playQueueIndex--;
      }
      
      // Actualizar skip previews
      if (window.musicPlayer?.updateSkipPreviews) {
        window.musicPlayer.updateSkipPreviews();
      }
      
      // Actualizar imágenes del carrusel lateral
      this.updateSideImages();
    }

    // Re-renderizar cola
    this.renderQueue();
  }

  clearQueue() {
    console.log('[NOW PLAYING] Limpiando toda la cola');
    window.clearPlayQueue?.();
    
    // Si musicPlayer existe, pausar
    if (window.musicPlayer) {
      window.musicPlayer.pause?.();
    }

    // Re-renderizar
    this.renderQueue();

    // Actualizar imágenes laterales
    this.updateSideImages();

    // Opcional: ocultar el panel después de vaciar
    setTimeout(() => {
      this.hideQueuePanel();
    }, 300);
  }
}

// Inicializar cuando el DOM esté listo
document.addEventListener('DOMContentLoaded', () => {
  window.nowPlayingManager = new NowPlayingManager();
});
