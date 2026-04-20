class ConfigManager {
  constructor() {
    this.themeKey = 'seaxmusic_theme';
    this.themes = {
      rojo: {
        name: 'Rojo',
        primary: '#E13838',
        hover: '#F04848',
        dark: '#C12828',
        rgb: '225, 56, 56'
      },
      naranja: {
        name: 'Naranja',
        primary: '#F08C38',
        hover: '#FF9B37',
        dark: '#C26E24',
        rgb: '240, 140, 56'
      },
      magenta: {
        name: 'Magenta',
        primary: '#A82DDC',
        hover: '#C74EE8',
        dark: '#8B23B1',
        rgb: '168, 45, 220'
      },
      rosado: {
        name: 'Rosado',
        primary: '#FF5CAD',
        hover: '#FF7ED6',
        dark: '#C84382',
        rgb: '255, 92, 173'
      },
      verde: {
        name: 'Verde',
        primary: '#2BB33F',
        hover: '#4CD65C',
        dark: '#1F8A2D',
        rgb: '43, 179, 63'
      },
      amarillo: {
        name: 'Amarillo',
        primary: '#F5C82E',
        hover: '#F5D74F',
        dark: '#C7A423',
        rgb: '245, 200, 46'
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

    this.updateSelectedSwatch(localStorage.getItem(this.themeKey) || 'rojo');
  }

  applyTheme(themeName) {
    const theme = this.themes[themeName] || this.themes.rojo;
    document.documentElement.style.setProperty('--accent-primary', theme.primary);
    document.documentElement.style.setProperty('--accent-hover', theme.hover);
    document.documentElement.style.setProperty('--accent-dark', theme.dark);
    document.documentElement.style.setProperty('--accent-rgb', theme.rgb);
    document.documentElement.style.setProperty('--accent-soft', `rgba(${theme.rgb}, 0.14)`);
    document.documentElement.style.setProperty('--accent-border', `rgba(${theme.rgb}, 0.28)`);
    localStorage.setItem(this.themeKey, themeName);
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
}

window.configManager = new ConfigManager();
