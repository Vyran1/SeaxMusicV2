// Sincronizar volumen real reportado por el backend
if (window.electronAPI && window.electronAPI.onVideoVolumeUpdated) {
  window.electronAPI.onVideoVolumeUpdated((realVolume) => {
    if (window.musicPlayer?.suppressVolumeUpdates) return;
    if (typeof realVolume === 'number' && Math.abs(window.musicPlayer.volume - realVolume) > 0.01) {
      window.musicPlayer.volume = realVolume;
      if (!window.musicPlayer.suppressVolumePersist) {
        window.musicPlayer.persistVolume?.(realVolume);
      }
      window.musicPlayer.updateVolumeUI();
      // También sincronizar barra de Now Playing si está activa
      if (window.nowPlayingManager) {
        window.nowPlayingManager.syncVolume(realVolume);
      }
    }
  });
}
// ===== Helpers para volumen por usuario =====
function buildUserKeyFromUser(user) {
  if (!user) return 'guest';
  const name = (user.name || '').trim().toLowerCase();
  const email = (user.email || '').trim().toLowerCase();
  const handle = (user.handle || '').trim().toLowerCase();
  const stable = `${email}|${name}|${handle}`.replace(/\|+$/, '');
  if (stable && stable !== '||') return stable;
  const id = (user.id || '').toString().trim();
  return id || 'guest';
}

function hashKey(value) {
  let hash = 0;
  for (let i = 0; i < value.length; i++) {
    hash = (hash << 5) - hash + value.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash).toString(36);
}

function getCurrentUser() {
  try {
    const userData = localStorage.getItem('seaxmusic_user');
    return userData ? JSON.parse(userData) : null;
  } catch (e) {
    return null;
  }
}

function getVolumeStorageKey(user) {
  const key = buildUserKeyFromUser(user);
  const suffix = hashKey(key);
  return `seaxmusic_volume_${suffix}`;
}

// Player control logic

class MusicPlayer {
  constructor() {
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 0;
    // Leer volumen guardado por usuario o usar 0.7 por defecto
    this.volumeStorageKey = getVolumeStorageKey(getCurrentUser());
    const savedVolume = localStorage.getItem(this.volumeStorageKey);
    const legacyVolume = localStorage.getItem('seaxmusic_volume');
    this.volume = savedVolume !== null
      ? parseFloat(savedVolume)
      : (legacyVolume !== null ? parseFloat(legacyVolume) : 0.7);
    this.isShuffle = false;
    this.repeatMode = 'off'; // 'off', 'all', 'one'
    this.currentTrack = null;
    this.suppressVolumePersist = false;
    this.suppressVolumeUpdates = false;
    
    this.initializeControls();
  }
  
  initializeControls() {
    // Play/Pause button
    const playBtn = document.getElementById('playBtn');
    playBtn.addEventListener('click', () => this.togglePlay());
    
    // Previous/Next buttons
    document.getElementById('prevBtn').addEventListener('click', () => this.previous());
    document.getElementById('nextBtn').addEventListener('click', () => this.next());
    
    // Shuffle button
    const shuffleBtn = document.getElementById('shuffleBtn');
    shuffleBtn.addEventListener('click', () => this.toggleShuffle());
    
    // Repeat button
    const repeatBtn = document.getElementById('repeatBtn');
    repeatBtn.addEventListener('click', () => this.toggleRepeat());
    
    // Progress bar - Draggable
    const progressBar = document.querySelector('.progress-bar');
    progressBar.addEventListener('click', (e) => this.seek(e));
    progressBar.addEventListener('mousedown', (e) => this.startProgressDrag(e));
    
    // Volume controls - Draggable
    const volumeBar = document.querySelector('.volume-bar');
    volumeBar.addEventListener('click', (e) => this.setVolume(e));
    volumeBar.addEventListener('mousedown', (e) => this.startVolumeDrag(e));
    
    const volumeBtn = document.getElementById('volumeBtn');
    volumeBtn.addEventListener('click', () => this.toggleMute());

    const djMixBtn = document.getElementById('djMixBtn');
    djMixBtn?.addEventListener('click', () => this.toggleDjMix());

    const pipBtn = document.getElementById('pipBtn');
    pipBtn?.addEventListener('click', () => this.togglePipMode());
    const pipPrevBtn = document.getElementById('pipPrevBtn');
    pipPrevBtn?.addEventListener('click', () => this.previous());
    const pipPlayBtn = document.getElementById('pipPlayBtn');
    pipPlayBtn?.addEventListener('click', () => this.togglePlay());
    const pipNextBtn = document.getElementById('pipNextBtn');
    pipNextBtn?.addEventListener('click', () => this.next());
    const pipCloseBtn = document.getElementById('pipCloseBtn');
    pipCloseBtn?.addEventListener('click', () => this.togglePipMode());
    const pipProgressBar = document.getElementById('pipProgressBar');
    pipProgressBar?.addEventListener('click', (e) => this.seek(e));

    // Like button
    document.getElementById('likeBtn').addEventListener('click', () => this.toggleLike());
    
    // Configuración button
    document.getElementById('fullscreenBtn').addEventListener('click', () => {
      if (window.configManager) {
        window.configManager.showConfigPage();
      } else {
        this.toggleFullscreen();
      }
    });
    
    // ⭐ Track image click → Open Now Playing
    const trackImage = document.getElementById('trackImage');
    trackImage?.addEventListener('click', () => this.openNowPlaying());
    
    // ⭐ Expand button → Open Now Playing
    const expandBtn = document.getElementById('expandBtn');
    expandBtn?.addEventListener('click', () => this.openNowPlaying());
    
    // Initialize volume UI
    this.updateVolumeUI();

    // ⭐ Enviar volumen inicial al backend para mantener sincronía
    if (window.electronAPI && window.electronAPI.send) {
      window.electronAPI.send('update-volume', this.volume);
    }

    // Inicializar estado DJ Mix en UI
    this.syncDjMixButtons();

    // Inicializar preview
    this.updateSkipPreviews();
    this.pipEnabled = false;

    if (window.electronAPI?.onPipClosed) {
      window.electronAPI.onPipClosed(() => {
        this.pipEnabled = false;
        const pipBtn = document.getElementById('pipBtn');
        if (pipBtn) {
          pipBtn.classList.remove('active');
          pipBtn.title = 'Pantalla sobre pantalla';
        }
      });
    }

    if (window.electronAPI?.onPipControl) {
      window.electronAPI.onPipControl((data) => {
        this.handlePipControl(data);
      });
    }
  }

  // ===== DJ MIX =====
  toggleDjMix() {
    if (!window.appState) return;
    const wasEnabled = !!window.appState.djMixEnabled;
    window.appState.djMixEnabled = !wasEnabled;
    try {
      localStorage.setItem('seaxmusic_djmix', window.appState.djMixEnabled ? '1' : '0');
    } catch (e) {}
    
    if (!window.appState.djMixEnabled) {
      window.appState.djMixInProgress = false;
      window.appState.djMixTriggeredFor = null;
      window.appState.djMixPreloadedFor = null;
      window.appState.djMixNextTrack = null;
      window.appState.djMixInactiveStartedFor = null;
      if (window.electronAPI?.djClose) {
        window.electronAPI.djClose();
      }
      if (window.electronAPI?.djSetWindowVolume) {
        window.electronAPI.djSetWindowVolume('active', this.volume);
      }
    } else {
      window.appState.djMixTriggeredFor = null;
      window.appState.djMixPreloadedFor = null;
      window.appState.djMixNextTrack = null;
      window.appState.djMixInactiveStartedFor = null;
      window.ensureDjPreloadForCurrent?.();
    }
    this.syncDjMixButtons();
  }

  syncDjMixButtons() {
    const enabled = !!window.appState?.djMixEnabled;
    const djBtn = document.getElementById('djMixBtn');
    if (djBtn) {
      djBtn.classList.toggle('dj-active', enabled);
      djBtn.title = enabled ? 'DJ Mix: Activado' : 'DJ Mix: Desactivado';
    }
    if (window.nowPlayingManager) {
      window.nowPlayingManager.syncDjMixButton?.(enabled);
    }
  }

  fadeVolumeTo(target, durationMs = 600, done) {
    const start = this.volume;
    const end = Math.max(0, Math.min(1, target));
    const startTime = performance.now();

    const step = (now) => {
      const t = Math.min(1, (now - startTime) / durationMs);
      const eased = t < 1 ? (t * (2 - t)) : 1; // easeOut
      const value = start + (end - start) * eased;
      this.setTransientVolume(value);
      if (t < 1) {
        requestAnimationFrame(step);
      } else if (typeof done === 'function') {
        done();
      }
    };

    requestAnimationFrame(step);
  }

  setTransientVolume(value) {
    this.volume = Math.max(0, Math.min(1, value));
    this.updateVolumeUI();
    if (window.electronAPI && window.electronAPI.send) {
      window.electronAPI.send('update-volume', this.volume);
    }
  }

  // ===== Persistencia de volumen por usuario =====
  persistVolume(value) {
    if (typeof value === 'number') {
      this.volume = Math.max(0, Math.min(1, value));
    }
    if (!this.volumeStorageKey) {
      this.volumeStorageKey = getVolumeStorageKey(getCurrentUser());
    }
    localStorage.setItem(this.volumeStorageKey, this.volume);
  }

  refreshVolumeForUser(user) {
    this.volumeStorageKey = getVolumeStorageKey(user);
    const savedVolume = localStorage.getItem(this.volumeStorageKey);
    const legacyVolume = localStorage.getItem('seaxmusic_volume');
    this.volume = savedVolume !== null
      ? parseFloat(savedVolume)
      : (legacyVolume !== null ? parseFloat(legacyVolume) : 0.7);
    this.updateVolumeUI();
    if (window.nowPlayingManager) {
      window.nowPlayingManager.syncVolume(this.volume);
    }
    if (window.electronAPI && window.electronAPI.send) {
      window.electronAPI.send('update-volume', this.volume);
    }
  }
  
  // ⭐ Abrir vista Now Playing
  openNowPlaying() {
    if (window.nowPlayingManager) {
      window.nowPlayingManager.show(this.currentTrack);
    }
  }
  
  async togglePlay() {
    // Enviar comando a YouTube vía IPC
    this.isPlaying = !this.isPlaying;
    this.updatePlayButton();
    
    const action = this.isPlaying ? 'play' : 'pause';
    console.log('🎵 Toggle Play/Pause:', action);
    
    // ⭐ Actualizar Now Playing si está activo
    if (window.nowPlayingManager) {
      window.nowPlayingManager.updatePlayState(this.isPlaying);
    }
    
    // Enviar comando IPC a main.js → YouTube
    if (window.electronAPI && window.electronAPI.send) {
      window.electronAPI.send('audio-control', action);
    }
  }
  
  updatePlayButton() {
    const playBtn = document.getElementById('playBtn');
    const icon = playBtn.querySelector('i');
    if (this.isPlaying) {
      icon.className = 'fas fa-pause';
    } else {
      icon.className = 'fas fa-play';
    }

    const pipPlayBtn = document.getElementById('pipPlayBtn');
    if (pipPlayBtn) {
      const pipIcon = pipPlayBtn.querySelector('i');
      if (pipIcon) {
        pipIcon.className = this.isPlaying ? 'fas fa-pause' : 'fas fa-play';
      }
    }
  }
  
  async previous() {
    console.log('⏮️ Previous track');
    
    // ⭐ Verificar si estamos al inicio del video (menos de 3 segundos)
    const isAtStart = this.currentTime < 3;
    
    // ⭐ Intentar usar cola si hay canciones anteriores
    if (window.appState && window.appState.playQueue && window.appState.playQueue.length > 0) {
      // Si estamos al inicio Y hay canción anterior en la cola, ir a ella
      if (isAtStart && window.appState.playQueueIndex > 0) {
        console.log('⏮️ Ir a canción anterior en cola');
        if (window.playPrevInQueue && window.playPrevInQueue()) {
          return;
        }
      }
    }
    
    // Si no hay cola o estamos a más de 3s, enviar a YouTube (reiniciará el video)
    if (window.electronAPI && window.electronAPI.send) {
      const playFn = () => window.electronAPI.send('audio-control', 'previous');
      if (window.runDjMixTransition) {
        window.runDjMixTransition(playFn);
      } else {
        playFn();
      }
    }
  }
  
  async next() {
    console.log('⏭️ Next track - Cola:', window.appState?.playQueue?.length, 'Índice:', window.appState?.playQueueIndex);

    // DJ Mix: si hay siguiente precargado, cambiar instantáneo
    if (window.appState?.djMixEnabled && window.appState?.djMixNextTrack && window.djMixImmediateSwap) {
      const swapped = await window.djMixImmediateSwap(window.appState.djMixNextTrack);
      if (swapped) {
        window.djMixAdvanceQueueIndex?.();
        return;
      }
    }
    
    // ⭐ Usar cola de reproducción si hay tracks
    if (window.appState && window.appState.playQueue && window.appState.playQueue.length > 0) {
      console.log('⏭️ Intentando usar cola de playlist...');
      if (window.playNextInQueue && window.playNextInQueue()) {
        console.log('⏭️ ✅ Usando siguiente de cola');
        return;
      }
      console.log('⏭️ Cola terminada o error');
    }
    
    // Si no hay cola o llegamos al final: usar YouTube normal
    console.log('⏭️ Usando YouTube autoplay');
    if (window.electronAPI && window.electronAPI.send) {
      const playFn = () => window.electronAPI.send('audio-control', 'next');
      if (window.runDjMixTransition) {
        window.runDjMixTransition(playFn);
      } else {
        playFn();
      }
    }
  }
  
  toggleShuffle() {
    this.isShuffle = !this.isShuffle;
    const shuffleBtn = document.getElementById('shuffleBtn');
    
    shuffleBtn.style.color = this.isShuffle ? 'var(--accent-primary)' : 'var(--text-secondary)';
    shuffleBtn.title = this.isShuffle ? 'Aleatorio: Activado' : 'Aleatorio: Desactivado';
    
    if (this.isShuffle) {
      shuffleBtn.classList.add('active');
    } else {
      shuffleBtn.classList.remove('active');
    }
    
    // ⭐ Sincronizar con Now Playing
    if (window.nowPlayingManager) {
      window.nowPlayingManager.syncShuffleButton();
    }
    
    // Enviar estado de shuffle a YouTube
    if (window.electronAPI && window.electronAPI.send) {
      window.electronAPI.send('set-shuffle-mode', this.isShuffle);
    }
    
    console.log('Shuffle:', this.isShuffle);
  }
  
  toggleRepeat() {
    const modes = ['off', 'all', 'one'];
    const currentIndex = modes.indexOf(this.repeatMode);
    this.repeatMode = modes[(currentIndex + 1) % modes.length];
    
    const repeatBtn = document.getElementById('repeatBtn');
    const icon = repeatBtn.querySelector('i');
    
    // ⭐ Sincronizar con Now Playing
    if (window.nowPlayingManager) {
      window.nowPlayingManager.syncRepeatButton();
    }
    
    // Enviar modo de repetición a YouTube
    if (window.electronAPI && window.electronAPI.send) {
      window.electronAPI.send('set-repeat-mode', this.repeatMode);
    }
    
    if (this.repeatMode === 'off') {
      repeatBtn.style.color = 'var(--text-secondary)';
      icon.className = 'fas fa-redo';
      repeatBtn.classList.remove('active');
      repeatBtn.title = 'Repetir: Desactivado';
    } else if (this.repeatMode === 'all') {
      repeatBtn.style.color = 'var(--accent-primary)';
      icon.className = 'fas fa-redo';
      repeatBtn.classList.add('active');
      repeatBtn.title = 'Repetir: Todas';
    } else {
      // Modo 'one' - repetir una canción
      repeatBtn.style.color = 'var(--accent-primary)';
      icon.className = 'fas fa-redo';
      repeatBtn.classList.add('active');
      repeatBtn.innerHTML = '<i class="fas fa-redo"></i><span style="font-size: 8px; position: absolute; bottom: 2px; right: 2px;">1</span>';
      repeatBtn.style.position = 'relative';
      repeatBtn.title = 'Repetir: Una canción';
    }
    
    // Restaurar icono normal si no es 'one'
    if (this.repeatMode !== 'one') {
      repeatBtn.innerHTML = '<i class="fas fa-redo"></i>';
    }
    
    console.log('Repeat mode:', this.repeatMode);
  }
  
  seek(event) {
    const progressBar = event.currentTarget;
    const rect = progressBar.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;
    const seekTime = percent * this.duration;
    
    console.log('⏩ Seek to:', seekTime);
    this.updateProgress(percent * 100);
    
    // Enviar comando seek a YouTube
    if (window.electronAPI && window.electronAPI.send) {
      window.electronAPI.send('seek-audio', seekTime);
    }
  }
  
  startProgressDrag(event) {
    event.preventDefault();
    const progressBar = event.currentTarget;
    
    const handleDrag = (e) => {
      const rect = progressBar.getBoundingClientRect();
      const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      const seekTime = percent * this.duration;
      
      this.updateProgress(percent * 100);
      
      // Enviar comando seek a YouTube
      if (window.electronAPI && window.electronAPI.send) {
        window.electronAPI.send('seek-audio', seekTime);
      }
    };
    
    const handleDragEnd = () => {
      document.removeEventListener('mousemove', handleDrag);
      document.removeEventListener('mouseup', handleDragEnd);
    };
    
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', handleDragEnd);
  }
  
  setVolume(event) {
    const volumeBar = event.currentTarget;
    const rect = volumeBar.getBoundingClientRect();
    const percent = (event.clientX - rect.left) / rect.width;
    this.volume = Math.max(0, Math.min(1, percent));
    this.persistVolume(this.volume);
    this.updateVolumeUI();
    
    // Enviar comando de volumen a YouTube
    if (window.electronAPI && window.electronAPI.send) {
      window.electronAPI.send('update-volume', this.volume);
    }
  }
  
  startVolumeDrag(event) {
    event.preventDefault();
    const volumeBar = event.currentTarget;
    
    const handleDrag = (e) => {
      const rect = volumeBar.getBoundingClientRect();
      this.volume = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      this.persistVolume(this.volume);
      this.updateVolumeUI();
      // Enviar comando de volumen a YouTube
      if (window.electronAPI && window.electronAPI.send) {
        window.electronAPI.send('update-volume', this.volume);
      }
    };
    
    const handleDragEnd = () => {
      document.removeEventListener('mousemove', handleDrag);
      document.removeEventListener('mouseup', handleDragEnd);
    };
    
    document.addEventListener('mousemove', handleDrag);
    document.addEventListener('mouseup', handleDragEnd);
  }
  
  toggleMute() {
    if (this.volume > 0) {
      this.previousVolume = this.volume;
      this.volume = 0;
    } else {
      this.volume = this.previousVolume || 0.7;
    }
    this.persistVolume(this.volume);
    this.updateVolumeUI();
    
    // Enviar comando de volumen a YouTube
    if (window.electronAPI && window.electronAPI.send) {
      window.electronAPI.send('update-volume', this.volume);
    }
  }
  
  updateVolumeUI() {
    const volumeFill = document.getElementById('volumeFill');
    const volumeHandle = document.getElementById('volumeHandle');
    const volumeBtn = document.getElementById('volumeBtn');
    const volumePercent = document.getElementById('volumePercent');
    const icon = volumeBtn.querySelector('i');
    
    const percent = this.volume * 100;
    volumeFill.style.width = percent + '%';
    volumeHandle.style.left = percent + '%';
    volumePercent.textContent = Math.round(percent) + '%';
    
    // Update volume icon
    if (this.volume === 0) {
      icon.className = 'fas fa-volume-mute';
    } else if (this.volume < 0.5) {
      icon.className = 'fas fa-volume-down';
    } else {
      icon.className = 'fas fa-volume-up';
    }

    // Sincronizar Now Playing en tiempo real
    if (window.nowPlayingManager) {
      window.nowPlayingManager.syncVolume(this.volume);
    }
  }

  seekTo(seconds) {
    const safe = Math.max(0, Number(seconds) || 0);
    this.updateProgress(this.duration ? (safe / this.duration) * 100 : 0);
    if (window.electronAPI && window.electronAPI.send) {
      window.electronAPI.send('seek-audio', safe);
    }
  }

  handlePipControl(data) {
    const action = data?.action;
    const value = data?.value;
    if (!action) return;
    if (action === 'play') {
      if (!this.isPlaying) this.togglePlay();
      return;
    }
    if (action === 'pause') {
      if (this.isPlaying) this.togglePlay();
      return;
    }
    if (action === 'next') {
      this.next();
      return;
    }
    if (action === 'previous') {
      this.previous();
      return;
    }
    if (action === 'seek') {
      this.seekTo(value);
    }
  }
  
  updateProgress(percent) {
    const progressFill = document.getElementById('progressFill');
    const progressHandle = document.getElementById('progressHandle');
    
    progressFill.style.width = percent + '%';
    progressHandle.style.left = percent + '%';
  }
  
  updateTime(current, total) {
    this.currentTime = current;
    this.duration = total;
    
    document.getElementById('currentTime').textContent = this.formatTime(current);
    document.getElementById('totalTime').textContent = this.formatTime(total);
    
    const percent = (current / total) * 100;
    this.updateProgress(percent);
    
    // ⭐ Actualizar Now Playing si está activo
    if (window.nowPlayingManager) {
      window.nowPlayingManager.updateProgress(current, total);
    }
  }
  
  formatTime(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }
  
  async toggleLike() {
    const track = this.currentTrack || window.appState?.currentTrack;
    if (!track) return;
    
    // Usar favoritesManager para toggle y persistir
    if (window.favoritesManager) {
      await window.favoritesManager.toggleFavorite(track);
    }
    
    // Actualizar UI de ambos lugares después de que cambie el estado
    this.updateLikeButton();
    if (window.nowPlayingManager) {
      window.nowPlayingManager.updateLikeButton();
    }
  }
  
  // ⭐ Actualizar estado visual del like button
  updateLikeButton() {
    const likeBtn = document.getElementById('likeBtn');
    if (!likeBtn) return;
    
    const icon = likeBtn.querySelector('i');
    const track = this.currentTrack || window.appState?.currentTrack;
    const isLiked = track && window.favoritesManager?.isFavorite(track.videoId);
    
    if (isLiked) {
      icon.className = 'fas fa-heart';
      likeBtn.classList.add('liked');
    } else {
      icon.className = 'far fa-heart';
      likeBtn.classList.remove('liked');
    }
  }
  
  toggleFullscreen() {
    console.log('Toggle fullscreen/mini player');
    // TODO: Implement fullscreen/mini player view
  }
  
  updateTrackInfo(track, direction = null) {
    if (!track) return;
    
    // ⭐ Guardar track actual
    this.currentTrack = track;
    
    document.getElementById('trackName').textContent = track.title || 'Selecciona una canción';
    document.getElementById('trackArtist').textContent = track.artist || 'SeaxMusic';
    
    const trackImage = document.getElementById('trackImage');
    if (track.thumbnail) {
      trackImage.src = track.thumbnail;
      trackImage.style.display = 'block';
    } else {
      trackImage.style.display = 'none';
    }
    
    // ⭐ Actualizar estado del like button en player bar
    this.updateLikeButton();

    // ⭐ Refrescar marquee tras cambio de texto
    if (window.scheduleMarqueeRefresh) {
      window.scheduleMarqueeRefresh();
    }
    
    // ⭐ Actualizar Now Playing con animación de carrusel
    if (window.nowPlayingManager) {
      window.nowPlayingManager.updateSong(track, direction);
    }

    this.updateSkipPreviews();
  }



  updateSkipPreviews() {
    const queue = window.appState?.playQueue || [];
    const idx = window.appState?.playQueueIndex ?? -1;

    const next = (queue.length && idx >= 0 && idx + 1 < queue.length)
      ? queue[idx + 1]
      : (window.appState?.nextVideoInfo || null);

    const prev = (queue.length && idx > 0)
      ? queue[idx - 1]
      : (window.appState?.prevVideoInfo || null);

    const apply = (prefix, data) => {
      const coverEl = document.getElementById(`${prefix}PreviewCover`);
      const titleEl = document.getElementById(`${prefix}PreviewTitle`);
      const artistEl = document.getElementById(`${prefix}PreviewArtist`);
      if (!coverEl || !titleEl || !artistEl) return;

      if (!data) {
        titleEl.textContent = 'Sin datos';
        artistEl.textContent = '—';
        coverEl.src = './assets/img/icon.png';
        return;
      }

      titleEl.textContent = data.title || 'Sin título';
      artistEl.textContent = data.artist || data.channel || 'YouTube';
      const thumb = data.thumbnail || (data.videoId ? `https://i.ytimg.com/vi/${data.videoId}/hqdefault.jpg` : './assets/img/icon.png');
      coverEl.src = thumb;
    };

    apply('next', next);
    apply('prev', prev);
    apply('npNext', next);
    apply('npPrev', prev);
  }
}

// Initialize player
const player = new MusicPlayer();

// Export player instance
window.musicPlayer = player;

// Update UI based on player responses
window.updatePlayerUI = function(status) {
  if (status.isPlaying !== undefined) {
    player.isPlaying = status.isPlaying;
    player.updatePlayButton();
  }
  
  if (status.currentTime !== undefined && status.duration !== undefined) {
    player.updateTime(status.currentTime, status.duration);
  }
};

window.updateTrackInfo = function(track, direction) {
  player.updateTrackInfo(track, direction);
};

// ⭐ Escuchar actualizaciones de info de video en tiempo real
if (window.electronAPI && window.electronAPI.onUpdateVideoInfo) {
  window.electronAPI.onUpdateVideoInfo((videoInfo) => {
    console.log('[PLAYER] Video info recibido:', videoInfo);
    
    // Actualizar currentTrack con la nueva info
    if (!player.currentTrack) {
      player.currentTrack = {};
    }

    const prevId = player.currentTrack.videoId || null;
    
    // Actualizar propiedades del track actual
    if (videoInfo.title) {
      player.currentTrack.title = videoInfo.title;
      document.getElementById('trackName').textContent = videoInfo.title;
    } else if (videoInfo.videoId && videoInfo.videoId !== prevId) {
      document.getElementById('trackName').textContent = 'Cargando...';
    }
    if (videoInfo.artist) {
      player.currentTrack.artist = videoInfo.artist;
      document.getElementById('trackArtist').textContent = videoInfo.artist;
    } else if (videoInfo.channel) {
      player.currentTrack.artist = videoInfo.channel;
      document.getElementById('trackArtist').textContent = videoInfo.channel;
    } else if (videoInfo.videoId && videoInfo.videoId !== prevId) {
      document.getElementById('trackArtist').textContent = 'YouTube';
    }
    if (videoInfo.channel) {
      player.currentTrack.channel = videoInfo.channel;
    }
    if (videoInfo.videoId) {
      player.currentTrack.videoId = videoInfo.videoId;
    }
    if (videoInfo.thumbnail) {
      player.currentTrack.thumbnail = videoInfo.thumbnail;
      const trackImage = document.getElementById('trackImage');
      if (trackImage) {
        trackImage.src = videoInfo.thumbnail;
        trackImage.style.display = 'block';
      }
    }
    // ⭐ Guardar avatar del canal
    if (videoInfo.channelAvatar) {
      player.currentTrack.channelAvatar = videoInfo.channelAvatar;
    }
    if (videoInfo.duration && videoInfo.duration > 0) {
      player.duration = videoInfo.duration;
      document.getElementById('totalTime').textContent = player.formatTime(videoInfo.duration);
    }
    
    // ⭐ Actualizar like button
    player.updateLikeButton();
    
    // ⭐ Actualizar Now Playing si está activo
    if (window.nowPlayingManager && window.nowPlayingManager.isActive) {
      window.nowPlayingManager.updateSong(player.currentTrack);
    }

    // ⭐ Refrescar marquee tras cambio de texto
    if (window.scheduleMarqueeRefresh) {
      window.scheduleMarqueeRefresh();
    }
  });
}

// ⭐ Escuchar actualizaciones de tiempo
if (window.electronAPI && window.electronAPI.onAudioTimeUpdate) {
  window.electronAPI.onAudioTimeUpdate((timeInfo) => {
    if (timeInfo.currentTime !== undefined && timeInfo.duration !== undefined) {
      player.updateTime(timeInfo.currentTime, timeInfo.duration);
    }
  });
}

// ⭐ Escuchar cuando el audio comienza/pausa
if (window.electronAPI && window.electronAPI.onAudioStarted) {
  window.electronAPI.onAudioStarted(() => {
    player.isPlaying = true;
    player.updatePlayButton();
    
    // Sincronizar con Now Playing
    if (window.nowPlayingManager) {
      window.nowPlayingManager.updatePlayState(true);
    }
  });
}

if (window.electronAPI && window.electronAPI.onAudioPaused) {
  window.electronAPI.onAudioPaused(() => {
    player.isPlaying = false;
    player.updatePlayButton();
    
    // Sincronizar con Now Playing
    if (window.nowPlayingManager) {
      window.nowPlayingManager.updatePlayState(false);
    }
  });
}

// ⭐ Escuchar actualizaciones de cover
if (window.electronAPI && window.electronAPI.onUpdateAlbumCover) {
  window.electronAPI.onUpdateAlbumCover((coverUrl) => {
    console.log('[PLAYER] Cover actualizado:', coverUrl);
    const trackImage = document.getElementById('trackImage');
    if (trackImage && coverUrl) {
      trackImage.src = coverUrl;
      trackImage.style.display = 'block';
      
      // Actualizar currentTrack
      if (player.currentTrack) {
        player.currentTrack.thumbnail = coverUrl;
      }
      
      // ⭐ Actualizar Now Playing si está activo
      if (window.nowPlayingManager && window.nowPlayingManager.isActive && player.currentTrack) {
        window.nowPlayingManager.updateSong(player.currentTrack);
      }
    }
  });
}
