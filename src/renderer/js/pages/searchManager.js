/**
 * Search Manager - Gestiona la página de búsqueda y resultados de SeaxMusic
 */

class SearchManager {
  constructor() {
    this.searchInput = null;
    this.searchBtn = null;
    this.isSearchPageActive = false;
    this.currentQuery = '';
    this.currentResults = [];
    this.continuation = null;
    this.isLoadingMore = false;
    this.RECENT_SEARCHES_KEY = 'seaxmusic_recent_searches';
    this.MAX_RECENT = 8;
    
    this.init();
  }

  getRecentSearches() {
    try {
      const sm = window.StorageManager;
      if (sm) return sm.getJSON(this.RECENT_SEARCHES_KEY, []);
      return JSON.parse(localStorage.getItem(this.RECENT_SEARCHES_KEY)) || [];
    } catch {
      return [];
    }
  }

  saveRecentSearch(query) {
    let searches = this.getRecentSearches();
    searches = searches.filter(s => s.toLowerCase() !== query.toLowerCase());
    searches.unshift(query);
    if (searches.length > this.MAX_RECENT) searches = searches.slice(0, this.MAX_RECENT);
    const sm = window.StorageManager;
    if (sm) sm.setJSON(this.RECENT_SEARCHES_KEY, searches);
    else localStorage.setItem(this.RECENT_SEARCHES_KEY, JSON.stringify(searches));
  }

  clearRecentSearches() {
    const sm = window.StorageManager;
    if (sm) sm.remove(this.RECENT_SEARCHES_KEY);
    else localStorage.removeItem(this.RECENT_SEARCHES_KEY);
    this.renderRecentSearches();
  }

  renderRecentSearches() {
    const container = document.getElementById('searchRecent');
    const list = document.getElementById('searchRecentList');
    if (!container || !list) return;
    const searches = this.getRecentSearches();
    if (searches.length === 0) {
      container.style.display = 'none';
      return;
    }
    container.style.display = 'block';
    // Las búsquedas pueden provenir de texto pegado por el usuario. Construir el
    // contenido con el DOM evita que una búsqueda se interprete como HTML.
    list.replaceChildren(...searches.map(query => {
      const item = document.createElement('div');
      item.className = 'search-recent-item';
      item.dataset.query = query;
      item.setAttribute('role', 'listitem');
      item.tabIndex = 0;
      item.setAttribute('aria-label', `Buscar ${query}`);
      item.innerHTML = '<i class="fas fa-history search-recent-icon" aria-hidden="true"></i>';

      const label = document.createElement('span');
      label.className = 'search-recent-query';
      label.textContent = query;

      const remove = document.createElement('button');
      remove.className = 'search-recent-remove';
      remove.dataset.query = query;
      remove.setAttribute('aria-label', `Eliminar ${query}`);
      remove.innerHTML = '<i class="fas fa-times" aria-hidden="true"></i>';
      item.append(label, remove);
      return item;
    }));

    list.querySelectorAll('.search-recent-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.search-recent-remove')) return;
        const query = item.dataset.query;
        if (this.searchInput) this.searchInput.value = query;
        this.performSearch(query);
      });
    });

    list.querySelectorAll('.search-recent-remove').forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        let searches = this.getRecentSearches();
        searches = searches.filter(s => s.toLowerCase() !== btn.dataset.query.toLowerCase());
        const sm = window.StorageManager;
        if (sm) sm.setJSON(this.RECENT_SEARCHES_KEY, searches);
        else localStorage.setItem(this.RECENT_SEARCHES_KEY, JSON.stringify(searches));
        this.renderRecentSearches();
      });
    });
  }

  init() {
    // Escuchar navegación a búsqueda
    document.querySelectorAll('.nav-item').forEach(item => {
      if (item.textContent.includes('Buscar')) {
        item.addEventListener('click', (e) => {
          e.preventDefault();
          this.showSearchPage(true);
        });
      }
    });
  }
  
  async showSearchPage(addToHistory = true) {
    Logger.debug('[SEARCH] Mostrando página de búsqueda...');
    
    // Agregar al historial de navegación
    if (addToHistory && window.navigationHistory) {
      window.navigationHistory.navigateTo('search');
    }
    
    // Marcar nav item como activo
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
      if (item.textContent.includes('Buscar')) {
        item.classList.add('active');
      }
    });
    
    // Cargar HTML de búsqueda
    const contentArea = document.querySelector('.content-area');
    if (!contentArea) return;
    
    try {
      const response = await fetch('./html/search.html');
      const html = await response.text();
      contentArea.innerHTML = html;
      
      this.isSearchPageActive = true;
      this.setupSearchListeners();
    } catch (error) {
      console.error('[SEARCH] Error cargando página de búsqueda:', error);
      this.showInlineSearchPage(contentArea);
    }
  }
  
  // Fallback si no puede cargar el HTML externo
  showInlineSearchPage(contentArea) {
    contentArea.innerHTML = `
      <div class="search-page">
        <div class="search-banner">
          <div class="search-banner-bg"></div>
          <div class="search-banner-content">
            <div class="search-banner-icon">
              <i class="fas fa-search"></i>
            </div>
            <div class="search-banner-info">
              <h1 class="search-banner-title">Buscar</h1>
              <p class="search-banner-subtitle">Encuentra tu música favorita en SeaxMusic</p>
            </div>
          </div>
          <div class="search-box-container" role="search" aria-label="Buscar música">
            <div class="search-input-wrapper">
              <i class="fas fa-search search-input-icon" aria-hidden="true"></i>
              <label for="searchInput" class="sr-only">Buscar música</label>
              <input type="text" id="searchInput" class="search-input" placeholder="¿Qué quieres escuchar?" aria-label="Buscar música" autocomplete="off">
              <button class="search-clear-btn" id="searchClearBtn" style="display: none;" aria-label="Limpiar búsqueda">
                <i class="fas fa-times" aria-hidden="true"></i>
              </button>
            </div>
            <button class="search-submit-btn" id="searchSubmitBtn" aria-label="Buscar">
              <i class="fas fa-search" aria-hidden="true"></i>
              <span>Buscar</span>
            </button>
          </div>
        </div>
        <div class="search-recent" id="searchRecent" style="display: none;" role="region" aria-label="Búsquedas recientes">
          <div class="search-recent-header">
            <span><i class="fas fa-clock" aria-hidden="true"></i> Búsquedas recientes</span>
            <button class="search-recent-clear" id="searchRecentClear" aria-label="Limpiar todas las búsquedas recientes">Limpiar todo</button>
          </div>
          <div class="search-recent-list" id="searchRecentList" role="list"></div>
        </div>
        <div class="search-results" id="searchResults" style="display: none;">
          <div class="search-results-header">
            <h2><i class="fas fa-list" style="color: var(--accent-primary); margin-right: 8px;"></i>Resultados</h2>
            <span class="results-count" id="resultsCount"></span>
          </div>
          <div class="search-loading" id="searchLoading" style="display: none;">
            <div class="search-loading-spinner">
              <div class="spinner-ring"></div>
            </div>
            <p>Buscando en SeaxMusic...</p>
          </div>
          <div class="search-results-grid" id="searchResultsGrid"></div>
          <div class="search-no-results" id="searchNoResults" style="display: none;">
            <i class="fas fa-search"></i>
            <h3>No se encontraron resultados</h3>
            <p>Intenta con otras palabras clave</p>
          </div>
        </div>
      </div>
    `;
    
    this.isSearchPageActive = true;
    this.setupSearchListeners();
  }
  
  setupSearchListeners() {
    // Input de búsqueda
    this.searchInput = document.getElementById('searchInput');
    const searchSubmitBtn = document.getElementById('searchSubmitBtn');
    const searchClearBtn = document.getElementById('searchClearBtn');
    const searchRecentClear = document.getElementById('searchRecentClear');
    
    // Render recent searches
    this.renderRecentSearches();
    
    if (this.searchInput) {
      // Enter para buscar
      this.searchInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
          this.performSearch(this.searchInput.value);
        }
      });
      
      // Mostrar/ocultar botón de limpiar
      this.searchInput.addEventListener('input', () => {
        if (searchClearBtn) {
          searchClearBtn.style.display = this.searchInput.value ? 'flex' : 'none';
        }
      });
      
      // Show recent searches on focus (only when no active results)
      this.searchInput.addEventListener('focus', () => {
        const searchResults = document.getElementById('searchResults');
        if (!searchResults || searchResults.style.display === 'none') {
          this.renderRecentSearches();
        }
      });
      
      // Focus automático
      setTimeout(() => this.searchInput.focus(), 100);
    }
    
    // Botón de buscar
    if (searchSubmitBtn) {
      searchSubmitBtn.addEventListener('click', () => {
        this.performSearch(this.searchInput?.value || '');
      });
    }
    
    // Botón de limpiar
    if (searchClearBtn) {
      searchClearBtn.addEventListener('click', () => {
        if (this.searchInput) {
          this.searchInput.value = '';
          this.searchInput.focus();
          searchClearBtn.style.display = 'none';
          this.renderRecentSearches();
        }
      });
    }
    
    // Clear all recent searches
    if (searchRecentClear) {
      searchRecentClear.addEventListener('click', () => this.clearRecentSearches());
    }
    
    // Categorías rápidas
    document.querySelectorAll('.category-card').forEach(card => {
      card.addEventListener('click', () => {
        const searchQuery = card.getAttribute('data-search');
        if (searchQuery && this.searchInput) {
          this.searchInput.value = searchQuery;
          this.performSearch(searchQuery);
        }
      });
    });
  }
  
  // ===== SEARCH LOGIC =====

  async performSearch(query) {
    query = query?.trim();
    if (!query) {
      console.warn('🔍 Search query is empty');
      return;
    }

    Logger.debug('🔍 Buscando en SeaxMusic:', query);
    this.currentQuery = query;
    this.currentResults = [];
    this.continuation = null;
    
    // Guardar en búsquedas recientes
    this.saveRecentSearch(query);
    
    // Mostrar sección de resultados y ocultar categorías/recent
    const searchResults = document.getElementById('searchResults');
    const searchCategories = document.getElementById('searchCategories');
    const searchRecent = document.getElementById('searchRecent');
    const searchLoading = document.getElementById('searchLoading');
    const searchResultsGrid = document.getElementById('searchResultsGrid');
    const searchNoResults = document.getElementById('searchNoResults');
    const resultsCount = document.getElementById('resultsCount');
    
    if (searchCategories) searchCategories.style.display = 'none';
    if (searchRecent) searchRecent.style.display = 'none';
    if (searchResults) searchResults.style.display = 'block';
    if (searchLoading) searchLoading.style.display = 'flex';
    if (searchResultsGrid) searchResultsGrid.innerHTML = '';
    if (searchNoResults) searchNoResults.style.display = 'none';

    try {
      // Buscar en YouTube via IPC
      if (window.electronAPI && window.electronAPI.searchYouTube) {
        const response = await window.electronAPI.searchYouTube(query);
        
        if (searchLoading) searchLoading.style.display = 'none';
        
        if (response.success && response.videos && response.videos.length > 0) {
          Logger.debug('✅ Resultados encontrados:', response.videos.length);
          if (resultsCount) {
            resultsCount.textContent = `${response.videos.length} resultados para "${query}"`;
          }
          this.continuation = response.continuation || null;
          this.currentResults = response.videos;
          this.displaySearchResults(response.videos);
        } else {
          Logger.debug('❌ No se encontraron resultados');
          if (searchNoResults) searchNoResults.style.display = 'flex';
          if (resultsCount) resultsCount.textContent = `Sin resultados para "${query}"`;
        }
      } else {
        // Fallback: Abrir YouTube directamente
        Logger.debug('⚠️ API de búsqueda no disponible, abriendo YouTube...');
        if (searchLoading) searchLoading.style.display = 'none';
        
        const youtubeSearchUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
        if (window.electronAPI && window.electronAPI.openYouTubeWindow) {
          await window.electronAPI.openYouTubeWindow(youtubeSearchUrl, query, 'Resultados de búsqueda');
        }
      }
    } catch (error) {
      console.error('❌ Error en búsqueda:', error);
      if (searchLoading) searchLoading.style.display = 'none';
      if (searchNoResults) searchNoResults.style.display = 'flex';
    }
  }
  
  displaySearchResults(videos) {
    const grid = document.getElementById('searchResultsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    videos.forEach(video => {
      grid.appendChild(this.createResultCard(video));
    });

    // Botón "Cargar más" al final del grid
    const loadMoreBtn = document.createElement('button');
    loadMoreBtn.className = 'search-load-more-btn';
    loadMoreBtn.innerHTML = '<i class="fas fa-chevron-down"></i> Cargar más resultados';
    if (this.continuation) {
      loadMoreBtn.style.display = 'flex';
    } else {
      loadMoreBtn.style.display = 'none';
    }
    loadMoreBtn.addEventListener('click', () => this.loadMore());
    grid.appendChild(loadMoreBtn);
  }

  async loadMore() {
    if (this.isLoadingMore || !this.continuation) return;
    this.isLoadingMore = true;

    const loadMoreBtn = document.querySelector('.search-load-more-btn');
    if (loadMoreBtn) {
      loadMoreBtn.innerHTML = '<div class="search-load-more-spinner"></div> Cargando...';
      loadMoreBtn.disabled = true;
    }

    try {
      if (window.electronAPI && window.electronAPI.searchYouTubeMore) {
        const response = await window.electronAPI.searchYouTubeMore(this.continuation);
        if (response.success && response.videos?.length > 0) {
          this.continuation = response.continuation || null;
          this.currentResults.push(...response.videos);
          this.appendSearchResults(response.videos);
        } else {
          this.continuation = null;
        }
      }
    } catch (error) {
      console.error('Error cargando más resultados:', error);
      this.continuation = null;
    }

    this.isLoadingMore = false;
    if (loadMoreBtn) {
      if (this.continuation) {
        loadMoreBtn.innerHTML = '<i class="fas fa-chevron-down"></i> Cargar más resultados';
        loadMoreBtn.disabled = false;
      } else {
        loadMoreBtn.textContent = 'Todos los resultados cargados';
        loadMoreBtn.disabled = true;
      }
    }
  }

  appendSearchResults(videos) {
    const grid = document.getElementById('searchResultsGrid');
    if (!grid) return;

    const loadMoreBtn = grid.querySelector('.search-load-more-btn');

    videos.forEach(video => {
      const card = this.createResultCard(video);
      if (loadMoreBtn) {
        grid.insertBefore(card, loadMoreBtn);
      } else {
        grid.appendChild(card);
      }
    });
  }

  createResultCard(video) {
    const card = document.createElement('div');
    card.className = 'music-card search-result-card';
    card.dataset.videoId = video.videoId || '';

    const artistName = video.channel || video.artist || 'SeaxMusic';
    const videoTitle = video.title || 'Sin título';
    const videoId = video.videoId || '';

    const thumbnailSrc = this.getSafeImageUrl(video.thumbnail)
      ? video.thumbnail
      : (videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : './assets/img/icon.png');

    const image = document.createElement('img');
    image.className = 'card-img';
    image.src = thumbnailSrc;
    image.alt = videoTitle;
    image.loading = 'lazy';
    image.addEventListener('error', () => {
      image.onerror = null;
      image.src = videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : './assets/img/icon.png';
    });

    const imageWrap = document.createElement('div');
    imageWrap.className = 'card-image';
    const overlay = document.createElement('div');
    overlay.className = 'card-overlay';
    overlay.innerHTML = '<button class="play-card-btn"><i class="fas fa-play"></i></button><button class="add-queue-card-btn" title="Añadir a la cola"><i class="fas fa-plus"></i></button>';
    imageWrap.append(image, overlay);
    if (video.duration) {
      const duration = document.createElement('span');
      duration.className = 'card-duration';
      duration.textContent = video.duration;
      imageWrap.appendChild(duration);
    }

    const info = document.createElement('div');
    info.className = 'card-info';
    const title = document.createElement('p');
    title.className = 'card-title';
    title.title = videoTitle;
    title.textContent = videoTitle;
    const artist = document.createElement('p');
    artist.className = 'card-artist';
    artist.title = artistName;
    artist.textContent = artistName;
    info.append(title, artist);
    if (video.isVerified) {
      const badge = document.createElement('span');
      badge.className = 'channel-badge';
      badge.innerHTML = '<i class="fas fa-check-circle"></i> Artista oficial';
      info.appendChild(badge);
    }
    card.append(imageWrap, info);

    const addQueueBtn = card.querySelector('.add-queue-card-btn');
    if (addQueueBtn) {
      addQueueBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.addToQueue({
          videoId: video.videoId,
          title: videoTitle,
          artist: artistName,
          channel: artistName,
          thumbnail: video.thumbnail || thumbnailSrc
        });
      });
    }

    card.addEventListener('click', () => {
      this.playVideo(video);
    });

    return card;
  }

  getSafeImageUrl(value) {
    if (typeof value !== 'string') return false;
    try {
      const url = new URL(value);
      return url.protocol === 'https:' || url.protocol === 'http:';
    } catch {
      return false;
    }
  }
  
  playVideo(video) {
    const videoTitle = video.title || 'Sin título';
    const artistName = video.channel || video.artist || 'SeaxMusic';
    
    Logger.debug('🎵 Reproduciendo desde búsqueda:', videoTitle);
    
    const currentTrack = {
      videoId: video.videoId,
      title: videoTitle,
      artist: artistName,
      channel: artistName,
      thumbnail: video.thumbnail
    };

    // Convertir los resultados de la búsqueda en una sesión inteligente. Así,
    // al terminar la canción elegida, SeaxMusic rota artistas y evita repetir
    // temas aunque el modo DJ esté apagado.
    if (window.setPlayQueue && this.currentResults.length > 1) {
      const selectedIndex = this.currentResults.findIndex(result => result.videoId === video.videoId);
      window.setPlayQueue(this.currentResults, Math.max(0, selectedIndex));
    }

    // Actualizar track actual compartido
    if (window.appState) {
      window.appState.currentTrack = currentTrack;
    }
    if (window.musicPlayer) {
      window.musicPlayer.currentTrack = currentTrack;
      if (window.musicPlayer.updateLikeButton) {
        window.musicPlayer.updateLikeButton();
      }
    }
    
    // Actualizar UI del player
    const trackName = document.getElementById('trackName');
    const trackArtist = document.getElementById('trackArtist');
    const trackImage = document.getElementById('trackImage');
    
    if (trackName) trackName.textContent = videoTitle;
    if (trackArtist) trackArtist.textContent = artistName;
    if (trackImage && video.thumbnail) trackImage.src = video.thumbnail;
    
    // Actualizar botón like
    if (window.updateLikeButton) {
      window.updateLikeButton();
    }
    
    // Reproducir en YouTube
    if (window.electronAPI && window.electronAPI.playVideo) {
      window.electronAPI.playVideo(video.videoId, videoTitle, artistName);
    } else if (window.electronAPI && window.electronAPI.playAudio) {
      window.electronAPI.playAudio(
        `https://www.youtube.com/watch?v=${video.videoId}`,
        videoTitle,
        artistName
      );
    }
  }

  // Cerrar ventana de YouTube
  async closeYouTubeWindow() {
    try {
      if (window.electronAPI && window.electronAPI.closeYouTubeWindow) {
        const result = await window.electronAPI.closeYouTubeWindow();
        if (result.success) {
          Logger.debug('✅ Ventana de YouTube cerrada');
        }
      }
    } catch (error) {
      console.error('Error closing YouTube window:', error);
    }
  }
}

// Initialize search manager when DOM is ready
let searchManager;
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    searchManager = new SearchManager();
    window.searchManager = searchManager;
  });
} else {
  searchManager = new SearchManager();
  window.searchManager = searchManager;
}
