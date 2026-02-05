// ===== DJ ENGINE - Sistema de Playlists Automáticas =====
// Analiza lo que escucha el usuario y genera playlists espectaculares

class DJEngine {
  constructor() {
    this.storageKey = 'seaxmusic_dj_data';
    this.autoPlaylistsKey = 'seaxmusic_auto_playlists';
    this.listenHistory = [];
    this.artistStats = {};
    this.genrePatterns = {};
    this.timePatterns = {};
    this.init();
  }

  init() {
    this.loadData();
    this.setupListeners();
  }

  // ⭐ Cargar datos guardados
  loadData() {
    try {
      const data = localStorage.getItem(this.storageKey);
      if (data) {
        const parsed = JSON.parse(data);
        this.listenHistory = parsed.listenHistory || [];
        this.artistStats = parsed.artistStats || {};
        this.genrePatterns = parsed.genrePatterns || {};
        this.timePatterns = parsed.timePatterns || {};
      }
    } catch (e) {
      console.error('[DJ ENGINE] Error cargando datos:', e);
    }
  }

  // ⭐ Guardar datos
  saveData() {
    try {
      const data = {
        listenHistory: this.listenHistory.slice(-500), // Últimas 500 escuchas
        artistStats: this.artistStats,
        genrePatterns: this.genrePatterns,
        timePatterns: this.timePatterns,
        lastUpdated: new Date().toISOString()
      };
      localStorage.setItem(this.storageKey, JSON.stringify(data));
    } catch (e) {
      console.error('[DJ ENGINE] Error guardando datos:', e);
    }
  }

  // ⭐ Escuchar eventos de reproducción
  setupListeners() {
    // Escuchar cuando se reproduce una canción
    if (window.electronAPI?.onAudioStarted) {
      window.electronAPI.onAudioStarted(() => {
        setTimeout(() => {
          const track = window.appState?.currentTrack;
          if (track) {
            this.trackPlay(track);
          }
        }, 500);
      });
    }
  }

  // ⭐ Registrar una reproducción
  trackPlay(track) {
    if (!track?.videoId) return;

    const now = new Date();
    const hour = now.getHours();
    const dayOfWeek = now.getDay();
    const artist = this.extractArtist(track);

    // Agregar al historial
    this.listenHistory.push({
      videoId: track.videoId,
      title: track.title,
      artist: artist,
      thumbnail: track.thumbnail,
      timestamp: now.toISOString(),
      hour: hour,
      dayOfWeek: dayOfWeek
    });

    // Actualizar estadísticas de artista
    if (artist) {
      if (!this.artistStats[artist]) {
        this.artistStats[artist] = { count: 0, tracks: [], lastPlayed: null };
      }
      this.artistStats[artist].count++;
      this.artistStats[artist].lastPlayed = now.toISOString();
      
      // Agregar track único al artista
      if (!this.artistStats[artist].tracks.find(t => t.videoId === track.videoId)) {
        this.artistStats[artist].tracks.push({
          videoId: track.videoId,
          title: track.title,
          thumbnail: track.thumbnail
        });
      }
    }

    // Actualizar patrones de tiempo
    const timeSlot = this.getTimeSlot(hour);
    if (!this.timePatterns[timeSlot]) {
      this.timePatterns[timeSlot] = [];
    }
    this.timePatterns[timeSlot].push({
      videoId: track.videoId,
      artist: artist
    });

    this.saveData();
    console.log('[DJ ENGINE] 🎵 Track registrado:', track.title, '- Artista:', artist);
  }

  // ⭐ Extraer artista del título
  extractArtist(track) {
    let artist = track.artist || track.channel || '';
    
    // Si el canal es genérico, intentar extraer del título
    if (artist.toLowerCase().includes('topic') || artist.toLowerCase().includes('vevo')) {
      const parts = track.title?.split(' - ');
      if (parts && parts.length >= 2) {
        artist = parts[0].trim();
      }
    }
    
    // Limpiar sufijos comunes
    artist = artist
      .replace(/\s*-\s*Topic$/i, '')
      .replace(/\s*VEVO$/i, '')
      .replace(/\s*Official$/i, '')
      .trim();
    
    return artist || 'Desconocido';
  }

  // ⭐ Obtener slot de tiempo
  getTimeSlot(hour) {
    if (hour >= 5 && hour < 9) return 'morning_early';
    if (hour >= 9 && hour < 12) return 'morning';
    if (hour >= 12 && hour < 14) return 'noon';
    if (hour >= 14 && hour < 18) return 'afternoon';
    if (hour >= 18 && hour < 21) return 'evening';
    if (hour >= 21 || hour < 2) return 'night';
    return 'late_night';
  }

  // ⭐ Obtener artistas top
  getTopArtists(limit = 10) {
    return Object.entries(this.artistStats)
      .filter(([artist, data]) => data.count >= 2) // Mínimo 2 plays
      .sort((a, b) => b[1].count - a[1].count)
      .slice(0, limit)
      .map(([artist, data]) => ({
        name: artist,
        playCount: data.count,
        tracks: data.tracks,
        lastPlayed: data.lastPlayed
      }));
  }

  // ⭐ Generar playlist de artista
  generateArtistMix(artistName) {
    const artistData = this.artistStats[artistName];
    if (!artistData || artistData.tracks.length < 3) return null;

    return {
      type: 'artist_mix',
      name: `${artistName} Mix`,
      description: `Lo mejor de ${artistName} basado en tu historial`,
      icon: 'fa-microphone-alt',
      color: this.getArtistColor(artistName),
      tracks: artistData.tracks.slice(0, 20),
      generatedAt: new Date().toISOString()
    };
  }

  // ⭐ Generar playlist por momento del día
  generateTimeMix() {
    const currentSlot = this.getTimeSlot(new Date().getHours());
    const slotNames = {
      morning_early: { name: 'Amanecer', emoji: '🌅', desc: 'Para empezar el día' },
      morning: { name: 'Mañana Activa', emoji: '☀️', desc: 'Energía para tu mañana' },
      noon: { name: 'Mediodía', emoji: '🌞', desc: 'Tu soundtrack del almuerzo' },
      afternoon: { name: 'Tarde Chill', emoji: '🌤️', desc: 'Relax de la tarde' },
      evening: { name: 'Atardecer', emoji: '🌆', desc: 'Vibes del atardecer' },
      night: { name: 'Noche', emoji: '🌙', desc: 'Para cerrar el día' },
      late_night: { name: 'Madrugada', emoji: '🌃', desc: 'Sesión nocturna' }
    };

    const slotInfo = slotNames[currentSlot];
    const patterns = this.timePatterns[currentSlot] || [];
    
    if (patterns.length < 5) return null;

    // Obtener tracks únicos más escuchados en este horario
    const trackCounts = {};
    patterns.forEach(p => {
      trackCounts[p.videoId] = (trackCounts[p.videoId] || 0) + 1;
    });

    const topTracks = Object.entries(trackCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 15)
      .map(([videoId]) => {
        const historyItem = this.listenHistory.find(h => h.videoId === videoId);
        return historyItem || null;
      })
      .filter(Boolean);

    if (topTracks.length < 5) return null;

    return {
      type: 'time_mix',
      name: `${slotInfo.emoji} ${slotInfo.name}`,
      description: slotInfo.desc,
      icon: 'fa-clock',
      color: '#7C3AED',
      tracks: topTracks,
      generatedAt: new Date().toISOString()
    };
  }

  // ⭐ Generar Seax Vibes Mix (mezcla general)
  generateSeaxVibes() {
    const allTracks = [];
    const seen = new Set();

    // Mezclar de diferentes fuentes
    const topArtists = this.getTopArtists(5);
    
    topArtists.forEach(artist => {
      artist.tracks.slice(0, 4).forEach(track => {
        if (!seen.has(track.videoId)) {
          seen.add(track.videoId);
          allTracks.push({
            ...track,
            artist: artist.name
          });
        }
      });
    });

    // Agregar tracks recientes que no sean de los top artistas
    const recentUnique = this.listenHistory
      .slice(-50)
      .filter(h => !seen.has(h.videoId))
      .slice(0, 10);
    
    recentUnique.forEach(track => {
      if (!seen.has(track.videoId)) {
        seen.add(track.videoId);
        allTracks.push(track);
      }
    });

    // Shuffle the tracks
    const shuffled = this.shuffleArray(allTracks);

    return {
      type: 'seax_vibes',
      name: '🔥 Seax Vibes',
      description: 'Tu mix personalizado basado en todo lo que escuchas',
      icon: 'fa-fire',
      color: '#E13838',
      tracks: shuffled.slice(0, 25),
      generatedAt: new Date().toISOString()
    };
  }

  // ⭐ Generar Descubrimiento (tracks poco escuchados)
  generateDiscovery() {
    // Tracks que solo has escuchado 1-2 veces
    const trackCounts = {};
    this.listenHistory.forEach(h => {
      trackCounts[h.videoId] = (trackCounts[h.videoId] || 0) + 1;
    });

    const rareTracks = this.listenHistory
      .filter(h => trackCounts[h.videoId] <= 2)
      .filter((h, i, arr) => arr.findIndex(x => x.videoId === h.videoId) === i)
      .slice(-20);

    if (rareTracks.length < 5) return null;

    return {
      type: 'discovery',
      name: '💎 Redescubre',
      description: 'Canciones que escuchaste poco - dale otra oportunidad',
      icon: 'fa-gem',
      color: '#06B6D4',
      tracks: this.shuffleArray(rareTracks).slice(0, 15),
      generatedAt: new Date().toISOString()
    };
  }

  // ⭐ Generar todas las playlists automáticas
  generateAllAutoPlaylists() {
    const playlists = [];

    // 1. Seax Vibes (siempre)
    const seaxVibes = this.generateSeaxVibes();
    if (seaxVibes && seaxVibes.tracks.length >= 5) {
      playlists.push(seaxVibes);
    }

    // 2. Mix del momento
    const timeMix = this.generateTimeMix();
    if (timeMix) {
      playlists.push(timeMix);
    }

    // 3. Top artistas individuales
    const topArtists = this.getTopArtists(3);
    topArtists.forEach(artist => {
      const mix = this.generateArtistMix(artist.name);
      if (mix && mix.tracks.length >= 5) {
        playlists.push(mix);
      }
    });

    // 4. Redescubrimiento
    const discovery = this.generateDiscovery();
    if (discovery) {
      playlists.push(discovery);
    }

    // Guardar playlists generadas
    this.saveAutoPlaylists(playlists);

    return playlists;
  }

  // ⭐ Guardar playlists automáticas
  saveAutoPlaylists(playlists) {
    try {
      localStorage.setItem(this.autoPlaylistsKey, JSON.stringify({
        playlists,
        generatedAt: new Date().toISOString()
      }));
    } catch (e) {
      console.error('[DJ ENGINE] Error guardando auto playlists:', e);
    }
  }

  // ⭐ Cargar playlists automáticas
  getAutoPlaylists() {
    try {
      const data = localStorage.getItem(this.autoPlaylistsKey);
      if (data) {
        const parsed = JSON.parse(data);
        // Si tiene más de 1 hora, regenerar
        const generatedAt = new Date(parsed.generatedAt);
        const hourAgo = new Date(Date.now() - 60 * 60 * 1000);
        if (generatedAt < hourAgo) {
          return this.generateAllAutoPlaylists();
        }
        return parsed.playlists || [];
      }
    } catch (e) {
      console.error('[DJ ENGINE] Error cargando auto playlists:', e);
    }
    return this.generateAllAutoPlaylists();
  }

  // ⭐ Generar URL de cover collage (4 imágenes)
  generateCollageCover(tracks) {
    if (!tracks || tracks.length === 0) return null;
    
    // Obtener hasta 4 thumbnails únicos
    const thumbs = tracks.slice(0, 4).map(t => 
      t.thumbnail || `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg`
    );
    
    // Retornar como string JSON para que se pueda parsear después
    return JSON.stringify({
      type: 'collage',
      images: thumbs
    });
  }
  
  // ⭐ Obtener cover de playlist (collage o logo)
  getPlaylistCoverUrl(playlist) {
    if (playlist.logo && !playlist.logo.startsWith('{')) {
      return playlist.logo;
    }
    
    // Intentar parsear como collage
    if (playlist.logo) {
      try {
        const parsed = JSON.parse(playlist.logo);
        if (parsed.type === 'collage' && parsed.images?.length > 0) {
          return parsed.images[0]; // Usar primera imagen para Discord/UI simple
        }
      } catch (e) {}
    }
    
    // Fallback: primera imagen de los tracks
    if (playlist.tracks?.length > 0) {
      return playlist.tracks[0].thumbnail || `https://i.ytimg.com/vi/${playlist.tracks[0].videoId}/hqdefault.jpg`;
    }
    
    return null;
  }

  // ⭐ Crear playlist real en la comunidad (como DJ Bot)
  createCommunityPlaylist(autoPlaylist) {
    if (!autoPlaylist?.tracks?.length || autoPlaylist.tracks.length < 3) {
      console.log('[DJ ENGINE] No hay suficientes tracks para crear playlist');
      return null;
    }

    const playlistManager = window.playlistManager;
    if (!playlistManager) {
      console.error('[DJ ENGINE] PlaylistManager no disponible');
      return null;
    }

    // ⭐ DJ Bot crea las playlists, no el usuario actual
    const djBotKey = 'dj_seax_bot';

    // Formatear tracks
    const formattedTracks = autoPlaylist.tracks.map(t => ({
      videoId: t.videoId,
      title: t.title,
      artist: t.artist || 'YouTube',
      thumbnail: t.thumbnail || `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg`,
      addedAt: new Date().toISOString()
    }));

    const now = new Date().toISOString();
    
    // ⭐ No guardar logo - el cover se generará dinámicamente desde los tracks
    // Esto permite que getPlaylistCoverHtml cree el collage de 4 imágenes correctamente
    
    const playlist = {
      id: `pl_dj_${Date.now()}`,
      globalId: `gpl_dj_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      name: autoPlaylist.name || '🎧 Mix DJ',
      logo: null, // ⭐ Sin logo fijo - collage se genera desde tracks
      description: autoPlaylist.description || 'Playlist generada automáticamente por DJ Seax',
      creator: {
        key: djBotKey,
        name: '🤖 DJ Seax',
        avatar: ''
      },
      likedBy: [],
      likeCount: 0,
      tracks: formattedTracks,
      createdAt: now,
      updatedAt: now,
      isDJGenerated: true,
      djType: autoPlaylist.type
    };

    // ⭐ Solo guardar en playlists globales de comunidad (NO en playlists del usuario)
    playlistManager.upsertGlobalPlaylist(playlist);

    // Refrescar UI
    if (playlistManager.refreshSidebar) {
      playlistManager.refreshSidebar();
    }

    console.log('[DJ ENGINE] ✅ Playlist creada en comunidad:', playlist.name, '-', formattedTracks.length, 'tracks');
    return playlist;
  }

  // ⭐ Verificar si ya existe una playlist DJ del mismo tipo hoy
  hasDJPlaylistToday(type) {
    const playlistManager = window.playlistManager;
    if (!playlistManager) return false;

    const global = playlistManager.getGlobalPlaylists?.() || [];
    const today = new Date().toISOString().slice(0, 10);
    
    return global.some(p => 
      p.isDJGenerated && 
      p.djType === type && 
      p.createdAt?.slice(0, 10) === today
    );
  }

  // ⭐ Crear playlists del DJ como playlists de comunidad
  publishDJPlaylists() {
    const playlists = this.getAutoPlaylists();
    const created = [];

    playlists.forEach(playlist => {
      // Solo crear si no existe una del mismo tipo hoy
      if (!this.hasDJPlaylistToday(playlist.type)) {
        const result = this.createCommunityPlaylist(playlist);
        if (result) {
          created.push(result);
        }
      }
    });

    if (created.length > 0) {
      console.log('[DJ ENGINE] 📢 Publicadas', created.length, 'playlists en la comunidad');
    }

    return created;
  }

  // ⭐ Reproducir playlist automática (con cover de playlist)
  playAutoPlaylist(playlist, shuffle = false) {
    if (!playlist?.tracks?.length) return;

    let tracks = [...playlist.tracks];
    if (shuffle) {
      tracks = this.shuffleArray(tracks);
    }

    // Formatear para el reproductor
    const formattedTracks = tracks.map(t => ({
      videoId: t.videoId,
      title: t.title,
      artist: t.artist || 'YouTube',
      thumbnail: t.thumbnail || `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg`
    }));

    // Establecer cola y reproducir
    if (window.setPlayQueue) {
      window.setPlayQueue(formattedTracks, 0);
    }

    // ⭐ Obtener cover de la playlist (collage o primera imagen)
    const playlistCover = this.getPlaylistCoverUrl(playlist);
    
    // ⭐ Crear info de playlist para Discord y UI
    const playlistInfo = {
      name: playlist.name,
      cover: playlistCover,
      id: playlist.id || `dj_${playlist.type}`
    };
    
    // ⭐ Guardar playlist actual para next/prev
    if (window.playlistManager) {
      window.playlistManager.currentPlayingPlaylist = {
        ...playlist,
        tracks: formattedTracks,
        logo: playlistCover // Asegurar que tiene el cover
      };
    }

    // Reproducir el primero con info de playlist
    if (formattedTracks[0] && window.electronAPI) {
      const track = formattedTracks[0];
      
      // ⭐ Actualizar UI con cover de playlist
      window.appState.currentTrack = {
        ...track,
        playlistName: playlist.name,
        thumbnail: playlistCover || track.thumbnail
      };
      
      // Actualizar elementos del reproductor
      const trackNameEl = document.getElementById('trackName');
      const trackArtistEl = document.getElementById('trackArtist');
      const trackImageEl = document.getElementById('trackImage');
      
      if (trackNameEl) trackNameEl.textContent = track.title || 'Sin título';
      if (trackArtistEl) trackArtistEl.textContent = track.artist || 'YouTube';
      if (trackImageEl && playlistCover) {
        trackImageEl.src = playlistCover;
      }
      
      // ⭐ Establecer info de playlist para Discord
      if (window.electronAPI.setCurrentPlaylist) {
        window.electronAPI.setCurrentPlaylist(playlistInfo);
      }
      
      // ⭐ Reproducir con info de playlist
      if (window.electronAPI.playAudioWithPlaylist) {
        window.electronAPI.playAudioWithPlaylist(
          `https://www.youtube.com/watch?v=${track.videoId}`,
          track.title,
          track.artist,
          playlistInfo
        );
      } else if (window.electronAPI.playAudio) {
        window.electronAPI.playAudio(
          `https://www.youtube.com/watch?v=${track.videoId}`,
          track.title,
          track.artist
        );
      }
    }

    console.log('[DJ ENGINE] 🎧 Reproduciendo playlist:', playlist.name, '- Cover:', playlistCover);
  }

  // ⭐ Utilidades
  shuffleArray(array) {
    const shuffled = [...array];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    return shuffled;
  }

  getArtistColor(artistName) {
    // Generar color basado en el nombre del artista
    let hash = 0;
    for (let i = 0; i < artistName.length; i++) {
      hash = artistName.charCodeAt(i) + ((hash << 5) - hash);
    }
    const hue = Math.abs(hash) % 360;
    return `hsl(${hue}, 70%, 50%)`;
  }

  // ⭐ Obtener estadísticas para mostrar
  getStats() {
    return {
      totalPlays: this.listenHistory.length,
      uniqueTracks: new Set(this.listenHistory.map(h => h.videoId)).size,
      topArtists: this.getTopArtists(5),
      mostPlayedSlot: this.getMostPlayedTimeSlot(),
      listeningSince: this.listenHistory[0]?.timestamp || null
    };
  }

  getMostPlayedTimeSlot() {
    const slotCounts = {};
    Object.entries(this.timePatterns).forEach(([slot, patterns]) => {
      slotCounts[slot] = patterns.length;
    });
    
    const sorted = Object.entries(slotCounts).sort((a, b) => b[1] - a[1]);
    return sorted[0] ? sorted[0][0] : null;
  }
}

// Crear instancia global
window.djEngine = new DJEngine();

// Exportar para uso
console.log('[DJ ENGINE] 🎧 Sistema DJ inicializado');
