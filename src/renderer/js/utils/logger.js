// ===== Logger centralizado - niveles y isDev =====
const Logger = (() => {
  const LEVELS = { debug: 0, info: 1, warn: 2, error: 3, silent: 4 };
  let currentLevel = LEVELS.debug;

  function isDev() {
    try {
      if (typeof window !== 'undefined' && window.__SEAX_DEV__) return true;
      if (typeof process !== 'undefined' && Array.isArray(process.argv) && process.argv.includes('--dev')) return true;
      if (typeof localStorage !== 'undefined' && localStorage.getItem('seaxmusic_verbose') === '1') return true;
      if (typeof location !== 'undefined' && location.search.includes('verbose')) return true;
    } catch {}
    return false;
  }

  function shouldLog(level) {
    if (level === 'debug' && !isDev()) return false;
    return LEVELS[level] >= currentLevel;
  }

  function fmt(level, args) {
    const ts = new Date().toISOString().slice(11, 19);
    return [`[${ts}][${level.toUpperCase()}]`, ...args];
  }

  return {
    LEVELS,
    setLevel(l) { if (LEVELS[l] != null) currentLevel = LEVELS[l]; },
    isDev,
    debug(...args) { if (shouldLog('debug')) console.debug(...fmt('debug', args)); },
    info(...args) { if (shouldLog('info')) console.info(...fmt('info', args)); },
    log(...args) { if (shouldLog('info')) console.log(...fmt('info', args)); },
    warn(...args) { if (shouldLog('warn')) console.warn(...fmt('warn', args)); },
    error(...args) { if (shouldLog('error')) console.error(...fmt('error', args)); },
  };
})();

if (typeof window !== 'undefined') {
  window.Logger = Logger;
  window.__SEAX_DEV__ = window.__SEAX_DEV__ || false;
  // Exponer flag dev desde main si está en --dev (será seteado por app.js)
  if (typeof process !== 'undefined' && process.argv?.includes('--dev')) window.__SEAX_DEV__ = true;
}
if (typeof module !== 'undefined' && module.exports) module.exports = Logger;
