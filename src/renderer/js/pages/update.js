
// update.js: UI moderna de modal de actualizaciones
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
  const themeName = localStorage.getItem('seaxmusic_theme') || 'rojo';
  const theme = themeMap[themeName] || themeMap.rojo;
  document.documentElement.style.setProperty('--accent-primary', theme.primary);
  document.documentElement.style.setProperty('--accent-hover', theme.hover);
  document.documentElement.style.setProperty('--accent-dark', theme.dark);
  document.documentElement.style.setProperty('--accent-rgb', theme.rgb);
  document.documentElement.style.setProperty('--accent-soft', `rgba(${theme.rgb}, 0.14)`);
  document.documentElement.style.setProperty('--accent-border', `rgba(${theme.rgb}, 0.28)`);
}

function escapeHtml(text) {
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

  if (typeof releaseNotes === 'object') {
    return [{
      version: releaseNotes.version || version,
      notes: formatMarkdownToHTML(releaseNotes.notes || releaseNotes.note || ''),
      date: releaseNotes.date || '',
      commits: Array.isArray(releaseNotes.commits) ? releaseNotes.commits : [],
      releaseUrl: releaseNotes.releaseUrl || ''
    }];
  }

  return fallback;
}

function renderCommitList(commits) {
  const commitList = document.getElementById('commit-list');
  const badge = document.getElementById('commit-badge');
  const countLabel = document.getElementById('commit-count');

  commitList.innerHTML = '';
  if (!commits || commits.length === 0) {
    badge.textContent = 'Sin commits disponibles';
    countLabel.textContent = '0 commits';
    commitList.innerHTML = '<div class="no-changelog">No se encontraron commits para esta versión.</div>';
    return;
  }

  badge.textContent = `${commits.length} commits`;
  countLabel.textContent = `${commits.length} commits`;

  commits.slice(0, 8).forEach((commit) => {
    const item = document.createElement('div');
    item.className = 'commit-item';
    item.innerHTML = `
      <div class="commit-message">${escapeHtml(commit.message)}</div>
      <div class="commit-meta">
        <span class="commit-author">${escapeHtml(commit.author || 'Desconocido')}</span>
        <span class="commit-sha">${escapeHtml(commit.sha ? commit.sha.slice(0, 8) : '------')}</span>
      </div>
      ${commit.url ? `<a class="commit-link" href="${escapeHtml(commit.url)}" target="_blank" rel="noopener">Ver commit</a>` : ''}
    `;
    commitList.appendChild(item);
  });
}

function renderSidebar(versions, selectedIdx) {
  const list = document.getElementById('version-list');
  list.innerHTML = '';

  versions.forEach((v, i) => {
    const item = document.createElement('div');
    item.className = 'version-item' + (i === selectedIdx ? ' selected' : '');
    item.tabIndex = 0;

    const badge = i === 0 ? '<span class="badge-new">NUEVO</span>' : '';
    item.innerHTML = `
      <div class="ver-main">v${escapeHtml(v.version)} ${badge}</div>
      <div class="ver-date">${escapeHtml(v.date || 'Fecha desconocida')}</div>
    `;

    item.onclick = () => selectVersion(i);
    item.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') selectVersion(i);
    };
    list.appendChild(item);
  });
}

function renderMainPanel(v) {
  document.getElementById('main-version-title').textContent = `Versión v${v.version}`;
  document.getElementById('main-version-date').textContent = v.date || 'Fecha desconocida';
  document.getElementById('main-changelog').innerHTML = v.notes && v.notes.trim() ? v.notes : '<div class="no-changelog">No hay notas de versión para esta actualización.</div>';
  const releaseLink = document.getElementById('release-link');
  if (v.releaseUrl) {
    releaseLink.href = v.releaseUrl;
    releaseLink.hidden = false;
  } else {
    releaseLink.hidden = true;
  }
  renderCommitList(v.commits || []);
}

function selectVersion(idx) {
  selectedIdx = idx;
  renderSidebar(versions, selectedIdx);
  renderMainPanel(versions[selectedIdx]);
}

window.updateAPI.onInfo((info) => {
  applyStoredTheme();
  console.log('[UPDATE-UI] Recibida info:', info);

  versions = normalizeReleaseNotes(info.releaseNotes, info.version);

  if (versions.length === 0) {
    versions = [{
      version: info.version,
      notes: '<p>Una nueva versión está disponible.</p>',
      date: info.releaseDate ? info.releaseDate.split('T')[0] : '',
      commits: Array.isArray(info.commitList) ? info.commitList : [],
      releaseUrl: info.releaseUrl || ''
    }];
  }

  versions = versions.map((v) => ({
    ...v,
    date: v.date ? v.date.split('T')[0] : (info.releaseDate ? info.releaseDate.split('T')[0] : ''),
    commits: Array.isArray(v.commits) ? v.commits : (Array.isArray(info.commitList) ? info.commitList : []),
    releaseUrl: v.releaseUrl || info.releaseUrl || ''
  }));

  if (info.commitList && Array.isArray(info.commitList) && versions.length > 0) {
    versions[0].commits = info.commitList;
  }

  versions.sort((a, b) => (b.version || '').localeCompare(a.version || ''));
  selectedIdx = 0;
  renderSidebar(versions, selectedIdx);
  renderMainPanel(versions[selectedIdx]);
});

document.getElementById('install-btn').addEventListener('click', () => {
  window.updateAPI.install();
});

document.getElementById('later-btn').addEventListener('click', () => {
  window.updateAPI.later();
});

window.updateAPI.onDevMode((data) => {
  const installBtn = document.getElementById('install-btn');
  const laterBtn = document.getElementById('later-btn');
  const changelog = document.getElementById('main-changelog');

  changelog.innerHTML = `
    <div class="dev-mode-notice">
      <strong>Modo Desarrollo</strong>
      <p>${escapeHtml(data.message)}</p>
    </div>
  ` + changelog.innerHTML;

  installBtn.textContent = 'Entendido';
  installBtn.style.background = 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)';
  laterBtn.style.display = 'none';

  const newBtn = installBtn.cloneNode(true);
  installBtn.parentNode.replaceChild(newBtn, installBtn);
  newBtn.addEventListener('click', () => {
    window.updateAPI.later();
  });
});
