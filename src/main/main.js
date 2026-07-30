const { app, BrowserWindow, powerSaveBlocker } = require('electron');
const path = require('path');
const state = require('./state');
const discordRPC = require('./services/discordRPC');
const AppUpdater = require('./services/autoUpdater');
const { createMainWindow } = require('./windows/mainWindow');
const { createYouTubeWindow, setupDeclarativeAdBlocker } = require('./windows/youtubeWindow');

// Evitar throttling en segundo plano (audio estable)
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

// Forzar cache local dentro de userData para evitar errores de permisos en Windows
const cachePath = path.join(app.getPath('userData'), 'Cache');
app.setPath('cache', cachePath);

// Inicializar todos los listeners y canales de comunicación IPC
require('./ipc/playerIpc');
require('./ipc/favoritesIpc');
require('./ipc/authIpc');
require('./ipc/systemIpc');
require('./ipc/hotkeyIpc');

// Content-Security-Policy estricta para el renderer principal
const { session } = require('electron');

function setupCSP() {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; " +
          "script-src 'self'; " +
          "style-src 'self' 'unsafe-inline' https://cdnjs.cloudflare.com https://fonts.googleapis.com https://fonts.gstatic.com; " +
          "font-src 'self' https://cdnjs.cloudflare.com https://fonts.gstatic.com; " +
          "img-src 'self' https://i.ytimg.com https://img.youtube.com https://yt3.ggpht.com https://lh3.googleusercontent.com data: blob:; " +
          "connect-src 'self' https://lrclib.net https://api.github.com; " +
          "media-src 'self' https://www.youtube.com; " +
          "frame-src 'self' https://www.youtube.com; " +
          "object-src 'none'"
        ]
      }
    });
  });
}

// Ciclo de vida de la aplicación (Electron App Lifecycle)
app.whenReady().then(() => {
  // Inicializar CSP
  setupCSP();

  // Inicializar AdBlocker declarativo a nivel de red
  setupDeclarativeAdBlocker();

  // Inicializar ventana principal
  createMainWindow();

  // Mantener reproducción estable en segundo plano (evita suspensión del sistema)
  if (powerSaveBlocker && !powerSaveBlocker.isStarted(state.powerSaveBlockerId || -1)) {
    state.powerSaveBlockerId = powerSaveBlocker.start('prevent-app-suspension');
    console.log('[POWER] powerSaveBlocker started:', state.powerSaveBlockerId);
  }

  // Inicializar Auto-Updater
  state.appUpdater = new AppUpdater();

  // Inicializar Discord Rich Presence
  discordRPC.initialize();

  // Crear ventana de YouTube activa automáticamente al iniciar
  setTimeout(() => {
    if (!state.youtubeWindow || state.youtubeWindow.isDestroyed()) {
      state.youtubeWindow = createYouTubeWindow(false);

      console.log('[YOUTUBE] YouTube window creada al iniciar (compartiendo sesión persistente)');
      state.youtubeWindow.loadURL('https://www.youtube.com');

      // Mostrar y abrir DevTools en modo desarrollo
      if (process.argv.includes('--dev')) {
        state.youtubeWindow.show();
        state.youtubeWindow.webContents.openDevTools({ mode: 'detach' });
        console.log('[DEV] YouTube window visible con DevTools');
      }

      // Inyectar script de monitoreo cuando cargue
      state.youtubeWindow.webContents.on('did-finish-load', () => {
        console.log('[YOUTUBE] YouTube cargado - Inyectando script de monitoreo');

        const monitoringScript = `
          (function() {
            console.log('[MONITOR] YouTube monitoring iniciado');

            window.checkYouTubeStatus = function() {
              try {
                const hasAvatar = !!document.querySelector('#avatar img, ytd-topbar-menu-button-renderer img');
                const hasLogout = !!document.querySelector('a[href*="logout"]');
                const isLoggedIn = hasAvatar || hasLogout;

                console.log('[MONITOR] Estado actual:', isLoggedIn ? 'LOGGED IN' : 'NOT LOGGED IN');

                return isLoggedIn;
              } catch (e) {
                console.error('[MONITOR] Error:', e);
                return false;
              }
            };

            setTimeout(() => {
              window.checkYouTubeStatus();
            }, 2000);
          })();
        `;

        state.youtubeWindow.webContents.executeJavaScript(monitoringScript)
          .catch(err => console.error('[YOUTUBE] Error inyectando monitor:', err));
      });

      const ytWin = state.youtubeWindow;
      state.youtubeWindow.on('closed', () => {
        if (state.youtubeWindow === ytWin) {
          state.youtubeWindow = null;
        }
      });
    }
  }, 500);

  // Manejo de Modal de Actualización en desarrollo / producción
  const isDevMode = process.argv.includes('--dev');
  const isPackaged = app.isPackaged;

  console.log('========================================');
  console.log('🔍 DIAGNÓSTICO DE ENTORNO:');
  console.log('   app.isPackaged:', isPackaged);
  console.log('   isDevMode (--dev flag):', isDevMode);
  console.log('   process.argv:', process.argv);
  console.log('   Versión:', app.getVersion());
  console.log('========================================');

  if (isDevMode) {
    console.log('🔧 Modo desarrollo detectado - forzando modal de update');

    // Notificar al renderer que se va a abrir el modal
    setTimeout(() => {
      if (state.mainWindow && !state.mainWindow.isDestroyed()) {
        state.mainWindow.webContents.send('update-modal-opened');
      }
    }, 500);

    const showDevUpdateModal = () => {
      setTimeout(() => {
        if (state.appUpdater && typeof state.appUpdater.promptInstallUpdate === 'function') {
          console.log('🔧 Mostrando modal de update en modo dev');
          state.appUpdater.promptInstallUpdate({
            version: '2.0.99-dev',
            releaseNotes: [
              { version: '2.0.99-dev', notes: '<ul><li>🚀 Modo desarrollador: ventana forzada</li><li>✨ Prueba de UI de updates</li><li>📝 Notas largas para probar el layout y el scroll en la ventana de actualización.</li></ul>', date: new Date().toISOString().slice(0, 10) },
              { version: '2.0.98-dev', notes: '<ul><li>🐛 Corrección de bugs menores</li><li>⚡ Mejoras de rendimiento</li></ul>', date: '2026-01-30' },
              { version: '2.0.97-dev', notes: '<ul><li>🎨 Nuevo diseño del modal</li><li>🔧 Ajustes de sincronización</li></ul>', date: '2026-01-29' }
            ]
          });
        }
      }, 3500);
    };

    if (state.mainWindow) {
      if (state.mainWindow.webContents.isLoading()) {
        state.mainWindow.webContents.once('did-finish-load', showDevUpdateModal);
      } else {
        showDevUpdateModal();
      }
    }
  } else {
    console.log('🚀 MODO PRODUCCIÓN - Iniciando verificación de actualizaciones...');

    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send('update-log', '🚀 MODO PRODUCCIÓN - Verificando actualizaciones...');
    }

    setTimeout(async () => {
      if (state.appUpdater) {
        console.log('📦 appUpdater existe, verificando...');

        if (state.mainWindow && !state.mainWindow.isDestroyed()) {
          state.mainWindow.webContents.send('update-log', '📦 Verificando actualizaciones pendientes...');
        }

        const hasPending = await state.appUpdater.checkAndShowPendingUpdate();
        console.log('📦 ¿Hay actualización pendiente?', hasPending);

        if (!hasPending) {
          console.log('🔍 No hay pendiente, buscando nuevas actualizaciones...');
          if (state.mainWindow && !state.mainWindow.isDestroyed()) {
            state.mainWindow.webContents.send('update-log', '🔍 Buscando nuevas actualizaciones en GitHub...');
          }

          try {
            const currentVer = app.getVersion();
            console.log('📌 [MAIN] Versión actual de la app:', currentVer);
            if (state.mainWindow && !state.mainWindow.isDestroyed()) {
              state.mainWindow.webContents.send('update-log', '📌 Versión instalada: ' + currentVer);
            }

            console.log('🔍 [MAIN] Llamando state.appUpdater.checkForUpdatesAndNotify()...');
            if (state.mainWindow && !state.mainWindow.isDestroyed()) {
              state.mainWindow.webContents.send('update-log', '🔍 Iniciando verificación con state.appUpdater...');
            }

            await state.appUpdater.checkForUpdatesAndNotify();

          } catch (err) {
            console.error('❌ [MAIN] Error general:', err);
            if (state.mainWindow && !state.mainWindow.isDestroyed()) {
              state.mainWindow.webContents.send('update-log', '❌ Error: ' + err.message);
            }
          }
        }
      } else {
        console.log('❌ state.appUpdater es NULL!');
        if (state.mainWindow && !state.mainWindow.isDestroyed()) {
          state.mainWindow.webContents.send('update-log', '❌ ERROR: state.appUpdater es NULL');
        }
      }
    }, 1500);
  }

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createMainWindow();
    }
  });
});

app.on('window-all-closed', () => {
  const isDevMode = process.argv.includes('--dev');

  // Destruir Discord Rich Presence al cerrar todas las ventanas
  discordRPC.destroy();

  if (process.platform !== 'darwin') {
    if (isDevMode) {
      console.log('[DEV] Todas las ventanas cerradas - app continúa en segundo plano para debug');
    } else {
      app.quit();
    }
  }
});

app.on('before-quit', () => {
  if (state.powerSaveBlockerId !== null && powerSaveBlocker.isStarted(state.powerSaveBlockerId)) {
    powerSaveBlocker.stop(state.powerSaveBlockerId);
    state.powerSaveBlockerId = null;
  }
});
