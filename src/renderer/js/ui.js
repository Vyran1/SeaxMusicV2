// UI interaction logic

// ⭐ Contenido original del inicio (para poder volver)
let originalHomeContent = null;

// ===== SISTEMA DE NAVEGACIÓN CON HISTORIAL =====
const navigationHistory = {
  history: ['home'],  // Stack de páginas visitadas
  currentIndex: 0,    // Índice actual en el historial
  
  // Navegar a una nueva página
  navigateTo(page) {
    // Si estamos en medio del historial, eliminar las páginas adelante
    if (this.currentIndex < this.history.length - 1) {
      this.history = this.history.slice(0, this.currentIndex + 1);
    }
    // No agregar si ya estamos en esa página
    if (this.history[this.currentIndex] !== page) {
      this.history.push(page);
      this.currentIndex = this.history.length - 1;
    }
    this.updateButtons();
    console.log('[NAV] Historial:', this.history, 'Índice:', this.currentIndex);
  },
  
  // Ir atrás
  goBack() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      const page = this.history[this.currentIndex];
      this.loadPage(page, false);
      this.updateButtons();
    }
  },
  
  // Ir adelante
  goForward() {
    if (this.currentIndex < this.history.length - 1) {
      this.currentIndex++;
      const page = this.history[this.currentIndex];
      this.loadPage(page, false);
      this.updateButtons();
    }
  },
  
  // Cargar una página sin agregar al historial
  loadPage(page, addToHistory = true) {
    console.log('[NAV] Cargando página:', page);
    
    if (page === 'home') {
      showHomePage(addToHistory);
    } else if (page === 'library') {
      if (window.libraryManager) {
        window.libraryManager.showLibrary(addToHistory);
      }
    } else if (page === 'search') {
      if (window.searchManager) {
        window.searchManager.showSearchPage(addToHistory);
      }
    }
  },
  
  // Actualizar estado de los botones
  updateButtons() {
    const backBtn = document.getElementById('backBtn');
    const forwardBtn = document.getElementById('forwardBtn');
    
    if (backBtn) {
      backBtn.disabled = this.currentIndex <= 0;
      backBtn.style.opacity = this.currentIndex <= 0 ? '0.3' : '1';
    }
    if (forwardBtn) {
      forwardBtn.disabled = this.currentIndex >= this.history.length - 1;
      forwardBtn.style.opacity = this.currentIndex >= this.history.length - 1 ? '0.3' : '1';
    }
  }
};

// Exponer globalmente
window.navigationHistory = navigationHistory;

// Event listeners para botones de navegación
document.getElementById('backBtn').addEventListener('click', () => {
  console.log('[NAV] Back button clicked');
  navigationHistory.goBack();
});

document.getElementById('forwardBtn').addEventListener('click', () => {
  console.log('[NAV] Forward button clicked');
  navigationHistory.goForward();
});

// Actualizar botones al inicio
navigationHistory.updateButtons();

// ⭐ Función global para mostrar la página de inicio con banner
function showHomePage(addToHistory = true) {
  console.log('[NAV] Mostrando página de inicio');
  
  // Agregar al historial de navegación
  if (addToHistory && window.navigationHistory) {
    window.navigationHistory.navigateTo('home');
  }
  
  // Marcar Inicio como activo
  document.querySelectorAll('.nav-item').forEach(item => {
    item.classList.remove('active');
    if (item.textContent.includes('Inicio')) {
      item.classList.add('active');
    }
  });
  
  // Limpiar cola de reproducción al salir de biblioteca
  if (window.clearPlayQueue) {
    window.clearPlayQueue();
  }
  
  // Marcar biblioteca como no activa
  if (window.libraryManager) {
    window.libraryManager.isLibraryActive = false;
  }
  
  // Restaurar contenido de inicio con banner
  const contentArea = document.querySelector('.content-area');
  if (contentArea) {
    // Obtener nombre del usuario
    const userName = document.getElementById('userName')?.textContent || 'Usuario';
    const greeting = getGreeting();
    
    contentArea.innerHTML = `
      <!-- Banner de Inicio -->
      <div class="home-banner">
        <div class="home-banner-bg"></div>
        <div class="home-banner-content">
          <div class="home-banner-icon">
            <i class="fas fa-headphones"></i>
          </div>
          <div class="home-banner-info">
            <span class="home-banner-greeting">${greeting}</span>
            <h1 class="home-banner-title">${userName}</h1>
            <p class="home-banner-subtitle">¿Qué quieres escuchar hoy?</p>
          </div>
        </div>
      </div>

      <section class="favorites-section">
        <h2><i class="fas fa-heart" style="color: var(--accent-primary); margin-right: 8px;"></i>Favoritos</h2>
        <div class="card-grid" id="favoritesGrid">
          <!-- Favorites content will be populated here -->
        </div>
      </section>

      <section class="recently-played">
        <h2><i class="fas fa-history" style="color: var(--accent-primary); margin-right: 8px;"></i>Reproducidos recientemente</h2>
        <div class="card-grid" id="recentGrid">
          <!-- Recent content will be populated here -->
        </div>
      </section>
    `;
    
    // Recargar contenido
    if (window.loadFavoritesContent) {
      window.loadFavoritesContent();
    }
    if (window.loadRecentlyPlayed) {
      window.loadRecentlyPlayed();
    }
  }
}

// ⭐ Obtener saludo según la hora
function getGreeting() {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) {
    return '☀️ Buenos días,';
  } else if (hour >= 12 && hour < 19) {
    return '🌤️ Buenas tardes,';
  } else {
    return '🌙 Buenas noches,';
  }
}

// Exponer globalmente
window.showHomePage = showHomePage;
window.getGreeting = getGreeting;

// Sidebar navigation
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    
    const navText = item.textContent.trim();
    
    // Si es "Tu Biblioteca", dejar que libraryManager lo maneje
    if (navText.includes('Tu Biblioteca')) {
      return; // libraryManager.js ya tiene su propio listener
    }
    
    // Si es "Inicio", mostrar la página de inicio
    if (navText.includes('Inicio')) {
      showHomePage();
      return;
    }
    
    // Si es "Buscar", ya tiene su propio comportamiento
    if (navText.includes('Buscar')) {
      // searchManager lo maneja
      return;
    }
    
    // Remove active class from all items
    document.querySelectorAll('.nav-item').forEach(nav => {
      nav.classList.remove('active');
    });
    
    // Add active class to clicked item
    item.classList.add('active');
    
    console.log('Navigate to:', navText);
  });
});

// Create music card element
function createMusicCard(item) {
  const card = document.createElement('div');
  card.className = 'music-card';
  card.style.cssText = `
    background-color: var(--bg-secondary);
    border-radius: 8px;
    padding: 16px;
    cursor: pointer;
    transition: all 0.2s;
  `;
  
  card.addEventListener('mouseenter', () => {
    card.style.backgroundColor = 'var(--bg-tertiary)';
  });
  
  card.addEventListener('mouseleave', () => {
    card.style.backgroundColor = 'var(--bg-secondary)';
  });
  
  const image = document.createElement('div');
  image.style.cssText = `
    width: 100%;
    aspect-ratio: 1;
    background-color: var(--bg-tertiary);
    border-radius: 4px;
    margin-bottom: 12px;
    background-image: url('${item.image}');
    background-size: cover;
    background-position: center;
  `;
  
  const title = document.createElement('div');
  title.textContent = item.title;
  title.style.cssText = `
    font-size: 14px;
    font-weight: 600;
    margin-bottom: 4px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `;
  
  const subtitle = document.createElement('div');
  subtitle.textContent = item.subtitle || item.type;
  subtitle.style.cssText = `
    font-size: 12px;
    color: var(--text-secondary);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  `;
  
  card.appendChild(image);
  card.appendChild(title);
  card.appendChild(subtitle);
  
  return card;
}

// Add playlist to sidebar
function addPlaylistToSidebar(playlist) {
  const playlistList = document.querySelector('.playlist-list');
  
  const item = document.createElement('div');
  item.className = 'playlist-item';
  item.style.cssText = `
    padding: 8px 12px;
    color: var(--text-secondary);
    cursor: pointer;
    border-radius: 4px;
    font-size: 14px;
    transition: all 0.2s;
  `;
  
  item.textContent = playlist.name;
  
  item.addEventListener('mouseenter', () => {
    item.style.backgroundColor = 'var(--bg-tertiary)';
    item.style.color = 'var(--text-primary)';
  });
  
  item.addEventListener('mouseleave', () => {
    item.style.backgroundColor = 'transparent';
    item.style.color = 'var(--text-secondary)';
  });
  
  item.addEventListener('click', () => {
    console.log('Open playlist:', playlist.name);
    // TODO: Load playlist content
  });
  
  playlistList.appendChild(item);
}

// Show notification
function showNotification(message, type = 'info') {
  const notification = document.createElement('div');
  notification.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background-color: var(--bg-tertiary);
    color: var(--text-primary);
    padding: 16px 24px;
    border-radius: 8px;
    border-left: 4px solid ${type === 'error' ? 'var(--accent-primary)' : 'var(--accent-primary)'};
    box-shadow: 0 4px 12px var(--shadow);
    z-index: 1000;
    animation: slideIn 0.3s ease;
  `;
  
  notification.textContent = message;
  document.body.appendChild(notification);
  
  setTimeout(() => {
    notification.style.animation = 'slideOut 0.3s ease';
    setTimeout(() => {
      document.body.removeChild(notification);
    }, 300);
  }, 3000);
}

// Add CSS animations
const style = document.createElement('style');
style.textContent = `
  @keyframes slideIn {
    from {
      transform: translateX(100%);
      opacity: 0;
    }
    to {
      transform: translateX(0);
      opacity: 1;
    }
  }
  
  @keyframes slideOut {
    from {
      transform: translateX(0);
      opacity: 1;
    }
    to {
      transform: translateX(100%);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// Export utility functions
window.uiUtils = {
  createMusicCard,
  addPlaylistToSidebar,
  showNotification
};
