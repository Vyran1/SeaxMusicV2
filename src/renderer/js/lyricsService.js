/**
 * 🎤 SeaxMusic Lyrics Service v2
 * Servicio de letras sincronizadas usando LRCLIB.net
 * Con caché, cancelación de búsquedas y búsqueda rápida
 */

class LyricsService {
    constructor() {
        this.baseUrl = 'https://lrclib.net/api';
        this.currentLyrics = null;
        this.parsedLyrics = [];
        this.currentLineIndex = -1;
        
        // Sistema de cancelación
        this.currentSearchId = 0;
        this.abortController = null;
        
        // Caché de letras (evita búsquedas repetidas)
        this.cache = new Map();
        this.maxCacheSize = 50;
        
        // Preload de siguiente canción
        this.preloadAbortController = null;
        this.preloadingTrack = null;
        
        console.log('🎤 LyricsService v2 initialized');
    }
    
    /**
     * Precargar letras de la siguiente canción (en segundo plano)
     * No afecta la búsqueda actual
     */
    async preloadLyrics(trackName, artistName) {
        if (!trackName) return;
        
        const cleanTrack = this.cleanSearchTerm(trackName);
        const cleanArtist = this.cleanSearchTerm(artistName);
        const cacheKey = this.getCacheKey(cleanTrack, cleanArtist);
        
        // Si ya está en caché, no hacer nada
        if (this.cache.has(cacheKey)) {
            console.log(`🎤 [PRELOAD] Ya en caché: "${cleanTrack}"`);
            return;
        }
        
        // Si ya estamos precargando esta canción, no duplicar
        if (this.preloadingTrack === cacheKey) {
            return;
        }
        
        // Cancelar preload anterior
        if (this.preloadAbortController) {
            this.preloadAbortController.abort();
        }
        
        this.preloadingTrack = cacheKey;
        this.preloadAbortController = new AbortController();
        const signal = this.preloadAbortController.signal;
        
        console.log(`🎤 [PRELOAD] Precargando: "${cleanTrack}" - "${cleanArtist}"`);
        
        try {
            // Búsqueda silenciosa en segundo plano
            const exactUrl = `${this.baseUrl}/get?track_name=${encodeURIComponent(cleanTrack)}&artist_name=${encodeURIComponent(cleanArtist)}`;
            const response = await fetch(exactUrl, { signal });
            
            if (response.ok) {
                const data = await response.json();
                if (data && (data.syncedLyrics || data.plainLyrics)) {
                    this.addToCache(cacheKey, data);
                    console.log(`✅ [PRELOAD] Precargado: "${cleanTrack}"`);
                    return;
                }
            }
            
            // Si no encontró con exacta, intentar búsqueda general
            const searchUrl = `${this.baseUrl}/search?q=${encodeURIComponent(cleanTrack + ' ' + cleanArtist)}`;
            const searchResponse = await fetch(searchUrl, { signal });
            
            if (searchResponse.ok) {
                const results = await searchResponse.json();
                if (results?.length > 0) {
                    const best = results.find(r => r.syncedLyrics) || results.find(r => r.plainLyrics);
                    if (best) {
                        this.addToCache(cacheKey, best);
                        console.log(`✅ [PRELOAD] Precargado: "${cleanTrack}"`);
                        return;
                    }
                }
            }
            
            // Cachear como no encontrado
            this.addToCache(cacheKey, null);
            
        } catch (error) {
            if (error.name !== 'AbortError') {
                console.log(`⚠️ [PRELOAD] Error: ${error.message}`);
            }
        } finally {
            if (this.preloadingTrack === cacheKey) {
                this.preloadingTrack = null;
            }
        }
    }
    
    /**
     * Generar clave de caché
     */
    getCacheKey(track, artist) {
        return `${track.toLowerCase().trim()}|${artist.toLowerCase().trim()}`;
    }
    
    /**
     * Buscar letras - con cancelación y caché
     */
    async searchLyrics(trackName, artistName, trackId = null) {
        // Cancelar búsqueda anterior si existe
        if (this.abortController) {
            this.abortController.abort();
        }
        
        // Nueva búsqueda
        const searchId = ++this.currentSearchId;
        this.abortController = new AbortController();
        
        // Limpiar estado anterior
        this.clear();
        
        // Limpiar términos de búsqueda
        const cleanTrack = this.cleanSearchTerm(trackName);
        const cleanArtist = this.cleanSearchTerm(artistName);
        
        if (!cleanTrack) {
            console.log('🎤 No hay título para buscar');
            return null;
        }
        
        // Verificar caché
        const cacheKey = this.getCacheKey(cleanTrack, cleanArtist);
        if (this.cache.has(cacheKey)) {
            console.log(`🎤 [${searchId}] Usando caché para: "${cleanTrack}"`);
            const cached = this.cache.get(cacheKey);
            if (cached === null) return null; // Cacheado como no encontrado
            return this.processLyricsResult(cached, searchId);
        }
        
        console.log(`🔍 [${searchId}] Buscando: "${cleanTrack}" - "${cleanArtist}"`);
        
        try {
            // Búsqueda rápida: intentar ambos endpoints en paralelo
            const result = await this.fastSearch(cleanTrack, cleanArtist, searchId);
            
            // Verificar que sigue siendo la búsqueda actual
            if (searchId !== this.currentSearchId) {
                console.log(`⏭️ [${searchId}] Resultado ignorado (búsqueda cancelada)`);
                return null;
            }
            
            // Guardar en caché (incluso si es null)
            this.addToCache(cacheKey, result);
            
            if (result) {
                return this.processLyricsResult(result, searchId);
            }
            
            console.log(`❌ [${searchId}] No se encontraron letras`);
            return null;
            
        } catch (error) {
            if (error.name === 'AbortError') {
                console.log(`⏭️ [${searchId}] Búsqueda abortada`);
                return null;
            }
            console.error(`❌ [${searchId}] Error:`, error.message);
            return null;
        }
    }
    
    /**
     * Búsqueda rápida - intenta múltiples estrategias con timeout
     */
    async fastSearch(track, artist, searchId) {
        const signal = this.abortController?.signal;
        
        // Función helper para fetch con timeout de 4 segundos
        const fetchWithTimeout = async (url, timeout = 4000) => {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);
            
            try {
                const response = await fetch(url, { 
                    signal: signal || controller.signal 
                });
                clearTimeout(timeoutId);
                return response;
            } catch (e) {
                clearTimeout(timeoutId);
                throw e;
            }
        };
        
        // Estrategia 1: Búsqueda exacta (más rápida si coincide) - 3s timeout
        try {
            const exactUrl = `${this.baseUrl}/get?track_name=${encodeURIComponent(track)}&artist_name=${encodeURIComponent(artist)}`;
            const response = await fetchWithTimeout(exactUrl, 3000);
            
            if (response.ok) {
                const data = await response.json();
                if (data && (data.syncedLyrics || data.plainLyrics)) {
                    console.log(`✅ [${searchId}] Encontrado con búsqueda exacta`);
                    return data;
                }
            }
        } catch (e) {
            if (e.name === 'AbortError') {
                if (signal?.aborted) throw e; // Cancelación del usuario
                console.log(`⏱️ [${searchId}] Timeout en búsqueda exacta`);
            }
        }
        
        // Verificar cancelación
        if (searchId !== this.currentSearchId) return null;
        
        // Estrategia 2: Búsqueda general - 4s timeout
        try {
            const searchUrl = `${this.baseUrl}/search?q=${encodeURIComponent(track + ' ' + artist)}`;
            const response = await fetchWithTimeout(searchUrl, 4000);
            
            if (response.ok) {
                const results = await response.json();
                if (results?.length > 0) {
                    // Priorizar letras sincronizadas
                    const withSync = results.find(r => r.syncedLyrics);
                    if (withSync) {
                        console.log(`✅ [${searchId}] Encontrado con búsqueda general (sincronizado)`);
                        return withSync;
                    }
                    // Fallback a letras planas
                    const withPlain = results.find(r => r.plainLyrics);
                    if (withPlain) {
                        console.log(`✅ [${searchId}] Encontrado con búsqueda general (plano)`);
                        return withPlain;
                    }
                }
            }
        } catch (e) {
            if (e.name === 'AbortError') {
                if (signal?.aborted) throw e;
                console.log(`⏱️ [${searchId}] Timeout en búsqueda general`);
            }
        }
        
        // Verificar cancelación
        if (searchId !== this.currentSearchId) return null;
        
        // Estrategia 3: Solo título (a veces el artista confunde) - 3s timeout
        try {
            const titleOnlyUrl = `${this.baseUrl}/search?q=${encodeURIComponent(track)}`;
            const response = await fetchWithTimeout(titleOnlyUrl, 3000);
            
            if (response.ok) {
                const results = await response.json();
                if (results?.length > 0) {
                    const withSync = results.find(r => r.syncedLyrics);
                    if (withSync) {
                        console.log(`✅ [${searchId}] Encontrado solo con título`);
                        return withSync;
                    }
                }
            }
        } catch (e) {
            if (e.name === 'AbortError') {
                if (signal?.aborted) throw e;
                console.log(`⏱️ [${searchId}] Timeout en búsqueda por título`);
            }
        }
        
        return null;
    }
    
    /**
     * Agregar a caché con límite de tamaño
     */
    addToCache(key, value) {
        if (this.cache.size >= this.maxCacheSize) {
            // Eliminar la entrada más antigua
            const firstKey = this.cache.keys().next().value;
            this.cache.delete(firstKey);
        }
        this.cache.set(key, value);
    }
    
    /**
     * Procesar resultado de letras
     */
    processLyricsResult(data, searchId) {
        if (!data || searchId !== this.currentSearchId) return null;
        
        this.currentLyrics = {
            id: data.id,
            trackName: data.trackName,
            artistName: data.artistName,
            albumName: data.albumName,
            duration: data.duration,
            instrumental: data.instrumental,
            syncedLyrics: data.syncedLyrics,
            plainLyrics: data.plainLyrics
        };
        
        // Parsear letras
        if (data.syncedLyrics) {
            this.parsedLyrics = this.parseSyncedLyrics(data.syncedLyrics);
            console.log(`🎤 ${this.parsedLyrics.length} líneas sincronizadas`);
        } else if (data.plainLyrics) {
            this.parsedLyrics = data.plainLyrics.split('\n')
                .map((line, index) => ({
                    time: -1,
                    text: line.trim(),
                    index
                }))
                .filter(l => l.text);
            console.log(`🎤 ${this.parsedLyrics.length} líneas (sin sincronizar)`);
        }
        
        return this.currentLyrics;
    }
    
    /**
     * Parsear LRC a array de {time, text}
     */
    parseSyncedLyrics(lrcText) {
        const parsed = [];
        const timeRegex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]/;
        
        for (const line of lrcText.split('\n')) {
            const match = line.match(timeRegex);
            if (match) {
                const mins = parseInt(match[1]);
                const secs = parseInt(match[2]);
                const ms = parseInt(match[3].padEnd(3, '0'));
                const time = mins * 60 + secs + ms / 1000;
                const text = line.replace(timeRegex, '').trim();
                
                if (text) {
                    parsed.push({ time, text, index: parsed.length });
                }
            }
        }
        
        return parsed;
    }
    
    /**
     * Limpiar término de búsqueda
     */
    cleanSearchTerm(term) {
        if (!term) return '';
        
        return term
            .replace(/\(.*?(official|video|lyrics|audio|hd|4k|remaster|live|ft\.|feat\.).*?\)/gi, '')
            .replace(/\[.*?(official|video|lyrics|audio|hd|4k|remaster|live).*?\]/gi, '')
            .replace(/\s*-\s*Topic$/i, '')
            .replace(/VEVO$/i, '')
            .replace(/\s*\|\s*.*/g, '')
            .replace(/[|•]/g, '')
            .replace(/\s+/g, ' ')
            .trim();
    }
    
    /**
     * Obtener línea actual por tiempo
     */
    getCurrentLine(currentTime) {
        if (!this.parsedLyrics.length || this.parsedLyrics[0].time === -1) {
            return null;
        }
        
        let line = null;
        for (let i = 0; i < this.parsedLyrics.length; i++) {
            if (this.parsedLyrics[i].time <= currentTime) {
                line = this.parsedLyrics[i];
                this.currentLineIndex = i;
            } else {
                break;
            }
        }
        return line;
    }
    
    /**
     * ¿Tiene letras sincronizadas?
     */
    hasSyncedLyrics() {
        return this.parsedLyrics.length > 0 && this.parsedLyrics[0].time !== -1;
    }
    
    /**
     * Obtener todas las letras
     */
    getAllLyrics() {
        return this.parsedLyrics;
    }
    
    /**
     * Limpiar estado (pero NO el caché)
     */
    clear() {
        this.currentLyrics = null;
        this.parsedLyrics = [];
        this.currentLineIndex = -1;
    }
    
    /**
     * Cancelar búsqueda actual
     */
    cancel() {
        this.currentSearchId++;
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    }
}

// Instancia global
window.lyricsService = new LyricsService();
