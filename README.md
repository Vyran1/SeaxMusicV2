# SeaxMusic

Una aplicación de música moderna.

## 🎵 Características

- **Interfaz moderna**: Diseño oscuro con acentos rojos, inspirado en Spotify
- **Reproductor de YouTube**: Backend oculto que utiliza YouTube para la reproducción
- **Control completo**: Play, pause, volumen, búsqueda y más
- **Multiplataforma**: Funciona en PC, con soporte futuro para móvil y TV

## 🚀 Estructura del Proyecto

```
SeaxMusicV2/
├── src/
│   ├── main/                 # Proceso principal de Electron
│   │   └── main.js          # Configuración de ventanas y IPC
│   ├── renderer/            # Proceso de renderizado (UI)
│   │   ├── index.html       # Interfaz principal
│   │   ├── css/
│   │   │   └── styles.css   # Estilos (tema oscuro + rojo)
│   │   ├── assets/
│   │   │   ├── icons/
│   │   │   └── img/       
│   │   └── js/
│   │       ├── app.js       # Lógica principal de la app
│   │       ├── player.js    # Control del reproductor
│   │       └── ui.js        # Interacciones de UI
│   ├── backend/             # Ventanas backend ocultas
│   │   ├── youtube-player.html
│   │   └── youtube-player.js
│   └── preload/             # Scripts de preload
│       ├── preload.js       # API para ventana principal
│       └── backend-preload.js
├── package.json
└── README.md
```

## 📦 Instalación

1. Instala las dependencias:
```bash
npm install
```

2. Ejecuta la aplicación:
```bash
npm start
```

3. Modo desarrollo (con DevTools):
```bash
npm run dev
```

## 🏗️ Arquitectura

### Ventana Principal
- Interfaz de usuario completa
- Control de reproducción
- Navegación y búsqueda
- Gestión de playlists

### Ventanas Backend
- Ventanas ocultas de Electron
- Ejecutan el reproductor de YouTube
- Controladas desde la ventana principal vía IPC
- Permiten control total: play, pause, volumen, seek, etc.

### Comunicación IPC
- `create-backend-player`: Crea un nuevo reproductor
- `backend-command`: Envía comandos al reproductor
- `get-player-status`: Obtiene el estado actual
- `player-response`: Respuestas del backend

## 🎨 Tema

- **Colores principales**:
  - Fondo primario: `#121212`
  - Fondo secundario: `#181818`
  - Acento rojo: `#E13838`
  - Texto principal: `#FFFFFF`
  - Texto secundario: `#B3B3B3`

## 🔧 Tecnologías

- **Electron**: Framework para aplicaciones de escritorio
- **HTML/CSS/JavaScript**: Stack web estándar
- **YouTube IFrame API**: Reproducción de música

## 📝 Próximas Funcionalidades

- Búsqueda de música
- Gestión de playlists
- Historial de reproducción
- Sistema de favoritos
- Sincronización entre dispositivos
- Soporte para móvil y TV

## 👨‍💻 Desarrollo

El proyecto está organizado de forma modular:
- Cada funcionalidad en su propio archivo
- Separación clara entre UI y lógica
- Comunicación estructurada entre procesos

## 📁 Organización de carpetas

- `src/main/`: Lógica principal de Electron (ventanas, updater, Discord, etc)
- `src/renderer/`: Todo lo visual y de usuario (HTML, CSS, JS, assets)
- `src/backend/`: Webviews y reproductor oculto (YouTube)
- `src/preload/`: Scripts de seguridad para IPC
- `mobile/`: App Android (Kotlin)
- `docs/`: Documentación extendida
- `build/`: Archivos de build y distribución

## 📝 Créditos

Desarrollado por SeaxDev. Inspirado en la experiencia de usuario de Spotify y YouTube Music.

---

Para más detalles, revisa la carpeta `docs/` o abre un issue.
