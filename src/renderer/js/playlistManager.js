// Playlist Manager - Crear y gestionar playlists

class PlaylistManager {
  constructor() {
    this.playlists = [];
    this.activePlaylistId = null;
    this.modalMode = 'create';
    this.editingId = null;
    this.sequence = null;
    this.searchTimer = null;
    this.searchQuery = '';
    this.searchResults = [];
    this.searchLoading = false;
    this.init();
  }

  init() {
    this.bindModal();
    this.loadSidebarSection();
    this.syncGlobalFromLocal();
  }

  async loadSidebarSection() {
    const slot = document.getElementById('playlistSidebarSlot');
    if (!slot) return;
    try {
      const response = await fetch('./html/playlist-sidebar.html');
      const html = await response.text();
      slot.innerHTML = html;
    } catch (e) {
      slot.innerHTML = `
        <div class="playlist-section">
          <h3>Playlists</h3>
          <div class="playlist-actions">
            <button class="playlist-create-btn" id="createPlaylistBtn">
              <i class="fas fa-plus"></i>
              Nueva playlist
            </button>
          </div>
          <div class="playlist-list"></div>
        </div>
      `;
    }
    this.bindSidebarCreate();
    this.refreshSidebar();
  }

  bindSidebarCreate() {
    const createBtn = document.getElementById('createPlaylistBtn');
    if (createBtn) {
      createBtn.addEventListener('click', () => this.openModal());
    }
  }

  bindModal() {
    const modal = document.getElementById('playlistModal');
    const closeBtn = document.getElementById('playlistModalClose');
    const cancelBtn = document.getElementById('playlistModalCancel');
    const saveBtn = document.getElementById('playlistModalSave');
    const nameInput = document.getElementById('playlistNameInput');
    const descInput = document.getElementById('playlistDescInput');
    const logoInput = document.getElementById('playlistLogoInput');
    const logoFile = document.getElementById('playlistLogoFile');
    const coverUpload = document.querySelector('.playlist-cover-upload');

    if (!modal) return;

    closeBtn?.addEventListener('click', () => this.closeModal());
    cancelBtn?.addEventListener('click', () => this.closeModal());
    modal.addEventListener('click', (e) => {
      if (e.target === modal) this.closeModal();
    });

    nameInput?.addEventListener('input', () => this.updatePreview());
    descInput?.addEventListener('input', () => this.updatePreview());
    logoInput?.addEventListener('input', () => this.updatePreview());

    // ⭐ Click en el cover upload abre el selector de archivos
    coverUpload?.addEventListener('click', () => {
      logoFile?.click();
    });

    logoFile?.addEventListener('change', (e) => {
      const file = e.target.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result;
        if (typeof result === 'string') {
          logoInput.value = result;
          this.updatePreview();
        }
      };
      reader.readAsDataURL(file);
    });

    saveBtn?.addEventListener('click', () => this.saveModal());
  }

  getUserKey() {
    try {
      const userData = localStorage.getItem('seaxmusic_user');
      if (!userData) return 'guest';
      const user = JSON.parse(userData);
      return this.buildUserKeyFromUser(user);
    } catch (e) {
      return 'guest';
    }
  }

  buildUserKeyFromUser(user) {
    if (!user) return 'guest';
    const name = (user.name || '').trim().toLowerCase();
    const email = (user.email || '').trim().toLowerCase();
    const handle = (user.handle || '').trim().toLowerCase();
    const stable = `${email}|${name}|${handle}`.replace(/\|+$/, '');
    if (stable && stable !== '||') return stable;
    const id = (user.id || '').toString().trim();
    return id || 'guest';
  }

  getStorageKeyForUser(user) {
    const key = this.buildUserKeyFromUser(user);
    return `seaxmusic_playlists_${this.hashKey(key)}`;
  }

  getCurrentUser() {
    try {
      const userData = localStorage.getItem('seaxmusic_user');
      return userData ? JSON.parse(userData) : null;
    } catch (e) {
      return null;
    }
  }

  getCurrentStorageKey() {
    return this.getStorageKeyForUser(this.getCurrentUser());
  }

  hashKey(value) {
    let hash = 0;
    for (let i = 0; i < value.length; i++) {
      hash = (hash << 5) - hash + value.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash).toString(16);
  }

  getStorageKey() {
    return this.getCurrentStorageKey();
  }

  loadPlaylists() {
    try {
      const data = localStorage.getItem(this.getStorageKey());
      this.playlists = data ? JSON.parse(data) : [];
      this.playlists = this.playlists.map(p => ({
        likedBy: p.likedBy || [],
        likeCount: p.likeCount || 0,
        creator: p.creator || this.getCurrentUserProfile(),
        ...p
      }));
    } catch (e) {
      this.playlists = [];
    }
    return this.playlists;
  }

  savePlaylists() {
    localStorage.setItem(this.getStorageKey(), JSON.stringify(this.playlists));
  }

  syncGlobalFromLocal() {
    this.loadPlaylists();
    this.playlists.forEach(playlist => {
      if (!playlist.globalId) {
        playlist.globalId = `gpl_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
      }
      if (!playlist.creator) {
        playlist.creator = this.getCurrentUserProfile();
      }
      if (!Array.isArray(playlist.likedBy)) playlist.likedBy = [];
      if (typeof playlist.likeCount !== 'number') playlist.likeCount = playlist.likedBy.length;
      this.upsertGlobalPlaylist(playlist);
    });
    this.savePlaylists();
  }

  getGlobalPlaylists() {
    try {
      const raw = localStorage.getItem('seaxmusic_global_playlists');
      const list = raw ? JSON.parse(raw) : [];
      return list.map(p => ({
        likedBy: p.likedBy || [],
        likeCount: p.likeCount || (p.likedBy ? p.likedBy.length : 0),
        ...p
      }));
    } catch (e) {
      return [];
    }
  }

  saveGlobalPlaylists(playlists) {
    localStorage.setItem('seaxmusic_global_playlists', JSON.stringify(playlists));
  }

  getCurrentUserProfile() {
    const user = this.getCurrentUser();
    if (!user) return { key: 'guest', name: 'Usuario', avatar: '' };
    return {
      key: this.buildUserKeyFromUser(user),
      name: user.name || 'Usuario',
      avatar: user.avatar || ''
    };
  }

  upsertGlobalPlaylist(playlist) {
    const global = this.getGlobalPlaylists();
    const idx = global.findIndex(p => p.globalId === playlist.globalId);
    const payload = { ...playlist };
    if (idx === -1) {
      global.unshift(payload);
    } else {
      global[idx] = payload;
    }
    this.saveGlobalPlaylists(global);
  }

  isPlaylistLiked(playlist) {
    const user = this.getCurrentUserProfile();
    const likedBy = playlist.likedBy || [];
    return likedBy.includes(user.key);
  }

  togglePlaylistLike(playlist) {
    const user = this.getCurrentUserProfile();
    const global = this.getGlobalPlaylists();
    const idx = global.findIndex(p => p.globalId === playlist.globalId);
    if (idx === -1) return;
    const likedBy = new Set(global[idx].likedBy || []);
    if (likedBy.has(user.key)) {
      likedBy.delete(user.key);
    } else {
      likedBy.add(user.key);
    }
    global[idx].likedBy = Array.from(likedBy);
    global[idx].likeCount = global[idx].likedBy.length;
    this.saveGlobalPlaylists(global);
  }

  getPlaylistCoverHtml(playlist, size = 'medium') {
    const sizeClass = size === 'large' ? 'playlist-cover-large' : 
                      size === 'small' ? 'playlist-cover-small' : 'playlist-cover-medium';
    
    // Si tiene logo como collage JSON
    if (playlist.logo?.startsWith('{')) {
      try {
        const parsed = JSON.parse(playlist.logo);
        if (parsed.type === 'collage' && parsed.images?.length >= 4) {
          return `<div class="playlist-cover-collage ${sizeClass}">
            ${parsed.images.slice(0, 4).map(src => `<img src="${src}" alt="">`).join('')}
          </div>`;
        } else if (parsed.images?.length > 0) {
          return `<img src="${parsed.images[0]}" alt="" class="${sizeClass}">`;
        }
      } catch (e) {}
    }
    
    // Si tiene logo normal
    if (playlist.logo) {
      return `<img src="${playlist.logo}" alt="" class="${sizeClass}">`;
    }
    
    // Generar collage de los primeros 4 tracks
    if (playlist.tracks && playlist.tracks.length >= 4) {
      const thumbs = playlist.tracks.slice(0, 4).map(t => 
        t.thumbnail || `https://i.ytimg.com/vi/${t.videoId}/hqdefault.jpg`
      );
      return `<div class="playlist-cover-collage ${sizeClass}">
        ${thumbs.map(src => `<img src="${src}" alt="">`).join('')}
      </div>`;
    }
    
    // Fallback: primera imagen o icono
    if (playlist.tracks?.length > 0) {
      const thumb = playlist.tracks[0].thumbnail || `https://i.ytimg.com/vi/${playlist.tracks[0].videoId}/hqdefault.jpg`;
      return `<img src="${thumb}" alt="" class="${sizeClass}">`;
    }
    
    return `<div class="${sizeClass} playlist-cover-empty"><i class="fas fa-music"></i></div>`;
  }

  openModal(playlist = null) {
    const modal = document.getElementById('playlistModal');
    const title = document.getElementById('playlistModalTitle');
    const nameInput = document.getElementById('playlistNameInput');
    const descInput = document.getElementById('playlistDescInput');
    const logoInput = document.getElementById('playlistLogoInput');
    const logoFile = document.getElementById('playlistLogoFile');

    if (!modal) return;

    this.modalMode = playlist ? 'edit' : 'create';
    this.editingId = playlist ? playlist.id : null;

    if (title) title.textContent = playlist ? 'Editar playlist' : 'Nueva playlist';
    if (nameInput) nameInput.value = playlist?.name || '';
    if (descInput) descInput.value = playlist?.description || '';
    if (logoInput) logoInput.value = playlist?.logo || '';
    if (logoFile) logoFile.value = '';

    this.updatePreview();
    modal.classList.add('active');
  }

  closeModal() {
    const modal = document.getElementById('playlistModal');
    modal?.classList.remove('active');
  }

  updatePreview() {
    const nameInput = document.getElementById('playlistNameInput');
    const descInput = document.getElementById('playlistDescInput');
    const logoInput = document.getElementById('playlistLogoInput');
    const previewTitle = document.getElementById('playlistPreviewTitle');
    const previewCover = document.getElementById('playlistLogoPreview');
    const previewSubtitle = document.querySelector('.playlist-preview-subtitle');
    const previewMiniCover = document.querySelector('.preview-cover-mini');

    if (previewTitle) {
      previewTitle.textContent = nameInput?.value?.trim() || 'Nombre de la playlist';
    }
    if (previewSubtitle) {
      previewSubtitle.textContent = descInput?.value?.trim() || 'Lista personalizada';
    }

    const logo = logoInput?.value?.trim();
    
    // Update main cover preview
    if (previewCover) {
      if (logo) {
        previewCover.innerHTML = `<img src="${logo}" alt="">`;
      } else {
        previewCover.innerHTML = '<i class="fas fa-music"></i>';
      }
    }
    
    // Update mini cover preview in preview card
    if (previewMiniCover) {
      if (logo) {
        previewMiniCover.innerHTML = `<img src="${logo}" alt="">`;
      } else {
        previewMiniCover.innerHTML = '<i class="fas fa-music"></i>';
      }
    }
  }

  saveModal() {
    const nameInput = document.getElementById('playlistNameInput');
    const descInput = document.getElementById('playlistDescInput');
    const logoInput = document.getElementById('playlistLogoInput');

    const name = nameInput?.value?.trim();
    if (!name) {
      alert('Pon un nombre para la playlist');
      return;
    }

    const logo = logoInput?.value?.trim() || '';
    const description = descInput?.value?.trim() || '';

    this.loadPlaylists();

    if (this.modalMode === 'edit' && this.editingId) {
      const idx = this.playlists.findIndex(p => p.id === this.editingId);
      if (idx !== -1) {
        this.playlists[idx].name = name;
        this.playlists[idx].logo = logo;
        this.playlists[idx].description = description;
        this.playlists[idx].updatedAt = new Date().toISOString();
        this.upsertGlobalPlaylist(this.playlists[idx]);
      }
    } else {
      const creator = this.getCurrentUserProfile();
      this.playlists.unshift({
        id: `pl_${Date.now()}`,
        globalId: `gpl_${Date.now()}`,
        name,
        logo,
        description,
        creator,
        likedBy: [],
        likeCount: 0,
        tracks: [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      });
      this.upsertGlobalPlaylist(this.playlists[0]);
    }

    this.savePlaylists();
    this.refreshSidebar();
    this.closeModal();

    if (this.modalMode === 'create') {
      const created = this.playlists[0];
      if (created) {
        this.showPlaylist(created.id);
      }
    } else if (this.editingId) {
      this.showPlaylist(this.editingId);
    }
  }

  refreshSidebar() {
    this.loadPlaylists();
    const list = document.querySelector('.playlist-list');
    if (!list) return;

    list.innerHTML = '';

    if (this.playlists.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'playlist-item';
      empty.textContent = 'Sin playlists';
      empty.style.opacity = '0.6';
      list.appendChild(empty);
      return;
    }

    this.playlists.forEach(playlist => {
      const item = document.createElement('div');
      item.className = 'playlist-item playlist-item-row';
      item.innerHTML = `
        <div class="playlist-item-cover">
          ${this.getPlaylistCoverHtml(playlist, 'small')}
        </div>
        <span>${playlist.name}</span>
      `;
      item.addEventListener('click', () => this.showPlaylist(playlist.id));
      list.appendChild(item);
    });

    const likedPlaylists = this.getGlobalPlaylists().filter(pl => this.isPlaylistLiked(pl));
    if (likedPlaylists.length > 0) {
      const divider = document.createElement('div');
      divider.className = 'playlist-sidebar-divider';
      divider.textContent = 'Playlists que te gustan';
      list.appendChild(divider);

      likedPlaylists.forEach(playlist => {
        const item = document.createElement('div');
        item.className = 'playlist-item playlist-item-row';
        item.innerHTML = `
          <div class="playlist-item-cover">
            ${this.getPlaylistCoverHtml(playlist, 'small')}
          </div>
          <span>${playlist.name}</span>
        `;
        item.addEventListener('click', () => this.showPlaylist(playlist.globalId || playlist.id));
        list.appendChild(item);
      });
    }

    if (document.querySelector('.playlists-page')) {
      this.renderPlaylistsHome();
    }
  }

  renderPlaylistsHome() {
    this.loadPlaylists();

    const userGrid = document.getElementById('userPlaylistsGrid');
    const userCount = document.getElementById('userPlaylistsCount');
    const userEmpty = document.getElementById('userPlaylistsEmpty');

    if (userCount) {
      userCount.textContent = `${this.playlists.length} playlists`;
    }

    if (userGrid) {
      userGrid.innerHTML = '';
      if (this.playlists.length === 0) {
        userEmpty?.classList.remove('hidden');
      } else {
        userEmpty?.classList.add('hidden');
        this.playlists.forEach(playlist => {
          const card = document.createElement('div');
          card.className = 'global-playlist-card playlist-user-card';
          const coverHtml = this.getPlaylistCoverHtml(playlist, 'large');
          const likeCount = playlist.likeCount || 0;
          const creatorName = playlist.creator?.name || 'Tu';
          const trackCount = (playlist.tracks || []).length;

          card.innerHTML = `
            <div class="global-playlist-cover">
              ${coverHtml}
              <div class="global-like-count">${trackCount} canciones</div>
            </div>
            <div class="global-playlist-info">
              <div class="global-playlist-title">${playlist.name}</div>
              <div class="playlist-card-meta">
                <span>${creatorName}</span>
                <span class="likes"><i class="fas fa-heart"></i> ${likeCount}</span>
              </div>
            </div>
          `;

          card.addEventListener('click', () => {
            this.showPlaylist(playlist.id);
          });

          userGrid.appendChild(card);
        });
      }
    }

    if (window.libraryManager?.renderGlobalPlaylists) {
      window.libraryManager.renderGlobalPlaylists();
    }
  }

  showPlaylist(id) {
    this.loadPlaylists();
    let playlist = this.playlists.find(p => p.id === id);
    let isGlobal = false;
    if (!playlist) {
      const global = this.getGlobalPlaylists();
      playlist = global.find(p => p.globalId === id || p.id === id);
      isGlobal = !!playlist;
    }
    if (!playlist) return;

    this.activePlaylistId = id;

    if (window.navigationHistory) {
      window.navigationHistory.navigateTo('playlists');
    }
    document.querySelectorAll('.nav-item').forEach(item => {
      item.classList.remove('active');
      if (item.textContent.includes('Playlists')) {
        item.classList.add('active');
      }
    });

    const contentArea = document.querySelector('.content-area');
    if (!contentArea) return;

    const count = playlist.tracks.length;
    const description = playlist.description || 'Lista personalizada';
    const globalMatch = playlist.globalId
      ? this.getGlobalPlaylists().find(p => p.globalId === playlist.globalId)
      : null;
    const creator = playlist.creator || globalMatch?.creator || { name: 'Usuario', avatar: '' };
    const currentKey = this.getCurrentUserProfile().key;
    const isOwner = (creator.key || '') === currentKey;
    this.activeIsOwner = isOwner;
    const creatorAvatar = creator.avatar
      ? `<img src="${creator.avatar}" alt="">`
      : `<i class="fas fa-user"></i>`;
    const likeCount = globalMatch?.likeCount ?? playlist.likeCount ?? 0;
    const liked = globalMatch ? this.isPlaylistLiked(globalMatch) : this.isPlaylistLiked(playlist);

    // ⭐ Generar botones según permisos
    const ownerButtons = isOwner ? `
      <button class="playlist-action-btn ghost" id="playlistEdit"><i class="fas fa-pen"></i> Editar</button>
      <button class="playlist-action-btn ghost" id="playlistDelete"><i class="fas fa-trash"></i> Eliminar</button>
    ` : '';
    
    // ⭐ Botón de like solo si NO es dueño
    const likeButton = !isOwner ? `
      <button class="playlist-like-btn ${liked ? 'liked' : ''}" id="playlistLikeBtn" title="Me gusta esta playlist">
        <i class="${liked ? 'fas' : 'far'} fa-heart"></i>
        <span>${likeCount}</span>
      </button>
    ` : `<span class="playlist-like-count"><i class="fas fa-heart"></i> ${likeCount}</span>`;
    
    // ⭐ Panel de agregar solo para dueños
    const addPanelHtml = isOwner ? `
      <div class="playlist-add-panel">
        <h3>Agregar canciones</h3>
        <div class="playlist-form-group">
          <input type="text" id="playlistAddSearch" placeholder="Buscar en favoritos e historial">
        </div>
        <div class="playlist-add-list" id="playlistAddList"></div>
      </div>
    ` : '';
    
    // ⭐ Botón agregar actual solo para dueños
    const addCurrentBtn = isOwner ? `
      <button class="playlist-action-btn ghost" id="playlistAddCurrent"><i class="fas fa-plus"></i> Agregar actual</button>
    ` : '';

    contentArea.innerHTML = `
      <div class="playlist-page">
        <div class="playlist-hero">
          <div class="playlist-hero-cover">
            ${this.getPlaylistCoverHtml(playlist, 'large')}
          </div>
          <div class="playlist-hero-info">
            <span class="home-hero-greeting">Playlist</span>
            <h1>${playlist.name}</h1>
            <p>${description} • ${count} canciones</p>
            <div class="playlist-creator">
              <span class="creator-avatar">${creatorAvatar}</span>
              <span class="creator-name">Creada por ${creator.name || 'Usuario'}</span>
              ${likeButton}
            </div>
            <div class="playlist-hero-actions">
              <button class="playlist-action-btn primary" id="playlistPlay"><i class="fas fa-play"></i> Reproducir</button>
              <button class="playlist-action-btn ghost" id="playlistShuffle"><i class="fas fa-random"></i> Aleatorio</button>
              ${ownerButtons}
              <button class="playlist-action-btn ghost" id="playlistCopy"><i class="fas fa-copy"></i> Copiar</button>
            </div>
          </div>
        </div>

        <div class="playlist-content ${!isOwner ? 'full-width' : ''}">
          <div class="playlist-tracks">
            <div class="playlist-tracks-header">
              <h3>Canciones</h3>
              ${addCurrentBtn}
            </div>
            <div class="playlist-track-list" id="playlistTrackList"></div>
          </div>
          ${addPanelHtml}
        </div>
      </div>
    `;

    this.renderPlaylistTracks(playlist);
    if (isOwner) {
      this.renderAddCandidates(playlist);
    }
    this.bindPlaylistActions(playlist, isOwner);
  }
  bindPlaylistActions(playlist, isOwner = false) {
    document.getElementById('playlistPlay')?.addEventListener('click', () => this.playPlaylist(playlist, false));
    document.getElementById('playlistShuffle')?.addEventListener('click', () => this.playPlaylist(playlist, true));
    document.getElementById('playlistCopy')?.addEventListener('click', () => this.openCopyModal(playlist));
    
    // ⭐ Like de playlist - solo si NO es dueño
    if (!isOwner) {
      document.getElementById('playlistLikeBtn')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.togglePlaylistLike(playlist);
        this.refreshSidebar();
        this.showPlaylist(playlist.id);
      });
    }
    
    // ⭐ Acciones de dueño
    if (isOwner) {
      document.getElementById('playlistEdit')?.addEventListener('click', () => this.openModal(playlist));
      document.getElementById('playlistDelete')?.addEventListener('click', () => this.deletePlaylist(playlist.id));
      document.getElementById('playlistAddCurrent')?.addEventListener('click', () => {
        if (window.appState && window.appState.currentTrack) {
          this.addTrackToPlaylist(playlist.id, window.appState.currentTrack);
        }
      });

      const searchInput = document.getElementById('playlistAddSearch');
      if (searchInput) {
        searchInput.addEventListener('input', () => {
          const query = searchInput.value.trim();
          this.searchQuery = query;
          if (this.searchTimer) clearTimeout(this.searchTimer);
          this.searchTimer = setTimeout(() => {
            if (query.length >= 2) {
              this.searchYouTubeForPlaylist(query, playlist);
            } else {
              this.searchResults = [];
              this.searchLoading = false;
              this.renderAddCandidates(playlist);
            }
          }, 350);
        });
      }
    }
  }

  deletePlaylist(id) {
    if (!confirm('¿Eliminar esta playlist?')) return;
    this.loadPlaylists();
    const removed = this.playlists.find(p => p.id === id);
    this.playlists = this.playlists.filter(p => p.id !== id);
    this.savePlaylists();
    if (removed?.globalId) {
      const global = this.getGlobalPlaylists().filter(p => p.globalId !== removed.globalId);
      this.saveGlobalPlaylists(global);
    }
    this.refreshSidebar();
    if (window.navigationHistory) {
      window.navigationHistory.loadPage('home', false);
    }
  }

  openCopyModal(playlist) {
    const modal = document.getElementById('playlistCopyModal');
    const list = document.getElementById('playlistCopyList');
    const closeBtn = document.getElementById('playlistCopyClose');
    const cancelBtn = document.getElementById('playlistCopyCancel');
    if (!modal || !list) return;

    list.innerHTML = '';
    const accounts = this.getAccountsList();
    const currentKey = this.getStorageKey();

    if (accounts.length === 0) {
      list.innerHTML = `<div class="playlist-empty-state">No hay cuentas destino disponibles.</div>`;
    } else {
      accounts.forEach(acc => {
        const targetKey = this.getStorageKeyForUser(acc.user);
        const disabled = targetKey === currentKey;
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
            <button class="account-use-btn" ${disabled ? 'disabled' : ''}>Copiar</button>
          </div>
        `;
        item.querySelector('.account-use-btn')?.addEventListener('click', () => {
          this.copyPlaylistToAccount(playlist, acc.user);
          modal.classList.remove('active');
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

  getAccountsList() {
    try {
      const raw = localStorage.getItem('seaxmusic_accounts');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }

  copyPlaylistToAccount(playlist, user) {
    if (!playlist || !user) return;
    const targetKey = this.getStorageKeyForUser(user);
    let targetPlaylists = [];
    try {
      const raw = localStorage.getItem(targetKey);
      targetPlaylists = raw ? JSON.parse(raw) : [];
    } catch (e) {
      targetPlaylists = [];
    }
    targetPlaylists.unshift({
      ...playlist,
      id: `pl_${Date.now()}`,
      name: `${playlist.name} (copia)`,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    });
    localStorage.setItem(targetKey, JSON.stringify(targetPlaylists));
  }

  renderPlaylistTracks(playlist) {
    const list = document.getElementById('playlistTrackList');
    if (!list) return;

    list.innerHTML = '';

    if (playlist.tracks.length === 0) {
      list.innerHTML = `<div class="playlist-empty-state">Aún no hay canciones en esta playlist.</div>`;
      return;
    }

    const isOwner = !!this.activeIsOwner;
    playlist.tracks.forEach((track, index) => {
      const item = document.createElement('div');
      item.className = 'playlist-track-item';
      if (isOwner) {
        item.setAttribute('draggable', 'true');
      }
      item.dataset.index = index;
      
      // ⭐ Verificar favorito de forma segura
      const liked = window.favoritesManager?.isFavorite?.(track.videoId) || false;
      
      item.innerHTML = `
        <div class="playlist-track-drag ${isOwner ? '' : 'disabled'}"><i class="fas fa-grip-vertical"></i></div>
        <div class="playlist-track-cover"><img src="${track.thumbnail || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`}" alt=""></div>
        <div class="playlist-track-info">
          <span class="playlist-track-title">${track.title || 'Sin título'}</span>
          <span class="playlist-track-artist">${track.artist || track.channel || 'YouTube'}</span>
        </div>
        <div class="playlist-track-duration">${track.duration || ''}</div>
        <div class="playlist-track-actions">
          <button class="playlist-like-btn ${liked ? 'liked' : ''}" title="Me gusta">
            <i class="${liked ? 'fas' : 'far'} fa-heart"></i>
          </button>
          <button data-action="remove" ${isOwner ? '' : 'disabled'}><i class="fas fa-times"></i></button>
        </div>
      `;
      
      // ⭐ Click handler para like con actualización visual inmediata
      const likeBtn = item.querySelector('.playlist-like-btn');
      likeBtn?.addEventListener('click', async (e) => {
        e.stopPropagation();
        if (!window.favoritesManager) return;
        
        const isLiked = await window.favoritesManager.toggleFavorite(track);
        
        // Actualizar botón visual
        likeBtn.classList.toggle('liked', isLiked);
        const icon = likeBtn.querySelector('i');
        if (icon) {
          icon.className = isLiked ? 'fas fa-heart' : 'far fa-heart';
        }
        
        // Sincronizar con otros lugares
        if (window.musicPlayer?.updateLikeButton) {
          window.musicPlayer.updateLikeButton();
        }
        if (window.nowPlayingManager?.updateLikeButton) {
          window.nowPlayingManager.updateLikeButton();
        }
        if (window.libraryManager?.refresh) {
          window.libraryManager.refresh();
        }
      });
      
      item.querySelector('[data-action="remove"]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        if (isOwner) this.removeTrackFromPlaylist(playlist.id, track.videoId);
      });
      
      // ⭐ Click en el track para reproducir desde esa posición
      item.addEventListener('click', (e) => {
        // Evitar reproducir si se hizo click en botones
        if (e.target.closest('button') || e.target.closest('.playlist-track-actions')) return;
        this.playTrackFromPlaylist(playlist, index);
      });
      
      if (isOwner) {
        item.addEventListener('dragstart', (e) => this.handleDragStart(e));
        item.addEventListener('dragover', (e) => this.handleDragOver(e));
        item.addEventListener('drop', (e) => this.handleDrop(e, playlist.id));
        item.addEventListener('dragend', (e) => this.handleDragEnd(e));
      }
      list.appendChild(item);
    });
  }

  renderAddCandidates(playlist) {
    const list = document.getElementById('playlistAddList');
    if (!list) return;

    const query = (document.getElementById('playlistAddSearch')?.value || '').trim().toLowerCase();
    let candidates = [];

    if (query.length >= 2 && this.searchResults.length > 0) {
      candidates = this.searchResults;
    } else if (query.length >= 2 && this.searchLoading) {
      list.innerHTML = `<div class="playlist-empty-state">Buscando en YouTube...</div>`;
      return;
    } else {
      const favorites = (window.appState?.favorites || []);
      const history = (window.appState?.recentHistory || []);
      candidates = [...favorites, ...history].filter(track => track?.videoId);
    }

    list.innerHTML = '';

    if (candidates.length === 0) {
      list.innerHTML = `<div class="playlist-empty-state">No hay canciones para agregar.</div>`;
      return;
    }

    candidates.slice(0, 20).forEach(track => {
      const exists = playlist.tracks.some(t => t.videoId === track.videoId);
      const item = document.createElement('div');
      item.className = 'playlist-add-item';
      item.innerHTML = `
        <img src="${track.thumbnail || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`}" alt="">
        <div>
          <div class="playlist-track-title">${track.title || 'Sin título'}</div>
          <div class="playlist-track-artist">${track.artist || track.channel || 'YouTube'}</div>
        </div>
        <button ${exists ? 'disabled' : ''}><i class="fas fa-plus"></i></button>
      `;
      item.querySelector('button')?.addEventListener('click', () => this.addTrackToPlaylist(playlist.id, track));
      list.appendChild(item);
    });
  }

  async searchYouTubeForPlaylist(query, playlist) {
    if (!window.electronAPI?.searchYouTube) return;
    this.searchLoading = true;
    this.searchResults = [];
    this.renderAddCandidates(playlist);
    try {
      const response = await window.electronAPI.searchYouTube(query);
      if (response?.success && Array.isArray(response.videos)) {
        this.searchResults = response.videos.map(video => ({
          videoId: video.videoId,
          title: video.title,
          artist: video.channel || video.artist || 'YouTube',
          channel: video.channel || video.artist || 'YouTube',
          thumbnail: video.thumbnail,
          duration: video.duration || ''
        }));
      }
    } catch (e) {
      console.error('[PLAYLIST] Error buscando en YouTube:', e);
    } finally {
      this.searchLoading = false;
      this.renderAddCandidates(playlist);
    }
  }

  addTrackToPlaylist(playlistId, track) {
    if (!track || !track.videoId) return;

    this.loadPlaylists();
    const playlist = this.playlists.find(p => p.id === playlistId);
    if (!playlist) return;

    if (playlist.tracks.some(t => t.videoId === track.videoId)) return;

    playlist.tracks.push({
      videoId: track.videoId,
      title: track.title || 'Sin título',
      artist: track.artist || track.channel || 'YouTube',
      channel: track.channel || track.artist || 'YouTube',
      thumbnail: track.thumbnail || '',
      duration: track.duration || ''
    });
    playlist.updatedAt = new Date().toISOString();

    this.savePlaylists();
    this.upsertGlobalPlaylist(playlist);
    this.refreshSidebar();
    this.showPlaylist(playlistId);
  }

  removeTrackFromPlaylist(playlistId, videoId) {
    this.loadPlaylists();
    const playlist = this.playlists.find(p => p.id === playlistId);
    if (!playlist) return;

    playlist.tracks = playlist.tracks.filter(track => track.videoId !== videoId);
    playlist.updatedAt = new Date().toISOString();

    this.savePlaylists();
    this.upsertGlobalPlaylist(playlist);
    this.refreshSidebar();
    this.showPlaylist(playlistId);
  }

  handleDragStart(e) {
    const item = e.target.closest('.playlist-track-item');
    if (!item) return;
    item.classList.add('dragging');
    e.dataTransfer.setData('text/plain', item.dataset.index);
    e.dataTransfer.effectAllowed = 'move';
  }

  handleDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  }

  handleDrop(e, playlistId) {
    e.preventDefault();
    const fromIndex = parseInt(e.dataTransfer.getData('text/plain'), 10);
    const target = e.target.closest('.playlist-track-item');
    if (!target) return;
    const toIndex = parseInt(target.dataset.index, 10);
    if (Number.isNaN(fromIndex) || Number.isNaN(toIndex) || fromIndex === toIndex) return;

    this.loadPlaylists();
    const playlist = this.playlists.find(p => p.id === playlistId);
    if (!playlist) return;

    const [moved] = playlist.tracks.splice(fromIndex, 1);
    playlist.tracks.splice(toIndex, 0, moved);
    playlist.updatedAt = new Date().toISOString();

    this.savePlaylists();
    this.upsertGlobalPlaylist(playlist);
    this.refreshSidebar();
    this.showPlaylist(playlistId);
  }

  handleDragEnd(e) {
    const item = e.target.closest('.playlist-track-item');
    if (item) item.classList.remove('dragging');
  }

  playPlaylist(playlist, shuffle = false) {
    if (!playlist || playlist.tracks.length === 0) return;

    let queue = [...playlist.tracks];
    if (shuffle) {
      for (let i = queue.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [queue[i], queue[j]] = [queue[j], queue[i]];
      }
    }

    if (window.setPlayQueue) {
      window.setPlayQueue(queue, 0);
    }

    this.setSequenceFromPlaylist(playlist);
    
    // ⭐ Guardar info de playlist actual para cover y Discord
    this.currentPlayingPlaylist = playlist;

    const first = queue[0];
    
    // ⭐ Obtener cover de la playlist
    const playlistCover = this.getPlaylistCover(playlist);
    
    // ⭐ Crear info de playlist para enviar a main
    const playlistInfo = {
      name: playlist.name,
      cover: playlistCover,
      id: playlist.id || playlist.globalId
    };
    
    // ⭐ Actualizar UI del reproductor con info de playlist
    this.updatePlayerUIForPlaylist(first, playlistInfo);
    
    if (window.electronAPI) {
      // ⭐ Establecer playlist actual
      if (window.electronAPI.setCurrentPlaylist) {
        window.electronAPI.setCurrentPlaylist(playlistInfo);
      }
      
      // ⭐ Reproducir con info de playlist
      if (window.electronAPI.playAudioWithPlaylist) {
        window.electronAPI.playAudioWithPlaylist(
          `https://www.youtube.com/watch?v=${first.videoId}`,
          first.title || 'Sin título',
          first.artist || first.channel || 'YouTube',
          playlistInfo
        );
      } else if (window.electronAPI.playAudio) {
        window.electronAPI.playAudio(
          `https://www.youtube.com/watch?v=${first.videoId}`,
          first.title || 'Sin título',
          first.artist || first.channel || 'YouTube'
        );
      }
    }
  }
  
  // ⭐ Obtener URL del cover de la playlist (soporta collage JSON)
  getPlaylistCover(playlist) {
    if (playlist.logo) {
      // Si es un JSON de collage, extraer la primera imagen
      if (playlist.logo.startsWith('{')) {
        try {
          const parsed = JSON.parse(playlist.logo);
          if (parsed.type === 'collage' && parsed.images?.length > 0) {
            return parsed.images[0];
          }
        } catch (e) {}
      }
      return playlist.logo;
    }
    // Usar thumbnail del primer track como fallback
    if (playlist.tracks && playlist.tracks.length > 0) {
      const firstTrack = playlist.tracks[0];
      return firstTrack.thumbnail || `https://i.ytimg.com/vi/${firstTrack.videoId}/hqdefault.jpg`;
    }
    return null;
  }
  
  // ⭐ Actualizar UI del reproductor para playlist
  updatePlayerUIForPlaylist(track, playlistInfo) {
    // Actualizar appState
    if (window.appState) {
      window.appState.currentTrack = {
        videoId: track.videoId,
        title: track.title,
        artist: track.artist || track.channel || 'YouTube',
        thumbnail: playlistInfo.cover || track.thumbnail || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`,
        playlistName: playlistInfo.name
      };
    }
    
    // Actualizar elementos del reproductor
    const trackNameEl = document.getElementById('trackName');
    const trackArtistEl = document.getElementById('trackArtist');
    const trackImageEl = document.getElementById('trackImage');
    
    if (trackNameEl) trackNameEl.textContent = track.title || 'Sin título';
    if (trackArtistEl) trackArtistEl.textContent = track.artist || track.channel || 'YouTube';
    
    // ⭐ Usar cover de playlist si está disponible
    if (trackImageEl && playlistInfo.cover) {
      trackImageEl.src = playlistInfo.cover;
    } else if (trackImageEl) {
      trackImageEl.src = track.thumbnail || `https://i.ytimg.com/vi/${track.videoId}/hqdefault.jpg`;
    }
    
    // Actualizar botón like
    if (window.updateLikeButton) {
      window.updateLikeButton();
    }
  }
  
  // ⭐ Reproducir un track específico de la playlist
  playTrackFromPlaylist(playlist, trackIndex) {
    if (!playlist || !playlist.tracks || trackIndex < 0 || trackIndex >= playlist.tracks.length) return;
    
    const queue = [...playlist.tracks];
    
    if (window.setPlayQueue) {
      window.setPlayQueue(queue, trackIndex);
    }
    
    this.setSequenceFromPlaylist(playlist);
    this.currentPlayingPlaylist = playlist;
    
    const track = queue[trackIndex];
    const playlistCover = this.getPlaylistCover(playlist);
    
    const playlistInfo = {
      name: playlist.name,
      cover: playlistCover,
      id: playlist.id || playlist.globalId
    };
    
    // ⭐ Actualizar UI del reproductor
    this.updatePlayerUIForPlaylist(track, playlistInfo);
    
    if (window.electronAPI) {
      if (window.electronAPI.setCurrentPlaylist) {
        window.electronAPI.setCurrentPlaylist(playlistInfo);
      }
      
      if (window.electronAPI.playAudioWithPlaylist) {
        window.electronAPI.playAudioWithPlaylist(
          `https://www.youtube.com/watch?v=${track.videoId}`,
          track.title || 'Sin título',
          track.artist || track.channel || 'YouTube',
          playlistInfo
        );
      } else if (window.electronAPI.playAudio) {
        window.electronAPI.playAudio(
          `https://www.youtube.com/watch?v=${track.videoId}`,
          track.title || 'Sin título',
          track.artist || track.channel || 'YouTube'
        );
      }
    }
  }

  setSequenceFromPlaylist(playlist) {
    const userList = this.playlists.map(p => p.id);
    let index = userList.indexOf(playlist.id);
    let source = 'user';
    let list = userList;

    if (index === -1) {
      const global = this.getGlobalPlaylists();
      list = global.map(p => p.globalId || p.id);
      const key = playlist.globalId || playlist.id;
      index = list.indexOf(key);
      source = 'global';
    }

    if (index === -1) return;
    this.sequence = { list, index, source };
  }

  playNextPlaylistInSequence() {
    if (!this.sequence || !this.sequence.list.length) return false;
    const nextIndex = this.sequence.index + 1;
    if (nextIndex >= this.sequence.list.length) {
      this.sequence = null;
      return false;
    }
    const nextId = this.sequence.list[nextIndex];
    this.sequence.index = nextIndex;
    this.showPlaylist(nextId);
    const sourceList = this.sequence.source === 'global'
      ? this.getGlobalPlaylists()
      : this.playlists;
    const nextPlaylist = sourceList.find(p => (p.globalId || p.id) === nextId);
    if (!nextPlaylist || nextPlaylist.tracks.length === 0) return false;
    this.playPlaylist(nextPlaylist, false);
    return true;
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    window.playlistManager = new PlaylistManager();
  });
} else {
  window.playlistManager = new PlaylistManager();
}










