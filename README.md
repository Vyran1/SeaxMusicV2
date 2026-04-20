# SeaxMusic

Una aplicación de música de escritorio moderna con reproducción oculta en YouTube.

## ✨ Qué es SeaxMusic

SeaxMusic es un reproductor de música construido sobre Electron que utiliza una ventana backend de YouTube para reproducir audio sin la interfaz de YouTube visible al usuario.

## 🎵 Características principales

- Interfaz oscura con acento rojo
- Reproducción de música mediante backend de YouTube
- Control completo de reproducción: play, pause, seek, volumen, shuffle, repeat
- Soporte de playlists, favoritos e historial
- IPC entre ventana principal y backend para sincronizar estado

## 🚀 Rápido arranque

```bash
npm install
npm start
```

Modo desarrollo con herramientas de depuración:

```bash
npm run dev
```

## 🧩 Estructura del proyecto

```
SeaxMusicV2/
├── docs/                    # Documentación y notas del proyecto
│   └── Comandosupdate.md
├── src/
│   ├── main/                 # Proceso principal de Electron
│   │   ├── main.js           # Ventanas, IPC y lógica principal
│   │   └── services/         # Servicios específicos del main process
│   │       ├── autoUpdater.js
│   │       └── discordRPC.js
│   ├── preload/              # Scripts seguros para IPC
│   │   ├── preload.js
│   │   └── scripts/          # Preload scripts especializados
│   │       ├── backend-preload.js
│   │       ├── login-preload.js
│   │       ├── pip-preload.js
│   │       ├── aux-preload.js
│   │       ├── updatePreload.js
│   │       └── youtube-content.js
│   └── renderer/             # Interfaz de usuario
│       ├── index.html        # Pantalla principal
│       ├── css/              # Estilos de la app
│       │   └── styles.css
│       ├── html/             # Plantillas y vistas secundarias
│       │   ├── profile.html
│       │   └── update.html
│       └── js/               # Lógica de renderer segmentada
│           ├── core/         # Núcleo de reproducción y UI
│           │   ├── app.js
│           │   ├── player.js
│           │   └── ui.js
│           └── pages/        # Scripts por página / sección
│               ├── auth.js
│               ├── profile.js
│               └── update.js
├── build/                    # Recursos de build y configuración de empaquetado
├── package.json              # Configuración del proyecto
└── README.md                 # Documentación del proyecto
```

## 🏗️ Arquitectura

### Ventana principal

- Contiene la UI de SeaxMusic
- Controla la reproducción, el volumen y la navegación
- Recibe eventos del backend y actualiza los componentes de la app

### Backend de YouTube

- Se usa una ventana oculta que carga YouTube
- El backend aplica volumen, seek y controles de reproducción
- Se comunica con la ventana principal por IPC

### Preload

- Expone APIs seguras a la UI
- Filtra y envía comandos entre los procesos renderer y main

## 📦 Comandos disponibles

- `npm install`: instala dependencias
- `npm start`: ejecuta la app en modo normal
- `npm run dev`: ejecuta la app con modo de desarrollo
- `npm run build`: empaqueta la app con `electron-builder`
- `npm run build:win`: construye para Windows
- `npm run build:mac`: construye para macOS
- `npm run build:linux`: construye para Linux
- `npm run build:all`: construye para Windows, macOS y Linux
- `npm run publish`: publica usando Electron Builder

## 🎨 Tema y estilo

- Fondo primario: `#121212`
- Fondo secundario: `#181818`
- Acento rojo: `#E13838`
- Texto principal: `#FFFFFF`
- Texto secundaria: `#B3B3B3`

## 🔧 Tecnologías usadas

- Electron
- HTML / CSS / JavaScript
- electron-builder
- electron-updater
- discord-rpc

## 📌 Notas importantes

- La reproducción se gestiona principalmente en `src/main/main.js`
- El volumen y los comandos se sincronizan con `src/preload/backend-preload.js`
- La ventana principal usa `src/preload/preload.js` para conectar con el proceso main

## 📝 Créditos

Desarrollado por Vyran y el equipo de SeaxMusic.

---

Si quieres mejorar la app, abre una issue o crea un PR con tus ideas.