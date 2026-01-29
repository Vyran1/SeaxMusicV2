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

    const activity = {
      details: '🎧 Navegando en SeaxMusic',
      state: '💿 Explorando canciones',
      largeImageKey: 'seaxmusic_logo',
      largeImageText: 'SeaxMusic',
      smallImageKey: 'seaxmusic_logo2',
      smallImageText: 'SeaxMusic Player',
      instance: false
    };

    this.updateActivity(activity);
  }

  /**
   * Actualizar cuando se reproduce una canción (CON COVER Y BOTÓN)
   */
  setPlayingActivity(trackName, trackArtist, trackImage, duration = 0) {
    if (!this.isConnected || !this.client) return;

    this.state.isPlaying = true;
    this.state.trackName = trackName;
    this.state.trackArtist = trackArtist;
    // ⭐ Solo actualizar imagen si se proporciona Y el cover NO está bloqueado
    if (trackImage && !this.state.coverLocked) {
      this.state.trackImage = trackImage;
      this.state.coverLocked = true; // Bloquear después de establecer
      console.log('[DISCORD] Cover establecido y bloqueado');
    }
    this.state.duration = duration;
    this.state.isPaused = false;
    
    const now = Math.floor(Date.now() / 1000);
    this.state.startTimestamp = now;
    this.state.endTimestamp = now + Math.floor(duration || 0);

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
        endTimestamp: this.state.endTimestamp,
        instance: false,
        buttons: [
          {
            label: '▶️ Escuchar en YouTube',
            url: this.state.videoUrl || 'https://www.youtube.com'
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

    const activity = {
      type: 2,
      details: this.state.trackName ? `🎵 ${this.sanitizeString(this.state.trackName)}` : 'Sin canción',
      state: this.state.trackArtist ? `🎤 ${this.sanitizeString(this.state.trackArtist)} • ⏸️ Pausado` : '⏸️ Pausado',
      largeImageKey: this.state.trackImage || 'seaxmusic_logo', // ⭐ Mantener cover cuando pausa
      largeImageText: 'Pausado',
      smallImageKey: 'seaxmusic_logo2',
      smallImageText: 'SeaxMusic',
      instance: false,
      buttons: [
        {
          label: '▶️ Escuchar en YouTube',
          url: this.state.videoUrl || 'https://www.youtube.com'
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
  }

  /**
   * Actualizar actividad en Discord
   */
  updateActivity(activity) {
    if (!this.isConnected || !this.client) return;

    try {
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
