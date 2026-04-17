/**
 * Discord Rich Presence para SeaxMusic
 * Muestra la canción actual y estado en Discord
 * Basado en Spotify-like RPC con cover, timestamps y botón de escucha
 */

const RPC = require('discord-rpc');

// Client ID de Discord Developer Portal
const CLIENT_ID = '1461594775936434339';

class DiscordRichPresence {
  constructor() {
    this.client = null;
    this.isConnected = false;
    this.currentActivity = null;
    this.debounceTimeout = null;
    this.reconnectTimeout = null;
    this.reconnectAttempts = 0;
    this.maxReconnectAttempts = 5;
    
    // Estado actual (igual que en la versión anterior)
    this.state = {
      isPlaying: false,
      trackName: null,
      trackArtist: null,
      trackImage: null,
      videoUrl: null,
      videoId: null,
      duration: 0,
      currentTime: 0,
      isPaused: false,
      startTimestamp: null,
      endTimestamp: null,
      coverLocked: false  // ⭐ Bloquea el cover una vez establecido
    };
  }

  /**
   * Inicializar conexión con Discord
   */
  async initialize() {
    try {
      console.log('[DISCORD] Inicializando Discord Rich Presence...');
      
      this.client = new RPC.Client({ transport: 'ipc' });
      
      this.client.on('ready', () => {
        console.log('[DISCORD] ✅ Conectado a Discord como', this.client.user.username);
        this.isConnected = true;
        this.reconnectAttempts = 0;
        
        // Mostrar actividad inicial (navegando)
        this.setIdleActivity();
      });

      this.client.on('disconnected', () => {
        console.log('[DISCORD] ❌ Desconectado de Discord');
        this.isConnected = false;
        this.scheduleReconnect();
      });

      // Conectar
      await this.client.login({ clientId: CLIENT_ID });
      
    } catch (error) {
      console.error('[DISCORD] Error inicializando:', error.message);
      this.isConnected = false;
      this.scheduleReconnect();
    }
  }

  /**
   * Programar reconexión
   */
  scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.log('[DISCORD] Máximo de intentos de reconexión alcanzado');
      return;
    }

    const delay = Math.min(5000 * Math.pow(2, this.reconnectAttempts), 60000);
    console.log(`[DISCORD] Reintentando conexión en ${delay/1000}s...`);
    
    this.reconnectTimeout = setTimeout(() => {
      this.reconnectAttempts++;
      this.initialize();
    }, delay);
  }

  /**
   * Actividad cuando está navegando (sin reproducir)
   */
  setIdleActivity() {
    if (!this.isConnected || !this.client) return;

    this.state.playlistName = null;
    const activity = {
      type: 2,
      details: '🎧 Navegando en SeaxMusic',
      state: '💿 Explorando canciones',
      largeImageKey: 'seaxmusic_logo',
      largeImageText: 'SeaxMusic',
      smallImageKey: 'seaxmusic_logo2',
      smallImageText: 'SeaxMusic Player',
      instance: false,
      buttons: [
        {
          label: 'Escuchar en YouTube',
          url: 'https://www.youtube.com'
        },
        {
          label: 'Descargar',
          url: 'https://github.com/Vyran1/SeaxMusicV2/releases/latest'
        }
      ]
    };

    this.updateActivity(activity);
  }

  /**
   * Actualizar cuando se reproduce una canción (CON COVER Y BOTÓN)
   */
  setPlayingActivity(trackName, trackArtist, trackImage, duration = 0, videoId = null) {
    if (!this.isConnected || !this.client) return;

    const oldTrackName = this.state.trackName;
    const oldTrackArtist = this.state.trackArtist;
    const oldVideoId = this.state.videoId;
    const sameTrack = videoId && oldVideoId && videoId === oldVideoId && trackName === oldTrackName && trackArtist === oldTrackArtist;

    if (!sameTrack) {
      this.state.coverLocked = false;
      this.state.trackImage = null;
      console.log('[DISCORD] Nueva pista detectada, desbloqueando cover');
    }

    this.state.isPlaying = true;
    this.state.playlistName = null;
    this.state.trackName = trackName;
    this.state.trackArtist = trackArtist;
    this.state.videoId = videoId || oldVideoId;

    // ⭐ Solo actualizar imagen si se proporciona
    if (trackImage) {
      this.state.trackImage = trackImage;
      this.state.coverLocked = true; // Bloquear después de establecer
      console.log('[DISCORD] Cover establecido y bloqueado');
    }
    this.state.duration = duration;
    this.state.isPaused = false;
    
    const now = Math.floor(Date.now() / 1000);
    if (!sameTrack || !this.state.startTimestamp) {
      this.state.startTimestamp = now;
      this.state.endTimestamp = duration ? now + Math.floor(duration) : undefined;
    } else {
      const elapsed = Math.max(0, now - this.state.startTimestamp);
      this.state.startTimestamp = now - elapsed;
      this.state.endTimestamp = duration ? now + Math.max(0, Math.floor(duration) - elapsed) : undefined;
    }

    // ⭐ Debounce para evitar actualizaciones múltiples
    clearTimeout(this.debounceTimeout);
    this.debounceTimeout = setTimeout(() => {
      // ⭐ Usar la imagen del estado (puede haberse establecido por setInitialTrackImage)
      const imageToUse = this.state.trackImage || 'seaxmusic_logo';
      
      const activity = {
        type: 2,
        details: `🎵 ${this.sanitizeString(trackName)}`,
        state: `🎤 ${this.sanitizeString(trackArtist)}`,
        largeImageKey: imageToUse, // ⭐ Usar imagen del estado
        largeImageText: this.sanitizeString(trackName),
        smallImageKey: 'seaxmusic_logo2', // ⭐ Logo pequeño abajo
        smallImageText: 'Reproduciendo',
        startTimestamp: this.state.startTimestamp,
        endTimestamp: this.state.endTimestamp || undefined,
        instance: false,
        buttons: [
          {
            label: 'Escuchar en YouTube',
            url: this.state.videoUrl || 'https://www.youtube.com'
          },
          {
            label: 'Descargar',
            url: 'https://github.com/Vyran1/SeaxMusicV2/releases/latest'
          }
        ]
      };

      this.updateActivity(activity);
    }, 150);
  }

  /**
   * ⭐ Actualizar cuando se reproduce desde una playlist (muestra cover de playlist)
   */
  setPlaylistActivity(playlistName, trackName, trackArtist, playlistCover, duration = 0, videoId = null) {
    if (!this.isConnected || !this.client) return;

    const oldTrackName = this.state.trackName;
    const oldTrackArtist = this.state.trackArtist;
    const oldVideoId = this.state.videoId;
    const sameTrack = videoId && oldVideoId && videoId === oldVideoId && trackName === oldTrackName && trackArtist === oldTrackArtist;

    if (!sameTrack) {
      this.state.coverLocked = false;
      this.state.trackImage = null;
      console.log('[DISCORD] Nueva pista en playlist, desbloqueando cover');
    }

    console.log('[DISCORD] setPlaylistActivity:', playlistName, '- Cover:', playlistCover);

    this.state.isPlaying = true;
    this.state.trackName = trackName;
    this.state.trackArtist = trackArtist;
    this.state.playlistName = playlistName;
    this.state.videoId = videoId || oldVideoId;
    
    // ⭐ Usar cover de playlist si disponible
    if (playlistCover) {
      this.state.trackImage = playlistCover;
      this.state.coverLocked = true;
      console.log('[DISCORD] Cover de playlist establecido:', playlistCover);
    }
    
    this.state.duration = duration;
    this.state.isPaused = false;
    
    const now = Math.floor(Date.now() / 1000);
    if (!sameTrack || !this.state.startTimestamp) {
      this.state.startTimestamp = now;
      this.state.endTimestamp = duration ? now + Math.floor(duration) : undefined;
    } else {
      const elapsed = Math.max(0, now - this.state.startTimestamp);
      this.state.startTimestamp = now - elapsed;
      this.state.endTimestamp = duration ? now + Math.max(0, Math.floor(duration) - elapsed) : undefined;
    }

    clearTimeout(this.debounceTimeout);
    this.debounceTimeout = setTimeout(() => {
      const imageToUse = this.state.trackImage || 'seaxmusic_logo';
      
      const activity = {
        type: 2,
        details: `📀 Playlist: ${this.sanitizeString(playlistName)}`,
        state: `🎵 ${this.sanitizeString(trackName)} • 🎤 ${this.sanitizeString(trackArtist)}`,
        largeImageKey: imageToUse,
        largeImageText: `Playlist: ${this.sanitizeString(playlistName)}`,
        smallImageKey: 'seaxmusic_logo2',
        smallImageText: 'Reproduciendo playlist',
        startTimestamp: this.state.startTimestamp,
        endTimestamp: this.state.endTimestamp || undefined,
        instance: false,
        buttons: [
          {
            label: 'Escuchar en YouTube',
            url: this.state.videoUrl || 'https://www.youtube.com'
          },
          {
            label: 'Descargar',
            url: 'https://github.com/Vyran1/SeaxMusicV2/releases/latest'
          }
        ]
      };

      this.updateActivity(activity);
    }, 150);
  }

  /**
   * Actualizar cuando se pausa (CON BOTÓN)
   */
  setPausedActivity() {
    if (!this.isConnected || !this.client) return;

    this.state.isPlaying = false;
    this.state.isPaused = true;

    // ⭐ Mantener formato de playlist si estaba reproduciendo una
    const isPlaylist = !!this.state.playlistName;
    
    const activity = {
      type: 2,
      details: isPlaylist 
        ? `📀 Playlist: ${this.sanitizeString(this.state.playlistName)}`
        : (this.state.trackName ? `🎵 ${this.sanitizeString(this.state.trackName)}` : 'Sin canción'),
      state: isPlaylist
        ? `🎵 ${this.sanitizeString(this.state.trackName)} • ⏸️ Pausado`
        : (this.state.trackArtist ? `🎤 ${this.sanitizeString(this.state.trackArtist)} • ⏸️ Pausado` : '⏸️ Pausado'),
      largeImageKey: this.state.trackImage || 'seaxmusic_logo',
      largeImageText: 'Pausado',
      smallImageKey: 'seaxmusic_logo2',
      smallImageText: 'SeaxMusic',
      instance: false,
      buttons: [
        {
          label: 'Escuchar en YouTube',
          url: this.state.videoUrl || 'https://www.youtube.com'
        },
        {
          label: 'Descargar',
          url: 'https://github.com/Vyran1/SeaxMusicV2/releases/latest'
        }
      ]
    };

    this.updateActivity(activity);
  }

  resumeActivity() {
    if (!this.isConnected || !this.client || !this.state.trackName) return;
    if (this.state.isPlaying) return;

    this.state.isPlaying = true;
    this.state.isPaused = false;

    const imageToUse = this.state.trackImage || 'seaxmusic_logo';
    const activity = this.state.playlistName ? {
      type: 2,
      details: `📀 Playlist: ${this.sanitizeString(this.state.playlistName)}`,
      state: `🎵 ${this.sanitizeString(this.state.trackName)} • 🎶 Reproduciendo`,
      largeImageKey: imageToUse,
      largeImageText: `Playlist: ${this.sanitizeString(this.state.playlistName)}`,
      smallImageKey: 'seaxmusic_logo2',
      smallImageText: 'Reproduciendo playlist',
      startTimestamp: this.state.startTimestamp,
      endTimestamp: this.state.endTimestamp,
      instance: false,
      buttons: [
        {
          label: 'Escuchar en YouTube',
          url: this.state.videoUrl || 'https://www.youtube.com'
        },
        {
          label: 'Descargar',
          url: 'https://github.com/Vyran1/SeaxMusicV2/releases/latest'
        }
      ]
    } : {
      type: 2,
      details: `🎵 ${this.sanitizeString(this.state.trackName)}`,
      state: `🎤 ${this.sanitizeString(this.state.trackArtist)} • 🎶 Reproduciendo`,
      largeImageKey: imageToUse,
      largeImageText: this.sanitizeString(this.state.trackName),
      smallImageKey: 'seaxmusic_logo2',
      smallImageText: 'Reproduciendo',
      startTimestamp: this.state.startTimestamp,
      endTimestamp: this.state.endTimestamp || undefined,
      instance: false,
      buttons: [
        {
          label: 'Escuchar en YouTube',
          url: this.state.videoUrl || 'https://www.youtube.com'
        },
        {
          label: 'Descargar',
          url: 'https://github.com/Vyran1/SeaxMusicV2/releases/latest'
        }
      ]
    };

    this.updateActivity(activity);
  }

  /**
   * Establecer la imagen del track SOLO si el cover NO está bloqueado
   * (Se usa para el primer cover de la canción, no para actualizaciones posteriores)
   */
  setInitialTrackImage(imageUrl) {
    // ⭐ Solo establecer si el cover NO está bloqueado
    if (!this.state.coverLocked && imageUrl) {
      console.log('[DISCORD] Estableciendo imagen inicial del track y bloqueando');
      this.state.trackImage = imageUrl;
      this.state.coverLocked = true; // ⭐ Bloquear para que no se actualice más
    } else {
      console.log('[DISCORD] Cover ya bloqueado, ignorando nueva imagen');
    }
  }

  /**
   * Desbloquear el cover (llamar cuando cambia de video/canción)
   */
  unlockCover() {
    console.log('[DISCORD] Desbloqueando cover para nueva canción');
    this.state.coverLocked = false;
    this.state.trackImage = null;
    this.state.playlistName = null; // ⭐ Limpiar info de playlist
  }

  /**
   * Actualizar actividad en Discord
   */
  activityEquals(a, b) {
    if (!a || !b) return false;
    const fields = [
      'type', 'details', 'state', 'largeImageKey', 'largeImageText',
      'smallImageKey', 'smallImageText', 'startTimestamp', 'endTimestamp', 'instance'
    ];
    for (const field of fields) {
      if ((a[field] || null) !== (b[field] || null)) return false;
    }

    const buttonsA = a.buttons || [];
    const buttonsB = b.buttons || [];
    if (buttonsA.length !== buttonsB.length) return false;
    for (let i = 0; i < buttonsA.length; i++) {
      if (buttonsA[i].label !== buttonsB[i].label || buttonsA[i].url !== buttonsB[i].url) {
        return false;
      }
    }

    return true;
  }

  updateActivity(activity) {
    if (!this.isConnected || !this.client) return;

    try {
      if (this.currentActivity && this.activityEquals(this.currentActivity, activity)) {
        console.log('[DISCORD] Actividad idéntica, omitiendo actualización');
        return;
      }

      this.client.setActivity(activity);
      this.currentActivity = activity;
      console.log('[DISCORD] Actividad actualizada:', activity.details);
    } catch (error) {
      console.error('[DISCORD] Error actualizando actividad:', error.message);
    }
  }

  /**
   * Limpiar actividad
   */
  clearActivity() {
    if (!this.isConnected || !this.client) return;

    try {
      this.client.clearActivity();
      this.currentActivity = null;
      this.state = {
        isPlaying: false,
        trackName: null,
        trackArtist: null,
        trackImage: null,
        duration: 0,
        currentTime: 0
      };
      console.log('[DISCORD] Actividad limpiada');
    } catch (error) {
      console.error('[DISCORD] Error limpiando actividad:', error.message);
    }
  }

  /**
   * Sanitizar y limpiar string para Discord (máximo 128 caracteres)
   * Elimina caracteres especiales y paréntesis
   */
  sanitizeString(str) {
    if (!str) return 'Desconocido';
    // Limpiar paréntesis y caracteres especiales (igual que la versión proporcionada)
    const cleaned = str.replace(/\(.*?\)|\[.*?\]/g, '').trim();
    if (cleaned.length > 128) {
      return cleaned.substring(0, 125) + '...';
    }
    return cleaned || 'Desconocido';
  }

  /**
   * Destruir cliente
   */
  destroy() {
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
    }
    
    if (this.client) {
      try {
        this.client.destroy();
      } catch (error) {
        // Ignorar errores al destruir
      }
    }
    
    this.isConnected = false;
    this.client = null;
    console.log('[DISCORD] Cliente destruido');
  }
}

// Exportar instancia única
module.exports = new DiscordRichPresence();

