const { BrowserWindow, session } = require('electron');
const path = require('path');
const state = require('../state');

function createYouTubeWindow(isLoginWindow = false) {
  // ⭐ Elegir el preload correcto según el tipo de ventana
  const preloadPath = isLoginWindow
    ? path.join(__dirname, '../../preload/scripts/login-preload.js')    // Login: solo detecta login
    : path.join(__dirname, '../../preload/scripts/backend-preload.js'); // Player: controles de video

  const windowConfig = {
    width: isLoginWindow ? 500 : 1280,
    height: isLoginWindow ? 700 : 720,
    minWidth: isLoginWindow ? 400 : 800,
    minHeight: isLoginWindow ? 600 : 600,
    show: false, // Inicialmente oculta, se muestra cuando esté lista
    backgroundColor: '#000000',
    icon: path.join(__dirname, '../../renderer/assets/icons/icon.ico'),
    skipTaskbar: !isLoginWindow,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: preloadPath,
      partition: 'persist:youtube', // ⭐ partition en vez de session
      backgroundThrottling: false
    },
    autoHideMenuBar: true,
    ...(isLoginWindow && {
      parent: state.mainWindow,
      modal: true
    })
  };

  const win = new BrowserWindow(windowConfig);
  if (!isLoginWindow) {
    try { win.setTitle('SeaxMusic Video'); } catch (e) { }
    // Mute initially to prevent startup autoplay of YouTube's last session
    try {
      win.webContents.setAudioMuted(true);
      console.log('[VOLUME] Muted backend YouTube window on creation');
    } catch (e) {
      console.error('[VOLUME] Error muting on creation:', e);
    }
  }
  return win;
}

function createBackendWindow(id) {
  const backendWindow = new BrowserWindow({
    show: true,
    width: 1280,
    height: 720,
    minWidth: 800,
    minHeight: 600,
    autoHideMenuBar: true,
    icon: path.join(__dirname, '../../renderer/assets/icons/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../../preload/scripts/backend-preload.js'),
      partition: 'persist:youtube', // ⭐ CORRECCIÓN: Usar partition
      backgroundThrottling: false
    }
  });

  try {
    backendWindow.webContents.setAudioMuted(true);
    console.log('[VOLUME] Muted backend window on creation');
  } catch (e) {
    console.error('[VOLUME] Error muting backend window on creation:', e);
  }

  backendWindow.loadURL('https://www.youtube.com');
  backendWindow.customId = id;
  state.backendWindows.push(backendWindow);

  if (process.argv.includes('--dev')) {
    backendWindow.webContents.openDevTools({ mode: 'detach' });
  }

  backendWindow.on('closed', () => {
    const index = state.backendWindows.findIndex(win => win.customId === id);
    if (index !== -1) {
      state.backendWindows.splice(index, 1);
    }
  });

  return backendWindow;
}

function createAuxYoutubeWindow() {
  const isDevMode = process.argv.includes('--dev');

  if (state.auxYoutubeWindow && !state.auxYoutubeWindow.isDestroyed()) {
    return state.auxYoutubeWindow;
  }

  state.auxYoutubeWindow = new BrowserWindow({
    width: 900,
    height: 700,
    show: isDevMode, // Mostrar en dev mode para debug
    title: 'SeaxMusic - Datos Auxiliar',
    webPreferences: {
      partition: 'persist:youtube', // Misma sesión que la principal (login)
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../../preload/scripts/aux-preload.js'),
      backgroundThrottling: false
    }
  });

  if (isDevMode) {
    state.auxYoutubeWindow.webContents.openDevTools();
  }

  state.auxYoutubeWindow.on('closed', () => {
    state.auxYoutubeWindow = null;
  });

  return state.auxYoutubeWindow;
}

async function setVideoOnlyMode(win, enabled) {
  if (!win || win.isDestroyed()) return;
  const css = `
    html, body, ytd-app { background: #000 !important; overflow: hidden !important; }
    ytd-masthead, #secondary, #comments, #related, #chat, #sidebar,
    ytd-watch-next-secondary-results-renderer, #below, #info, #header,
    ytd-mini-guide-renderer, ytd-guide-renderer { display: none !important; }
    ytd-watch-flexy, #player, ytd-player, #movie_player, .html5-video-player {
      width: 100vw !important; height: 100vh !important; max-height: 100vh !important;
    }
    #player-container-outer, #player-container-inner { width: 100vw !important; height: 100vh !important; }
  `;

  if (enabled) {
    if (!state.videoViewCssKey) {
      state.videoViewCssKey = await win.webContents.insertCSS(css);
    }
  } else if (state.videoViewCssKey) {
    try { await win.webContents.removeInsertedCSS(state.videoViewCssKey); } catch (e) { }
    state.videoViewCssKey = null;
  }
}

function setupDeclarativeAdBlocker() {
  const filter = {
    urls: [
      '*://*.doubleclick.net/*',
      '*://*.googleadservices.com/*',
      '*://*.googlesyndication.com/*',
      '*://*.moatads.com/*',
      '*://*.adservice.google.com/*',
      '*://*.adservice.google.es/*',
      '*://video-stats.l.google.com/*',
      '*://*.youtube.com/pagead/*',
      '*://*.youtube.com/ptracking/*',
      '*://*.youtube.com/api/stats/ads/*',
      '*://*.youtube.com/api/stats/qoe?*adformat=*',
      '*://*.youtube.com/youtubei/v1/log_event*'
    ]
  };

  // Register on default session
  session.defaultSession.webRequest.onBeforeRequest(filter, (details, callback) => {
    callback({ cancel: true });
  });

  // Register on the persistent YouTube partition session used by player windows
  try {
    const ytSession = session.fromPartition('persist:youtube');
    ytSession.webRequest.onBeforeRequest(filter, (details, callback) => {
      callback({ cancel: true });
    });
    console.log('🛡️ [MAIN] Bloqueador de anuncios declarativo registrado a nivel de red (Default + persist:youtube)');
  } catch (err) {
    console.error('❌ [MAIN] Error al registrar bloqueador de anuncios en persist:youtube:', err);
  }
}

module.exports = {
  createYouTubeWindow,
  createBackendWindow,
  createAuxYoutubeWindow,
  setVideoOnlyMode,
  setupDeclarativeAdBlocker
};
