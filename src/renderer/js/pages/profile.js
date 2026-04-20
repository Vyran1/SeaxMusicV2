// Profile Menu Logic

class ProfileMenu {
  constructor() {
    this.loadUserData();
    this.initializeEventListeners();
    this.displayUserInfo();
  }

  initializeEventListeners() {
    const settingsBtn = document.getElementById('settingsBtn');
    const accountBtn = document.getElementById('accountBtn');
    const helpBtn = document.getElementById('helpBtn');
    const logoutBtn = document.getElementById('logoutBtn');

    if (settingsBtn) {
      settingsBtn.addEventListener('click', () => this.openSettings());
    }

    if (accountBtn) {
      accountBtn.addEventListener('click', () => this.openAccount());
    }

    if (helpBtn) {
      helpBtn.addEventListener('click', () => this.openHelp());
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => this.logout());
    }
  }

  loadUserData() {
    const userData = localStorage.getItem('seaxmusic_user');
    if (userData) {
      this.user = JSON.parse(userData);
    }
  }

  displayUserInfo() {
    if (!this.user) return;

    const userAvatar = document.getElementById('userAvatar');
    const userName = document.getElementById('userName');
    const userEmail = document.getElementById('userEmail');

    if (userAvatar && this.user.avatar) {
      userAvatar.src = this.user.avatar;
    }

    if (userName) {
      userName.textContent = this.user.name || 'Usuario';
    }

    if (userEmail) {
      userEmail.textContent = this.user.email || 'sin correo';
    }
  }

  openSettings() {
    console.log('Abriendo configuración...');
    // TODO: Open settings modal or window
  }

  openAccount() {
    console.log('Abriendo configuración de cuenta...');
    // TODO: Open account settings modal
  }

  openHelp() {
    console.log('Abriendo ayuda...');
    // TODO: Open help/support modal
  }

  logout() {
    // Mostrar modal de confirmación bonito
    const modal = document.getElementById('logoutModal');
    if (modal) {
      modal.classList.add('active');
    }
  }
  
  confirmLogout() {
    // Clear user data
    localStorage.removeItem('seaxmusic_user');

    // Notify parent window
    if (window.opener) {
      window.opener.postMessage({
        type: 'USER_LOGGED_OUT'
      }, '*');
    }

    // Close this window/menu
    window.close();
  }
  
  cancelLogout() {
    const modal = document.getElementById('logoutModal');
    if (modal) {
      modal.classList.remove('active');
    }
  }
  
  initializeModalEvents() {
    const confirmBtn = document.getElementById('logoutConfirm');
    const cancelBtn = document.getElementById('logoutCancel');
    const modal = document.getElementById('logoutModal');
    
    if (confirmBtn) {
      confirmBtn.addEventListener('click', () => this.confirmLogout());
    }
    
    if (cancelBtn) {
      cancelBtn.addEventListener('click', () => this.cancelLogout());
    }
    
    // Cerrar al hacer clic fuera del modal
    if (modal) {
      modal.addEventListener('click', (e) => {
        if (e.target === modal) {
          this.cancelLogout();
        }
      });
    }
  }
}

// Initialize profile menu when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    const profile = new ProfileMenu();
    profile.initializeModalEvents();
  });
} else {
  const profile = new ProfileMenu();
  profile.initializeModalEvents();
}
