
// update.js: UI moderna tipo launcher para updates
let versions = [];
let selectedIdx = 0;

function formatMarkdownToHTML(text) {
  if (!text) return '';
  
  // Convertir Markdown básico a HTML
  let html = text
    // Escapar HTML existente primero
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    // Headers
    .replace(/^### (.+)$/gm, '<h3>$1</h3>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/^# (.+)$/gm, '<h1>$1</h1>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Code inline
    .replace(/`(.+?)`/g, '<code>$1</code>')
    // Lists
    .replace(/^[\-\*] (.+)$/gm, '<li>$1</li>')
    // Line breaks
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>');
  
  // Envolver listas en <ul>
  html = html.replace(/(<li>.*<\/li>)/gs, '<ul>$1</ul>');
  // Limpiar múltiples <ul> consecutivos
  html = html.replace(/<\/ul>\s*<ul>/g, '');
  
  return `<p>${html}</p>`;
}

function normalizeReleaseNotes(releaseNotes, version) {
  console.log('[UPDATE-UI] Normalizando releaseNotes:', typeof releaseNotes, releaseNotes);
  
  // Puede ser string, objeto, o array
  if (!releaseNotes) {
    return [{ version: version, notes: 'Sin notas de versión disponibles.', date: '' }];
  }
  
  if (Array.isArray(releaseNotes)) {
    if (releaseNotes.length === 0) {
      return [{ version: version, notes: 'Sin notas de versión disponibles.', date: '' }];
    }
    return releaseNotes.map((r, i) => ({
      version: r.version || version,
      notes: formatMarkdownToHTML(r.note || r.notes || ''),
      date: r.date || ''
    }));
  }
  
  if (typeof releaseNotes === 'string') {
    return [{ version: version, notes: formatMarkdownToHTML(releaseNotes), date: '' }];
  }
  
  if (typeof releaseNotes === 'object') {
    return [{
      version: releaseNotes.version || version,
      notes: formatMarkdownToHTML(releaseNotes.note || releaseNotes.notes || ''),
      date: releaseNotes.date || ''
    }];
  }
  
  return [{ version: version, notes: 'Sin notas de versión disponibles.', date: '' }];
}

function renderSidebar(versions, selectedIdx) {
  const list = document.getElementById('version-list');
  list.innerHTML = '';
  versions.forEach((v, i) => {
    const item = document.createElement('div');
    item.className = 'version-item' + (i === selectedIdx ? ' selected' : '');
    item.tabIndex = 0;
    // Badge "NUEVA" solo para la primera versión (la más reciente)
    const badge = i === 0 ? '<span class="badge-new">NUEVA</span>' : '';
    item.innerHTML = `
      <div class="ver-main">v${v.version} ${badge}</div>
      <div class="ver-date">${v.date ? v.date : ''}</div>
    `;
    item.onclick = () => {
      selectVersion(i);
    };
    item.onkeydown = (e) => {
      if (e.key === 'Enter' || e.key === ' ') selectVersion(i);
    };
    list.appendChild(item);
  });
}

function renderMainPanel(v) {
  document.getElementById('main-version-title').textContent = `Versión v${v.version}`;
  document.getElementById('main-version-date').textContent = v.date ? v.date : '';
  document.getElementById('main-changelog').innerHTML = v.notes && v.notes.trim() ? v.notes : '<div class="no-changelog">No hay notas de versión para esta actualización.</div>';
}

function selectVersion(idx) {
  selectedIdx = idx;
  renderSidebar(versions, selectedIdx);
  renderMainPanel(versions[selectedIdx]);
}

window.updateAPI.onInfo((info) => {
  console.log('[UPDATE-UI] Recibida info:', info);
  
  versions = normalizeReleaseNotes(info.releaseNotes, info.version);
  
  // Si no hay versiones, crear una por defecto
  if (versions.length === 0) {
    versions = [{
      version: info.version,
      notes: 'Nueva versión disponible.',
      date: info.releaseDate ? info.releaseDate.split('T')[0] : ''
    }];
  }
  
  // Asegurar que la fecha esté formateada
  versions = versions.map(v => ({
    ...v,
    date: v.date ? v.date.split('T')[0] : (info.releaseDate ? info.releaseDate.split('T')[0] : '')
  }));
  
  console.log('[UPDATE-UI] Versiones procesadas:', versions);
  
  // Ordenar de más nueva a más vieja (si hay varias)
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

// Handler para modo desarrollo
window.updateAPI.onDevMode((data) => {
  const installBtn = document.getElementById('install-btn');
  const laterBtn = document.getElementById('later-btn');
  
  // Mostrar mensaje en el changelog
  const changelog = document.getElementById('main-changelog');
  changelog.innerHTML = `
    <div class="dev-mode-notice" style="
      background: linear-gradient(135deg, #ff9800 0%, #f57c00 100%);
      color: white;
      padding: 16px 20px;
      border-radius: 8px;
      margin-bottom: 16px;
      display: flex;
      align-items: center;
      gap: 12px;
    ">
      <span style="font-size: 24px;">⚠️</span>
      <div>
        <strong style="display: block; margin-bottom: 4px;">Modo Desarrollo</strong>
        <span style="opacity: 0.9;">${data.message}</span>
      </div>
    </div>
  ` + changelog.innerHTML;
  
  // Cambiar botón install a "Entendido" 
  installBtn.textContent = 'Entendido';
  installBtn.style.background = 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)';
  
  // Ocultar botón "Más tarde"
  laterBtn.style.display = 'none';
  
  // Reemplazar completamente el botón para eliminar listeners anteriores
  const newBtn = installBtn.cloneNode(true);
  installBtn.parentNode.replaceChild(newBtn, installBtn);
  newBtn.addEventListener('click', () => {
    window.updateAPI.later();
  });
});
