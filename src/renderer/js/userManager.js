// User Management Logic

class UserManager {
  constructor() {
    this.user = null;
    this.loginWindow = null;
    this.clickOutsideHandlerAdded = false; // Flag para evitar múltiples handlers
    this.loginNotificationShown = false; // Flag para evitar múltiples notificaciones
    this.contentReloadInProgress = false; // Flag para evitar múltiples recargas de contenido
    this.loadUserData();
    this.initializeEventListeners();
    this.updateUserUI();

    // Listen for messages from child windows
    window.addEventListener('message', (event) => this.handleWindowMessage(event));
    
    // Listen for YouTube login from IPC
    if (window.electronAPI && window.electronAPI.onYouTubeUserLoggedIn) {
      window.electronAPI.onYouTubeUserLoggedIn((data) => {
        console.log('[YOUTUBE] Mensaje recibido de YouTube:', data);
        if (data.success) {
          this.handleYouTubeLogin(data.user);
        }
      });
    }
    
    // Listen for YouTube logout from IPC
    if (window.electronAPI && window.electronAPI.onYouTubeUserLoggedOut) {
      window.electronAPI.onYouTubeUserLoggedOut((data) => {
        console.log('[LOGOUT] YouTube logout detectado:', data);
        this.handleYouTubeLogout();
      });
    }
  }

  initializeEventListeners() {
    const userBtn = document.getElementById('userBtn');
    if (userBtn) {
      userBtn.addEventListener('click', () => this.toggleProfileMenu());
    }
  }

  loadUserData() {
    const userData = localStorage.getItem('seaxmusic_user');
    if (userData) {
      try {
        this.user = JSON.parse(userData);
      } catch (error) {
        console.error('Error parsing user data:', error);
        this.user = null;
      }
    }
  }

  updateUserUI() {
    const userAvatar = document.getElementById('userAvatar');
    const userIcon = document.getElementById('userIcon');
    const userName = document.getElementById('userName');
    const userBtn = document.getElementById('userBtn');

    if (this.user) {
      // User is logged in
      if (userAvatar) {
        // ⭐ userAvatar es un <img>, usar src correctamente
        if (this.user.avatar && this.user.avatar.startsWith('http')) {
          userAvatar.src = this.user.avatar;
          userAvatar.style.display = 'block';
          userAvatar.onerror = () => {
            // Si falla la carga, ocultar imagen
            userAvatar.style.display = 'none';
            if (userIcon) userIcon.style.display = 'block';
          };
        } else {
          // Sin avatar, mostrar icono
          userAvatar.style.display = 'none';
          if (userIcon) userIcon.style.display = 'block';
        }
      }

      if (userIcon && this.user.avatar && this.user.avatar.startsWith('http')) {
        userIcon.style.display = 'none';
      }

      if (userName) {
        userName.textContent = this.user.name || 'Usuario';
      }

      // Update home banner name if exists
      const homeBannerName = document.getElementById('homeBannerName');
      if (homeBannerName) {
        homeBannerName.textContent = this.user.name || 'Usuario';
      }

      if (userBtn) {
        userBtn.classList.add('logged-in');
      }
    } else {
      // User is not logged in
      if (userAvatar) {
        userAvatar.style.display = 'none';
      }

      if (userIcon) {
        userIcon.style.display = 'block';
      }

      if (userName) {
        userName.textContent = 'Usuario';
      }

      // Update home banner name if exists
      const homeBannerName = document.getElementById('homeBannerName');
      if (homeBannerName) {
        homeBannerName.textContent = 'Usuario';
      }

      if (userBtn) {
        userBtn.classList.remove('logged-in');
      }
    }
  }

  toggleProfileMenu() {
    if (!this.user) {
      // Not logged in, open login window
      this.openLoginWindow();
    } else {
      // Logged in, show profile menu
      const profileDropdown = document.getElementById('profileDropdown');
      if (profileDropdown) {
        const isVisible = profileDropdown.style.display !== 'none';
        profileDropdown.style.display = isVisible ? 'none' : 'block';

        if (!isVisible) {
          this.loadProfileMenu();
        }
      }
    }
  }

  openLoginWindow() {
    // Open YouTube login window directly (small window with Google Sign In)
    if (window.electronAPI && window.electronAPI.openYouTubeLoginWindow) {
      console.log('[LOGIN] Opening YouTube login window...');
      window.electronAPI.openYouTubeLoginWindow();
    } else {
      console.error('[ERROR] Unable to open YouTube login window - electronAPI not available');
    }
  }

  loadProfileMenu() {
    const profileDropdown = document.getElementById('profileDropdown');
    if (!profileDropdown) return;

    // ⭐ Usar avatar real si está disponible, sino iniciales
    const initials = this.user.name.charAt(0).toUpperCase();
    let avatarHTML;
    
    if (this.user.avatar && this.user.avatar.startsWith('http')) {
      avatarHTML = `<img src="${this.user.avatar}" style="
        width: 44px;
        height: 44px;
        border-radius: 50%;
        object-fit: cover;
      " alt="${this.user.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
      <div style="
        width: 44px;
        height: 44px;
        background: linear-gradient(135deg, #E13838, #FF0000);
        border-radius: 50%;
        display: none;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 18px;
      ">${initials}</div>`;
    } else {
      avatarHTML = `<div style="
        width: 44px;
        height: 44px;
        background: linear-gradient(135deg, #E13838, #FF0000);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 18px;
      ">${initials}</div>`;
    }
    
    // ⭐ Mostrar handle si está disponible, sino el nombre
    const displayEmail = this.user.handle || this.user.email || '';

    // Create profile menu HTML
    const menuHTML = `
      <div class="profile-menu">
        <div class="user-info">
          ${avatarHTML}
          <div class="user-details">
            <div class="user-name">${this.user.name || 'Usuario'}</div>
            <div class="user-email">${displayEmail}</div>
          </div>
        </div>

        <div class="divider"></div>

        <div class="menu-items">
          <button class="menu-item" id="settingsMenuItem">
            <i class="fas fa-cog"></i>
            <span>Configuración</span>
          </button>

          <button class="menu-item" id="accountMenuItem">
            <i class="fas fa-user"></i>
            <span>Mi Cuenta</span>
          </button>

          <button class="menu-item" id="helpMenuItem">
            <i class="fas fa-question-circle"></i>
            <span>Ayuda</span>
          </button>
        </div>

        <div class="divider"></div>

        <button class="menu-item logout" id="logoutMenuItem">
          <i class="fas fa-sign-out-alt"></i>
          <span>Cerrar Sesión</span>
        </button>
      </div>
    `;

    profileDropdown.innerHTML = menuHTML;

    // Add event listeners
    document.getElementById('settingsMenuItem')?.addEventListener('click', () => this.openSettings());
    document.getElementById('accountMenuItem')?.addEventListener('click', () => this.openAccount());
    document.getElementById('helpMenuItem')?.addEventListener('click', () => this.openHelp());
    document.getElementById('logoutMenuItem')?.addEventListener('click', () => this.logout());

    // Close menu when clicking outside - solo añadir una vez
    if (!this.clickOutsideHandlerAdded) {
      this.clickOutsideHandlerAdded = true;
      document.addEventListener('click', (e) => {
        const userBtn = document.getElementById('userBtn');
        const dropdown = document.getElementById('profileDropdown');
        if (dropdown && !dropdown.contains(e.target) && !userBtn.contains(e.target)) {
          dropdown.style.display = 'none';
        }
      });
    }
  }

  handleWindowMessage(event) {
    // Handle messages from child windows (login, profile, etc)
    if (event.data && event.data.type === 'USER_LOGGED_IN') {
      const user = event.data.user;
      
      console.log('👤 Usuario logueado:', user.name);
      
      // Update user
      this.user = user;
      
      // Save user to localStorage
      localStorage.setItem('seaxmusic_user', JSON.stringify(user));
      
      // Save user to JSON file via Electron IPC
      if (window.electronAPI && window.electronAPI.saveUserData) {
        window.electronAPI.saveUserData(user).catch(err => 
          console.error('Error saving user data:', err)
        );
      }
      
      // Update UI
      this.updateUserUI();
      this.closeProfileMenu();
      
      // Show notification
      this.showLoginNotification(user.name);
      
    } else if (event.data && event.data.type === 'USER_LOGGED_OUT') {
      console.log('🚪 Sesión cerrada');
      
      this.user = null;
      
      // Clear localStorage
      localStorage.removeItem('seaxmusic_user');
      
      // Clear from JSON file via Electron IPC
      if (window.electronAPI && window.electronAPI.clearUserData) {
        window.electronAPI.clearUserData().catch(err => 
          console.error('Error clearing user data:', err)
        );
      }
      
      // Update UI
      this.updateUserUI();
      this.closeProfileMenu();
    }
  }

  handleYouTubeLogin(user) {
    console.log('✅ YouTube login manejado:', user);
    
    // ⭐ Evitar procesar múltiples veces (notificación Y recarga)
    if (this.loginNotificationShown || this.contentReloadInProgress) {
      console.log('[LOGIN] Login ya procesado o recarga en progreso, ignorando...');
      return;
    }
    
    this.user = user;
    
    // Save user to localStorage
    localStorage.setItem('seaxmusic_user', JSON.stringify(user));
    
    // Save user to JSON file via Electron IPC
    if (window.electronAPI && window.electronAPI.saveUserData) {
      window.electronAPI.saveUserData(user).catch(err => 
        console.error('Error saving user data:', err)
      );
    }
    
    // Update UI
    this.updateUserUI();
    this.closeProfileMenu();
    
    // Show notification (solo una vez)
    this.loginNotificationShown = true;
    this.showLoginNotification(user.name);
    
    // Reset flag después de un tiempo MUY largo para evitar loops
    setTimeout(() => {
      this.loginNotificationShown = false;
    }, 120000); // 2 minutos
    
    // ⭐ Solo recargar si no hay usuario previo cargado
    // Esto evita recargar cuando ya hay sesión
    const existingUser = localStorage.getItem('seaxmusic_user');
    const isNewLogin = !existingUser || JSON.parse(existingUser).id !== user.id;
    
    if (isNewLogin) {
      // ⭐ Recargar todo el contenido con el loader (como carga inicial)
      this.reloadAllContent();
    }
    
    // ⭐ NO cerrar YouTube window después del login
    // La ventana de YouTube debe permanecer abierta para reproducir música
    console.log('[LOGIN] Login completado - YouTube window permanece abierta para reproducción');
  }
  
  // ⭐ Recargar todo el contenido (historial, favoritos) con loader
  reloadAllContent() {
    // ⭐ Evitar múltiples recargas simultáneas
    if (this.contentReloadInProgress) {
      console.log('[RELOAD] Ya hay una recarga en progreso, ignorando...');
      return;
    }
    
    this.contentReloadInProgress = true;
    console.log('🔄 Recargando todo el contenido...');
    
    // Mostrar loader
    if (typeof showLoader === 'function') {
      showLoader('Cargando tu música...');
    }
    if (typeof updateLoaderStatus === 'function') {
      updateLoaderStatus('Cargando historial de la nueva cuenta...');
    }
    
    // Resetear flags de contenido cargado
    if (window.appState) {
      window.appState.contentLoaded.favorites = false;
      window.appState.contentLoaded.history = false;
    }
    
    // Esperar un poco para que YouTube cargue el perfil del nuevo usuario
    setTimeout(() => {
      // Recargar favoritos
      if (typeof loadFavoritesFromStorage === 'function') {
        loadFavoritesFromStorage();
      }
      if (typeof loadFavoritesContent === 'function') {
        loadFavoritesContent();
      }
      
      // Recargar historial
      if (typeof loadRecentlyPlayed === 'function') {
        loadRecentlyPlayed();
      }
      
      // Permitir nueva recarga después de 30 segundos
      setTimeout(() => {
        this.contentReloadInProgress = false;
      }, 30000);
    }, 2000);
  }

  handleYouTubeLogout() {
    console.log('[LOGOUT] YouTube logout manejado');
    
    // Clear user data
    this.user = null;
    
    // Clear localStorage completely
    localStorage.removeItem('seaxmusic_user');
    localStorage.clear();
    
    // Clear JSON file via Electron IPC
    if (window.electronAPI && window.electronAPI.clearUserData) {
      window.electronAPI.clearUserData().catch(err => 
        console.error('Error clearing user data:', err)
      );
    }
    
    // Update UI
    this.updateUserUI();
    this.closeProfileMenu();
    
    // Show notification
    this.showLogoutNotification();
    
    // Close YouTube window
    if (window.electronAPI && window.electronAPI.closeYouTubeWindow) {
      window.electronAPI.closeYouTubeWindow().catch(err => 
        console.error('Error closing YouTube window:', err)
      );
    }
    
    // Después de logout, mostrar automáticamente el login la próxima vez
    // (esto se activa cuando el usuario vuelva a hacer clic en el botón de usuario)
    console.log('[LOGOUT] Logout completado - el próximo clic en usuario mostrará login');
  }

  showLoginNotification(userName) {
    // Create notification
    const notification = document.createElement('div');
    notification.className = 'login-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #E13838, #FF0000);
      color: white;
      padding: 16px 24px;
      border-radius: 8px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(225, 56, 56, 0.4);
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
    `;
    notification.innerHTML = `<i class="fas fa-check-circle"></i> ¡Bienvenido ${userName}!`;
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  showLogoutNotification() {
    // Create notification
    const notification = document.createElement('div');
    notification.className = 'logout-notification';
    notification.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      background: linear-gradient(135deg, #666666, #333333);
      color: white;
      padding: 16px 24px;
      border-radius: 8px;
      font-weight: 600;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
      z-index: 10000;
      animation: slideIn 0.3s ease-out;
    `;
    notification.innerHTML = `<i class="fas fa-sign-out-alt"></i> Sesión cerrada`;
    document.body.appendChild(notification);
    
    // Remove after 3 seconds
    setTimeout(() => {
      notification.remove();
    }, 3000);
  }

  saveUserData() {
    localStorage.setItem('seaxmusic_user', JSON.stringify(this.user));
    // TODO: Save to JSON file using Electron IPC
  }

  clearUserData() {
    localStorage.removeItem('seaxmusic_user');
    // TODO: Clear from JSON file using Electron IPC
  }

  closeProfileMenu() {
    const profileDropdown = document.getElementById('profileDropdown');
    if (profileDropdown) {
      profileDropdown.style.display = 'none';
    }
  }

  openSettings() {
    console.log('Abriendo configuración...');
    // TODO: Open settings modal
    this.closeProfileMenu();
  }

  openAccount() {
    console.log('Abriendo cuenta...');
    // TODO: Open account settings modal
    this.closeProfileMenu();
  }

  openHelp() {
    console.log('Abriendo ayuda...');
    // TODO: Open help modal
    this.closeProfileMenu();
  }

  logout() {
    if (confirm('Estás seguro de que deseas cerrar sesión?')) {
      this.user = null;
      
      // Limpiar localStorage completamente
      localStorage.removeItem('seaxmusic_user');
      localStorage.clear();
      
      // Limpiar desde JSON file vía Electron IPC
      if (window.electronAPI && window.electronAPI.clearUserData) {
        window.electronAPI.clearUserData()
          .then(() => console.log('[OK] Sesión y datos limpios'))
          .catch(err => console.error('Error limpiando datos:', err));
      }
      
      // Logout también de YouTube para limpiar sesión allá
      if (window.electronAPI && window.electronAPI.logoutYouTube) {
        window.electronAPI.logoutYouTube()
          .then(() => {
            console.log('[OK] YouTube sesión cerrada');
            
            // Después de hacer logout, verificar que realmente se cerró
            // Esperar 3 segundos y luego chequear el estado
            setTimeout(() => {
              if (window.electronAPI && window.electronAPI.forceCheckYouTubeLogin) {
                window.electronAPI.forceCheckYouTubeLogin()
                  .then(() => console.log('[OK] Estado de YouTube verificado'))
                  .catch(err => console.error('[ERROR] No se pudo verificar estado:', err));
              }
            }, 3000);
          })
          .catch(err => console.error('Error cerrando sesión de YouTube:', err));
      }
      
      this.updateUserUI();
      this.closeProfileMenu();
      console.log('[LOGOUT] Sesión cerrada correctamente');
    }
  }
}

// Initialize user manager when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.userManager = new UserManager();
  });
} else {
  window.userManager = new UserManager();
}
