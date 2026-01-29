const { contextBridge, ipcRenderer } = require('electron');

/**
 * PRELOAD PARA VENTANA DE LOGIN
 * 
 * Esta ventana se usa SOLO para login de YouTube/Google.
 * NO debe enviar eventos de video-info, update-time, video-playing, etc.
 * Solo detecta cuando el usuario completa el login.
 */

console.log('[LOGIN-PRELOAD] Ventana de login cargada');

// ===== API DE LOGIN PARA EL RENDERER =====
contextBridge.exposeInMainWorld('loginAPI', {
  notifyLogin: (userInfo) => {
    ipcRenderer.send('youtube-login-success', userInfo);
  },
  log: (message) => {
    console.log('[LOGIN]', message);
  }
});

// ===== DETECTAR Y MONITOREAR LOGIN DE YOUTUBE =====
let isLoggedIn = false;
let loginCheckInterval = null;
let mutationObserver = null;

function checkYouTubeLoginStatus() {
  try {
    // Detectar login en YouTube buscando el elemento ytd-topbar-menu-button-renderer
    const topbarMenuButton = document.querySelector('ytd-topbar-menu-button-renderer');
    const hasAvatarImg = topbarMenuButton?.querySelector('img[src*="ggpht"]') || 
                         topbarMenuButton?.querySelector('img[src*="lh3"]');
    
    // Buscar el botón de usuario en la barra superior
    const userButton = document.querySelector('button[aria-label*="Cuenta"], button[aria-label*="gusto"], button[aria-label*="perfil"]');
    
    // Buscar el img del avatar
    const profileImage = hasAvatarImg || 
                        document.querySelector('#avatar-button img[src*="ggpht"]') || 
                        document.querySelector('button img[src*="lh3"]');
    
    // Verificar si hay un elemento de logout visible
    const logoutLink = document.querySelector('a[href="/logout"]') ||
                      document.querySelector('a[href*="Logout"]');
    
    // Verificar datos de sesión
    const hasSessionData = !!sessionStorage.getItem('_GA_SESSION_ID') || 
                          !!localStorage.getItem('SAPISID') ||
                          !!document.cookie.includes('SAPISID');
    
    const loginDetected = !!(profileImage || (logoutLink && hasSessionData) || (topbarMenuButton && hasAvatarImg));

    if (loginDetected && !isLoggedIn) {
      isLoggedIn = true;
      console.log('[LOGIN] YOUTUBE LOGIN DETECTADO');
      
      // Función para extraer datos del usuario
      const extractUserData = () => {
        let userName = 'YouTube User';
        let userHandle = '';
        let userAvatar = '';
        
        // Buscar en ytd-active-account-header-renderer (menú de perfil desplegado)
        const accountHeader = document.querySelector('ytd-active-account-header-renderer');
        if (accountHeader) {
          const nameEl = accountHeader.querySelector('#account-name');
          if (nameEl) {
            userName = nameEl.textContent?.trim() || nameEl.getAttribute('title') || 'YouTube User';
          }
          
          const handleEl = accountHeader.querySelector('#channel-handle');
          if (handleEl) {
            userHandle = handleEl.textContent?.trim() || handleEl.getAttribute('title') || '';
          }
          
          const avatarImg = accountHeader.querySelector('#avatar img') || 
                           accountHeader.querySelector('yt-img-shadow#avatar img') ||
                           accountHeader.querySelector('yt-img-shadow img');
          if (avatarImg && avatarImg.src && avatarImg.src.startsWith('http')) {
            userAvatar = avatarImg.src;
          }
        }
        
        // Fallback: avatar del topbar
        if (!userAvatar) {
          const topbarImg = document.querySelector('ytd-topbar-menu-button-renderer img[src*="ggpht"]');
          if (topbarImg && topbarImg.src) {
            userAvatar = topbarImg.src;
          }
        }
        
        return { userName, userHandle, userAvatar };
      };
      
      // Intentar abrir el menú de usuario para obtener los datos
      const openMenuButton = document.querySelector('ytd-topbar-menu-button-renderer button, #avatar-btn, button[aria-label*="Cuenta"]');
      
      if (openMenuButton) {
        console.log('[LOGIN] Abriendo menú de usuario para extraer datos...');
        openMenuButton.click();
        
        setTimeout(() => {
          const data = extractUserData();
          console.log('[LOGIN] Datos extraídos - Nombre:', data.userName, 'Handle:', data.userHandle);
          
          // Cerrar el menú
          openMenuButton.click();
          
          // Enviar notificación de login
          ipcRenderer.send('youtube-login-success', {
            isLoggedIn: true,
            timestamp: new Date().toISOString(),
            userName: data.userName,
            userHandle: data.userHandle,
            userAvatar: data.userAvatar
          });
        }, 500);
      } else {
        const data = extractUserData();
        ipcRenderer.send('youtube-login-success', {
          isLoggedIn: true,
          timestamp: new Date().toISOString(),
          userName: data.userName,
          userHandle: data.userHandle,
          userAvatar: data.userAvatar
        });
      }
      
    } else if (!loginDetected && isLoggedIn) {
      isLoggedIn = false;
      console.log('[LOGOUT] YOUTUBE LOGOUT DETECTADO');
      
      ipcRenderer.send('youtube-logout-success', {
        isLoggedIn: false,
        timestamp: new Date().toISOString()
      });
    }
  } catch (error) {
    console.error('Error checking login status:', error);
  }
}

// Monitorear cambios en el DOM
setTimeout(() => {
  try {
    const config = {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['aria-label', 'src'],
      characterData: false
    };
    
    const observeTarget = document.body || document.documentElement;
    
    if (!observeTarget) {
      console.log('[WARNING] No se puede observar: document.body y documentElement no disponibles');
      return;
    }
    
    mutationObserver = new MutationObserver(() => {
      checkYouTubeLoginStatus();
    });
    
    mutationObserver.observe(observeTarget, config);
    console.log('[LOGIN-OBSERVER] MutationObserver iniciado para detectar login');
  } catch (error) {
    console.error('Error creating MutationObserver:', error);
  }
}, 1000);

// Check periódico cada 2 segundos
loginCheckInterval = setInterval(() => {
  checkYouTubeLoginStatus();
}, 2000);

// Check inicial
setTimeout(() => {
  checkYouTubeLoginStatus();
}, 2000);

// Limpiar al cerrar
window.addEventListener('beforeunload', () => {
  if (mutationObserver) mutationObserver.disconnect();
  if (loginCheckInterval) clearInterval(loginCheckInterval);
});

console.log('[LOGIN-PRELOAD] Sistema de detección de login iniciado');
