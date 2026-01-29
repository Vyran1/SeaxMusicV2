/**
 * Script inyectado en YouTube para detectar login
 * Se ejecuta en el contexto de YouTube y puede comunicarse con la app
 */

console.log('🎬 YouTube content script loaded');

// Esperar a que YouTube cargue completamente
let loginCheckInterval = null;
let lastUserStatus = null;

function checkYouTubeLogin() {
  try {
    // Buscar indicadores de login en YouTube
    // YouTube guarda el usuario en localStorage bajo key "INNERTUBE_CLIENT_NAME"
    const youtubeData = localStorage.getItem('INNERTUBE_CLIENT_NAME');
    
    // También podemos buscar elementos de la UI que indican login
    const userMenu = document.querySelector('a[aria-label*="Cuenta"], a[aria-label*="Account"], ytd-button-renderer[aria-label*="user"]');
    const userIcon = document.querySelector('yt-icon-button[aria-label*="user"]');
    
    // Buscar en múltiples lugares donde YouTube guarda info del usuario
    const accountLink = document.querySelector('a[href*="/c/"], a[href*="/user/"], a[href*="/channel/"]');
    const signOutBtn = document.querySelector('a[href*="logout"], a[href*="sign_out"]');
    
    // Si encontramos un botón de sign out, el usuario está logueado
    const isLoggedIn = !!signOutBtn || !!accountLink || !!userMenu;
    
    // Obtener info del usuario si está disponible
    let userInfo = null;
    if (isLoggedIn) {
      // Intentar obtener el email o nombre del usuario
      const userNameElement = document.querySelector('yt-formatted-string[role="textbox"]');
      const userEmailElement = document.querySelector('[aria-label*="email"]');
      
      userInfo = {
        isLoggedIn: true,
        timestamp: new Date().toISOString(),
        userName: userNameElement?.textContent || 'YouTube User',
        userEmail: userEmailElement?.textContent || 'user@youtube.com'
      };
    }
    
    // Si el estado cambió, notificar a la app
    if (JSON.stringify(userInfo) !== JSON.stringify(lastUserStatus)) {
      lastUserStatus = userInfo;
      
      if (isLoggedIn && userInfo) {
        console.log('✅ Usuario logueado en YouTube:', userInfo);
        
        // Enviar mensaje a la app principal
        window.postMessage({
          type: 'YOUTUBE_LOGIN_SUCCESS',
          data: userInfo
        }, '*');
      }
    }
  } catch (error) {
    console.error('Error checking YouTube login:', error);
  }
}

// Iniciar verificación cada segundo
setTimeout(() => {
  loginCheckInterval = setInterval(checkYouTubeLogin, 1000);
  checkYouTubeLogin(); // Verificar inmediatamente también
}, 500);

// Escuchar mensajes de la app
window.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'CHECK_YOUTUBE_LOGIN') {
    console.log('📨 Recibido: Verificar login de YouTube');
    checkYouTubeLogin();
  }
});

console.log('✅ YouTube monitoring iniciado');
