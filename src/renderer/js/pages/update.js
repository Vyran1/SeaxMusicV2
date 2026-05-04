console.log('🚀 [UPDATE-UI] Script cargado correctamente');

let versions = [];
let selectedIdx = 0;

const themeMap = {
  rojo: { primary: '#FF1E1E', hover: '#FF4B4B', dark: '#D70000', rgb: '255, 30, 30' },
  naranja: { primary: '#FF8C00', hover: '#FFA500', dark: '#D2691E', rgb: '255, 140, 0' },
  magenta: { primary: '#E600FF', hover: '#F046FF', dark: '#B300C7', rgb: '230, 0, 255' },
  rosado: { primary: '#FF0080', hover: '#FF409F', dark: '#C70064', rgb: '255, 0, 128' },
  verde: { primary: '#48FF00', hover: '#73FF3A', dark: '#39CC00', rgb: '72, 255, 0' },
  amarillo: { primary: '#FAFF00', hover: '#FBFF40', dark: '#C4C700', rgb: '250, 255, 0' },
  azul: { primary: '#0066FF', hover: '#3385FF', dark: '#0047B3', rgb: '0, 102, 255' },
  cian: { primary: '#00FFF2', hover: '#33FFF7', dark: '#00B3AA', rgb: '0, 255, 242' }
};

function applyTheme(themeName) {
  try {
    const name = themeName || localStorage.getItem('seaxmusic_theme') || 'rojo';
    const theme = themeMap[name] || themeMap.rojo;
    const root = document.documentElement;
    root.style.setProperty('--accent-primary', theme.primary);
    root.style.setProperty('--accent-hover', theme.hover);
    root.style.setProperty('--accent-dark', theme.dark);
    root.style.setProperty('--accent-rgb', theme.rgb);
    root.style.setProperty('--accent-soft', `rgba(${theme.rgb}, 0.14)`);
    root.style.setProperty('--accent-border', `rgba(${theme.rgb}, 0.28)`);
    const [r, g, b] = theme.rgb.split(',').map(s => s.trim());
    root.style.setProperty('--aura-glow', `rgba(${r}, ${g}, ${b}, 0.14)`);
    root.style.setProperty('--aura-color', `rgba(${r}, ${g}, ${b}, 0.07)`);
  } catch (e) {
    const theme = themeMap.rojo;
    document.documentElement.style.setProperty('--accent-primary', theme.primary);
    document.documentElement.style.setProperty('--accent-hover', theme.hover);
    document.documentElement.style.setProperty('--accent-dark', theme.dark);
    document.documentElement.style.setProperty('--accent-rgb', theme.rgb);
  }
}

function sanitizeHtml(html) {
  if (!html) return '';
  return html
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<iframe\b[^<]*(?:(?!<\/iframe>)<[^<]*)*<\/iframe>/gi, '')
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    .replace(/on\w+\s*=\s*[^\s>]*/gi, '');
}

function markdownToHtml(text) {
  if (!text) return '';
  if (/<[a-z][\s\S]*>/i.test(text)) {
    return sanitizeHtml(text);
  }

  let html = text;

  html = html.replace(/^### (.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^## (.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^# (.+)$/gm, '<h1>$1</h1>');

  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');
  html = html.replace(/`(.+?)`/g, '<code>$1</code>');

  html = html.replace(/^[-*] (.+)$/gm, '<li>$1</li>');

  html = html.replace(/((?:<li>.*?<\/li>\n?)+)/g, '<ul>$1</ul>');

  html = html.replace(/<\/ul>\s*<ul>/g, '');

  html = html.replace(/^> (.+)$/gm, '<blockquote>$1</blockquote>');
  html = html.replace(/<\/blockquote>\s*<blockquote>/g, '<br>');

  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  html = html.replace(/\n{2,}/g, '</p><p>');
  html = html.replace(/\n/g, '<br>');

  html = `<p>${html}</p>`;

  html = html.replace(/<p>\s*<(h[123]|ul|blockquote)/g, '<$1');
  html = html.replace(/<\/(h[123]|ul|blockquote)>\s*<\/p>/g, '</$1>');
  html = html.replace(/<p>\s*<\/p>/g, '');

  return html;
}

function normalizeReleaseNotes(releaseNotes, version) {
  const fallback = [{ version, notes: '<p>Sin notas de versión disponibles.</p>', date: '', commits: [] }];

  if (!releaseNotes) return fallback;

  if (Array.isArray(releaseNotes)) {
    if (releaseNotes.length === 0) return fallback;
    return releaseNotes.map((release) => ({
      version: release.version || version,
      notes: typeof release.notes === 'string' ? markdownToHtml(release.notes) : markdownToHtml(release.note || ''),
      date: release.date || '',
      commits: Array.isArray(release.commits) ? release.commits : [],
      releaseUrl: release.releaseUrl || ''
    }));
  }

  if (typeof releaseNotes === 'string') {
    return [{ version, notes: markdownToHtml(releaseNotes), date: '', commits: [], releaseUrl: '' }];
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
    const msg = commit.message || '';
    const author = commit.author || 'Vyran';
    const sha = commit.sha ? commit.sha.slice(0, 7) : '------';
    const item = document.createElement('div');
    item.className = 'commit-item';
    item.innerHTML = `
      <div class="commit-message">${markdownToHtml(msg.replace(/<\/?p>/g, '').trim())}</div>
      <div class="commit-meta">
        <span class="commit-author">${author}</span>
        <span class="commit-sha">${sha}</span>
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
      <div class="ver-main">v${v.version} ${badge}</div>
      <div class="ver-date">${v.date || 'Hoy'}</div>
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

function handleUpdateInfo(info) {
  console.log('📦 [UPDATE-UI] Datos recibidos:', info);

  versions = normalizeReleaseNotes(info.releaseNotes, info.version);

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
}

if (window.updateAPI) {
  window.updateAPI.onInfo(handleUpdateInfo);

  window.updateAPI.onTheme((themeData) => {
    console.log('🎨 [UPDATE-UI] Tema recibido:', themeData);
    if (themeData && themeData.themeName) {
      applyTheme(themeData.themeName);
    }
  });
}

document.getElementById('install-btn')?.addEventListener('click', () => {
  window.updateAPI?.install();
});

document.getElementById('later-btn')?.addEventListener('click', () => {
  window.updateAPI?.later();
});

applyTheme();
