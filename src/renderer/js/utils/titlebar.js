// Controles de la barra de título propia (la ventana principal no tiene marco nativo)
(function () {
  const api = window.electronAPI && window.electronAPI.windowControls;
  if (!api) return;

  const maxBtn = document.getElementById('tbMaximize');
  const maxIcon = maxBtn ? maxBtn.querySelector('i') : null;

  // Icono y etiqueta según el estado real de la ventana
  const syncMaximizeState = async () => {
    const maximized = await api.isMaximized();
    if (maxIcon) maxIcon.className = maximized ? 'far fa-clone' : 'far fa-square';
    if (maxBtn) maxBtn.setAttribute('aria-label', maximized ? 'Restaurar' : 'Maximizar');
  };

  const toggleMaximize = async () => {
    await api.toggleMaximize();
    syncMaximizeState();
  };

  document.getElementById('tbMinimize')?.addEventListener('click', () => api.minimize());
  maxBtn?.addEventListener('click', toggleMaximize);
  document.getElementById('tbClose')?.addEventListener('click', () => api.close());

  // Doble clic en la barra (fuera de los botones) maximiza o restaura
  document.getElementById('titlebar')?.addEventListener('dblclick', (event) => {
    if (!event.target.closest('.titlebar-controls')) toggleMaximize();
  });

  window.addEventListener('resize', syncMaximizeState);
  syncMaximizeState();
})();
