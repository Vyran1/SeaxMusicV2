/**
 * Library Manager - Gestiona Tu Biblioteca con drag & drop
 */

class LibraryManager {
  constructor() {
    this.currentView = 'grid'; // 'grid' o 'list'
    this.sortBy = 'custom'; // 'custom', 'recent', 'title', 'artist'
    this.draggedItem = null;
    this.draggedIndex = null;
    this.isLibraryActive = false;
    
    this.init();
  }
  
  init() {
    // Escuchar navegación a biblioteca
    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.textContent.includes('Tu Biblioteca')) {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          this.showLibrary(true);
        });
      }
    });
  }
  
  async showLibrary(addToHistory = true) {
    console.log('[LIBRARY] Mostrando biblioteca...');
    
    // Agregar al historial de navegación
    if (addToHistory && window.navigationHistory) {
      window.navigationHistory.navigateTo('library');
    }
    
    // Marcar nav item como activo
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
      if (item.textContent.includes('Tu Biblioteca')) {
        item.classList.add('active');
      }
    });
    
    // Cargar HTML de biblioteca
    const contentArea = document.querySelector('.content-area');
    if (!contentArea) return;
    
    try {
      const response = await fetch('./html/library.html');
      const html = await response.text();
      contentArea.innerHTML = html;
      
      this.isLibraryActive = true;
      this.setupEventListeners();
      this.loadFavorites();
    } catch (error) {
      console.error('[LIBRARY] Error cargando biblioteca:', error);
      this.showInlineLibrary(contentArea);
    }
  }
  
  // Fallback si no puede cargar el HTML externo
  showInlineLibrary(contentArea) {
    contentArea.innerHTML = `
      <div class="library-page">
        <div class="library-header">
          <div class="library-header-bg"></div>
          <div class="library-header-content">
            <div class="library-icon">
              <i class="fas fa-music"></i>
            </div>
            <div class="library-info">
              <span class="library-label">COLECCIÓN</span>
              <h1 class="library-title">Tu Biblioteca</h1>
              <p class="library-description">
                <span id="libraryCount">0</span> canciones que te encantan
              </p>
            </div>
          </div>
        </div>
        
        <div class="library-controls">
          <button class="library-play-btn" id="playAllLibrary">
            <i class="fas fa-play"></i>
          </button>
          <button class="library-shuffle-btn" id="shuffleLibrary">
            <i class="fas fa-random"></i>
          </button>
          <div class="library-sort">
            <select id="librarySortBy">
              <option value="custom">Orden personalizado</option>
              <option value="recent">Recién añadidos</option>
              <option value="title">Título A-Z</option>
              <option value="artist">Artista A-Z</option>
            </select>
          </div>
          <div class="library-view-toggle">
            <button class="view-btn active" data-view="grid" title="Vista de cuadrícula">
              <i class="fas fa-th-large"></i>
            </button>
            <button class="view-btn" data-view="list" title="Vista de lista">
              <i class="fas fa-list"></i>
            </button>
          </div>
        </div>
        
        <div class="library-content" id="libraryContent">
          <div class="library-grid" id="libraryGrid"></div>
          <div class="library-list hidden" id="libraryList">
            <div class="library-list-header">
              <div class="list-col-drag"></div>
              <div class="list-col-num">#</div>
              <div class="list-col-title">Título</div>
              <div class="list-col-artist">Artista</div>
              <div class="list-col-duration"><i class="far fa-clock"></i></div>
              <div class="list-col-actions"></div>
            </div>
            <div class="library-list-body" id="libraryListBody"></div>
          </div>
        </div>
        
        <div class="library-empty hidden" id="libraryEmpty">
          <div class="empty-icon">
            <i class="far fa-heart"></i>
          </div>
          <h3>Tu biblioteca está vacía</h3>
          <p>Las canciones que marques con ❤️ aparecerán aquí</p>
          <button class="empty-browse-btn" id="browseMusic">
            <i class="fas fa-search"></i>
            Explorar música
          </button>
        </div>
      </div>
    `;
    
    this.isLibraryActive = true;
    this.setupEventListeners();
    this.loadFavorites();
  }
  
  setupEventListeners() {
    // Toggle de vista (grid/list)
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const view = btn.dataset.view;
        this.switchView(view);
      });
    });
    
    // Ordenar
    const sortSelect = document.getElementById('librarySortBy');
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        this.sortBy = e.target.value;
        this.loadFavorites();
      });
    }
    
    // Play all
    const playAllBtn = document.getElementById('playAllLibrary');
    if (playAllBtn) {
      playAllBtn.addEventListener('click', () => this.playAll());
    }
    
    // Shuffle
    const shuffleBtn = document.getElementById('shuffleLibrary');
    if (shuffleBtn) {
      shuffleBtn.addEventListener('click', () => this.playAll(true));
    }
    
    // Browse music (cuando está vacío)
    const browseBtn = document.getElementById('browseMusic');
    if (browseBtn) {
      browseBtn.addEventListener('click', () => {
        // Volver a inicio
        document.querySelectorAll('.nav-item').forEach(item => {
          item.classList.remove('active');
          if (item.textContent.includes('Inicio')) {
            item.classList.add('active');
            item.click();
          }
        });
      });
    }
  }
  
  switchView(view) {
    this.currentView = view;
    
    // Update toggle buttons
    document.querySelectorAll('.view-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });
    
    // Show/hide views
    const gridEl = document.getElementById('libraryGrid');
    const listEl = document.getElementById('libraryList');
    
    if (view === 'grid') {
      gridEl?.classList.remove('hidden');
      listEl?.classList.add('hidden');
    } else {
      gridEl?.classList.add('hidden');
      listEl?.classList.remove('hidden');
    }
  }
  
  async loadFavorites() {
    console.log('[LIBRARY] Cargando favoritos...');
    
    let favorites = [];
    
    try {
      // Usar la API de Electron para obtener favoritos
      if (window.electronAPI && window.electronAPI.getFavorites) {
        favorites = await window.electronAPI.getFavorites();
      } else if (window.appState && window.appState.favorites) {
        favorites = window.appState.favorites;
      }
    } catch (e) {
      console.error('[LIBRARY] Error cargando favoritos:', e);
    }
    
    // Ordenar según el criterio seleccionado
    favorites = this.sortFavorites(favorites);
    
    // Actualizar contador
    const countEl = document.getElementById('libraryCount');
    if (countEl) {
      countEl.textContent = favorites.length;
    }
    
    // Mostrar vacío o contenido
    const emptyEl = document.getElementById('libraryEmpty');
    const contentEl = document.getElementById('libraryContent');
    
    if (favorites.length === 0) {
      emptyEl?.classList.remove('hidden');
      contentEl?.classList.add('hidden');
    } else {
      emptyEl?.classList.add('hidden');
      contentEl?.classList.remove('hidden');
      
      this.renderGrid(favorites);
      this.renderList(favorites);
    }
  }
  
  sortFavorites(favorites) {
    const sorted = [...favorites];
    
    switch (this.sortBy) {
      case 'title':
        sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
        break;
      case 'artist':
        sorted.sort((a, b) => (a.artist || a.channel || '').localeCompare(b.artist || b.channel || ''));
        break;
      case 'recent':
        sorted.reverse(); // Asumiendo que los más recientes están al final
        break;
      case 'custom':
      default:
        // Mantener orden personalizado (guardado)
        break;
    }
    
    return sorted;
  }
  
  renderGrid(favorites) {
    const gridEl = document.getElementById('libraryGrid');
    if (!gridEl) return;
    
    gridEl.innerHTML = favorites.map((fav, index) => `
      <div class="library-card" 
           data-index="${index}" 
           data-video-id="${fav.videoId}"
           draggable="true">
        <div class="library-card-drag" title="Arrastrar para reordenar">
          <i class="fas fa-grip-vertical"></i>
        </div>
        <button class="library-card-remove" title="Quitar de biblioteca">
          <i class="fas fa-times"></i>
        </button>
        <div class="library-card-image">
          <img src="${fav.thumbnail || `https://i.ytimg.com/vi/${fav.videoId}/maxresdefault.jpg`}" 
               alt="${fav.title}"
               onerror="this.onerror=null; this.src='https://i.ytimg.com/vi/${fav.videoId}/hqdefault.jpg'; this.onerror=function(){this.src='./assets/img/icon.png'};">
          <button class="library-card-play">
            <i class="fas fa-play"></i>
          </button>
        </div>
        <div class="library-card-title" title="${fav.title}">${fav.title || 'Sin título'}</div>
        <div class="library-card-artist">${fav.artist || fav.channel || 'Artista desconocido'}</div>
      </div>
    `).join('');
    
    this.setupGridDragAndDrop();
    this.setupGridEvents();
  }
  
  renderList(favorites) {
    const listBody = document.getElementById('libraryListBody');
    if (!listBody) return;
    
    listBody.innerHTML = favorites.map((fav, index) => `
      <div class="library-list-item" 
           data-index="${index}"
           data-video-id="${fav.videoId}"
           draggable="true">
        <div class="list-col-drag" title="Arrastrar para reordenar">
          <i class="fas fa-grip-vertical"></i>
        </div>
        <div class="list-col-num">${index + 1}</div>
        <div class="list-col-title">
          <div class="list-item-image">
            <img src="${fav.thumbnail || `https://i.ytimg.com/vi/${fav.videoId}/maxresdefault.jpg`}" 
                 alt="${fav.title}"
                 onerror="this.onerror=null; this.src='https://i.ytimg.com/vi/${fav.videoId}/hqdefault.jpg'; this.onerror=function(){this.src='./assets/img/icon.png'};">
          </div>
          <div class="list-item-info">
            <span class="list-item-name">${fav.title || 'Sin título'}</span>
          </div>
        </div>
        <div class="list-col-artist">${fav.artist || fav.channel || 'Artista desconocido'}</div>
        <div class="list-col-duration">${fav.duration || '--:--'}</div>
        <div class="list-col-actions">
          <button class="list-action-btn remove-btn" title="Quitar de biblioteca">
            <i class="fas fa-trash-alt"></i>
          </button>
        </div>
      </div>
    `).join('');
    
    this.setupListDragAndDrop();
    this.setupListEvents();
  }
  
  setupGridDragAndDrop() {
    const cards = document.querySelectorAll('.library-card');
    
    cards.forEach(card => {
      card.addEventListener('dragstart', (e) => this.handleDragStart(e, 'grid'));
      card.addEventListener('dragend', (e) => this.handleDragEnd(e));
      card.addEventListener('dragover', (e) => this.handleDragOver(e));
      card.addEventListener('dragleave', (e) => this.handleDragLeave(e));
      card.addEventListener('drop', (e) => this.handleDrop(e, 'grid'));
    });
  }
  
  setupListDragAndDrop() {
    const items = document.querySelectorAll('.library-list-item');
    
    items.forEach(item => {
      item.addEventListener('dragstart', (e) => this.handleDragStart(e, 'list'));
      item.addEventListener('dragend', (e) => this.handleDragEnd(e));
      item.addEventListener('dragover', (e) => this.handleDragOver(e));
      item.addEventListener('dragleave', (e) => this.handleDragLeave(e));
      item.addEventListener('drop', (e) => this.handleDrop(e, 'list'));
    });
  }
  
  handleDragStart(e, viewType) {
    this.draggedItem = e.target.closest(viewType === 'grid' ? '.library-card' : '.library-list-item');
    this.draggedIndex = parseInt(this.draggedItem.dataset.index);
    
    this.draggedItem.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', this.draggedIndex);
  }
  
  handleDragEnd(e) {
    if (this.draggedItem) {
      this.draggedItem.classList.remove('dragging');
    }
    
    // Remover clase drag-over de todos los elementos
    document.querySelectorAll('.drag-over').forEach(el => {
      el.classList.remove('drag-over');
    });
    
    this.draggedItem = null;
    this.draggedIndex = null;
  }
  
  handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    const target = e.target.closest('.library-card, .library-list-item');
    if (target && target !== this.draggedItem) {
      target.classList.add('drag-over');
    }
  }
  
  handleDragLeave(e) {
    const target = e.target.closest('.library-card, .library-list-item');
    if (target) {
      target.classList.remove('drag-over');
    }
  }
  
  async handleDrop(e, viewType) {
    e.preventDefault();
    
    const target = e.target.closest(viewType === 'grid' ? '.library-card' : '.library-list-item');
    if (!target || target === this.draggedItem) return;
    
    const fromIndex = this.draggedIndex;
    const toIndex = parseInt(target.dataset.index);
    
    console.log(`[LIBRARY] Moviendo de ${fromIndex} a ${toIndex}`);
    
    // Reordenar favoritos
    await this.reorderFavorites(fromIndex, toIndex);
    
    // Recargar vista
    this.loadFavorites();
  }
  
  async reorderFavorites(fromIndex, toIndex) {
    try {
      let favorites = [];
      
      if (window.electronAPI && window.electronAPI.getFavorites) {
        favorites = await window.electronAPI.getFavorites();
      } else if (window.appState && window.appState.favorites) {
        favorites = [...window.appState.favorites];
      }
      
      // Mover elemento
      const [movedItem] = favorites.splice(fromIndex, 1);
      favorites.splice(toIndex, 0, movedItem);
      
      // Guardar nuevo orden
      if (window.electronAPI && window.electronAPI.saveFavorites) {
        await window.electronAPI.saveFavorites(favorites);
      }
      
      if (window.appState) {
        window.appState.favorites = favorites;
      }
      
      console.log('[LIBRARY] Orden guardado');
    } catch (e) {
      console.error('[LIBRARY] Error reordenando:', e);
    }
  }
  
  setupGridEvents() {
    // Play buttons
    document.querySelectorAll('.library-card-play').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.library-card');
        this.playTrack(card.dataset.videoId);
      });
    });
    
    // Card click (play)
    document.querySelectorAll('.library-card').forEach(card => {
      card.addEventListener('click', (e) => {
        if (!e.target.closest('.library-card-remove') && !e.target.closest('.library-card-drag')) {
          this.playTrack(card.dataset.videoId);
        }
      });
    });
    
    // Remove buttons
    document.querySelectorAll('.library-card-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const card = btn.closest('.library-card');
        this.removeFromLibrary(card.dataset.videoId);
      });
    });
  }
  
  setupListEvents() {
    // Row click (play)
    document.querySelectorAll('.library-list-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (!e.target.closest('.remove-btn') && !e.target.closest('.list-col-drag')) {
          this.playTrack(item.dataset.videoId);
        }
      });
    });
    
    // Remove buttons
    document.querySelectorAll('.library-list-item .remove-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const item = btn.closest('.library-list-item');
        this.removeFromLibrary(item.dataset.videoId);
      });
    });
  }
  
  async playTrack(videoId, setQueueFromHere = true) {
    console.log('[LIBRARY] Reproduciendo:', videoId);
    
    try {
      let favorites = [];
      
      if (window.electronAPI && window.electronAPI.getFavorites) {
        favorites = await window.electronAPI.getFavorites();
      } else if (window.appState && window.appState.favorites) {
        favorites = window.appState.favorites;
      }
      
      // Aplicar ordenamiento actual
      favorites = this.sortFavorites(favorites);
      
      const trackIndex = favorites.findIndex(f => f.videoId === videoId);
      const track = favorites[trackIndex];
      
      if (track) {
        // ⭐ Establecer cola desde esta posición
        if (setQueueFromHere && window.setPlayQueue && trackIndex >= 0) {
          window.setPlayQueue(favorites, trackIndex);
        }
        
        if (window.electronAPI && window.electronAPI.playAudio) {
          window.electronAPI.playAudio(
            `https://www.youtube.com/watch?v=${videoId}`,
            track.title || 'Sin título',
            track.artist || track.channel || 'Artista desconocido'
          );
        }
      }
    } catch (e) {
      console.error('[LIBRARY] Error reproduciendo:', e);
    }
  }
  
  async removeFromLibrary(videoId) {
    console.log('[LIBRARY] Quitando de biblioteca:', videoId);
    
    try {
      if (window.electronAPI && window.electronAPI.toggleFavorite) {
        await window.electronAPI.toggleFavorite(videoId);
      }
      
      // También actualizar appState si existe
      if (window.appState && window.appState.favorites) {
        window.appState.favorites = window.appState.favorites.filter(f => f.videoId !== videoId);
      }
      
      // Recargar vista
      this.loadFavorites();
      
      // Actualizar icono de like si la canción actual es la que se quitó
      if (window.appState && window.appState.currentTrack && 
          window.appState.currentTrack.videoId === videoId) {
        const likeBtn = document.getElementById('likeBtn');
        if (likeBtn) {
          likeBtn.innerHTML = '<i class="far fa-heart"></i>';
          likeBtn.classList.remove('liked');
        }
      }
    } catch (e) {
      console.error('[LIBRARY] Error quitando de biblioteca:', e);
    }
  }
  
  async playAll(shuffle = false) {
    console.log('[LIBRARY] Reproduciendo todo' + (shuffle ? ' (shuffle)' : ''));
    
    try {
      let favorites = [];
      
      if (window.electronAPI && window.electronAPI.getFavorites) {
        favorites = await window.electronAPI.getFavorites();
      } else if (window.appState && window.appState.favorites) {
        favorites = [...window.appState.favorites];
      }
      
      if (favorites.length === 0) return;
      
      // Aplicar el orden actual si no es shuffle
      if (!shuffle) {
        favorites = this.sortFavorites(favorites);
      } else {
        // Mezclar array (Fisher-Yates)
        for (let i = favorites.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [favorites[i], favorites[j]] = [favorites[j], favorites[i]];
        }
      }
      
      // ⭐ Establecer cola de reproducción con todas las canciones
      if (window.setPlayQueue) {
        window.setPlayQueue(favorites, 0);
      }
      
      // Reproducir primera canción
      const first = favorites[0];
      if (window.electronAPI && window.electronAPI.playAudio) {
        window.electronAPI.playAudio(
          `https://www.youtube.com/watch?v=${first.videoId}`,
          first.title || 'Sin título',
          first.artist || first.channel || 'Artista desconocido'
        );
      }
    } catch (e) {
      console.error('[LIBRARY] Error reproduciendo todo:', e);
    }
  }
  
  // Método para refrescar cuando se agregan/quitan favoritos desde fuera
  refresh() {
    if (this.isLibraryActive) {
      this.loadFavorites();
    }
  }
}

// Inicializar
const libraryManager = new LibraryManager();

// Exportar para uso global
window.libraryManager = libraryManager;
