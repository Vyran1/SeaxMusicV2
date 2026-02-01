const { autoUpdater } = require('electron-updater');
const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
const fs = require('fs');
const https = require('https');

class AppUpdater {
    constructor() {
        this.updateAvailable = false;
        this.updateDownloaded = false;
        this.updateWindow = null;
        this.mainWindow = null;
        this.pendingUpdateInfo = null;
        this._minimizeMainHandler = null;
        this._restoreMainHandler = null;
        this._focusMainHandler = null;
        this._closeMainHandler = null;
        this._allowClose = false;
        
        // GitHub repo info para obtener releases
        this.githubOwner = 'Vyran1';
        this.githubRepo = 'SeaxMusicV2';
        
        // Ruta para persistir actualización pendiente
        this.updateInfoPath = path.join(app.getPath('userData'), 'pending-update.json');
        
        // Configuración del auto-updater
        autoUpdater.autoDownload = true;
        autoUpdater.autoInstallOnAppQuit = false; // NO instalar automáticamente
        
        this.setupEventListeners();
    }
    
    /**
     * Comparar versiones: retorna true si a > b
     */
    isVersionGreater(a, b) {
        if (!a || !b) return false;
        // Limpiar prefijo 'v' si existe
        const cleanA = a.replace(/^v/, '');
        const cleanB = b.replace(/^v/, '');
        const pa = cleanA.split('.').map(Number);
        const pb = cleanB.split('.').map(Number);
        for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
            const numA = pa[i] || 0;
            const numB = pb[i] || 0;
            if (numA > numB) return true;
            if (numA < numB) return false;
        }
        return false;
    }
    
    /**
     * Obtener releases de GitHub
     */
    async fetchGitHubReleases() {
        return new Promise((resolve, reject) => {
            const options = {
                hostname: 'api.github.com',
                path: `/repos/${this.githubOwner}/${this.githubRepo}/releases`,
                method: 'GET',
                headers: {
                    'User-Agent': 'SeaxMusic-Updater',
                    'Accept': 'application/vnd.github.v3+json'
                }
            };
            
            const req = https.request(options, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    try {
                        if (res.statusCode === 200) {
                            const releases = JSON.parse(data);
                            resolve(releases);
                        } else {
                            console.log('⚠️ GitHub API respondió con:', res.statusCode);
                            resolve([]);
                        }
                    } catch (e) {
                        console.error('❌ Error parseando releases:', e);
                        resolve([]);
                    }
                });
            });
            
            req.on('error', (e) => {
                console.error('❌ Error obteniendo releases de GitHub:', e);
                resolve([]);
            });
            
            req.end();
        });
    }
    
    /**
     * Formatear releases de GitHub para el modal
     */
    formatReleasesForModal(releases, currentVersion) {
        if (!releases || releases.length === 0) return [];
        
        return releases
            .filter(r => !r.draft && !r.prerelease)
            .filter(r => this.isVersionGreater(r.tag_name, currentVersion))
            .map(r => ({
                version: r.tag_name.replace(/^v/, ''),
                notes: r.body || 'Sin notas de versión',
                date: r.published_at ? r.published_at.split('T')[0] : ''
            }))
            .sort((a, b) => this.isVersionGreater(a.version, b.version) ? -1 : 1);
    }
    
    /**
     * Cargar actualización pendiente desde archivo
     */
    loadPendingUpdate() {
        try {
            if (fs.existsSync(this.updateInfoPath)) {
                const data = fs.readFileSync(this.updateInfoPath, 'utf8');
                this.pendingUpdateInfo = JSON.parse(data);
                console.log('📦 Actualización pendiente cargada:', this.pendingUpdateInfo.version);
                return this.pendingUpdateInfo;
            }
        } catch (e) {
            console.error('❌ Error cargando actualización pendiente:', e);
        }
        return null;
    }
    
    /**
     * Guardar actualización pendiente
     */
    savePendingUpdate(info) {
        try {
            const saveData = {
                version: info.version,
                releaseNotes: info.releaseNotes,
                releaseDate: info.releaseDate,
                timestamp: new Date().toISOString()
            };
            fs.writeFileSync(this.updateInfoPath, JSON.stringify(saveData, null, 2), 'utf8');
            console.log('💾 Actualización pendiente guardada:', info.version);
        } catch (e) {
            console.error('❌ Error guardando actualización pendiente:', e);
        }
    }
    
    /**
     * Limpiar actualización pendiente
     */
    clearPendingUpdate() {
        try {
            if (fs.existsSync(this.updateInfoPath)) {
                fs.unlinkSync(this.updateInfoPath);
                console.log('🗑️ Actualización pendiente eliminada');
            }
            this.pendingUpdateInfo = null;
        } catch (e) {
            console.error('❌ Error limpiando actualización pendiente:', e);
        }
    }
    
    /**
     * Verificar y mostrar actualización pendiente al iniciar
     */
    async checkAndShowPendingUpdate() {
        const pending = this.loadPendingUpdate();
        const currentVersion = app.getVersion();
        
        if (pending) {
            // Verificar que la versión pendiente sea MAYOR que la actual
            if (this.isVersionGreater(pending.version, currentVersion)) {
                console.log('🔔 Mostrando actualización pendiente:', pending.version, '> actual:', currentVersion);
                
                // Si no tiene releaseNotes formateados, obtenerlos de GitHub
                if (!pending.releaseNotes || (Array.isArray(pending.releaseNotes) && pending.releaseNotes.length === 0)) {
                    const releases = await this.fetchGitHubReleases();
                    const formattedReleases = this.formatReleasesForModal(releases, currentVersion);
                    if (formattedReleases.length > 0) {
                        pending.releaseNotes = formattedReleases;
                    }
                }
                
                setTimeout(() => {
                    this.promptInstallUpdate(pending);
                }, 1500);
                return true;
            } else {
                // Si la versión pendiente es igual o menor, eliminarla
                console.log('🗑️ Versión pendiente obsoleta:', pending.version, '<= actual:', currentVersion);
                this.clearPendingUpdate();
            }
        }
        return false;
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
        autoUpdater.on('update-downloaded', async (info) => {
            console.log('✅ Actualización descargada:', info.version);
            this.updateDownloaded = true;
            
            // Obtener releases de GitHub para mostrar en el modal
            const currentVersion = app.getVersion();
            const releases = await this.fetchGitHubReleases();
            const formattedReleases = this.formatReleasesForModal(releases, currentVersion);
            
            // Enriquecer info con releases de GitHub
            const enrichedInfo = {
                ...info,
                releaseNotes: formattedReleases.length > 0 ? formattedReleases : info.releaseNotes,
                releaseDate: info.releaseDate || new Date().toISOString()
            };
            
            // Guardar como pendiente
            this.savePendingUpdate(enrichedInfo);
            
            this.sendStatusToWindow('update-downloaded', enrichedInfo);
            
            // Mostrar modal de actualización
            this.promptInstallUpdate(enrichedInfo);
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
    
    // Preguntar si quiere instalar la actualización
    promptInstallUpdate(info) {
        // En modo dev, no mostrar modal de actualización
        if (!app.isPackaged) {
            console.log('🔧 Modo desarrollo: Modal de actualización omitido');
            return;
        }
        
        this.mainWindow = BrowserWindow.getAllWindows()[0];
        if (!this.mainWindow) return;

        // Si ya existe una ventana de update, solo enfocarla
        if (this.updateWindow && !this.updateWindow.isDestroyed()) {
            this.updateWindow.focus();
            return;
        }
        
        this._allowClose = false;

        this.updateWindow = new BrowserWindow({
            width: 900,
            height: 520,
            minWidth: 900,
            minHeight: 520,
            maxWidth: 900,
            maxHeight: 520,
            parent: this.mainWindow,
            modal: true,
            resizable: false,
            minimizable: false,
            maximizable: false,
            movable: false,
            closable: false,
            show: false,
            frame: false,
            backgroundColor: '#232323',
            skipTaskbar: true,
            alwaysOnTop: true,
            webPreferences: {
                nodeIntegration: false,
                contextIsolation: true,
                preload: require('path').join(__dirname, '../preload/updatePreload.js')
            }
        });

        // Bloquear mainWindow
        this.mainWindow.setEnabled(false);
        
        // Sincronizar minimizar/restaurar
        this._minimizeMainHandler = () => {
            if (this.updateWindow && !this.updateWindow.isDestroyed()) {
                this.updateWindow.minimize();
            }
        };
        this.mainWindow.on('minimize', this._minimizeMainHandler);
        
        this._restoreMainHandler = () => {
            if (this.updateWindow && !this.updateWindow.isDestroyed()) {
                this.updateWindow.restore();
                this.updateWindow.show();
                this.updateWindow.focus();
            }
        };
        this.mainWindow.on('restore', this._restoreMainHandler);
        
        // Cuando se cierra el main, cerrar el modal también (sin instalar)
        this._closeMainHandler = () => {
            console.log('🔒 Main cerrado - cerrando modal de update (sin instalar)');
            // Guardar la actualización pendiente para el próximo inicio
            this.savePendingUpdate(info);
            this.closeUpdateWindow();
        };
        this.mainWindow.on('close', this._closeMainHandler);
        
        // Mantener foco en updateWindow
        this._focusMainHandler = () => {
            if (this.updateWindow && !this.updateWindow.isDestroyed()) {
                setTimeout(() => this.updateWindow.focus(), 50);
            }
        };
        this.mainWindow.on('focus', this._focusMainHandler);

        this.updateWindow.loadFile(require('path').join(__dirname, '../renderer/html/update.html'));

        this.updateWindow.once('ready-to-show', () => {
            this.updateWindow.show();
            this.updateWindow.focus();
            
            // Notificar al main renderer que el modal se abrió
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.webContents.send('update-modal-opened');
            }
            
            // Enviar info de actualización
            const updateData = {
                currentVersion: app.getVersion(),
                version: info.version,
                releaseNotes: info.releaseNotes,
                releaseDate: info.releaseDate || new Date().toISOString()
            };
            this.updateWindow.webContents.send('update-info', updateData);
        });

        // Prevenir cierre accidental
        this.updateWindow.on('close', (e) => {
            if (!this._allowClose) {
                e.preventDefault();
                this.updateWindow.show();
                this.updateWindow.focus();
            }
        });

        // IPC: Actualizar ahora
        const { ipcMain } = require('electron');
        ipcMain.removeAllListeners('update-install');
        ipcMain.on('update-install', () => {
            console.log('🚀 Usuario eligió instalar actualización');
            
            if (!app.isPackaged) {
                console.log('DEV MODE: install skipped - mostrando mensaje');
                // En modo dev, mostrar mensaje en lugar de cerrar silenciosamente
                if (this.updateWindow && !this.updateWindow.isDestroyed()) {
                    this.updateWindow.webContents.send('update-dev-mode', {
                        message: 'Modo desarrollo: La instalación se omite. En producción, la app se reiniciaría para actualizar.'
                    });
                }
                return;
            }
            
            this.clearPendingUpdate();
            this.closeUpdateWindow();
            
            if (this.updateDownloaded) {
                this.quitAndInstall();
            }
        });

        // IPC: Más tarde
        ipcMain.removeAllListeners('update-later');
        ipcMain.on('update-later', () => {
            console.log('⏰ Usuario pospuso la actualización');
            // Guardar para mostrar en próximo inicio
            this.savePendingUpdate(info);
            this.closeUpdateWindow();
        });

        // Al cerrar ventana
        this.updateWindow.on('closed', () => {
            this.cleanupWindowSync();
            if (this.mainWindow && !this.mainWindow.isDestroyed()) {
                this.mainWindow.setEnabled(true);
                this.mainWindow.webContents.send('update-modal-closed');
            }
            this.updateWindow = null;
        });
    }
    
    /**
     * Limpiar sincronización de ventanas
     */
    cleanupWindowSync() {
        if (this.mainWindow && !this.mainWindow.isDestroyed()) {
            if (this._minimizeMainHandler) {
                this.mainWindow.removeListener('minimize', this._minimizeMainHandler);
            }
            if (this._restoreMainHandler) {
                this.mainWindow.removeListener('restore', this._restoreMainHandler);
            }
            if (this._focusMainHandler) {
                this.mainWindow.removeListener('focus', this._focusMainHandler);
            }
            if (this._closeMainHandler) {
                this.mainWindow.removeListener('close', this._closeMainHandler);
            }
            try {
                this.mainWindow.setEnabled(true);
            } catch (e) {}
        }
        this._minimizeMainHandler = null;
        this._restoreMainHandler = null;
        this._focusMainHandler = null;
        this._closeMainHandler = null;
    }
    
    /**
     * Cerrar ventana de update de forma segura
     */
    closeUpdateWindow() {
        if (this.updateWindow && !this.updateWindow.isDestroyed()) {
            this._allowClose = true;
            this.cleanupWindowSync();
            this.updateWindow.close();
            this.updateWindow = null;
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
