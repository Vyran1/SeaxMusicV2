const { autoUpdater } = require('electron-updater');
const { app, dialog, BrowserWindow } = require('electron');

class AppUpdater {
    constructor() {
        this.updateAvailable = false;
        this.updateDownloaded = false;
        
        // Configuración del auto-updater
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = true;
        
        // En desarrollo, no verificar actualizaciones automáticamente
        if (process.env.NODE_ENV === 'development' || !app.isPackaged) {
            console.log('🔧 Modo desarrollo - Auto-updater deshabilitado');
            return;
        }
        
        this.setupEventListeners();
    }
    
    setupEventListeners() {
        // Verificando actualizaciones
        autoUpdater.on('checking-for-update', () => {
            console.log('🔍 Buscando actualizaciones...');
            this.sendStatusToWindow('checking-for-update');
        });
        
        // Actualización disponible
        autoUpdater.on('update-available', (info) => {
            console.log('✅ Actualización disponible:', info.version);
            this.updateAvailable = true;
            this.sendStatusToWindow('update-available', info);
            
            // Notificar al usuario
            this.notifyUpdateAvailable(info);
        });
        
        // No hay actualizaciones
        autoUpdater.on('update-not-available', (info) => {
            console.log('ℹ️ No hay actualizaciones disponibles');
            this.sendStatusToWindow('update-not-available', info);
        });
        
        // Error en la actualización
        autoUpdater.on('error', (err) => {
            console.error('❌ Error en auto-updater:', err);
            this.sendStatusToWindow('error', err.message);
        });
        
        // Progreso de descarga
        autoUpdater.on('download-progress', (progressObj) => {
            const logMessage = `Velocidad: ${this.formatBytes(progressObj.bytesPerSecond)}/s - ` +
                              `${Math.round(progressObj.percent)}% - ` +
                              `${this.formatBytes(progressObj.transferred)} / ${this.formatBytes(progressObj.total)}`;
            console.log('📥', logMessage);
            this.sendStatusToWindow('download-progress', progressObj);
        });
        
        // Actualización descargada
        autoUpdater.on('update-downloaded', (info) => {
            console.log('✅ Actualización descargada:', info.version);
            this.updateDownloaded = true;
            this.sendStatusToWindow('update-downloaded', info);
            
            // Preguntar al usuario si quiere reiniciar
            this.promptInstallUpdate(info);
        });
    }
    
    // Verificar actualizaciones manualmente
    checkForUpdates() {
        if (!app.isPackaged) {
            console.log('🔧 No se verifican actualizaciones en modo desarrollo');
            return Promise.resolve({ updateAvailable: false });
        }
        
        return autoUpdater.checkForUpdates();
    }
    
    // Verificar actualizaciones silenciosamente (al iniciar la app)
    checkForUpdatesAndNotify() {
        if (!app.isPackaged) {
            return;
        }
        
        autoUpdater.checkForUpdatesAndNotify();
    }
    
    // Instalar actualización y reiniciar
    quitAndInstall() {
        autoUpdater.quitAndInstall(false, true);
    }
    
    // Notificar al usuario que hay una actualización disponible
    notifyUpdateAvailable(info) {
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (mainWindow) {
            mainWindow.webContents.send('update-notification', {
                type: 'available',
                version: info.version,
                releaseNotes: info.releaseNotes
            });
        }
    }
    
    // Preguntar si quiere instalar la actualización
    async promptInstallUpdate(info) {
        const mainWindow = BrowserWindow.getAllWindows()[0];
        
        const result = await dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: '¡Actualización Lista!',
            message: `SeaxMusic v${info.version} está listo para instalar.`,
            detail: 'La actualización se descargó correctamente. ¿Quieres reiniciar la aplicación ahora para aplicar los cambios?',
            buttons: ['Reiniciar Ahora', 'Más Tarde'],
            defaultId: 0,
            cancelId: 1
        });
        
        if (result.response === 0) {
            this.quitAndInstall();
        }
    }
    
    // Enviar estado a la ventana del renderer
    sendStatusToWindow(status, data = null) {
        const mainWindow = BrowserWindow.getAllWindows()[0];
        if (mainWindow && !mainWindow.isDestroyed()) {
            mainWindow.webContents.send('update-status', { status, data });
        }
    }
    
    // Formatear bytes para mostrar
    formatBytes(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }
}

module.exports = AppUpdater;
