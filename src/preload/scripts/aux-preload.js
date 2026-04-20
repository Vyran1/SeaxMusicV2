const { contextBridge, ipcRenderer } = require('electron');

/**
 * PRELOAD PARA VENTANA AUXILIAR
 * 
 * Esta ventana se usa SOLO para cargar páginas de YouTube y extraer datos (historial, destacados).
 * NO debe enviar eventos de video-info, update-time, video-playing, etc.
 * Esos eventos solo los envía la ventana principal de reproducción (backend-preload.js)
 */

console.log('[AUX-PRELOAD] Ventana auxiliar cargada - NO envía eventos de reproducción');

// ===== API BÁSICA PARA LA VENTANA AUXILIAR =====
contextBridge.exposeInMainWorld('auxAPI', {
  log: (message) => {
    console.log('[AUX]', message);
  }
});

// ===== SOLO ESCUCHAR PETICIONES DE EXTRACCIÓN DE VIDEOS =====
// Función para extraer videos de la página actual
function extractVideosFromPage(maxCount = 10) {
  const videos = [];
  
  // Selectores para videos en YouTube
  const videoSelectors = [
    'ytd-rich-item-renderer',           // Home page
    'ytd-video-renderer',               // Search results / History
    'ytd-compact-video-renderer',       // Sidebar
    'ytd-grid-video-renderer'           // Grids
  ];
  
  for (const selector of videoSelectors) {
    const videoElements = document.querySelectorAll(selector);
    
    for (const el of videoElements) {
      if (videos.length >= maxCount) break;
      
      try {
        // Extraer título
        const titleEl = el.querySelector('#video-title, #video-title-link, a#video-title');
        const title = titleEl?.textContent?.trim() || titleEl?.getAttribute('title') || '';
        
        // Extraer URL del video
        const linkEl = el.querySelector('a#thumbnail, a#video-title-link, a#video-title');
        const href = linkEl?.getAttribute('href') || '';
        
        // Extraer video ID
        const videoIdMatch = href.match(/(?:v=|shorts\/)([a-zA-Z0-9_-]{11})/);
        const videoId = videoIdMatch ? videoIdMatch[1] : null;
        
        // Extraer thumbnail
        const thumbEl = el.querySelector('img#img, img.yt-core-image');
        const thumbnail = thumbEl?.src || (videoId ? `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg` : '');
        
        // Extraer canal
        const channelEl = el.querySelector('#channel-name a, #text-container yt-formatted-string a, ytd-channel-name a');
        const channel = channelEl?.textContent?.trim() || '';
        
        // Extraer duración
        const durationEl = el.querySelector('span.ytd-thumbnail-overlay-time-status-renderer, #time-status span');
        const duration = durationEl?.textContent?.trim() || '';
        
        // Extraer vistas
        const viewsEl = el.querySelector('#metadata-line span:first-child, span.ytd-video-meta-block');
        const views = viewsEl?.textContent?.trim() || '';
        
        if (title && videoId && !videos.some(v => v.videoId === videoId)) {
          videos.push({
            title,
            videoId,
            thumbnail: thumbnail.startsWith('http') ? thumbnail : `https://i.ytimg.com/vi/${videoId}/mqdefault.jpg`,
            channel,
            duration,
            views,
            url: `https://www.youtube.com/watch?v=${videoId}`
          });
        }
      } catch (e) {
        console.error('[AUX-EXTRACT] Error extrayendo video:', e);
      }
    }
    
    if (videos.length >= maxCount) break;
  }
  
  return videos;
}

// Escuchar peticiones de videos destacados
ipcRenderer.on('get-featured-videos', (event, maxCount) => {
  console.log('[AUX-FEATURED] Solicitando videos destacados...');
  const videos = extractVideosFromPage(maxCount || 3);
  console.log('[AUX-FEATURED] Videos encontrados:', videos.length);
  ipcRenderer.send('featured-videos-response', videos);
});

// Escuchar peticiones de historial
ipcRenderer.on('get-history-videos', (event, maxCount) => {
  console.log('[AUX-HISTORY] Solicitando historial...');
  const videos = extractVideosFromPage(maxCount || 10);
  console.log('[AUX-HISTORY] Videos encontrados:', videos.length);
  ipcRenderer.send('history-videos-response', videos);
});

console.log('[AUX-PRELOAD] Listeners de extracción configurados');
