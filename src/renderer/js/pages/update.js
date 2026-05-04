// update.js: UI moderna de modal de actualizaciones
console.log('🚀 [UPDATE-UI] Script cargado correctamente');

let versions = [];
let selectedIdx = 0;

const themeMap = {
  rojo: { primary: '#E13838', hover: '#F04848', dark: '#C12828', rgb: '225, 56, 56' },
  naranja: { primary: '#F08C38', hover: '#FF9B37', dark: '#C26E24', rgb: '240, 140, 56' },
  magenta: { primary: '#A82DDC', hover: '#C74EE8', dark: '#8B23B1', rgb: '168, 45, 220' },
  rosado: { primary: '#FF5CAD', hover: '#FF7ED6', dark: '#C84382', rgb: '255, 92, 173' },
  verde: { primary: '#2BB33F', hover: '#4CD65C', dark: '#1F8A2D', rgb: '43, 179, 63' },
  amarillo: { primary: '#F5C82E', hover: '#F5D74F', dark: '#C7A423', rgb: '245, 200, 46' }
};

function applyStoredTheme() {
  try {
    const themeName = localStorage.getItem('seaxmusic_theme') || 'rojo';
    const theme = themeMap[themeName] || themeMap.rojo;
    document.documentElement.style.setProperty('--accent-primary', theme.primary);
    document.documentElement.style.setProperty('--accent-hover', theme.hover);
    document.documentElement.style.setProperty('--accent-dark', theme.dark);
    document.documentElement.style.setProperty('--accent-rgb', theme.rgb);
  } catch (e) {
    console.error('❌ [UPDATE-UI] Error aplicando tema:', e);
  }
}

function escapeHtml(text) {
  if (!text) return '';
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function formatMarkdownToHTML(text) {
  if (!text) return '';

  let html = escapeHtml(text)
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    .replace(/`(.+?)`/g, '<code>$1</code>')
    .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');

  html = html.replace(/(<li>.*?<\/li>)/gs, '<ul>$1</ul>');
  html = html.replace(/<\/ul>\s*<ul>/g, '');

  return `<p>${html}</p>`;
}

function normalizeReleaseNotes(releaseNotes, version) {
  const fallback = [{ version, notes: '<p>Sin notas de versión disponibles.</p>', date: '', commits: [] }];

  if (!releaseNotes) return fallback;
  if (Array.isArray(releaseNotes)) {
    if (releaseNotes.length === 0) return fallback;
    return releaseNotes.map((release) => ({
      version: release.version || version,
      notes: typeof release.notes === 'string' ? formatMarkdownToHTML(release.notes) : formatMarkdownToHTML(release.note || ''),
      date: release.date || '',
      commits: Array.isArray(release.commits) ? release.commits : [],
      releaseUrl: release.releaseUrl || ''
    }));
  }

  if (typeof releaseNotes === 'string') {
    return [{ version, notes: formatMarkdownToHTML(releaseNotes), date: '', commits: [], releaseUrl: '' }];
  }

  return fallback;
}

function renderCommitList(commits) {
  const commitList = document.getElementById('commit-list');
  const countLabel = document.getElementById('commit-count');

  if (!commitList) return;

  commitList.innerHTML = '';
  if (!commits || commits.length === 0) {
    if (countLabel) countLabel.textContent = '0 commits';
    commitList.innerHTML = '<div class="no-changelog">No se encontraron commits.</div>';
    return;
  }

  if (countLabel) countLabel.textContent = `${commits.length} commits`;

  commits.slice(0, 10).forEach((commit) => {
    const item = document.createElement('div');
    item.className = 'commit-item';
    item.innerHTML = `
      <div class="commit-message">${escapeHtml(commit.message)}</div>
      <div class="commit-meta">
        <span class="commit-author">${escapeHtml(commit.author || 'Vyran')}</span>
        <span class="commit-sha">${escapeHtml(commit.sha ? commit.sha.slice(0, 7) : '------')}</span>
      </div>
    `;
    commitList.appendChild(item);
  });
}

function renderSidebar(versions, selectedIdx) {
  const list = document.getElementById('version-list');
  if (!list) return;
  list.innerHTML = '';

  versions.forEach((v, i) => {
    const item = document.createElement('div');
    item.className = 'version-item' + (i === selectedIdx ? ' selected' : '');
    
    const badge = i === 0 ? '<span class="badge-new">NUEVO</span>' : '';
    item.innerHTML = `
      <div class="ver-main">v${escapeHtml(v.version)} ${badge}</div>
      <div class="ver-date">${escapeHtml(v.date || 'Hoy')}</div>
    `;

    item.onclick = () => selectVersion(i);
    list.appendChild(item);
  });
}

function renderMainPanel(v) {
  const title = document.getElementById('main-version-title');
  const date = document.getElementById('main-version-date');
  const changelog = document.getElementById('main-changelog');

  if (title) title.textContent = `Versión v${v.version}`;
  if (date) date.textContent = v.date || 'Publicado recientemente';
  if (changelog) {
    changelog.innerHTML = v.notes && v.notes.trim() ? v.notes : '<p>Mejoras de rendimiento y correcciones de errores.</p>';
  }
  
  renderCommitList(v.commits || []);
}

function selectVersion(idx) {
  selectedIdx = idx;
  renderSidebar(versions, selectedIdx);
  renderMainPanel(versions[selectedIdx]);
}

// Escuchar evento de info
if (window.updateAPI) {
  window.updateAPI.onInfo((info) => {
    console.log('📦 [UPDATE-UI] Datos recibidos:', info);
    applyStoredTheme();

    versions = normalizeReleaseNotes(info.releaseNotes, info.version);
    
    // Asegurar que info.version esté en la lista
    if (!versions.find(v => v.version === info.version)) {
        versions.unshift({
            version: info.version,
            notes: '<p>Actualización de sistema disponible.</p>',
            date: info.releaseDate ? info.releaseDate.split('T')[0] : '',
            commits: info.commitList || []
        });
    }

    renderSidebar(versions, 0);
    renderMainPanel(versions[0]);
  });
}

document.getElementById('install-btn')?.addEventListener('click', () => {
  window.updateAPI?.install();
});

document.getElementById('later-btn')?.addEventListener('click', () => {
  window.updateAPI?.later();
});

// Fallback inicial por si tarda la info
document.addEventListener('DOMContentLoaded', () => {
    applyStoredTheme();
    console.log('✅ [UPDATE-UI] DOM cargado');
});
