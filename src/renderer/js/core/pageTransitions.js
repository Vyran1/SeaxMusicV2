/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║       SEAXMUSIC — PAGE TRANSITIONS ENGINE v1.0          ║
 * ║  Sistema de transiciones animadas entre páginas.        ║
 * ║  Fade-out → Slide-in para eliminar la sensación de      ║
 * ║  "página web" y sentirse como una app nativa.           ║
 * ╚══════════════════════════════════════════════════════════╝
 */

(function () {
  'use strict';

  // ─── Configuración ────────────────────────────────────────
  const TRANSITION_CONFIG = {
    fadeOutMs: 120,    // Cuánto tarda la página actual en desvanecerse
    slideInMs: 280,    // Cuánto tarda la nueva página en entrar
    slideOffset: 18,   // Píxeles de desplazamiento del slide-in (sutil)
    easing: 'cubic-bezier(0.4, 0, 0.2, 1)',
  };

  // ─── Inyectar estilos de transición ───────────────────────

  function injectTransitionCSS() {
    if (document.getElementById('page-transition-styles')) return;

    const style = document.createElement('style');
    style.id = 'page-transition-styles';
    style.textContent = `
      /* ── Estado base del área de contenido ── */
      .content-area {
        will-change: opacity, transform;
      }

      /* ── Fade-out: la página actual desaparece ── */
      .content-area.page-exit {
        animation: page-exit ${TRANSITION_CONFIG.fadeOutMs}ms ${TRANSITION_CONFIG.easing} forwards;
        pointer-events: none;
      }

      /* ── Slide-in: la nueva página entra deslizándose ── */
      .content-area.page-enter {
        animation: page-enter ${TRANSITION_CONFIG.slideInMs}ms ${TRANSITION_CONFIG.easing} forwards;
        pointer-events: none;
      }

      /* La página queda al 100% de opacidad tras entrar */
      .content-area.page-enter-done {
        opacity: 1;
        transform: none;
      }

      @keyframes page-exit {
        from {
          opacity: 1;
          transform: translateY(0) scale(1);
        }
        to {
          opacity: 0;
          transform: translateY(${TRANSITION_CONFIG.slideOffset * -0.4}px) scale(0.98);
        }
      }

      @keyframes page-enter {
        from {
          opacity: 0;
          transform: translateY(${TRANSITION_CONFIG.slideOffset}px);
        }
        to {
          opacity: 1;
          transform: translateY(0);
        }
      }

      /* ── Transición de los items del nav-menu ── */
      .nav-item {
        transition:
          color 0.2s ease,
          background 0.2s ease;
      }
      .nav-item.transitioning {
        pointer-events: none;
      }

      /* ── Ripple en sidebar nav-item al hacer click ── */
      .nav-item {
        position: relative;
        overflow: hidden;
      }
      .nav-item .nav-ripple {
        position: absolute;
        border-radius: 50%;
        background: rgba(255, 255, 255, 0.15);
        transform: scale(0);
        animation: nav-ripple 400ms linear;
        pointer-events: none;
      }
      @keyframes nav-ripple {
        to {
          transform: scale(4);
          opacity: 0;
        }
      }

      /* ── Skeleton loader durante transición ── */
      .page-transition-skeleton {
        position: absolute;
        inset: 0;
        background: linear-gradient(
          90deg,
          transparent 0%,
          rgba(255, 255, 255, 0.03) 50%,
          transparent 100%
        );
        background-size: 200% 100%;
        animation: skeleton-sweep 0.8s ease-in-out;
        pointer-events: none;
        z-index: 10;
      }
      @keyframes skeleton-sweep {
        from { background-position: -200% 0; }
        to   { background-position:  200% 0; }
      }
    `;
    document.head.appendChild(style);
    console.log('[PAGE-TRANS] 💅 Estilos de transición inyectados.');
  }

  // ─── Helpers ──────────────────────────────────────────────

  function getContentArea() {
    return document.querySelector('.content-area');
  }

  /** Añade efecto ripple en el nav-item al hacer click */
  function addRipple(element, event) {
    const ripple = document.createElement('span');
    ripple.className = 'nav-ripple';
    const rect = element.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    ripple.style.cssText = `
      width: ${size}px;
      height: ${size}px;
      left: ${event.clientX - rect.left - size / 2}px;
      top: ${event.clientY - rect.top - size / 2}px;
    `;
    element.appendChild(ripple);
    setTimeout(() => ripple.remove(), 400);
  }

  // ─── Motor de transición principal ────────────────────────

  /**
   * Ejecuta una transición animada entre páginas.
   * @param {Function} renderFn - Función que cambia el contenido del DOM
   * @param {Object} [opts] - Opciones de transición
   */
  function transitionTo(renderFn, opts = {}) {
    const area = getContentArea();
    if (!area) {
      // Si no hay área de contenido, ejecutar directamente
      renderFn();
      return;
    }

    // Evitar múltiples transiciones simultáneas
    if (area.dataset.transitioning === '1') {
      renderFn();
      return;
    }

    area.dataset.transitioning = '1';

    // 1️⃣ Fase exit: fade-out de la página actual
    area.classList.remove('page-enter', 'page-enter-done');
    area.classList.add('page-exit');

    setTimeout(() => {
      // 2️⃣ Cambiar contenido
      area.classList.remove('page-exit');
      area.style.opacity = '0';
      area.style.transform = `translateY(${TRANSITION_CONFIG.slideOffset}px)`;

      // Ejecutar la función que renderiza la nueva página
      try {
        renderFn();
      } catch (e) {
        console.error('[PAGE-TRANS] Error en renderFn:', e);
      }

      // 3️⃣ Fase enter: slide-in de la nueva página
      // Forzar reflow para que la animación se note
      void area.offsetHeight;

      area.style.opacity = '';
      area.style.transform = '';
      area.classList.add('page-enter');

      // Limpiar después de la animación
      const cleanup = () => {
        area.classList.remove('page-enter');
        area.classList.add('page-enter-done');
        area.dataset.transitioning = '0';
        // Refrescar marquee con el nuevo contenido
        if (window.scheduleMarqueeRefresh) {
          window.scheduleMarqueeRefresh();
        }
      };

      setTimeout(cleanup, TRANSITION_CONFIG.slideInMs + 20);

    }, TRANSITION_CONFIG.fadeOutMs);
  }

  // ─── Parchear el sistema de navegación existente ──────────

  function patchNavigation() {
    // Guardar referencia a showHomePage original
    const _originalShowHome = window.showHomePage;
    if (typeof _originalShowHome === 'function') {
      window.showHomePage = function (addToHistory = true) {
        transitionTo(() => _originalShowHome(addToHistory));
      };
    }

    // Parchear libraryManager cuando esté disponible
    const patchLibrary = () => {
      if (!window.libraryManager) return false;

      if (typeof window.libraryManager.showLibrary === 'function' && !window.libraryManager.__patched_transitions) {
        const _origShowLibrary = window.libraryManager.showLibrary.bind(window.libraryManager);
        window.libraryManager.showLibrary = function (addToHistory = true) {
          transitionTo(() => _origShowLibrary(addToHistory));
        };
      }

      if (typeof window.libraryManager.showPlaylistsSection === 'function') {
        const _origShowPlaylists = window.libraryManager.showPlaylistsSection.bind(window.libraryManager);
        window.libraryManager.showPlaylistsSection = function (addToHistory = true) {
          transitionTo(() => _origShowPlaylists(addToHistory));
        };
      }

      window.libraryManager.__patched_transitions = true;
      return true;
    };

    // Parchear searchManager cuando esté disponible
    const patchSearch = () => {
      if (!window.searchManager) return false;
      if (typeof window.searchManager.showSearchPage === 'function' && !window.searchManager.__patched_transitions) {
        const _origShowSearch = window.searchManager.showSearchPage.bind(window.searchManager);
        window.searchManager.showSearchPage = function (addToHistory = true) {
          transitionTo(() => _origShowSearch(addToHistory));
        };
        window.searchManager.__patched_transitions = true;
      }
      return true;
    };

    // Parchear configManager
    const patchConfig = () => {
      if (!window.configManager) return false;
      if (typeof window.configManager.showConfigPage === 'function' && !window.configManager.__patched_transitions) {
        const _origShowConfig = window.configManager.showConfigPage.bind(window.configManager);
        window.configManager.showConfigPage = function (addToHistory = true) {
          transitionTo(() => _origShowConfig(addToHistory));
        };
        window.configManager.__patched_transitions = true;
      }
      return true;
    };

    // Parchear devManager
    const patchDev = () => {
      if (!window.devManager) return false;
      if (typeof window.devManager.showDevPage === 'function' && !window.devManager.__patched_transitions) {
        const _origShowDev = window.devManager.showDevPage.bind(window.devManager);
        window.devManager.showDevPage = function (addToHistory = true) {
          transitionTo(() => _origShowDev(addToHistory));
        };
        window.devManager.__patched_transitions = true;
      }
      return true;
    };

    // Reintentar parchar managers que no están listos aún
    let attempts = 0;
    const maxAttempts = 30;
    const retryInterval = setInterval(() => {
      attempts++;
      const allDone =
        patchLibrary() &&
        patchSearch() &&
        patchConfig() &&
        patchDev();

      if (allDone || attempts >= maxAttempts) {
        clearInterval(retryInterval);
        if (allDone) {
          console.log('[PAGE-TRANS] ✅ Todos los managers parcheados.');
        } else {
          console.warn('[PAGE-TRANS] ⚠️ Algunos managers no se pudieron parchear.');
        }
      }
    }, 200);
  }

  // ─── Añadir ripple + bloqueo durante transición ───────────

  function enhanceNavItems() {
    // Aplicar ripple a nav-items
    document.querySelectorAll('.nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        addRipple(item, e);
      });
    });

    // Observar nuevos nav-items que se añadan dinámicamente
    const observer = new MutationObserver(() => {
      document.querySelectorAll('.nav-item:not([data-ripple])').forEach(item => {
        item.dataset.ripple = '1';
        item.addEventListener('click', (e) => addRipple(item, e));
      });
    });
    observer.observe(document.body, { childList: true, subtree: true });
  }

  // ─── API pública ──────────────────────────────────────────

  window.pageTransitions = {
    transitionTo,
    TRANSITION_CONFIG,
  };

  // ─── Inicialización ───────────────────────────────────────

  function init() {
    injectTransitionCSS();

    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        patchNavigation();
        enhanceNavItems();
      });
    } else {
      patchNavigation();
      enhanceNavItems();
    }

    console.log('[PAGE-TRANS] ✅ Sistema de transiciones iniciado.');
  }

  init();
})();
