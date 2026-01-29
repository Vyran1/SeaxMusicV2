
// update.js: UI moderna tipo launcher para updates
let versions = [];
let selectedIdx = 0;

function normalizeReleaseNotes(releaseNotes, currentVersion) {
  // Puede ser string, objeto, o array
  if (!releaseNotes) return [];
  if (Array.isArray(releaseNotes)) {
    return releaseNotes.map((r, i) => ({
      version: r.version || currentVersion,
      notes: r.note || r.notes || '',
      date: r.date || ''
    }));
  }
  if (typeof releaseNotes === 'string') {
    return [{ version: currentVersion, notes: releaseNotes, date: '' }];
  }
  if (typeof releaseNotes === 'object') {
    return [{
      version: releaseNotes.version || currentVersion,
      notes: releaseNotes.note || releaseNotes.notes || '',
      date: releaseNotes.date || ''
    }];
  }
  return [];
}

function renderSidebar(versions, selectedIdx) {
  const list = document.getElementById('version-list');
  list.innerHTML = '';
  versions.forEach((v, i) => {
    const item = document.createElement('div');
    item.className = 'version-item' + (i === selectedIdx ? ' selected' : '');
    item.tabIndex = 0;
    item.innerHTML = `
      <div class="ver-main">v${v.version}</div>
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
  versions = normalizeReleaseNotes(info.releaseNotes, info.version);
  // Ordenar de más nueva a más vieja (si hay varias)
  versions.sort((a, b) => (b.version || '').localeCompare(a.version || ''));
  selectedIdx = 0;
  renderSidebar(versions, selectedIdx);
  renderMainPanel(versions[selectedIdx]);
});

document.getElementById('install-btn').addEventListener('click', () => {
  window.updateAPI.install();
});
