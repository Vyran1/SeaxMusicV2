class DevManager {
  async showDevPage(addToHistory = true) {
    const contentArea = document.querySelector('.content-area');
    if (!contentArea) return;

    if (addToHistory && window.navigationHistory) {
      window.navigationHistory.navigateTo('dev');
    }

    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

    try {
      const response = await fetch('./html/dev.html');
      const html = await response.text();
      contentArea.innerHTML = html;
      this.render();
    } catch (e) {
      contentArea.innerHTML = `<div class="playlist-empty-state">No se pudo cargar el panel dev.</div>`;
    }
  }

  render() {
    const favorites = window.appState?.favorites || [];
    const history = window.appState?.recentHistory || [];
    const accounts = this.getAccounts();
    const playlistManager = window.playlistManager;
    const localPlaylists = playlistManager?.loadPlaylists?.() || [];
    const globalPlaylists = playlistManager?.getGlobalPlaylists?.() || [];
    const djPlaylists = globalPlaylists.filter(p => p.isDJGenerated);

    this.setText('devFavoritesCount', favorites.length);
    this.setText('devHistoryCount', history.length);
    this.setText('devPlaylistsCount', localPlaylists.length);
    this.setText('devGlobalPlaylistsCount', globalPlaylists.length);
    this.setText('devDJCount', djPlaylists.length);
    this.setText('devAccountsCount', accounts.length);

    this.renderBars('devActivityBars', [favorites.length, history.length, localPlaylists.length, djPlaylists.length]);
    this.renderBars('devStorageBars', [globalPlaylists.length, accounts.length, localPlaylists.length, history.length]);

    this.renderDJList(djPlaylists);
    this.renderAccounts(accounts);
  }

  setText(id, value) {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  }

  renderBars(id, values) {
    const container = document.getElementById(id);
    if (!container) return;
    container.innerHTML = '';
    const max = Math.max(...values, 1);
    values.forEach(v => {
      const bar = document.createElement('div');
      bar.className = 'dev-bar';
      bar.style.height = `${Math.round((v / max) * 100)}%`;
      container.appendChild(bar);
    });
  }

  renderDJList(playlists) {
    const list = document.getElementById('devDJList');
    if (!list) return;
    list.innerHTML = '';

    if (!playlists.length) {
      list.innerHTML = `<div class="playlist-empty-state">No hay playlists DJ.</div>`;
      return;
    }

    playlists.forEach(pl => {
      const item = document.createElement('div');
      item.className = 'dev-list-item';
      item.innerHTML = `
        <div>
          <strong>${pl.name}</strong>
          <div style="font-size:12px; color: var(--text-secondary);">${(pl.tracks || []).length} canciones</div>
        </div>
        <div class="dev-list-actions">
          <button data-action="open">Abrir</button>
          <button data-action="delete">Eliminar</button>
        </div>
      `;

      item.querySelector('[data-action="open"]')?.addEventListener('click', () => {
        window.playlistManager?.showPlaylist?.(pl.globalId || pl.id);
      });
      item.querySelector('[data-action="delete"]')?.addEventListener('click', () => {
        if (!confirm('¿Eliminar esta playlist DJ?')) return;
        window.playlistManager?.deletePlaylistEverywhere?.(pl.globalId || pl.id);
        this.render();
      });

      list.appendChild(item);
    });
  }

  renderAccounts(accounts) {
    const list = document.getElementById('devAccountsList');
    if (!list) return;
    list.innerHTML = '';

    if (!accounts.length) {
      list.innerHTML = `<div class="playlist-empty-state">No hay cuentas guardadas.</div>`;
      return;
    }

    accounts.forEach(acc => {
      const item = document.createElement('div');
      item.className = 'dev-list-item';
      item.innerHTML = `
        <div>
          <strong>${acc.user?.name || 'Usuario'}</strong>
          <div style="font-size:12px; color: var(--text-secondary);">${acc.user?.email || acc.user?.handle || 'sin correo'}</div>
        </div>
        <div class="dev-list-actions">
          <button data-action="remove">Eliminar</button>
        </div>
      `;
      item.querySelector('[data-action="remove"]')?.addEventListener('click', () => {
        if (!confirm('¿Eliminar esta cuenta?')) return;
        const stored = this.getAccounts().filter(a => a.key !== acc.key);
        localStorage.setItem('seaxmusic_accounts', JSON.stringify(stored));
        this.render();
      });
      list.appendChild(item);
    });
  }

  getAccounts() {
    try {
      const raw = localStorage.getItem('seaxmusic_accounts');
      return raw ? JSON.parse(raw) : [];
    } catch (e) {
      return [];
    }
  }
}

window.devManager = new DevManager();
