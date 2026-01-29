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
    // Confirm logout
    if (confirm('¿Estás seguro de que deseas cerrar sesión?')) {
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
  }
}

// Initialize profile menu when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new ProfileMenu();
  });
} else {
  new ProfileMenu();
}
