// ===== StorageManager - Acceso unificado a localStorage con versionado y manejo robusto =====
const StorageManager = (() => {
  const VERSION = 1;
  const VERSION_KEY = 'seaxmusic_storage_version';
  const PREFIX = 'seaxmusic_';

  const KEYS = {
    DJ_DATA: 'seaxmusic_dj_data',
    DJ_AUTOPLAYLISTS: 'seaxmusic_auto_playlists',
    DJ_PUBLISH_LAST: 'seaxmusic_dj_publish_last',
    DJMIX: 'seaxmusic_djmix',
    USER: 'seaxmusic_user',
    ACCOUNTS: 'seaxmusic_accounts',
    THEME: 'seaxmusic_theme',
    VOLUME: 'seaxmusic_volume',
    VOLUME_LEGACY: 'seaxmusic_volume', // alias
    LAST_TRACK: 'seaxmusic_last_track',
    RECENT_SEARCHES: 'seaxmusic_recent_searches',
    PIP_COLLAPSED: 'seaxmusic_pip_collapsed',
    HISTORY: 'seaxmusic_history_cache'
  };

  function ensureVersion() {
    try {
      const v = localStorage.getItem(VERSION_KEY);
      if (v !== String(VERSION)) {
        localStorage.setItem(VERSION_KEY, String(VERSION));
        console.log(`[STORAGE] Version ${VERSION} inicializada`);
      }
    } catch (e) { console.warn('[STORAGE] ensureVersion error', e); }
  }

  function safeGet(key) {
    try { return localStorage.getItem(key); } catch (e) { console.warn(`[STORAGE] get ${key} failed`, e); return null; }
  }

  function safeSet(key, value) {
    try {
      localStorage.setItem(key, value);
      return true;
    } catch (e) {
      if (e && (e.name === 'QuotaExceededError' || e.code === 22)) {
        console.warn('[STORAGE] QuotaExceeded, intentando limpieza LRU');
        tryCleanup();
        try { localStorage.setItem(key, value); return true; } catch (e2) { console.error('[STORAGE] still full after cleanup', e2); return false; }
      }
      console.warn(`[STORAGE] set ${key} failed`, e);
      return false;
    }
  }

  function tryCleanup() {
    // Limpia claves no críticas o antiguas (auto playlists cache, historial cache)
    const expendable = [KEYS.DJ_AUTOPLAYLISTS, KEYS.HISTORY, KEYS.RECENT_SEARCHES];
    for (const k of expendable) {
      try { localStorage.removeItem(k); console.log(`[STORAGE] cleaned ${k}`); } catch {}
    }
  }

  function getJSON(key, fallback = null) {
    const raw = safeGet(key);
    if (raw == null) return fallback;
    try { const parsed = JSON.parse(raw); return parsed ?? fallback; } catch (e) {
      console.warn(`[STORAGE] JSON parse failed for ${key}, removing`, e);
      try { localStorage.removeItem(key); } catch {}
      return fallback;
    }
  }

  function setJSON(key, obj) {
    try { return safeSet(key, JSON.stringify(obj)); } catch (e) { console.warn(`[STORAGE] setJSON ${key} failed`, e); return false; }
  }

  function remove(key) {
    try { localStorage.removeItem(key); return true; } catch (e) { console.warn(`[STORAGE] remove ${key} failed`, e); return false; }
  }

  function clearPrefixed() {
    try {
      const toRemove = [];
      for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k && k.startsWith(PREFIX)) toRemove.push(k);
      }
      toRemove.forEach(k => { try { localStorage.removeItem(k); } catch {} });
      ensureVersion();
      return true;
    } catch (e) { console.warn('[STORAGE] clearPrefixed failed', e); return false; }
  }

  // Auto-init
  ensureVersion();

  return {
    VERSION,
    KEYS,
    get: safeGet,
    set: safeSet,
    getJSON,
    setJSON,
    remove,
    clearAll: clearPrefixed,
    getOrDefault: (k, def) => { const v = safeGet(k); return v == null ? def : v; }
  };
})();

if (typeof window !== 'undefined') window.StorageManager = StorageManager;
if (typeof module !== 'undefined' && module.exports) module.exports = StorageManager;
