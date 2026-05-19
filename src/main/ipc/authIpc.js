const { ipcMain } = require('electron');
const fs = require('fs');
const state = require('../state');
const { createLoginWindow } = require('../windows/loginWindow');

// En dev mode, limpiar datos de sesión anterior para testing
if (process.argv.includes('--dev')) {
  console.log('[DEV] Dev mode: Limpiando datos de sesión anterior del store...');
  try {
    state.sessionStore.clear();
    console.log('[SESSION] Datos de sesión anterior borrados del store');
  } catch (error) {
    console.error('Error limpiando datos del store:', error);
  }
}

// IPC Handler: Save user data
ipcMain.handle('save-user-data', async (event, userData) => {
  try {
    state.sessionStore.set(userData);
    return { success: true };
  } catch (error) {
    console.error('Error saving user data via electron-store:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handler: Load user data
ipcMain.handle('load-user-data', async () => {
  try {
    const data = state.sessionStore.store;
    if (data && Object.keys(data).length > 0) {
      return data;
    }
    return null;
  } catch (error) {
    console.error('Error loading user data via electron-store:', error);
    return null;
  }
});

// IPC Handler: Clear user data
ipcMain.handle('clear-user-data', async () => {
  try {
    state.sessionStore.clear();
    return { success: true };
  } catch (error) {
    console.error('Error clearing user data via electron-store:', error);
    return { success: false, error: error.message };
  }
});

// ⭐ Handler de login - usar datos ya extraídos por backend-preload.js
ipcMain.on('youtube-login-success', (event, userInfo) => {
  // Evitar procesar múltiples veces
  if (state.loginProcessed) {
    console.log('[LOGIN] Login ya procesado, ignorando...');
    return;
  }

  console.log('[LOGIN] YouTube login detectado:', userInfo);
  state.loginProcessed = true;

  // Los datos ya vienen extraídos desde backend-preload.js
  // No necesitamos volver a extraer, solo enviar al renderer

  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('youtube-user-logged-in', {
      success: true,
      user: {
        id: Date.now(),
        name: userInfo.userName || 'YouTube User',
        handle: userInfo.userHandle || '',
        email: userInfo.userHandle || '', // Usar handle como "email" ya que YouTube no expone email
        avatar: userInfo.userAvatar || '',
        youtubeConnected: true,
        loginDate: new Date().toISOString()
      }
    });

    console.log('[NOTIFY] Notificación enviada a la app principal');
  }

  // ⭐ Cerrar loginWindow después del login exitoso (siempre, exceptuando DEV)
  const isDevMode = process.argv.includes('--dev');

  console.log('[LOGIN] Verificando cierre de ventana - isDevMode:', isDevMode, 'loginWindow existe:', !!state.loginWindow);

  if (!isDevMode && state.loginWindow && !state.loginWindow.isDestroyed()) {
    console.log('[LOGIN] Programando cierre de ventana de login en 1 segundo...');
    setTimeout(() => {
      if (state.loginWindow && !state.loginWindow.isDestroyed()) {
        console.log('[LOGIN] Cerrando ventana de login automáticamente');
        try {
          state.loginWindow.close();
        } catch (e) {
          console.error('[LOGIN] Error cerrando ventana:', e);
        }
        state.loginWindow = null;
      } else {
        console.log('[LOGIN] La ventana ya no existe o fue destruida');
      }
    }, 1000);
  } else if (isDevMode) {
    console.log('[DEV] Login window permanece abierta para debug');
  } else {
    console.log('[LOGIN] No hay loginWindow para cerrar');
  }

  // Reset flag después de un tiempo MUY largo para evitar loops
  setTimeout(() => {
    state.loginProcessed = false;
  }, 120000); // 2 minutos
});

ipcMain.on('youtube-logout-success', (event) => {
  console.log('[LOGOUT] YouTube logout detectado');

  // ⭐ Resetear flag de login para permitir nuevo login
  state.loginProcessed = false;
  console.log('[LOGOUT] Flag loginProcessed reseteado');

  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('youtube-user-logged-out', {
      success: true,
      timestamp: new Date().toISOString()
    });

    console.log('[NOTIFY] Notificación de logout enviada a la app principal');
  }
});

// ⭐ CORRECCIÓN: Logout mejorado
ipcMain.handle('logout-youtube', async () => {
  try {
    console.log('[LOGOUT] Iniciando logout de YouTube...');

    const ytSession = state.getYouTubeSession();

    try {
      await ytSession.clearStorageData({
        storages: ['cookies', 'localstorage', 'sessionstorage', 'indexdb', 'websql', 'serviceworkers', 'cachestorage']
      });
      console.log('[LOGOUT] Storage y cookies limpiadas correctamente');
    } catch (e) {
      console.error('[LOGOUT] Error limpiando storage:', e);
    }

    if (state.youtubeWindow && !state.youtubeWindow.isDestroyed()) {
      console.log('[LOGOUT] Navegando a logout en ventana existente...');

      state.youtubeWindow.loadURL('https://accounts.google.com/Logout');

      await new Promise(resolve => setTimeout(resolve, 2000));

      if (state.youtubeWindow && !state.youtubeWindow.isDestroyed()) {
        state.youtubeWindow.loadURL('https://www.youtube.com');
        console.log('[LOGOUT] YouTube recargado después del logout');
      }
    }

    if (state.loginWindow && !state.loginWindow.isDestroyed()) {
      try { state.loginWindow.close(); } catch (e) {}
      state.loginWindow = null;
    }

    return { success: true };
  } catch (error) {
    console.error('[LOGOUT] Error en logout:', error);
    return { success: false, error: error.message };
  }
});

// IPC Handler: Get YouTube login status
ipcMain.handle('get-youtube-login-status', async () => {
  try {
    if (state.youtubeWindow && !state.youtubeWindow.isDestroyed()) {
      const loginStatusScript = `
        (function() {
          const topbarMenuButton = document.querySelector('ytd-topbar-menu-button-renderer');
          const hasAvatarImg = topbarMenuButton?.querySelector('img[src*="ggpht"]') || 
                               topbarMenuButton?.querySelector('img[src*="lh3"]');
          const profileImage = hasAvatarImg || 
                              document.querySelector('#avatar-button img[src*="ggpht"]') || 
                              document.querySelector('button img[src*="lh3"]');
          
          return !!(profileImage || (hasAvatarImg));
        })();
      `;

      const isLoggedIn = await state.youtubeWindow.webContents.executeJavaScript(loginStatusScript);

      return {
        success: true,
        isLoggedIn: isLoggedIn,
        timestamp: new Date().toISOString()
      };
    }

    return {
      success: false,
      isLoggedIn: false,
      error: 'YouTube window not available'
    };
  } catch (error) {
    console.error('[GET-STATUS] Error getting YouTube status:', error);
    return {
      success: false,
      isLoggedIn: false,
      error: error.message
    };
  }
});

// IPC Handler: Force check login status
ipcMain.handle('force-check-youtube-login', async () => {
  try {
    if (state.youtubeWindow && !state.youtubeWindow.isDestroyed()) {
      const checkScript = `
        if (typeof checkYouTubeStatus === 'function') {
          checkYouTubeStatus();
        }
      `;

      await state.youtubeWindow.webContents.executeJavaScript(checkScript);
      return { success: true };
    }

    return { success: false, error: 'YouTube window not available' };
  } catch (error) {
    console.error('[FORCE-CHECK] Error forcing check:', error);
    return { success: false, error: error.message };
  }
});

// ⭐ CORRECCIÓN CRÍTICA: Ventana de login separada que comparte sesión
ipcMain.handle('open-youtube-login-window', async () => {
  createLoginWindow();
  return { success: true };
});
