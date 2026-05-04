/**
 * ╔══════════════════════════════════════════════════════════╗
 * ║         SEAXMUSIC — AURA ENGINE v2.0                    ║
 * ║  Extrae el color dominante del álbum y lo aplica como   ║
 * ║  color de acento GLOBAL de toda la interfaz.            ║
 * ║  Si el álbum es morado → todo es morado.                ║
 * ║  Si el álbum es azul  → todo es azul.                   ║
 * ╚══════════════════════════════════════════════════════════╝
 */

(function () {
  'use strict';

  // ─── Configuración ────────────────────────────────────────
  const CFG = {
    transitionMs: 2500,   // Duración de la transición suave (más lenta y premium)
    sampleSize: 32,       // Resolución del canvas de muestreo
    minSaturation: 0.18,  // Descartar grises
    minBrightness: 0.08,  // Descartar negros
    maxBrightness: 0.94,  // Descartar blancos
    defaultR: 225, defaultG: 56, defaultB: 56, // Color base (rojo SeaxMusic)
    throttleMs: 600,
  };

  // ─── Estado ───────────────────────────────────────────────
  let lastUrl = null;
  let lastExtracted = 0;
  let rafId = null;

  // ¿El usuario eligió "Del álbum" en configuración?
  // Se inicializa desde localStorage para persistir entre recargas.
  window._auraAlbumModeEnabled = (localStorage.getItem('seaxmusic_theme') === 'album');

  // Color actual (animado)
  let curR = CFG.defaultR, curG = CFG.defaultG, curB = CFG.defaultB;
  // Color objetivo
  let tgtR = curR, tgtG = curG, tgtB = curB;

  // ─── Canvas oculto ────────────────────────────────────────
  const canvas = document.createElement('canvas');
  canvas.width = CFG.sampleSize;
  canvas.height = CFG.sampleSize;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });

  // ─── RGB ↔ HSL ────────────────────────────────────────────
  function rgbToHsl(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s;
    const l = (max + min) / 2;
    if (max === min) { h = s = 0; }
    else {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
        case g: h = ((b - r) / d + 2) / 6; break;
        case b: h = ((r - g) / d + 4) / 6; break;
      }
    }
    return [h * 360, s, l];
  }

  function hslToRgb(h, s, l) {
    h /= 360;
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const hue2rgb = (p, q, t) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1 / 6) return p + (q - p) * 6 * t;
      if (t < 1 / 2) return q;
      if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
      return p;
    };
    return [
      Math.round(hue2rgb(p, q, h + 1 / 3) * 255),
      Math.round(hue2rgb(p, q, h) * 255),
      Math.round(hue2rgb(p, q, h - 1 / 3) * 255),
    ];
  }

  // ─── Asegurar color VISIBLE y VIBRANTE ───────────────────
  // No cambia el tono, solo ajusta saturación y luminosidad
  // para que el color sea siempre legible y bonito en la UI.
  function makeVibrant(r, g, b) {
    const [h, s, l] = rgbToHsl(r, g, b);
    // Saturación ultra-llamativa (82%+) para un look premium
    const newS = Math.min(Math.max(s * 1.4, 0.82), 1.0);
    // Luminosidad vibrante perfecta (48% - 58%)
    const newL = Math.min(Math.max(l, 0.48), 0.58);
    return hslToRgb(h, newS, newL);
  }

  // ─── Extracción del color dominante ───────────────────────
  function extractDominant(img) {
    try {
      ctx.clearRect(0, 0, CFG.sampleSize, CFG.sampleSize);
      ctx.drawImage(img, 0, 0, CFG.sampleSize, CFG.sampleSize);
      const { data } = ctx.getImageData(0, 0, CFG.sampleSize, CFG.sampleSize);

      // Cuantización: agrupar píxeles en buckets de 32px
      const buckets = {};
      for (let i = 0; i < data.length; i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2], a = data[i + 3];
        if (a < 100) continue; // Ignorar semi-transparentes

        const [, s, l] = rgbToHsl(r, g, b);
        if (s < CFG.minSaturation) continue;
        if (l < CFG.minBrightness || l > CFG.maxBrightness) continue;

        // Cuantizar a nivel de 32 para agrupar colores similares
        const qr = Math.round(r / 32) * 32;
        const qg = Math.round(g / 32) * 32;
        const qb = Math.round(b / 32) * 32;
        const key = `${qr},${qg},${qb}`;

        if (!buckets[key]) {
          buckets[key] = { r: 0, g: 0, b: 0, count: 0, score: 0 };
        }
        buckets[key].r += r;
        buckets[key].g += g;
        buckets[key].b += b;
        buckets[key].count++;
        // Score = saturación al cuadrado × luminosidad balanceada
        buckets[key].score += (s * s) * (1 - Math.abs(l - 0.5) * 1.5);
      }

      // Promediar los RGB y score
      const candidates = Object.values(buckets).map(b => ({
        r: Math.round(b.r / b.count),
        g: Math.round(b.g / b.count),
        b: Math.round(b.b / b.count),
        count: b.count,
        avgScore: b.score / b.count
      }));

      if (!candidates.length) return null;

      // Ordenar priorizando fuertemente colores vivos pero requiriendo presencia mínima
      candidates.sort((a, b) => (b.avgScore * Math.pow(b.count, 0.35)) - (a.avgScore * Math.pow(a.count, 0.35)));
      const best = candidates[0];
      return { r: best.r, g: best.g, b: best.b };

    } catch (e) {
      console.warn('[AURA] Error extrayendo color:', e.message);
      return null;
    }
  }

  // ─── Animación suave (rAF) ────────────────────────────────
  function easeInOut(t) {
    // Curva premium cubic-bezier muy suave
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function animateTo(r, g, b) {
    tgtR = r; tgtG = g; tgtB = b;
    const startR = curR, startG = curG, startB = curB;
    const start = performance.now();

    if (rafId) cancelAnimationFrame(rafId);

    function step(now) {
      if (!window._auraAlbumModeEnabled) {
        rafId = null;
        return;
      }

      const t = Math.min(1, (now - start) / CFG.transitionMs);
      const e = easeInOut(t);

      curR = Math.round(startR + (tgtR - startR) * e);
      curG = Math.round(startG + (tgtG - startG) * e);
      curB = Math.round(startB + (tgtB - startB) * e);

      applyToRoot(curR, curG, curB);

      if (t < 1) {
        rafId = requestAnimationFrame(step);
      } else {
        rafId = null;
      }
    }

    rafId = requestAnimationFrame(step);
  }

  // ─── Aplicar al :root como fuente única de verdad ─────────
  function applyToRoot(r, g, b) {
    // Calcular variantes
    const [vR, vG, vB] = makeVibrant(r, g, b);
    const bright = [
      Math.min(255, vR + 25),
      Math.min(255, vG + 25),
      Math.min(255, vB + 25),
    ];
    const dark = [
      Math.max(0, vR - 40),
      Math.max(0, vG - 40),
      Math.max(0, vB - 40),
    ];

    const root = document.documentElement;

    // ── Fuente única de verdad: --accent-rgb ──
    root.style.setProperty('--accent-rgb', `${vR}, ${vG}, ${vB}`);
    root.style.setProperty('--accent-primary', `rgb(${vR}, ${vG}, ${vB})`);
    root.style.setProperty('--accent-hover', `rgb(${bright[0]}, ${bright[1]}, ${bright[2]})`);
    root.style.setProperty('--accent-dark', `rgb(${dark[0]}, ${dark[1]}, ${dark[2]})`);
    root.style.setProperty('--accent-soft', `rgba(${vR}, ${vG}, ${vB}, 0.14)`);
    root.style.setProperty('--accent-border', `rgba(${vR}, ${vG}, ${vB}, 0.30)`);

    // ── Variables de aura (fondo ambiental) ──
    root.style.setProperty('--aura-glow', `rgba(${vR}, ${vG}, ${vB}, 0.16)`);
    root.style.setProperty('--aura-color', `rgba(${vR}, ${vG}, ${vB}, 0.08)`);
    root.style.setProperty('--aura-bloom', `0 0 40px rgba(${vR}, ${vG}, ${vB}, 0.35)`);
  }

  // ─── Procesar thumbnail ───────────────────────────────────
  function processAlbumArt(url, force = false) {
    // ⛔ Solo operar si el usuario eligió "Del álbum" en configuración
    if (!window._auraAlbumModeEnabled) return;

    if (!url || (!force && url === lastUrl)) return;
    const now = Date.now();
    if (!force && now - lastExtracted < CFG.throttleMs) return;
    lastExtracted = now;
    lastUrl = url;

    const img = new Image();
    img.crossOrigin = 'anonymous';

    img.onload = () => {
      // Re-check por si el usuario cambió de modo mientras cargaba
      if (!window._auraAlbumModeEnabled) return;
      const color = extractDominant(img);
      if (color) {
        console.log(`[AURA] 🎨 rgb(${color.r}, ${color.g}, ${color.b})`);
        animateTo(color.r, color.g, color.b);
        const trackImage = document.getElementById('trackImage');
        if (trackImage) trackImage.classList.add('aura-active');
      }
    };

    img.onerror = () => {
      console.warn('[AURA] No se pudo cargar la imagen (posible CORS).');
    };

    img.src = url;
  }

  function resetToDefault() {
    animateTo(CFG.defaultR, CFG.defaultG, CFG.defaultB);
    lastUrl = null;
    const trackImage = document.getElementById('trackImage');
    if (trackImage) trackImage.classList.remove('aura-active');
  }

  // ─── CSS global del sistema de aura ───────────────────────
  function injectAuraCSS() {
    if (document.getElementById('aura-engine-styles')) return;

    const style = document.createElement('style');
    style.id = 'aura-engine-styles';
    style.textContent = `
      /* ════════════════════════════════════════════════════
         AURA ENGINE — Transiciones globales de color
         Todo lo que use var(--accent-*) o var(--aura-*)
         se actualiza suavemente al cambiar de canción.
         ════════════════════════════════════════════════════ */

      /* Valores por defecto (igual que variables.css, por si carga tarde) */
      :root {
        --aura-color: rgba(225, 56, 56, 0.07);
        --aura-glow:  rgba(225, 56, 56, 0.14);
      }

      /* ── Transición en toda la UI que use variables de acento ── */
      *,
      *::before,
      *::after {
        --accent-transition: 1.2s cubic-bezier(0.4, 0, 0.2, 1);
      }

      /* Elementos clave que necesitan transición explícita */
      .player-bar,
      .player-bar::before,
      .sidebar,
      .nav-item,
      .nav-item .icon,
      .hero-chip,
      .hero-icon,
      .hero-btn.primary,
      .hero-resume-btn,
      .dj-publish-btn,
      .play-btn,
      .np-play,
      .progress-fill,
      .np-progress-fill,
      .volume-fill,
      .np-volume-fill,
      .playlist-create-btn,
      .logo span {
        transition:
          background   1.2s cubic-bezier(0.4, 0, 0.2, 1),
          box-shadow   1.2s cubic-bezier(0.4, 0, 0.2, 1),
          border-color 1.2s cubic-bezier(0.4, 0, 0.2, 1),
          color        1.2s cubic-bezier(0.4, 0, 0.2, 1) !important;
      }

      /* Glow dinámico en la carátula del player bar */
      .track-image {
        transition: box-shadow 0.08s ease-out, transform 0.08s ease-out;
        will-change: transform, box-shadow;
      }
      .track-image.aura-active {
        box-shadow:
          0 0 0 2px rgba(var(--accent-rgb), 0.30),
          0 4px 20px rgba(var(--accent-rgb), 0.50),
          0 8px 32px rgba(0, 0, 0, 0.40);
      }
 
      /* Orb de luz bajo el player bar - Ahora contenido dentro de la barra */
      /* Efecto de "Ola" de color que sale de la barra */
      .player-bar {
        overflow: visible; 
      }
      
      /* Línea decorativa superior (Neón reactivo) */
      .player-bar::before {
        content: '';
        position: absolute;
        top: 0; left: 0; right: 0;
        height: 2px;
        background: linear-gradient(90deg, 
          transparent, 
          rgba(var(--accent-rgb), calc(0.3 + var(--audio-pulse-intensity, 0) * 0.7)), 
          transparent
        );
        z-index: 1001;
        box-shadow: 0 0 calc(5px + var(--audio-pulse-intensity, 0) * 15px) rgba(var(--accent-rgb), calc(var(--audio-pulse-intensity, 0) * 0.8));
        will-change: background, box-shadow;
      }

      /* La "Ola" de color (Sombra suave que emerge) */
      .player-bar::after {
        content: '';
        position: absolute;
        top: -55px;
        left: 50%;
        transform: translateX(-50%) scaleX(calc(1.1 + var(--audio-pulse-intensity, 0) * 0.4));
        width: 85%;
        height: 130px;
        border-radius: 100% 100% 0 0;
        background: radial-gradient(
          ellipse at bottom, 
          rgba(var(--accent-rgb), calc(0.12 + var(--audio-pulse-intensity, 0) * 0.35)) 0%, 
          rgba(var(--accent-rgb), 0.04) 40%, 
          transparent 75%
        );
        pointer-events: none;
        z-index: -1;
        filter: blur(18px);
        /* Opacidad base mínima mientras suena, pulsando hacia arriba */
        opacity: calc(0.5 + var(--audio-pulse-intensity, 0) * 0.5);
        transition: background 1.2s ease, opacity 0.1s ease;
        will-change: transform, background, opacity;
      }
    `;
    document.head.appendChild(style);
    console.log('[AURA] 💅 Estilos inyectados.');
  }

  // ─── Enganchar en el sistema del player ──────────────────
  function hookIntoPlayer() {
    // 1. Observar cambios en trackImage.src
    const trackImage = document.getElementById('trackImage');
    if (trackImage) {
      new MutationObserver((mutations) => {
        for (const m of mutations) {
          if (m.attributeName === 'src') {
            const src = trackImage.getAttribute('src');
            if (src && !src.includes('icon.png') && !src.includes('data:')) {
              processAlbumArt(src);
            } else {
              trackImage.classList.remove('aura-active');
            }
          }
        }
      }).observe(trackImage, { attributes: true, attributeFilter: ['src'] });
    }

    // 2. IPC: album cover actualizado
    if (window.electronAPI?.onUpdateAlbumCover) {
      window.electronAPI.onUpdateAlbumCover((url) => {
        if (url) processAlbumArt(url);
      });
    }

    // 3. Parchear window.updateTrackInfo para capturar thumbnails
    const _orig = window.updateTrackInfo;
    if (typeof _orig === 'function') {
      window.updateTrackInfo = function (track, direction) {
        _orig(track, direction);
        const thumb = track?.thumbnail;
        if (thumb && !thumb.includes('icon.png')) {
          processAlbumArt(thumb);
        }
      };
    }

    console.log('[AURA] 🔗 Conectado al player.');
  }

  // ─── API pública ──────────────────────────────────────────
  window.auraEngine = { processAlbumArt, resetToDefault };

  // ─── Init ─────────────────────────────────────────────────
  injectAuraCSS();

  // Solo aplicar color inicial si el modo álbum está activo
  // (de lo contrario, configManager ya aplicó el color fijo)
  if (!window._auraAlbumModeEnabled) {
    console.log('[AURA] Modo fijo activo — engine en espera.');
  } else {
    console.log('[AURA] Modo álbum activo — esperando canción.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', hookIntoPlayer);
  } else {
    setTimeout(hookIntoPlayer, 300);
  }

  console.log('[AURA] ✅ Aura Engine v2.0 iniciado.');
})();
