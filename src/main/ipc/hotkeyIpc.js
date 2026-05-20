const { app, globalShortcut, ipcMain } = require('electron');
const Store = require('electron-store');
const state = require('../state');

// Inicializar el almacén para los atajos de teclado con valores seguros por defecto
const hotkeyStore = new Store({
  name: 'hotkeys-config',
  defaults: {
    hotkeys: {
      playPause: 'MediaPlayPause',
      next: 'MediaNextTrack',
      prev: 'MediaPreviousTrack',
      volumeUp: 'CommandOrControl+Alt+Up',
      volumeDown: 'CommandOrControl+Alt+Down',
      mute: 'CommandOrControl+Alt+M'
    },
    enabled: true
  }
});

/**
 * Registra todos los atajos de teclado configurados usando la API globalShortcut de Electron.
 */
function registerAllHotkeys() {
  // Primero, desregistrar todo para evitar duplicados o fugas de atajos
  globalShortcut.unregisterAll();

  // Si los atajos están desactivados en ajustes, detenerse aquí
  if (!hotkeyStore.get('enabled')) {
    console.log('[HOTKEYS] Los atajos globales están desactivados en la configuración.');
    return;
  }

  const hotkeys = hotkeyStore.get('hotkeys');
  console.log('[HOTKEYS] Registrando atajos globales en el sistema:', hotkeys);

  for (const [action, accelerator] of Object.entries(hotkeys)) {
    if (!accelerator || accelerator.trim() === '') {
      continue;
    }

    try {
      const registered = globalShortcut.register(accelerator, () => {
        console.log(`[HOTKEYS] Atajo disparado: ${action} (${accelerator})`);
        
        // Notificar a la ventana principal del disparador
        if (state.mainWindow && !state.mainWindow.isDestroyed()) {
          state.mainWindow.webContents.send('global-hotkey-triggered', { action });
        }
      });

      if (!registered) {
        console.error(`[HOTKEYS] Falló el registro del atajo global: "${accelerator}" para la acción: "${action}"`);
      }
    } catch (error) {
      console.error(`[HOTKEYS] Error crítico registrando el acelerador "${accelerator}":`, error);
    }
  }
}

// Registrar automáticamente al estar listo
if (app.isReady()) {
  registerAllHotkeys();
} else {
  app.whenReady().then(() => {
    registerAllHotkeys();
  });
}

// Limpiar shortcuts al cerrar la aplicación de forma limpia
app.on('will-quit', () => {
  globalShortcut.unregisterAll();
  console.log('[HOTKEYS] Todos los atajos globales han sido liberados.');
});

// ===== CONTROLADORES IPC =====

// Obtener la configuración actual de atajos
ipcMain.handle('get-hotkeys', async () => {
  return {
    hotkeys: hotkeyStore.get('hotkeys'),
    enabled: hotkeyStore.get('enabled')
  };
});

// Asignar un nuevo atajo para una acción específica con validación en caliente
ipcMain.handle('set-hotkey', async (event, { action, accelerator }) => {
  try {
    const currentHotkeys = hotkeyStore.get('hotkeys');
    const oldAccelerator = currentHotkeys[action];

    // Caso de limpieza de atajo (quedar vacío)
    if (!accelerator || accelerator.trim() === '') {
      currentHotkeys[action] = '';
      hotkeyStore.set('hotkeys', currentHotkeys);
      registerAllHotkeys();
      return { success: true, hotkeys: currentHotkeys };
    }

    // Validar si el atajo ya está ocupado por otra acción dentro de nuestra app
    for (const [otherAction, otherAcc] of Object.entries(currentHotkeys)) {
      if (otherAction !== action && otherAcc === accelerator) {
        return { success: false, error: 'Este atajo ya está asignado a otra acción.' };
      }
    }

    // Validar compatibilidad de registro en el sistema operativo mediante registro temporal
    if (accelerator !== oldAccelerator) {
      // Liberar el viejo temporalmente
      if (oldAccelerator) {
        try {
          globalShortcut.unregister(oldAccelerator);
        } catch (e) {}
      }

      const success = globalShortcut.register(accelerator, () => {
        if (state.mainWindow && !state.mainWindow.isDestroyed()) {
          state.mainWindow.webContents.send('global-hotkey-triggered', { action });
        }
      });

      if (!success) {
        // Falló: Revertir al estado de atajos previos y notificar
        registerAllHotkeys();
        return { success: false, error: 'Este atajo ya está en uso por otra app o no es soportado.' };
      }

      // Registro exitoso, desregistrar el de prueba para que se guarde limpiamente
      globalShortcut.unregister(accelerator);
    }

    // Guardar nuevo valor
    currentHotkeys[action] = accelerator;
    hotkeyStore.set('hotkeys', currentHotkeys);
    
    // Re-registrar con el set de atajos actualizado
    registerAllHotkeys();
    
    return { success: true, hotkeys: currentHotkeys };
  } catch (error) {
    console.error('[HOTKEYS] Error al intentar configurar el atajo:', error);
    registerAllHotkeys();
    return { success: false, error: 'Atajo inválido o combinación no soportada.' };
  }
});

// Restablecer atajos de fábrica
ipcMain.handle('reset-hotkeys', async () => {
  hotkeyStore.reset('hotkeys');
  registerAllHotkeys();
  return { success: true, hotkeys: hotkeyStore.get('hotkeys') };
});

// Activar o desactivar el control por atajos
ipcMain.handle('toggle-hotkeys-enabled', async (event, { enabled }) => {
  hotkeyStore.set('enabled', !!enabled);
  registerAllHotkeys();
  return { success: true, enabled: hotkeyStore.get('enabled') };
});
