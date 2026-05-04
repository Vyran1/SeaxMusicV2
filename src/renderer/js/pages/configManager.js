class ConfigManager {
  constructor() {
    this.themeKey = 'seaxmusic_theme';
    this.themes = {
      rojo: {
        name: 'Rojo Neón',
        primary: '#FF1E1E',
        hover: '#FF4B4B',
        dark: '#D70000',
        rgb: '255, 30, 30'
      },
      naranja: {
        name: 'Naranja Eléctrico',
        primary: '#FF8C00',
        hover: '#FFA500',
        dark: '#D2691E',
        rgb: '255, 140, 0'
      },
      magenta: {
        name: 'Magenta Neón',
        primary: '#E600FF',
        hover: '#F046FF',
        dark: '#B300C7',
        rgb: '230, 0, 255'
      },
      rosado: {
        name: 'Rosado Vibrante',
        primary: '#FF0080',
        hover: '#FF409F',
        dark: '#C70064',
        rgb: '255, 0, 128'
      },
      verde: {
        name: 'Verde Neón',
        primary: '#48FF00',
        hover: '#73FF3A',
        dark: '#39CC00',
        rgb: '72, 255, 0'
      },
      amarillo: {
        name: 'Amarillo Neón',
        primary: '#FAFF00',
        hover: '#FBFF40',
        dark: '#C4C700',
        rgb: '250, 255, 0'
      },
      azul: {
        name: 'Azul Eléctrico',
        primary: '#0066FF',
        hover: '#3385FF',
        dark: '#0047B3',
        rgb: '0, 102, 255'
      },
      cian: {
        name: 'Cian Neón',
        primary: '#00FFF2',
        hover: '#33FFF7',
        dark: '#00B3AA',
        rgb: '0, 255, 242'
      }
    };

    const savedTheme = localStorage.getItem(this.themeKey) || 'rojo';
    this.applyTheme(savedTheme);
  }

  showConfigPage(addToHistory = true) {
    const contentArea = document.querySelector('.content-area');
    if (!contentArea) return;

    if (addToHistory && window.navigationHistory) {
      window.navigationHistory.navigateTo('config');
    }

    document.querySelectorAll('.nav-item').forEach(item => item.classList.remove('active'));

    fetch('./html/config.html')
      .then(response => response.text())
      .then(html => {
        contentArea.innerHTML = html;
        this.bindConfigPage();
      })
      .catch(() => {
        contentArea.innerHTML = `<div class="playlist-empty-state">No se pudo cargar el panel de configuración.</div>`;
      });
  }

  bindConfigPage() {
    const swatches = document.querySelectorAll('.theme-swatch');
    swatches.forEach(swatch => {
      swatch.addEventListener('click', () => {
        const theme = swatch.dataset.theme;
        this.applyTheme(theme);
        this.updateSelectedSwatch(theme);
      });
    });

    document.getElementById('resetThemeBtn')?.addEventListener('click', () => {
      this.applyTheme('rojo');
      this.updateSelectedSwatch('rojo');
    });

    const savedTheme = localStorage.getItem(this.themeKey) || 'rojo';
    this.updateSelectedSwatch(savedTheme);
  }

  applyTheme(themeName) {
    localStorage.setItem(this.themeKey, themeName);

    // ── Modo especial: "Del álbum" ──────────────────────────────────────
    if (themeName === 'album') {
      // Activar el modo dinámico en el auraEngine
      window._auraAlbumModeEnabled = true;

      // Si ya hay una canción sonando, aplicar su color inmediatamente
      const trackImage = document.getElementById('trackImage');
      const src = trackImage?.getAttribute('src');
      if (src && !src.includes('icon.png') && !src.includes('data:')) {
        window.auraEngine?.processAlbumArt(src, true);
      } else {
        // Intentar con el thumbnail de la canción actual
        const currentTrack = window.musicPlayer?.currentTrack || window.appState?.currentTrack;
        if (currentTrack?.thumbnail) {
          window.auraEngine?.processAlbumArt(currentTrack.thumbnail, true);
        }
      }
      return;
    }

    // ── Modo fijo: color elegido ────────────────────────────────────────
    // Desactivar el modo dinámico
    window._auraAlbumModeEnabled = false;

    const theme = this.themes[themeName] || this.themes.rojo;
    const root = document.documentElement;
    root.style.setProperty('--accent-primary', theme.primary);
    root.style.setProperty('--accent-hover',   theme.hover);
    root.style.setProperty('--accent-dark',     theme.dark);
    root.style.setProperty('--accent-rgb',      theme.rgb);
    root.style.setProperty('--accent-soft',     `rgba(${theme.rgb}, 0.14)`);
    root.style.setProperty('--accent-border',   `rgba(${theme.rgb}, 0.28)`);

    // Resetear variables de aura al color fijo elegido
    const [r, g, b] = theme.rgb.split(',').map(s => s.trim());
    root.style.setProperty('--aura-glow',  `rgba(${r}, ${g}, ${b}, 0.14)`);
    root.style.setProperty('--aura-color', `rgba(${r}, ${g}, ${b}, 0.07)`);
  }

  updateSelectedSwatch(activeTheme) {
    document.querySelectorAll('.theme-swatch').forEach(swatch => {
      if (swatch.dataset.theme === activeTheme) {
        swatch.classList.add('selected');
        swatch.setAttribute('aria-pressed', 'true');
      } else {
        swatch.classList.remove('selected');
        swatch.setAttribute('aria-pressed', 'false');
      }
    });
  }

  // Utilidad pública: ¿está activo el modo "Del álbum"?
  static isAlbumModeActive() {
    return localStorage.getItem('seaxmusic_theme') === 'album';
  }
}

window.configManager = new ConfigManager();
