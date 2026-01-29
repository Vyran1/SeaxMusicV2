/**
 * ===== SEAXMUSIC AD BLOCKER =====
 * Sistema completo de bloqueo y salto de anuncios para YouTube
 * 
 * Características:
 * - Saltar anuncios automáticamente cuando aparece el botón "Omitir"
 * - Acelerar anuncios que no se pueden saltar (16x velocidad)
 * - Silenciar anuncios automáticamente
 * - Cerrar overlays y banners publicitarios
 * - Detectar y manejar diferentes tipos de anuncios
 */

class YouTubeAdBlocker {
  constructor() {
    this.isEnabled = true;
    this.adsSkipped = 0;
    this.adsMuted = 0;
    this.adsAccelerated = 0;
    this.originalVolume = 1;
    this.originalPlaybackRate = 1;
    this.checkInterval = null;
    this.observerSetup = false;
    
    // Selectores de YouTube para anuncios
    this.selectors = {
      // Botones de saltar anuncio
      skipButtons: [
        '.ytp-ad-skip-button',
        '.ytp-ad-skip-button-modern',
        '.ytp-skip-ad-button',
        'button.ytp-ad-skip-button',
        '.ytp-ad-skip-button-container button',
        '[class*="skip-button"]',
        '.videoAdUiSkipButton',
        '.ytp-ad-skip-button-slot button'
      ],
      
      // Indicadores de anuncio reproduciéndose
      adPlaying: [
        '.ad-showing',
        '.ytp-ad-player-overlay',
        '.ytp-ad-player-overlay-layout',
        '.ytp-ad-module',
        '[class*="ad-interrupting"]'
      ],
      
      // Overlays y banners
      adOverlays: [
        '.ytp-ad-overlay-container',
        '.ytp-ad-overlay-slot',
        '.ytp-ad-text-overlay',
        '.ytp-ad-image-overlay',
        '.ytp-ad-overlay-close-button',
        '.video-ads',
        '.ytp-ad-overlay-ad-info-button-container',
        '.ytp-ad-info-dialog-container',
        'ytd-promoted-sparkles-web-renderer',
        'ytd-display-ad-renderer',
        'ytd-companion-slot-renderer',
        'ytd-action-companion-ad-renderer',
        'ytd-in-feed-ad-layout-renderer',
        'ytd-ad-slot-renderer',
        '.ytd-banner-promo-renderer',
        'ytd-promoted-video-renderer',
        'ytd-movie-offer-module-renderer',
        '.masthead-ad-control'
      ],
      
      // Contenedores de anuncios de video
      videoAdContainers: [
        '.ytp-ad-player-overlay-instream-info',
        '.ytp-ad-simple-ad-badge',
        '.ytp-ad-preview-container',
        '.ytp-ad-message-container'
      ],
      
      // Botón de cerrar overlay
      closeButtons: [
        '.ytp-ad-overlay-close-button',
        '.ytp-ad-overlay-close-container button',
        '[aria-label="Close"]',
        '[aria-label="Cerrar"]'
      ]
    };
    
    console.log('🛡️ [AD-BLOCKER] Sistema de bloqueo de anuncios inicializado');
  }

  /**
   * Iniciar el sistema de bloqueo de anuncios
   */
  start() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
    }
    
    // Verificar anuncios cada 50ms para respuesta rápida
    this.checkInterval = setInterval(() => this.checkAndBlockAds(), 50);
    
    // Configurar MutationObserver para detectar cambios en el DOM
    this.setupMutationObserver();
    
    // Inyectar CSS para ocultar elementos de anuncios
    this.injectAdBlockingCSS();
    
    console.log('🛡️ [AD-BLOCKER] Sistema activado');
  }

  /**
   * Detener el sistema de bloqueo
   */
  stop() {
    if (this.checkInterval) {
      clearInterval(this.checkInterval);
      this.checkInterval = null;
    }
    this.isEnabled = false;
    console.log('🛡️ [AD-BLOCKER] Sistema desactivado');
  }

  /**
   * Verificación principal de anuncios
   */
  checkAndBlockAds() {
    if (!this.isEnabled) return;
    
    try {
      // 1. Intentar saltar anuncio con botón
      this.trySkipAd();
      
      // 2. Si hay anuncio, acelerarlo y silenciarlo
      this.handleActiveAd();
      
      // 3. Cerrar overlays publicitarios
      this.closeAdOverlays();
      
      // 4. Ocultar banners y promociones
      this.hideAdBanners();
      
    } catch (error) {
      // Silenciar errores para no spamear la consola
    }
  }

  /**
   * Intentar saltar anuncio usando botones de skip
   */
  trySkipAd() {
    for (const selector of this.selectors.skipButtons) {
      const skipButton = document.querySelector(selector);
      
      if (skipButton && this.isElementVisible(skipButton)) {
        skipButton.click();
        this.adsSkipped++;
        console.log(`⏭️ [AD-BLOCKER] Anuncio saltado! (Total: ${this.adsSkipped})`);
        return true;
      }
    }
    return false;
  }

  /**
   * Manejar anuncio activo (acelerar y silenciar)
   */
  handleActiveAd() {
    const video = document.querySelector('video');
    if (!video) return;
    
    // Verificar si hay un anuncio reproduciéndose
    const isAdPlaying = this.isAdCurrentlyPlaying();
    
    if (isAdPlaying) {
      // Guardar valores originales
      if (this.originalVolume === 1 && video.volume > 0) {
        this.originalVolume = video.volume;
      }
      if (this.originalPlaybackRate === 1 && video.playbackRate === 1) {
        this.originalPlaybackRate = 1;
      }
      
      // Silenciar el anuncio
      if (video.volume > 0) {
        video.volume = 0;
        video.muted = true;
        this.adsMuted++;
      }
      
      // Acelerar el anuncio al máximo (16x es el límite de Chrome)
      if (video.playbackRate < 16) {
        video.playbackRate = 16;
        this.adsAccelerated++;
        console.log(`⚡ [AD-BLOCKER] Anuncio acelerado 16x y silenciado`);
      }
      
      // Intentar saltar al final del anuncio
      if (video.duration && isFinite(video.duration) && video.duration > 0) {
        // Solo saltar si el video es corto (anuncio típico)
        if (video.duration < 120) {
          video.currentTime = video.duration - 0.1;
        }
      }
      
    } else {
      // Restaurar valores originales cuando no hay anuncio
      if (video.playbackRate === 16) {
        video.playbackRate = this.originalPlaybackRate;
        video.muted = false;
        video.volume = this.originalVolume;
      }
    }
  }

  /**
   * Verificar si hay un anuncio reproduciéndose
   */
  isAdCurrentlyPlaying() {
    // Método 1: Buscar clases indicadoras de anuncio
    for (const selector of this.selectors.adPlaying) {
      if (document.querySelector(selector)) {
        return true;
      }
    }
    
    // Método 2: Verificar el player de YouTube
    const player = document.querySelector('#movie_player');
    if (player) {
      // YouTube añade la clase "ad-showing" cuando hay anuncio
      if (player.classList.contains('ad-showing')) {
        return true;
      }
      // También verificar atributos de datos
      if (player.getAttribute('data-ad-playing') === 'true') {
        return true;
      }
    }
    
    // Método 3: Verificar si hay elementos de preview de anuncio
    const adPreview = document.querySelector('.ytp-ad-preview-container');
    if (adPreview && this.isElementVisible(adPreview)) {
      return true;
    }
    
    // Método 4: Verificar badge de anuncio
    const adBadge = document.querySelector('.ytp-ad-simple-ad-badge');
    if (adBadge && this.isElementVisible(adBadge)) {
      return true;
    }
    
    return false;
  }

  /**
   * Cerrar overlays publicitarios
   */
  closeAdOverlays() {
    // Cerrar botones de cierre de overlay
    for (const selector of this.selectors.closeButtons) {
      const closeBtn = document.querySelector(selector);
      if (closeBtn && this.isElementVisible(closeBtn)) {
        closeBtn.click();
        console.log('❌ [AD-BLOCKER] Overlay cerrado');
      }
    }
  }

  /**
   * Ocultar banners y promociones
   */
  hideAdBanners() {
    for (const selector of this.selectors.adOverlays) {
      const elements = document.querySelectorAll(selector);
      elements.forEach(el => {
        if (el && el.style.display !== 'none') {
          el.style.display = 'none';
          el.style.visibility = 'hidden';
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
        }
      });
    }
  }

  /**
   * Verificar si un elemento es visible
   */
  isElementVisible(element) {
    if (!element) return false;
    
    const style = window.getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    
    return (
      style.display !== 'none' &&
      style.visibility !== 'hidden' &&
      style.opacity !== '0' &&
      rect.width > 0 &&
      rect.height > 0 &&
      element.offsetParent !== null
    );
  }

  /**
   * Configurar MutationObserver para detectar nuevos anuncios
   */
  setupMutationObserver() {
    if (this.observerSetup) return;
    
    const observer = new MutationObserver((mutations) => {
      // Cuando hay cambios en el DOM, verificar anuncios
      this.checkAndBlockAds();
    });
    
    // Observar cambios en el body
    const targetNode = document.body || document.documentElement;
    if (targetNode) {
      observer.observe(targetNode, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['class', 'style', 'src']
      });
      this.observerSetup = true;
      console.log('👁️ [AD-BLOCKER] MutationObserver configurado');
    }
  }

  /**
   * Inyectar CSS para ocultar elementos de anuncios
   */
  injectAdBlockingCSS() {
    const styleId = 'seaxmusic-ad-blocker-style';
    
    // No inyectar si ya existe
    if (document.getElementById(styleId)) return;
    
    const css = `
      /* ===== SEAXMUSIC AD BLOCKER CSS ===== */
      
      /* Ocultar overlays de anuncios */
      .ytp-ad-overlay-container,
      .ytp-ad-overlay-slot,
      .ytp-ad-text-overlay,
      .ytp-ad-image-overlay,
      .video-ads,
      ytd-promoted-sparkles-web-renderer,
      ytd-display-ad-renderer,
      ytd-companion-slot-renderer,
      ytd-action-companion-ad-renderer,
      ytd-in-feed-ad-layout-renderer,
      ytd-ad-slot-renderer,
      .ytd-banner-promo-renderer,
      ytd-promoted-video-renderer,
      ytd-movie-offer-module-renderer,
      .masthead-ad-control,
      #masthead-ad,
      ytd-primetime-promo-renderer,
      .ytd-mealbar-promo-renderer,
      ytd-statement-banner-renderer,
      .ytp-ad-info-dialog-container {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
        height: 0 !important;
        width: 0 !important;
        overflow: hidden !important;
      }
      
      /* Ocultar anuncios en la página principal */
      ytd-rich-item-renderer:has(ytd-ad-slot-renderer),
      ytd-rich-section-renderer:has(ytd-ad-slot-renderer) {
        display: none !important;
      }
      
      /* Ocultar anuncios en búsqueda */
      ytd-search-pyv-renderer,
      ytd-promoted-sparkles-text-search-renderer {
        display: none !important;
      }
      
      /* Hacer visible el botón de skip si existe */
      .ytp-ad-skip-button,
      .ytp-ad-skip-button-modern,
      .ytp-skip-ad-button {
        opacity: 1 !important;
        visibility: visible !important;
        pointer-events: auto !important;
      }
    `;
    
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = css;
    
    // Inyectar en head o documentElement
    const target = document.head || document.documentElement;
    if (target) {
      target.appendChild(style);
      console.log('🎨 [AD-BLOCKER] CSS de bloqueo inyectado');
    }
  }

  /**
   * Obtener estadísticas
   */
  getStats() {
    return {
      enabled: this.isEnabled,
      adsSkipped: this.adsSkipped,
      adsMuted: this.adsMuted,
      adsAccelerated: this.adsAccelerated
    };
  }
}

// ===== INICIALIZACIÓN =====
// Crear instancia global del bloqueador
const adBlocker = new YouTubeAdBlocker();

// Iniciar cuando el DOM esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => adBlocker.start());
} else {
  adBlocker.start();
}

// También iniciar cuando la ventana cargue completamente
window.addEventListener('load', () => {
  // Reiniciar para asegurar que todo esté configurado
  setTimeout(() => {
    adBlocker.checkAndBlockAds();
    console.log('🛡️ [AD-BLOCKER] Verificación completa realizada');
  }, 1000);
});

// Exponer al contexto global para debugging
window.seaxAdBlocker = adBlocker;

// Exportar para uso en otros módulos
if (typeof module !== 'undefined' && module.exports) {
  module.exports = YouTubeAdBlocker;
}

console.log('🛡️ [AD-BLOCKER] Módulo cargado correctamente');
