const { ipcMain, app } = require('electron');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const Store = require('electron-store');
const state = require('../state');

// Almacén seguro con validación estricta del esquema de datos
const favoritesSchema = {
  favorites: {
    type: 'array',
    default: [],
    items: {
      type: 'object',
      properties: {
        videoId: { type: 'string' },
        title: { type: 'string' },
        thumbnail: { type: 'string' },
        author: { type: 'string' },
        duration: { type: ['string', 'number'] },
        addedAt: { type: ['string', 'number'] }
      },
      required: ['videoId']
    }
  }
};

function getCurrentUserData() {
  try {
    const data = state.sessionStore.store;
    if (data && Object.keys(data).length > 0) {
      return data;
    }
  } catch (e) {
    console.error('[FAVORITES] Error obteniendo sesión del store:', e);
  }
  return null;
}

function buildUserKey(user) {
  if (!user) return 'guest';
  const name = (user.name || '').trim().toLowerCase();
  const email = (user.email || '').trim().toLowerCase();
  const handle = (user.handle || '').trim().toLowerCase();
  return (email && name) ? `${email}|${name}` : (email || handle || name || 'guest');
}

// ⭐ OBTENER ALMACÉN CON MIGRACIONES DE SEGURIDAD PARA MÚLTIPLES USUARIOS
function getFavoritesStore(user) {
  const userKey = buildUserKey(user);
  const isGuest = userKey === 'guest';
  const name = isGuest ? 'favorites' : `favorites-${crypto.createHash('sha256').update(userKey).digest('hex').slice(0, 12)}`;
  const filePath = path.join(app.getPath('userData'), `${name}.json`);

  // 1. Detectar y convertir formato array legacy a objeto compatible con el esquema de electron-store
  if (fs.existsSync(filePath)) {
    try {
      const rawData = fs.readFileSync(filePath, 'utf8').trim();
      if (rawData.startsWith('[')) {
        console.log(`[MIGRATION] Formato array legacy detectado en ${name}.json. Migrando a electron-store...`);
        const legacyArray = JSON.parse(rawData);
        
        // Crear un respaldo atómico de seguridad antes de transformar el archivo
        fs.writeFileSync(`${filePath}.bak`, rawData, 'utf8');
        
        // Re-escribir en formato compatible con el esquema de electron-store
        const compatObject = { favorites: Array.isArray(legacyArray) ? legacyArray : [] };
        fs.writeFileSync(filePath, JSON.stringify(compatObject, null, 2), 'utf8');
        console.log(`[MIGRATION] Migración completada para ${name}.json. Respaldo guardado en ${name}.json.bak`);
      }
    } catch (e) {
      console.error(`[MIGRATION] Error al convertir array legacy en ${name}.json:`, e);
    }
  }

  // 2. Si no es Guest, migrar el archivo global de favorites.json (guest) si no tiene favoritos propios
  if (!isGuest) {
    const legacyPath = path.join(app.getPath('userData'), 'favorites.json');
    const flagPath = path.join(app.getPath('userData'), 'favorites.migrated');
    
    if (!fs.existsSync(filePath) && fs.existsSync(legacyPath) && !fs.existsSync(flagPath)) {
      try {
        const legacyRaw = fs.readFileSync(legacyPath, 'utf8').trim();
        let legacyArray = [];
        if (legacyRaw.startsWith('[')) {
          legacyArray = JSON.parse(legacyRaw);
        } else if (legacyRaw.startsWith('{')) {
          legacyArray = JSON.parse(legacyRaw).favorites || [];
        }
        
        if (Array.isArray(legacyArray) && legacyArray.length > 0) {
          const compatObject = { favorites: legacyArray };
          fs.writeFileSync(filePath, JSON.stringify(compatObject, null, 2), 'utf8');
          fs.writeFileSync(flagPath, new Date().toISOString(), 'utf8');
          console.log('[MIGRATION] Migrados favoritos legacy globales a nuevo usuario registrado');
        }
      } catch (e) {
        console.error('[MIGRATION] Error migrando favoritos globales a usuario:', e);
      }
    }
  }

  // 3. Crear e instanciar el Store de forma segura y validada
  return new Store({
    name,
    defaults: {
      favorites: []
    },
    schema: favoritesSchema,
    clearInvalidConfig: true
  });
}

function loadFavorites() {
  try {
    const user = getCurrentUserData();
    const store = getFavoritesStore(user);
    return store.get('favorites', []);
  } catch (e) {
    console.error('[FAVORITES] Error cargando favoritos del store:', e);
  }
  return [];
}

function saveFavorites(favorites) {
  try {
    const user = getCurrentUserData();
    const store = getFavoritesStore(user);
    store.set('favorites', favorites);
    console.log('[FAVORITES] Guardados:', favorites.length, 'favoritos mediante electron-store');
    return true;
  } catch (e) {
    console.error('[FAVORITES] Error guardando favoritos en el store:', e);
    return false;
  }
}

// ===== REGISTRO IPC =====

ipcMain.handle('get-favorites', async () => {
  const favorites = loadFavorites();
  console.log('[FAVORITES] Cargando favoritos:', favorites.length);
  return favorites;
});

ipcMain.handle('save-favorites', async (event, favorites) => {
  const success = saveFavorites(favorites);
  return { success };
});

ipcMain.handle('add-favorite', async (event, video) => {
  const favorites = loadFavorites();
  if (!favorites.some(v => v.videoId === video.videoId)) {
    favorites.unshift(video);
    saveFavorites(favorites);
    console.log('[FAVORITES] Agregado:', video.title);
    return { success: true, favorites };
  }
  return { success: false, message: 'Ya existe', favorites };
});

ipcMain.handle('remove-favorite', async (event, videoId) => {
  let favorites = loadFavorites();
  const index = favorites.findIndex(v => v.videoId === videoId);
  if (index !== -1) {
    favorites.splice(index, 1);
    saveFavorites(favorites);
    console.log('[FAVORITES] Eliminado videoId:', videoId);
    return { success: true, favorites };
  }
  return { success: false, message: 'No encontrado', favorites };
});

ipcMain.handle('toggle-favorite', async (event, payload) => {
  const favorites = loadFavorites();
  const videoId = typeof payload === 'string'
    ? payload
    : (payload && payload.videoId ? payload.videoId : null);

  if (!videoId) {
    return { success: false, message: 'videoId requerido', favorites };
  }

  const index = favorites.findIndex(v => v.videoId === videoId);
  if (index !== -1) {
    favorites.splice(index, 1);
    saveFavorites(favorites);
    console.log('[FAVORITES] Toggle: eliminado', videoId);
    return { success: true, action: 'removed', favorites };
  }

  if (typeof payload === 'object' && payload.videoId) {
    favorites.unshift(payload);
    saveFavorites(favorites);
    console.log('[FAVORITES] Toggle: agregado', payload.title || videoId);
    return { success: true, action: 'added', favorites };
  }

  return { success: false, message: 'No se puede agregar sin objeto de video', favorites };
});
