// User Management Logic

class UserManager {
  constructor() {
    this.user = null;
    this.loginWindow = null;
    this.clickOutsideHandlerAdded = false; // Flag para evitar múltiples handlers
    this.loginNotificationShown = false; // Flag para evitar múltiples notificaciones
    this.contentReloadInProgress = false; // Flag para evitar múltiples recargas de contenido
    this.lastLoginProcessedAt = 0;
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
  
  getStoredUser() {
    try {
      const userData = localStorage.getItem('seaxmusic_user');
      return userData ? JSON.parse(userData) : null;
    } catch (e) {
      console.error('[USER] Error leyendo usuario almacenado:', e);
      return null;
    }
  }
  
  buildUserKey(user) {
    if (!user) return '';
    const name = (user.name || '').trim().toLowerCase();
    const email = (user.email || '').trim().toLowerCase();
    const handle = (user.handle || '').trim().toLowerCase();
    const stable = `${email}|${name}|${handle}`.replace(/\|+$/, '');
    if (stable && stable !== '||') return stable;
    const id = (user.id || '').toString().trim();
    return id || 'guest';
  }

  getAccounts() {
    try {
      const raw = localStorage.getItem('seaxmusic_accounts');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      console.error('[ACCOUNTS] Error leyendo cuentas:', e);
      return [];
    }
  }

  saveAccounts(accounts) {
    localStorage.setItem('seaxmusic_accounts', JSON.stringify(accounts));
  }

  upsertAccount(user) {
    if (!user) {
      console.log('[ACCOUNTS] No se puede guardar cuenta: usuario null');
      return;
    }
    const accounts = this.getAccounts();
    const key = this.buildUserKey(user);
    console.log('[ACCOUNTS] Guardando cuenta con key:', key);
    const index = accounts.findIndex(acc => acc.key === key);
    const payload = { key, user };
    if (index === -1) {
      accounts.unshift(payload);
      console.log('[ACCOUNTS] Nueva cuenta añadida');
    } else {
      accounts[index] = payload;
      console.log('[ACCOUNTS] Cuenta existente actualizada');
    }
    this.saveAccounts(accounts);
    console.log('[ACCOUNTS] Total cuentas guardadas:', accounts.length);
  }

  saveCurrentAccountSnapshot() {
    const current = this.user || this.getStoredUser();
    if (!current) return;
    this.upsertAccount(current);
  }

  stopPlaybackForAccountChange() {
    try {
      if (window.musicPlayer) {
        window.musicPlayer.isPlaying = false;
        window.musicPlayer.currentTrack = null;
        window.musicPlayer.updatePlayButton?.();
      }
      if (window.electronAPI?.send) {
        window.electronAPI.send('audio-control', 'pause');
      }
      if (window.clearPlayQueue) {
        window.clearPlayQueue();
      }
      if (window.electronAPI?.clearCurrentPlaylist) {
        window.electronAPI.clearCurrentPlaylist();
      }
      if (window.appState) {
        window.appState.currentTrack = null;
      }
      const trackName = document.getElementById('trackName');
      const trackArtist = document.getElementById('trackArtist');
      const trackImage = document.getElementById('trackImage');
      if (trackName) trackName.textContent = 'Selecciona una canción';
      if (trackArtist) trackArtist.textContent = 'SeaxMusic';
      if (trackImage) {
        trackImage.src = './assets/img/icon.png';
        trackImage.style.display = 'block';
      }
      if (window.musicPlayer?.updateLikeButton) {
        window.musicPlayer.updateLikeButton();
      }
    } catch (e) {
      console.error('[ACCOUNT] Error deteniendo reproducción:', e);
    }
  }

  removeAccount(key) {
    const accounts = this.getAccounts().filter(acc => acc.key !== key);
    this.saveAccounts(accounts);
  }

  openAccountSwitcher() {
    this.closeProfileMenu();
    const modal = document.getElementById('accountSwitchModal');
    const list = document.getElementById('accountSwitchList');
    const closeBtn = document.getElementById('accountSwitchClose');
    const cancelBtn = document.getElementById('accountSwitchCancel');
    if (!modal || !list) return;

    list.innerHTML = '';
    const accounts = this.getAccounts();
    const currentKey = this.buildUserKey(this.user);

    if (accounts.length === 0) {
      list.innerHTML = `<div class="playlist-empty-state">Aún no hay cuentas guardadas.</div>`;
    } else {
      accounts.forEach(acc => {
        const isActive = acc.key === currentKey;
        const item = document.createElement('div');
        item.className = 'account-switch-item';
        item.innerHTML = `
          <div class="account-avatar">
            ${acc.user.avatar ? `<img src="${acc.user.avatar}" alt="">` : `<i class="fas fa-user"></i>`}
          </div>
          <div class="account-info">
            <div class="account-name">${acc.user.name || 'Usuario'}</div>
            <div class="account-email">${acc.user.email || acc.user.handle || 'sin correo'}</div>
          </div>
          <div class="account-actions">
            ${isActive ? `<span class="account-active">Activa</span>` : `<button class="account-use-btn">Usar</button>`}
            <button class="account-remove-btn" title="Eliminar cuenta"><i class="fas fa-trash"></i></button>
          </div>
        `;

        item.querySelector('.account-use-btn')?.addEventListener('click', () => {
          this.switchAccount(acc.user);
          modal.classList.remove('active');
        });

        item.querySelector('.account-remove-btn')?.addEventListener('click', () => {
          this.removeAccount(acc.key);
          if (acc.key === currentKey) {
            localStorage.removeItem('seaxmusic_user');
            this.user = null;
            this.updateUserUI();
          }
          this.openAccountSwitcher();
        });

        list.appendChild(item);
      });
    }

    closeBtn?.addEventListener('click', () => modal.classList.remove('active'));
    cancelBtn?.addEventListener('click', () => modal.classList.remove('active'));
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });
    modal.classList.add('active');
  }

  async switchAccount(user) {
    if (!user) return;
    if (typeof showLoader === 'function') {
      showLoader('Cambiando de cuenta...');
    }
    if (typeof updateLoaderStatus === 'function') {
      updateLoaderStatus('Sincronizando tu música...');
    }
    this.stopPlaybackForAccountChange();
    if (window.appState) {
      window.appState.isSwitchingAccount = true;
      window.appState.favorites = [];
      window.appState.recentHistory = [];
      window.appState.contentLoaded.favorites = false;
      window.appState.contentLoaded.history = false;
    }
    localStorage.setItem('seaxmusic_user', JSON.stringify(user));
    this.user = user;
    this.upsertAccount(user);
    if (window.electronAPI && window.electronAPI.saveUserData) {
      try {
        await window.electronAPI.saveUserData(user);
      } catch (err) {
        console.error('Error saving user data:', err);
      }
    }
    this.updateUserUI();
    this.closeProfileMenu();
    this.reloadAllContent();
    if (window.renderHomeModules) {
      window.renderHomeModules();
    }
    if (window.wireHomeActions) {
      window.wireHomeActions();
    }
    if (window.libraryManager) {
      window.libraryManager.refresh();
    }
    if (window.playlistManager) {
      window.playlistManager.refreshSidebar();
    }
    if (window.navigationHistory) {
      window.navigationHistory.loadPage('home', false);
    }
  }

  loadUserData() {
    const userData = localStorage.getItem('seaxmusic_user');
    if (userData) {
      try {
        this.user = JSON.parse(userData);
        this.upsertAccount(this.user);
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
      avatarHTML = `<img src="${this.user.avatar}" class="user-avatar" style="
        width: 48px;
        height: 48px;
        border-radius: 50%;
        object-fit: cover;
        border: 2px solid rgba(225, 56, 56, 0.3);
        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
      " alt="${this.user.name}" onerror="this.style.display='none'; this.nextElementSibling.style.display='flex';">
      <div class="user-avatar-fallback" style="
        width: 48px;
        height: 48px;
        background: linear-gradient(135deg, #E13838, #c62828);
        border-radius: 50%;
        display: none;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 20px;
        box-shadow: 0 4px 12px rgba(225, 56, 56, 0.3);
      ">${initials}</div>`;
    } else {
      avatarHTML = `<div class="user-avatar" style="
        width: 48px;
        height: 48px;
        background: linear-gradient(135deg, #E13838, #c62828);
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: bold;
        font-size: 20px;
        box-shadow: 0 4px 12px rgba(225, 56, 56, 0.3);
      ">${initials}</div>`;
    }
    
    // ⭐ Mostrar handle si está disponible, sino el nombre
    const displayEmail = this.user.handle || this.user.email || '';

    // Create profile menu HTML - Premium Design
    const menuHTML = `
      <div class="profile-menu">
        <div class="user-info">
          ${avatarHTML}
          <div class="user-details">
            <div class="user-name">${this.user.name || 'Usuario'}</div>
            <div class="user-email">${displayEmail}</div>
          </div>
        </div>

        <div class="menu-items">
          <button class="menu-item" id="settingsMenuItem">
            <i class="fas fa-cog"></i>
            <span>Configuración</span>
          </button>

          <button class="menu-item" id="switchAccountMenuItem">
            <i class="fas fa-users"></i>
            <span>Cambiar cuenta</span>
          </button>

          <button class="menu-item" id="accountMenuItem">
            <i class="fas fa-user-circle"></i>
            <span>Mi Cuenta</span>
          </button>

          <button class="menu-item" id="devMenuItem">
            <i class="fas fa-terminal"></i>
            <span>Dev</span>
          </button>

          <button class="menu-item" id="helpMenuItem">
            <i class="fas fa-life-ring"></i>
            <span>Centro de Ayuda</span>
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
    document.getElementById('switchAccountMenuItem')?.addEventListener('click', () => this.openAccountSwitcher());
    document.getElementById('accountMenuItem')?.addEventListener('click', () => this.openAccount());
    document.getElementById('devMenuItem')?.addEventListener('click', () => this.openDevModal());
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
      
      const previousUser = this.getStoredUser();
      const previousKey = this.buildUserKey(previousUser);
      const nextKey = this.buildUserKey(user);
      
      // Update user
      this.user = user;
      
      // Save user to localStorage
      localStorage.setItem('seaxmusic_user', JSON.stringify(user));

      this.upsertAccount(user);
      
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
      
      if (previousKey !== nextKey) {
        if (typeof loadFavoritesFromStorage === 'function') {
          loadFavoritesFromStorage();
        }
        if (typeof loadFavoritesContent === 'function') {
          loadFavoritesContent();
        }
        if (typeof loadRecentlyPlayed === 'function') {
          loadRecentlyPlayed();
        }
      }
      
      if (window.renderHomeModules) {
        window.renderHomeModules();
      }
      if (window.wireHomeActions) {
        window.wireHomeActions();
      }
      if (window.libraryManager) {
        window.libraryManager.refresh();
      }
      if (window.playlistManager) {
        window.playlistManager.refreshSidebar();
      }
      
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
      
      if (window.appState) {
        window.appState.favorites = [];
        window.appState.recentHistory = [];
      }
      if (window.renderHomeModules) {
        window.renderHomeModules();
      }
      if (window.wireHomeActions) {
        window.wireHomeActions();
      }
      if (window.libraryManager) {
        window.libraryManager.refresh();
      }
      if (window.playlistManager) {
        window.playlistManager.refreshSidebar();
      }
    }
  }
  handleYouTubeLogin(user) {
    console.log('✅ YouTube login manejado:', user);
    console.log('[LOGIN] Datos recibidos - Nombre:', user?.name, 'Handle:', user?.handle, 'Email:', user?.email);
    
    const previousUser = this.getStoredUser();
    const previousKey = this.buildUserKey(previousUser);
    const nextKey = this.buildUserKey(user);
    
    console.log('[LOGIN] Previous key:', previousKey, '| New key:', nextKey);
    
    const now = Date.now();
    const shouldNotify = !this.loginNotificationShown;
    const lastLoginTooSoon = now - this.lastLoginProcessedAt < 5000;
    
    const wasLoggedIn = !!window.appState?.isLoggedIn;
    this.user = user;
    if (window.appState) {
      window.appState.isLoggedIn = true;
    }
    
    // Save user to localStorage
    localStorage.setItem('seaxmusic_user', JSON.stringify(user));
    console.log('[LOGIN] Usuario guardado en localStorage');

    // ⭐ Cargar volumen guardado para este usuario
    if (window.musicPlayer && typeof window.musicPlayer.refreshVolumeForUser === 'function') {
      window.musicPlayer.refreshVolumeForUser(user);
    }

    // ⭐ Guardar en lista de cuentas
    this.upsertAccount(user);
    console.log('[LOGIN] Cuenta guardada en lista de cuentas');
    
    // Save user to JSON file via Electron IPC
    if (window.electronAPI && window.electronAPI.saveUserData) {
      window.electronAPI.saveUserData(user).catch(err => 
        console.error('Error saving user data:', err)
      );
    }
    
    // Update UI
    this.updateUserUI();
    this.closeProfileMenu();
    
    if (window.appState) {
      window.appState.isSwitchingAccount = true;
      window.appState.favorites = [];
      window.appState.recentHistory = [];
    }
    if (window.libraryManager) {
      window.libraryManager.refresh();
    }
    if (window.playlistManager) {
      window.playlistManager.refreshSidebar();
    }
    if (window.renderHomeModules) {
      window.renderHomeModules();
    }
    if (window.wireHomeActions) {
      window.wireHomeActions();
    }
    
    // Show notification (solo una vez)
    if (shouldNotify) {
      this.loginNotificationShown = true;
      this.showLoginNotification(user.name);
    }
    
    // Reset flag después de un tiempo MUY largo para evitar loops
    setTimeout(() => {
      this.loginNotificationShown = false;
    }, 120000); // 2 minutos
    
    // ⭐ Recargar solo si venimos de logout o cambió de cuenta
    const shouldReload = !wasLoggedIn || previousKey !== nextKey;
    if (shouldReload && !lastLoginTooSoon) {
      this.reloadAllContent(true);
      this.lastLoginProcessedAt = now;
    } else {
      console.log('[LOGIN] Sesión ya activa, se omite recarga del loader');
    }
    
    // ⭐ NO cerrar YouTube window después del login
    // La ventana de YouTube debe permanecer abierta para reproducir música
    console.log('[LOGIN] Login completado - YouTube window permanece abierta para reproducción');
  }
  
  // ⭐ Recargar todo el contenido (historial, favoritos) con loader
  reloadAllContent(force = false) {
    // ⭐ Evitar múltiples recargas simultáneas
    if (this.contentReloadInProgress && !force) {
      console.log('[RELOAD] Ya hay una recarga en progreso, ignorando...');
      return;
    }
    if (force) {
      this.contentReloadInProgress = false;
    }
    
    this.contentReloadInProgress = true;
    console.log('🔄 Recargando todo el contenido...');
    
    // Mostrar loader
    if (typeof showLoader === 'function') {
      if (window.appState) {
        window.appState.loaderAllowed = true;
      }
      showLoader('Cargando tu música...');
    }
    if (typeof updateLoaderStatus === 'function') {
      updateLoaderStatus('Cargando historial de la nueva cuenta...');
    }
    
    // Resetear flags de contenido cargado
    if (window.appState) {
      window.appState.isSwitchingAccount = true;
      window.appState.favorites = [];
      window.appState.recentHistory = [];
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
    
    // ⭐ Resetear flags para permitir nuevo login
    this.loginNotificationShown = false;
    this.contentReloadInProgress = false;
    this.lastLoginProcessedAt = 0;

    this.stopPlaybackForAccountChange();
    
    // Guardar snapshot antes de limpiar sesión
    this.saveCurrentAccountSnapshot();

    // Clear user data
    this.user = null;
    if (window.appState) {
      window.appState.isLoggedIn = false;
    }
    
    // Clear solo la sesión actual (mantener cuentas guardadas)
    localStorage.removeItem('seaxmusic_user');

    // ⭐ Volver al volumen de invitado
    if (window.musicPlayer && typeof window.musicPlayer.refreshVolumeForUser === 'function') {
      window.musicPlayer.refreshVolumeForUser(null);
    }
    
    // Clear JSON file via Electron IPC
    if (window.electronAPI && window.electronAPI.clearUserData) {
      window.electronAPI.clearUserData().catch(err => 
        console.error('Error clearing user data:', err)
      );
    }
    
    // Update UI
    this.updateUserUI();
    this.closeProfileMenu();
    
    if (window.appState) {
      window.appState.favorites = [];
      window.appState.recentHistory = [];
    }
    if (window.libraryManager) {
      window.libraryManager.refresh();
    }
    if (window.playlistManager) {
      window.playlistManager.refreshSidebar();
    }
    if (window.renderHomeModules) {
      window.renderHomeModules();
    }
    if (window.wireHomeActions) {
      window.wireHomeActions();
    }
    
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
    this.closeProfileMenu();
    if (window.configManager) {
      window.configManager.showConfigPage();
    } else {
      console.log('Configuración no disponible');
    }
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

  openDevModal() {
    this.closeProfileMenu();
    const modal = document.getElementById('devAccessModal');
    const input = document.getElementById('devAccessCode');
    const submitBtn = document.getElementById('devAccessSubmit');
    const cancelBtn = document.getElementById('devAccessCancel');
    const closeBtn = document.getElementById('devAccessClose');
    const errorEl = document.getElementById('devAccessError');
    if (!modal) return;

    if (input) input.value = '';
    if (errorEl) errorEl.textContent = '';

    if (submitBtn) submitBtn.onclick = () => this.verifyDevCode();
    if (cancelBtn) cancelBtn.onclick = () => modal.classList.remove('active');
    if (closeBtn) closeBtn.onclick = () => modal.classList.remove('active');
    modal.addEventListener('click', (e) => {
      if (e.target === modal) modal.classList.remove('active');
    });

    modal.classList.add('active');
    input?.focus();
  }

  verifyDevCode() {
    const modal = document.getElementById('devAccessModal');
    const input = document.getElementById('devAccessCode');
    const errorEl = document.getElementById('devAccessError');
    const code = input?.value?.trim();

    if (code !== '0613') {
      if (errorEl) errorEl.textContent = 'Código incorrecto';
      modal?.classList.add('shake');
      setTimeout(() => modal?.classList.remove('shake'), 400);
      return;
    }

    modal?.classList.remove('active');
    if (window.devManager?.showDevPage) {
      window.devManager.showDevPage(true);
    } else if (window.navigationHistory) {
      window.navigationHistory.loadPage('home', false);
    }
  }

  logout() {
    // Mostrar modal de confirmación bonito
    this.showLogoutModal();
  }
  
  showLogoutModal() {
    // Crear modal si no existe
    let modal = document.getElementById('logoutConfirmModal');
    if (!modal) {
      modal = document.createElement('div');
      modal.id = 'logoutConfirmModal';
      modal.className = 'logout-confirm-overlay';
      modal.innerHTML = `
        <div class="logout-confirm-modal">
          <div class="logout-confirm-icon">
            <i class="fas fa-sign-out-alt"></i>
          </div>
          <h3 class="logout-confirm-title">¿Cerrar sesión?</h3>
          <p class="logout-confirm-text">Tendrás que volver a iniciar sesión con tu cuenta de YouTube para acceder a tu música.</p>
          <div class="logout-confirm-actions">
            <button class="logout-confirm-btn cancel" id="logoutCancelBtn">Cancelar</button>
            <button class="logout-confirm-btn confirm" id="logoutConfirmBtn">Cerrar Sesión</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      
      // Estilos inline para el modal
      const style = document.createElement('style');
      style.textContent = `
        .logout-confirm-overlay {
          position: fixed;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          background: rgba(0, 0, 0, 0.7);
          backdrop-filter: blur(4px);
          display: flex;
          align-items: center;
          justify-content: center;
          opacity: 0;
          visibility: hidden;
          transition: all 0.3s ease;
          z-index: 10000;
        }
        .logout-confirm-overlay.active {
          opacity: 1;
          visibility: visible;
        }
        .logout-confirm-modal {
          background: linear-gradient(180deg, #1e1e1e 0%, #121212 100%);
          border-radius: 16px;
          padding: 32px;
          width: 90%;
          max-width: 360px;
          text-align: center;
          border: 1px solid #333;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
          transform: scale(0.9) translateY(20px);
          transition: all 0.3s ease;
        }
        .logout-confirm-overlay.active .logout-confirm-modal {
          transform: scale(1) translateY(0);
        }
        .logout-confirm-icon {
          width: 64px;
          height: 64px;
          background: linear-gradient(135deg, #E13838 0%, #c62828 100%);
          border-radius: 50%;
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 20px;
          box-shadow: 0 8px 24px rgba(225, 56, 56, 0.3);
        }
        .logout-confirm-icon i {
          font-size: 28px;
          color: white;
        }
        .logout-confirm-title {
          font-size: 20px;
          font-weight: 600;
          color: #fff;
          margin-bottom: 12px;
        }
        .logout-confirm-text {
          font-size: 14px;
          color: #b3b3b3;
          line-height: 1.5;
          margin-bottom: 28px;
        }
        .logout-confirm-actions {
          display: flex;
          gap: 12px;
        }
        .logout-confirm-btn {
          flex: 1;
          padding: 12px 20px;
          border-radius: 8px;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s ease;
          border: none;
        }
        .logout-confirm-btn.cancel {
          background: #282828;
          color: #fff;
        }
        .logout-confirm-btn.cancel:hover {
          background: #3a3a3a;
        }
        .logout-confirm-btn.confirm {
          background: linear-gradient(135deg, #E13838 0%, #c62828 100%);
          color: white;
          box-shadow: 0 4px 12px rgba(225, 56, 56, 0.3);
        }
        .logout-confirm-btn.confirm:hover {
          transform: translateY(-2px);
          box-shadow: 0 6px 16px rgba(225, 56, 56, 0.4);
        }
      `;
      document.head.appendChild(style);
      
      // Event listeners
      document.getElementById('logoutCancelBtn').addEventListener('click', () => this.hideLogoutModal());
      document.getElementById('logoutConfirmBtn').addEventListener('click', () => this.confirmLogout());
      modal.addEventListener('click', (e) => {
        if (e.target === modal) this.hideLogoutModal();
      });
    }
    
    // Mostrar modal
    setTimeout(() => modal.classList.add('active'), 10);
  }
  
  hideLogoutModal() {
    const modal = document.getElementById('logoutConfirmModal');
    if (modal) {
      modal.classList.remove('active');
    }
  }
  
  confirmLogout() {
    this.hideLogoutModal();

    // Guardar snapshot antes de limpiar sesión
    this.saveCurrentAccountSnapshot();
    this.stopPlaybackForAccountChange();

    this.user = null;
    
    // Limpiar solo la sesión actual (mantener cuentas guardadas)
    localStorage.removeItem('seaxmusic_user');
    
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
    
    if (window.libraryManager) {
      window.libraryManager.refresh();
    }
    console.log('[LOGOUT] Sesión cerrada correctamente');
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






