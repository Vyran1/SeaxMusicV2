/**
 * Search Manager - Gestiona la página de búsqueda y resultados de YouTube
 */

class SearchManager {
  constructor() {
    this.searchInput = null;
    this.searchBtn = null;
    this.isSearchPageActive = false;
    this.currentQuery = '';
    
    this.init();
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
    console.log('[SEARCH] Mostrando página de búsqueda...');
    
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
              <p class="search-banner-subtitle">Encuentra tu música favorita en YouTube</p>
            </div>
          </div>
          <div class="search-box-container">
            <div class="search-input-wrapper">
              <i class="fas fa-search search-input-icon"></i>
              <input type="text" id="searchInput" class="search-input" placeholder="¿Qué quieres escuchar?" autocomplete="off">
              <button class="search-clear-btn" id="searchClearBtn" style="display: none;">
                <i class="fas fa-times"></i>
              </button>
            </div>
            <button class="search-submit-btn" id="searchSubmitBtn">
              <i class="fas fa-search"></i>
              <span>Buscar</span>
            </button>
          </div>
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
            <p>Buscando en YouTube...</p>
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
    const refreshChartsBtn = document.getElementById('refreshChartsBtn');
    
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
        }
      });
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
    
    // Botón de refrescar charts
    if (refreshChartsBtn) {
      refreshChartsBtn.addEventListener('click', () => {
        this.loadTopCharts();
      });
    }
    
    // Cargar Top 100 Global al entrar a la página
    this.loadTopCharts();
  }
  
  // ===== TOP 100 GLOBAL CHARTS =====
  async loadTopCharts() {
    console.log('[CHARTS] Cargando Top 100 Global...');
    
    const chartsLoading = document.getElementById('chartsLoading');
    const chartsGrid = document.getElementById('topChartsGrid');
    const refreshBtn = document.getElementById('refreshChartsBtn');
    
    // Mostrar loading con skeletons
    if (chartsLoading) chartsLoading.style.display = 'flex';
    if (chartsGrid) {
      chartsGrid.innerHTML = '';
      // Mostrar skeletons mientras carga
      for (let i = 0; i < 20; i++) {
        chartsGrid.innerHTML += `
          <div class="chart-card-skeleton">
            <div class="skeleton-rank"></div>
            <div class="skeleton-thumb"></div>
            <div class="skeleton-info">
              <div class="skeleton-title"></div>
              <div class="skeleton-artist"></div>
            </div>
          </div>
        `;
      }
    }
    if (refreshBtn) refreshBtn.classList.add('loading');
    
    try {
      if (window.electronAPI && window.electronAPI.getYouTubeCharts) {
        const response = await window.electronAPI.getYouTubeCharts();
        
        if (chartsLoading) chartsLoading.style.display = 'none';
        if (refreshBtn) refreshBtn.classList.remove('loading');
        
        if (response.success && response.songs && response.songs.length > 0) {
          console.log('[CHARTS] Top 100 cargado:', response.songs.length, 'canciones');
          this.displayTopCharts(response.songs);
        } else {
          console.log('[CHARTS] No se pudieron cargar los charts');
          if (chartsGrid) {
            chartsGrid.innerHTML = `
              <div class="charts-error" style="grid-column: 1/-1; text-align: center; padding: 40px; color: var(--text-secondary);">
                <i class="fas fa-exclamation-circle" style="font-size: 32px; margin-bottom: 12px; color: var(--text-muted);"></i>
                <p>No se pudieron cargar los charts</p>
                <button onclick="window.searchManager.loadTopCharts()" style="margin-top: 12px; padding: 8px 16px; background: var(--accent-primary); border: none; border-radius: 20px; color: white; cursor: pointer;">
                  Reintentar
                </button>
              </div>
            `;
          }
        }
      } else {
        console.log('[CHARTS] API no disponible');
        if (chartsLoading) chartsLoading.style.display = 'none';
        if (refreshBtn) refreshBtn.classList.remove('loading');
      }
    } catch (error) {
      console.error('[CHARTS] Error cargando charts:', error);
      if (chartsLoading) chartsLoading.style.display = 'none';
      if (refreshBtn) refreshBtn.classList.remove('loading');
    }
  }
  
  displayTopCharts(songs) {
    const grid = document.getElementById('topChartsGrid');
    if (!grid) return;
    
    grid.innerHTML = '';
    
    songs.forEach((song, index) => {
      const rank = song.rank || index + 1;
      const card = document.createElement('div');
      card.className = 'chart-card';
      card.setAttribute('data-video-id', song.videoId);
      
      // Clases especiales para top 3 y top 10
      let rankClass = '';
      if (rank <= 3) rankClass = 'top-3';
      else if (rank <= 10) rankClass = 'top-10';
      
      const thumbnailSrc = song.thumbnail || `https://i.ytimg.com/vi/${song.videoId}/mqdefault.jpg`;
      
      card.innerHTML = `
        <span class="chart-rank ${rankClass}">${rank}</span>
        <div class="chart-thumbnail">
          <img src="${thumbnailSrc}" 
               onerror="this.onerror=null; this.src='https://i.ytimg.com/vi/${song.videoId}/hqdefault.jpg'; this.onerror=function(){this.src='./assets/img/icon.png'};"
               alt="${song.title}" loading="lazy">
          <button class="chart-play-btn"><i class="fas fa-play"></i></button>
        </div>
        <div class="chart-info">
          <span class="chart-title" title="${song.title}">${song.title}</span>
          <span class="chart-artist" title="${song.artist}">${song.artist}</span>
        </div>
      `;
      
      // Click para reproducir
      card.addEventListener('click', () => {
        this.playVideo(song);
      });
      
      grid.appendChild(card);
    });
  }

  async performSearch(query) {
    query = query?.trim();
    if (!query) {
      console.warn('🔍 Search query is empty');
      return;
    }

    console.log('🔍 Buscando en YouTube:', query);
    this.currentQuery = query;
    
    // Mostrar sección de resultados y ocultar categorías/charts
    const searchResults = document.getElementById('searchResults');
    const searchCategories = document.getElementById('searchCategories');
    const topChartsSection = document.getElementById('topChartsSection');
    const searchLoading = document.getElementById('searchLoading');
    const searchResultsGrid = document.getElementById('searchResultsGrid');
    const searchNoResults = document.getElementById('searchNoResults');
    const resultsCount = document.getElementById('resultsCount');
    
    if (searchCategories) searchCategories.style.display = 'none';
    if (topChartsSection) topChartsSection.style.display = 'none';
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
          console.log('✅ Resultados encontrados:', response.videos.length);
          if (resultsCount) {
            resultsCount.textContent = `${response.videos.length} resultados para "${query}"`;
          }
          this.displaySearchResults(response.videos);
        } else {
          console.log('❌ No se encontraron resultados');
          if (searchNoResults) searchNoResults.style.display = 'flex';
          if (resultsCount) resultsCount.textContent = `Sin resultados para "${query}"`;
        }
      } else {
        // Fallback: Abrir YouTube directamente
        console.log('⚠️ API de búsqueda no disponible, abriendo YouTube...');
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
      const card = document.createElement('div');
      card.className = 'music-card search-result-card';
      card.setAttribute('data-video-id', video.videoId);
      
      const artistName = video.channel || video.artist || 'YouTube';
      const videoTitle = video.title || 'Sin título';
      const videoId = video.videoId || '';
      
      // Thumbnail con fallback
      const thumbnailSrc = video.thumbnail && video.thumbnail.startsWith('http')
        ? video.thumbnail
        : (videoId ? `https://i.ytimg.com/vi/${videoId}/maxresdefault.jpg` : './assets/img/icon.png');
      
      card.innerHTML = `
        <div class="card-image">
          <img class="card-img" src="${thumbnailSrc}" 
               onerror="this.onerror=null; this.src='https://i.ytimg.com/vi/${videoId}/hqdefault.jpg'; this.onerror=function(){this.src='./assets/img/icon.png'};"
               alt="${videoTitle}" loading="lazy">
          <div class="card-overlay">
            <button class="play-card-btn"><i class="fas fa-play"></i></button>
          </div>
          ${video.duration ? `<span class="card-duration">${video.duration}</span>` : ''}
        </div>
        <div class="card-info">
          <p class="card-title" title="${videoTitle}">${videoTitle}</p>
          <p class="card-artist" title="${artistName}">${artistName}</p>
          ${video.isVerified ? '<span class="channel-badge"><i class="fas fa-check-circle"></i> Artista oficial</span>' : ''}
        </div>
      `;
      
      // Click para reproducir
      card.addEventListener('click', () => {
        this.playVideo(video);
      });
      
      grid.appendChild(card);
    });
  }
  
  playVideo(video) {
    const videoTitle = video.title || 'Sin título';
    const artistName = video.channel || video.artist || 'YouTube';
    
    console.log('🎵 Reproduciendo desde búsqueda:', videoTitle);
    
    // Actualizar track actual
    if (window.appState) {
      window.appState.currentTrack = {
        videoId: video.videoId,
        title: videoTitle,
        artist: artistName,
        channel: artistName,
        thumbnail: video.thumbnail
      };
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
          console.log('✅ Ventana de YouTube cerrada');
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
