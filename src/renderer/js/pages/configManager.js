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

    // Vincular controles de atajos de teclado
    this.bindHotkeysConfig();
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

  // ===== CONFIGURACIÓN DE ATAJOS DE TECLADO GLOBALES =====

  async bindHotkeysConfig() {
    if (!window.electronAPI || !window.electronAPI.getHotkeys) {
      console.warn('[CONFIG] Electron API para atajos no disponible.');
      return;
    }

    try {
      const { hotkeys, enabled } = await window.electronAPI.getHotkeys();

      // Cargar switch de habilitación general
      const toggleCheckbox = document.getElementById('toggleHotkeysEnabled');
      if (toggleCheckbox) {
        toggleCheckbox.checked = enabled;

        // Configurar toggle switch visual
        const switchContainer = document.querySelector('.switch-container');
        switchContainer?.addEventListener('click', async (e) => {
          if (e.target.tagName === 'INPUT') return;
          toggleCheckbox.checked = !toggleCheckbox.checked;
          const isChecked = toggleCheckbox.checked;
          await window.electronAPI.toggleHotkeysEnabled(isChecked);
          this.showStatusMsg(isChecked ? 'Atajos globales activados' : 'Atajos globales desactivados');
        });
      }

      // Renderizar atajos actuales
      for (const [action, accelerator] of Object.entries(hotkeys)) {
        this.renderHotkey(action, accelerator);
      }

      // Configurar botones de grabar y limpiar
      document.querySelectorAll('.hotkey-item').forEach(item => {
        const action = item.dataset.action;
        
        // Botón Grabar
        const recordBtn = item.querySelector('.record-btn');
        recordBtn?.addEventListener('click', () => {
          this.startRecordingHotkey(action);
        });

        // Botón Limpiar
        const clearBtn = item.querySelector('.clear-btn');
        clearBtn?.addEventListener('click', async () => {
          const res = await window.electronAPI.setHotkey(action, '');
          if (res && res.success) {
            this.renderHotkey(action, '');
            this.showStatusMsg('Atajo eliminado.');
          }
        });
      });

      // Botón Restablecer Todo
      document.getElementById('resetAllHotkeysBtn')?.addEventListener('click', async () => {
        const res = await window.electronAPI.resetHotkeys();
        if (res && res.success) {
          for (const [act, acc] of Object.entries(res.hotkeys)) {
            this.renderHotkey(act, acc);
          }
          this.showStatusMsg('Valores predeterminados restaurados.');
        }
      });

    } catch (e) {
      console.error('[CONFIG] Error vinculando configuración de atajos:', e);
    }
  }

  renderHotkey(action, accelerator) {
    const displayDiv = document.getElementById(`display-${action}`);
    if (!displayDiv) return;
    displayDiv.innerHTML = '';

    if (!accelerator || accelerator.trim() === '') {
      const span = document.createElement('span');
      span.className = 'empty-shortcut';
      span.textContent = 'Sin asignar';
      displayDiv.appendChild(span);
      return;
    }

    const parts = accelerator.split('+');
    parts.forEach((part, index) => {
      const cleanPart = part.trim();
      const kbd = document.createElement('kbd');

      // Traducciones estéticas cortas para keycaps
      if (cleanPart === 'CommandOrControl' || cleanPart === 'Ctrl') {
        kbd.textContent = 'Ctrl';
      } else if (cleanPart === 'MediaPlayPause') {
        kbd.textContent = 'Media Play/Pause';
      } else if (cleanPart === 'MediaNextTrack') {
        kbd.textContent = 'Media Next';
      } else if (cleanPart === 'MediaPreviousTrack') {
        kbd.textContent = 'Media Prev';
      } else if (cleanPart === 'Up') {
        kbd.textContent = '↑';
      } else if (cleanPart === 'Down') {
        kbd.textContent = '↓';
      } else if (cleanPart === 'Left') {
        kbd.textContent = '←';
      } else if (cleanPart === 'Right') {
        kbd.textContent = '→';
      } else {
        kbd.textContent = cleanPart;
      }

      displayDiv.appendChild(kbd);

      if (index < parts.length - 1) {
        const plus = document.createElement('span');
        plus.className = 'plus-connector';
        plus.textContent = ' + ';
        displayDiv.appendChild(plus);
      }
    });
  }

  startRecordingHotkey(action) {
    // Si ya estamos grabando para otra acción, cancelarla primero
    if (this.recordingAction) {
      this.cancelRecording(this.recordingAction);
    }

    this.recordingAction = action;

    const item = document.querySelector(`.hotkey-item[data-action="${action}"]`);
    item?.classList.add('recording');

    const btn = item?.querySelector('.record-btn');
    if (btn) {
      btn.querySelector('span').textContent = 'Grabando...';
      btn.querySelector('i').className = 'fas fa-circle-notch fa-spin';
    }

    // Limpiar pantalla mostrando estado inicial de escucha
    const displayDiv = document.getElementById(`display-${action}`);
    if (displayDiv) {
      displayDiv.innerHTML = '<span class="empty-shortcut pulse">Presiona una combinación...</span>';
    }

    // Registrar listener del teclado (modo captura activa)
    this.activeRecordingListener = (e) => {
      // Prevenir atajos globales del navegador o reproductor local mientras grabamos
      e.preventDefault();
      e.stopPropagation();

      const result = this.parseKeyboardEvent(e);

      // Renderizar feedback visual en tiempo real
      this.renderRecordingPreview(action, result);

      // Si presionó una tecla física completa, guardar el atajo
      if (result.complete) {
        this.saveRecordedHotkey(action, result);
      }
    };

    // Escucha con captura estricta (useCapture = true)
    window.addEventListener('keydown', this.activeRecordingListener, true);

    // Cancelar la grabación al hacer clic en otro lugar
    this.activeCancelListener = (e) => {
      if (e.target.closest('.record-btn')) return;
      this.cancelRecording(action);
    };
    
    setTimeout(() => {
      window.addEventListener('click', this.activeCancelListener);
    }, 50);
  }

  parseKeyboardEvent(e) {
    const modifiers = [];
    if (e.ctrlKey) modifiers.push('CommandOrControl');
    if (e.altKey) modifiers.push('Alt');
    if (e.shiftKey) modifiers.push('Shift');
    if (e.metaKey) modifiers.push('Meta');

    let key = '';
    const keyName = e.key;
    const code = e.code;

    // Ignorar si solo se presionan teclas modificadoras solas
    if (['Control', 'Alt', 'Shift', 'Meta'].includes(keyName)) {
      return { modifiers, key: '', complete: false };
    }

    // Mapeo físico e inteligente
    if (code.startsWith('Key')) {
      key = code.substring(3).toUpperCase();
    } else if (code.startsWith('Digit')) {
      key = code.substring(5);
    } else if (code.startsWith('Numpad') && code.length > 6) {
      key = code.substring(6);
    } else if (code.startsWith('F') && code.length <= 3) {
      key = code;
    } else {
      switch (keyName) {
        case ' ':
          key = 'Space';
          break;
        case 'ArrowUp':
          key = 'Up';
          break;
        case 'ArrowDown':
          key = 'Down';
          break;
        case 'ArrowLeft':
          key = 'Left';
          break;
        case 'ArrowRight':
          key = 'Right';
          break;
        case 'Escape':
          key = 'Escape';
          break;
        case 'Enter':
          key = 'Enter';
          break;
        case 'Tab':
          key = 'Tab';
          break;
        case 'Backspace':
          key = 'Backspace';
          break;
        case 'Delete':
          key = 'Delete';
          break;
        case 'Insert':
          key = 'Insert';
          break;
        case 'Home':
          key = 'Home';
          break;
        case 'End':
          key = 'End';
          break;
        case 'PageUp':
          key = 'PageUp';
          break;
        case 'PageDown':
          key = 'PageDown';
          break;
        case 'AudioVolumeUp':
        case 'VolumeUp':
          key = 'VolumeUp';
          break;
        case 'AudioVolumeDown':
        case 'VolumeDown':
          key = 'VolumeDown';
          break;
        case 'AudioVolumeMute':
        case 'VolumeMute':
          key = 'VolumeMute';
          break;
        case 'MediaPlayPause':
          key = 'MediaPlayPause';
          break;
        case 'MediaNextTrack':
          key = 'MediaNextTrack';
          break;
        case 'MediaPreviousTrack':
          key = 'MediaPreviousTrack';
          break;
        default:
          if (keyName.length === 1) {
            key = keyName.toUpperCase();
          } else {
            key = keyName;
          }
      }
    }

    // Seguridad: Si no es una tecla multimedia, flecha, volumen o tecla de función (F1-F12),
    // requerir obligatoriamente al menos un modificador (Ctrl, Alt, Shift) para no secuestrar
    // el teclado general del usuario al escribir en otras apps.
    const isSpecialSingleKey = ['Up', 'Down', 'Left', 'Right', 'Space', 'Enter', 'Tab', 'Backspace', 'Delete', 'Insert', 'Home', 'End', 'PageUp', 'PageDown', 'VolumeUp', 'VolumeDown', 'VolumeMute', 'MediaPlayPause', 'MediaNextTrack', 'MediaPreviousTrack', 'Escape'].includes(key) || (key.startsWith('F') && key.length <= 3);
    
    if (!isSpecialSingleKey && modifiers.length === 0) {
      return { modifiers, key, complete: false };
    }

    return { modifiers, key, complete: key !== '' };
  }

  renderRecordingPreview(action, result) {
    const displayDiv = document.getElementById(`display-${action}`);
    if (!displayDiv) return;
    displayDiv.innerHTML = '';

    const { modifiers, key } = result;

    if (modifiers.length === 0 && !key) {
      displayDiv.innerHTML = '<span class="empty-shortcut pulse">Presionando teclas...</span>';
      return;
    }

    // Pintar modificadores
    modifiers.forEach(mod => {
      const kbd = document.createElement('kbd');
      kbd.textContent = mod === 'CommandOrControl' ? 'Ctrl' : mod;
      displayDiv.appendChild(kbd);

      const plus = document.createElement('span');
      plus.className = 'plus-connector';
      plus.textContent = ' + ';
      displayDiv.appendChild(plus);
    });

    // Pintar tecla final
    if (key) {
      const kbd = document.createElement('kbd');
      kbd.textContent = key;
      displayDiv.appendChild(kbd);
    } else {
      const span = document.createElement('span');
      span.className = 'empty-shortcut';
      span.textContent = '...';
      displayDiv.appendChild(span);
    }
  }

  async saveRecordedHotkey(action, result) {
    this.removeRecordingListeners();

    // Reconstruir acelerador Electron
    let accelerator = '';
    if (result.modifiers.length > 0) {
      accelerator = result.modifiers.join('+') + '+' + result.key;
    } else {
      accelerator = result.key;
    }

    // Cancelar en caso de Escape
    if (accelerator === 'Escape') {
      this.cancelRecording(action);
      return;
    }

    console.log(`[CONFIG] Guardando atajo para "${action}":`, accelerator);

    const res = await window.electronAPI.setHotkey(action, accelerator);

    // Limpiar UI visual
    const item = document.querySelector(`.hotkey-item[data-action="${action}"]`);
    item?.classList.remove('recording');

    const btn = item?.querySelector('.record-btn');
    if (btn) {
      btn.querySelector('span').textContent = 'Grabar';
      btn.querySelector('i').className = 'fas fa-keyboard';
    }

    if (res && res.success) {
      this.renderHotkey(action, accelerator);
      this.showStatusMsg('Atajo de teclado configurado exitosamente.');
    } else {
      // Si falló, recuperar atajo viejo y renderizarlo
      const { hotkeys } = await window.electronAPI.getHotkeys();
      this.renderHotkey(action, hotkeys[action]);
      this.showStatusMsg(res ? res.error : 'Conflicto de registro.', true);
    }

    this.recordingAction = null;
  }

  cancelRecording(action) {
    this.removeRecordingListeners();

    const item = document.querySelector(`.hotkey-item[data-action="${action}"]`);
    item?.classList.remove('recording');

    const btn = item?.querySelector('.record-btn');
    if (btn) {
      btn.querySelector('span').textContent = 'Grabar';
      btn.querySelector('i').className = 'fas fa-keyboard';
    }

    // Recargar original
    window.electronAPI.getHotkeys().then(({ hotkeys }) => {
      this.renderHotkey(action, hotkeys[action]);
    });

    this.showStatusMsg('Grabación de atajo cancelada.');
    this.recordingAction = null;
  }

  removeRecordingListeners() {
    if (this.activeRecordingListener) {
      window.removeEventListener('keydown', this.activeRecordingListener, true);
      this.activeRecordingListener = null;
    }
    if (this.activeCancelListener) {
      window.removeEventListener('click', this.activeCancelListener);
      this.activeCancelListener = null;
    }
  }

  showStatusMsg(text, isError = false) {
    const msg = document.getElementById('hotkeysStatusMsg');
    if (!msg) return;

    msg.textContent = text;
    msg.className = 'hotkeys-status-msg' + (isError ? ' error show' : ' show');

    if (this.statusMsgTimer) clearTimeout(this.statusMsgTimer);
    this.statusMsgTimer = setTimeout(() => {
      msg.classList.remove('show');
    }, 4000);
  }

  // Utilidad pública: ¿está activo el modo "Del álbum"?
  static isAlbumModeActive() {
    return localStorage.getItem('seaxmusic_theme') === 'album';
  }
}

window.configManager = new ConfigManager();
