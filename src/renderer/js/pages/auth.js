// Authentication Logic - Flujo de login con YouTube

class AuthManager {
  constructor() {
    this.currentUser = null;
    this.currentEmail = null;
    this.currentPassword = null;
    this.youtubeWindow = null;
    this.loadUserData();
    this.initializeEventListeners();
  }

  initializeEventListeners() {
    // Paso 1: Email
    const emailForm = document.getElementById('emailForm');
    if (emailForm) {
      emailForm.addEventListener('submit', (e) => this.handleEmailSubmit(e));
    }

    // Paso 2: Password
    const passwordForm = document.getElementById('passwordForm');
    if (passwordForm) {
      passwordForm.addEventListener('submit', (e) => this.handlePasswordSubmit(e));
    }

    // Botón Atrás
    const backBtn = document.getElementById('backBtn');
    if (backBtn) {
      backBtn.addEventListener('click', (e) => this.goBackToEmail(e));
    }
  }

  // ===== PASO 1: Email =====
  async handleEmailSubmit(event) {
    event.preventDefault();

    const email = document.getElementById('userEmail').value.trim();

    // Validación
    if (!email) {
      this.showError('Por favor ingresa un correo electrónico o teléfono');
      return;
    }

    if (!this.isValidEmail(email)) {
      this.showError('Correo electrónico inválido');
      return;
    }

    // Guardar email
    this.currentEmail = email;
    console.log('📧 Email guardado:', this.currentEmail);

    // Mostrar paso 2
    this.showPasswordStep();
  }

  // ===== PASO 2: Password =====
  async handlePasswordSubmit(event) {
    event.preventDefault();

    const password = document.getElementById('userPassword').value;

    // Validación
    if (!password) {
      this.showError('Por favor ingresa tu contraseña');
      return;
    }

    // Guardar contraseña
    this.currentPassword = password;
    console.log('🔐 Contraseña guardada');

    // Iniciar proceso de login en YouTube
    try {
      this.showLoading('Abriendo YouTube para iniciar sesión...');

      // Abrir YouTube con URL de Google Sign In
      const result = await window.electronAPI.openYouTubeWindow(
        'https://accounts.google.com/v3/signin/identifier?continue=https%3A%2F%2Fwww.youtube.com%2Fsignin%3Faction_handle_signin%3Dtrue%26app%3Ddesktop%26hl%3Des-419%26next%3Dhttps%253A%252F%252Fwww.youtube.com%252F&dsh=S1074243875%3A1769619062931417&ec=65620&hl=es-419&ifkv=AXbMIuBINQXYojiQpA3iEu4_zLwitnA9QNWQYBOTEDC_Lg1hiYIvmK4PLiehwNd2EqEaRUpz81YP&passive=true&service=youtube&uilel=3&flowName=WebLiteSignIn&flowEntry=ServiceLogin',
        'Google Sign In',
        'YouTube'
      );

      if (result.success) {
        console.log('📺 YouTube abierto para Google Sign In');
        
        // Esperar a que el usuario complete el login en YouTube
        // El backend-preload.js detectará cuando se complete el login
        await this.waitForYouTubeLogin();
      } else {
        this.showError('Error al abrir YouTube: ' + result.error);
        this.hideLoading();
      }
    } catch (error) {
      this.showError('Error: ' + error.message);
      this.hideLoading();
    }
  }

  // Esperar a que YouTube complete el login
  async waitForYouTubeLogin() {
    return new Promise((resolve, reject) => {
      // Escuchar el evento de login desde YouTube
      if (window.electronAPI && window.electronAPI.onYouTubeUserLoggedIn) {
        window.electronAPI.onYouTubeUserLoggedIn((data) => {
          console.log('✅ Usuario logueado en YouTube:', data);

          this.showLoading('Guardando datos del usuario...');

          // Crear objeto de usuario con datos de YouTube
          const user = {
            id: Date.now(),
            name: data.user?.name || 'Usuario de YouTube',
            email: this.currentEmail,
            password: this.currentPassword, // ⚠️ En producción, esto debería estar encriptado
            avatar: data.user?.avatar || this.generateAvatarDataUrl(data.user?.name || 'YouTube'),
            youtubeConnected: true,
            youtubeUser: data.user,
            loginDate: new Date().toISOString()
          };

          // Guardar datos del usuario
          this.saveUserData(user);
          this.currentUser = user;

          console.log('💾 Datos de usuario guardados:', user);

          this.hideLoading();
          
          // Cerrar ventana de login después de un pequeño delay
          setTimeout(() => {
            this.notifyParentAndClose(user);
          }, 1000);

          resolve(user);
        });
      }

      // Si pasan 5 minutos sin login, cancelar
      setTimeout(() => {
        reject(new Error('Timeout: no se completó el login en YouTube'));
      }, 5 * 60 * 1000);
    });
  }

  // Mostrar paso 2 (password)
  showPasswordStep() {
    const emailForm = document.getElementById('emailForm');
    const passwordForm = document.getElementById('passwordForm');

    if (emailForm) emailForm.classList.remove('active');
    if (passwordForm) passwordForm.classList.add('active');

    this.clearError();
  }

  // Volver al paso 1 (email)
  goBackToEmail(event) {
    event.preventDefault();

    const emailForm = document.getElementById('emailForm');
    const passwordForm = document.getElementById('passwordForm');

    if (emailForm) emailForm.classList.add('active');
    if (passwordForm) passwordForm.classList.remove('active');

    // Limpiar password
    document.getElementById('userPassword').value = '';
    this.currentPassword = null;

    this.clearError();
  }

  // ===== GUARDAR Y CARGAR DATOS =====
  saveUserData(user) {
    // Guardar a localStorage
    localStorage.setItem('seaxmusic_user', JSON.stringify(user));
    
    // Guardar a JSON file usando Electron IPC
    if (window.electronAPI && window.electronAPI.saveUserData) {
      window.electronAPI.saveUserData(user)
        .then(() => console.log('✅ Datos guardados en archivo'))
        .catch(err => console.error('❌ Error guardando datos:', err));
    }
  }

  loadUserData() {
    const userData = localStorage.getItem('seaxmusic_user');
    if (userData) {
      try {
        this.currentUser = JSON.parse(userData);
        console.log('📂 Usuario cargado desde localStorage:', this.currentUser);
      } catch (e) {
        console.error('Error al cargar datos del usuario:', e);
      }
    }
  }

  // ===== UTILIDADES =====
  notifyParentAndClose(user) {
    // Enviar mensaje a ventana principal
    if (window.opener) {
      window.opener.postMessage({
        type: 'USER_LOGGED_IN',
        user: user
      }, '*');
    }

    // Cerrar ventana de login
    setTimeout(() => {
      window.close();
    }, 500);
  }

  showError(message) {
    const errorDiv = document.getElementById('errorMessage');
    if (errorDiv) {
      errorDiv.textContent = message;
      errorDiv.classList.add('show');
    }
  }

  clearError() {
    const errorDiv = document.getElementById('errorMessage');
    if (errorDiv) {
      errorDiv.classList.remove('show');
      errorDiv.textContent = '';
    }
  }

  showLoading(text = 'Cargando...') {
    const spinner = document.getElementById('loadingSpinner');
    const loadingText = document.getElementById('loadingText');
    
    if (spinner) spinner.style.display = 'flex';
    if (loadingText) loadingText.textContent = text;
  }

  hideLoading() {
    const spinner = document.getElementById('loadingSpinner');
    if (spinner) spinner.style.display = 'none';
  }

  isValidEmail(email) {
    // Acepta email o teléfono
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^\d{10,}$/; // Al menos 10 dígitos
    return emailRegex.test(email) || phoneRegex.test(email.replace(/\D/g, ''));
  }

  generateAvatarDataUrl(name) {
    // Generar avatar simple con iniciales
    const initials = (name || 'U').charAt(0).toUpperCase();
    const colors = ['#E13838', '#FF6B6B', '#FFA500', '#FFD700', '#32CD32', '#00CED1', '#4169E1'];
    const color = colors[Math.floor(Math.random() * colors.length)];
    
    // Crear SVG data URL
    const svg = `
      <svg width="100" height="100" xmlns="http://www.w3.org/2000/svg">
        <circle cx="50" cy="50" r="50" fill="${color}"/>
        <text x="50" y="65" font-size="40" font-weight="bold" fill="white" text-anchor="middle" font-family="Arial">${initials}</text>
      </svg>
    `;
    
    return 'data:image/svg+xml;base64,' + btoa(svg);
  }
}

// Inicializar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    new AuthManager();
  });
} else {
  new AuthManager();
}
