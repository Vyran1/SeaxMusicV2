// Player control logic

class MusicPlayer {
  constructor() {
    this.isPlaying = false;
    this.currentTime = 0;
    this.duration = 0;
    this.volume = 0.7;
    this.isShuffle = false;
    this.repeatMode = 'off'; // 'off', 'all', 'one'
    this.currentTrack = null;
    
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
    
    // Like button
    document.getElementById('likeBtn').addEventListener('click', () => this.toggleLike());
    
    // Fullscreen button
    document.getElementById('fullscreenBtn').addEventListener('click', () => this.toggleFullscreen());
    
    // ⭐ Track image click → Open Now Playing
    const trackImage = document.getElementById('trackImage');
    trackImage?.addEventListener('click', () => this.openNowPlaying());
    
    // ⭐ Expand button → Open Now Playing
    const expandBtn = document.getElementById('expandBtn');
    expandBtn?.addEventListener('click', () => this.openNowPlaying());
    
    // Initialize volume UI
    this.updateVolumeUI();
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
  }
  
  async previous() {
    console.log('⏮️ Previous track');
    
    // ⭐ Solo usar cola si estamos en Tu Biblioteca
    if (window.libraryManager && window.libraryManager.isLibraryActive) {
      if (window.appState && window.appState.playQueue && window.appState.playQueue.length > 0) {
        if (window.appState.playQueueIndex > 0) {
          if (window.playPrevInQueue && window.playPrevInQueue()) {
            return;
          }
        }
      }
    }
    
    // Fuera de biblioteca: usar YouTube normal
    if (window.electronAPI && window.electronAPI.send) {
      window.electronAPI.send('audio-control', 'previous');
    }
  }
  
  async next() {
    console.log('⏭️ Next track');
    
    // ⭐ Solo usar cola si estamos en Tu Biblioteca
    if (window.libraryManager && window.libraryManager.isLibraryActive) {
      if (window.appState && window.appState.playQueue && window.appState.playQueue.length > 0) {
        if (window.playNextInQueue && window.playNextInQueue()) {
          return;
        }
      }
    }
    
    // Fuera de biblioteca: usar YouTube normal
    if (window.electronAPI && window.electronAPI.send) {
      window.electronAPI.send('audio-control', 'next');
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
  
  toggleLike() {
    const likeBtn = document.getElementById('likeBtn');
    const icon = likeBtn.querySelector('i');
    likeBtn.classList.toggle('liked');
    if (likeBtn.classList.contains('liked')) {
      icon.className = 'fas fa-heart';
    } else {
      icon.className = 'far fa-heart';
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
    
    // ⭐ Actualizar Now Playing con animación de carrusel
    if (window.nowPlayingManager) {
      window.nowPlayingManager.updateSong(track, direction);
    }
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
    
    if (videoInfo.title || videoInfo.artist) {
      document.getElementById('trackName').textContent = videoInfo.title || 'Desconocido';
      document.getElementById('trackArtist').textContent = videoInfo.artist || 'Artista desconocido';
    }
    
    if (videoInfo.duration && videoInfo.duration > 0) {
      player.duration = videoInfo.duration;
      document.getElementById('totalTime').textContent = player.formatTime(videoInfo.duration);
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
  });
}

if (window.electronAPI && window.electronAPI.onAudioPaused) {
  window.electronAPI.onAudioPaused(() => {
    player.isPlaying = false;
    player.updatePlayButton();
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
    }
  });
}
