const { BrowserWindow } = require('electron');
const path = require('path');
const state = require('../state');

function createLoginWindow() {
  if (state.loginWindow && !state.loginWindow.isDestroyed()) {
    console.log('[LOGIN] Cerrando ventana de login anterior');
    try { state.loginWindow.close(); } catch (e) {}
    state.loginWindow = null;
  }

  state.loginWindow = new BrowserWindow({
    width: 500,
    height: 700,
    minWidth: 400,
    minHeight: 600,
    show: false,
    backgroundColor: '#000000',
    icon: path.join(__dirname, '../../renderer/assets/icons/icon.ico'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, '../../preload/scripts/login-preload.js'),
      partition: 'persist:youtube', // ⭐ Misma partition = misma sesión
      backgroundThrottling: false
    },
    autoHideMenuBar: true,
    parent: state.mainWindow,
    modal: true
  });

  console.log('[LOGIN] Ventana pequeña de login creada (compartiendo sesión)');

  // URL directa de login de Google para YouTube
  state.loginWindow.loadURL('https://accounts.google.com/ServiceLogin?service=youtube&hl=es&continue=https://www.youtube.com/signin?action_handle_signin=true&next=%2F');

  state.loginWindow.once('ready-to-show', () => {
    console.log('[LOGIN] Ventana lista, mostrando...');
    if (state.loginWindow && !state.loginWindow.isDestroyed()) {
      state.loginWindow.show();
      state.loginWindow.focus();
    }
  });

  if (process.argv.includes('--dev')) {
    state.loginWindow.webContents.openDevTools({ mode: 'detach' });
  }

  // Inyectar script de detección de login
  state.loginWindow.webContents.on('did-finish-load', () => {
    console.log('[LOGIN] Página de login cargada, inyectando detector...');

    const loginDetectionScript = `
      (function() {
        console.log('[LOGIN-DETECT] Script de detección iniciado');
        
        let checkInterval = null;
        
        function checkIfLoggedIn() {
          try {
            const isYouTube = window.location.hostname.includes('youtube.com');
            const hasUserButton = !!document.querySelector('ytd-topbar-menu-button-renderer img[src*="ggpht"], #avatar img[src*="ggpht"]');
            
            if (isYouTube && hasUserButton) {
              console.log('[LOGIN-DETECT] Login exitoso detectado!');
              
              // ⭐ Abrir menú de usuario para extraer datos correctos
              const userButton = document.querySelector('ytd-topbar-menu-button-renderer button, #avatar-btn');
              
              if (userButton) {
                userButton.click();
                
                setTimeout(() => {
                  const accountHeader = document.querySelector('ytd-active-account-header-renderer');
                  let userName = 'YouTube User';
                  let userHandle = '';
                  let avatarUrl = '';
                  
                  if (accountHeader) {
                    const nameEl = accountHeader.querySelector('#account-name');
                    if (nameEl) userName = nameEl.textContent?.trim() || nameEl.getAttribute('title') || 'YouTube User';
                    
                    const handleEl = accountHeader.querySelector('#channel-handle');
                    if (handleEl) userHandle = handleEl.textContent?.trim() || handleEl.getAttribute('title') || '';
                    
                    const avatarImg = accountHeader.querySelector('#avatar img');
                    if (avatarImg && avatarImg.src) avatarUrl = avatarImg.src;
                  }
                  
                  // Fallback avatar
                  if (!avatarUrl) {
                    const topbarImg = document.querySelector('ytd-topbar-menu-button-renderer img[src*="ggpht"]');
                    if (topbarImg) avatarUrl = topbarImg.src;
                  }
                  
                  // Cerrar menú
                  userButton.click();
                  
                  console.log('[LOGIN-DETECT] Datos:', userName, userHandle, avatarUrl ? 'avatar OK' : 'sin avatar');
                  
                  // Usar loginAPI (del login-preload.js) o youtubeAPI (fallback)
                  const api = window.loginAPI || window.youtubeAPI;
                  if (api && api.notifyLogin) {
                    api.notifyLogin({
                      isLoggedIn: true,
                      userName: userName,
                      userHandle: userHandle,
                      userAvatar: avatarUrl,
                      timestamp: new Date().toISOString()
                    });
                  } else {
                    console.error('[LOGIN-DETECT] No API disponible para notificar login');
                  }
                }, 500);
              }
              
              if (checkInterval) {
                clearInterval(checkInterval);
                checkInterval = null;
              }
            }
          } catch (e) {
            console.error('[LOGIN-DETECT] Error:', e);
          }
        }
        
        checkInterval = setInterval(checkIfLoggedIn, 500);
        
        window.addEventListener('load', checkIfLoggedIn);
        
        window.addEventListener('beforeunload', () => {
          if (checkInterval) clearInterval(checkInterval);
        });
        
        console.log('[LOGIN-DETECT] Detector configurado');
      })();
    `;

    if (state.loginWindow && !state.loginWindow.isDestroyed()) {
      state.loginWindow.webContents.executeJavaScript(loginDetectionScript)
        .then(() => console.log('[LOGIN] Script de detección inyectado'))
        .catch(err => console.error('[LOGIN] Error inyectando script:', err));
    }
  });

  state.loginWindow.on('closed', () => {
    console.log('[LOGIN] Ventana de login cerrada');
    state.loginWindow = null;

    // Recargar youtubeWindow para actualizar sesión
    if (state.youtubeWindow && !state.youtubeWindow.isDestroyed()) {
      console.log('[LOGIN] Recargando ventana de YouTube para actualizar sesión...');
      const currentUrl = state.youtubeWindow.webContents.getURL();
      state.youtubeWindow.loadURL(currentUrl);
    }
  });

  return state.loginWindow;
}

module.exports = { createLoginWindow };
