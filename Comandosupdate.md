git add .
git commit -m "Release v2.0.4"
git tag v2.0.4


Subir todo a GitHub
git push origin main --tags

npm run publish
$env:GH_TOKEN = "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"; npm run publish

🆕 Nuevas Funciones

Modo DJ en crear playlist: ahora puedes elegir Crear manual o Crear con DJ.
DJ Mix por artistas: eliges 1+ artistas, el DJ crea el MIX automático.
Buscador de artistas dentro del modal del DJ (rápido y con debounce).
Playlists DJ visibles en la vista de Playlists con el mismo diseño del home.
Panel Dev con acceso por código 0613:
métricas reales locales (favoritos, historial, playlists, DJ, cuentas)
listas de playlists DJ con abrir/eliminar
lista de cuentas logueadas

🎧 DJ Seax Mejorado

DJ ahora crea mezclas más limpias:
filtra covers/remix/karaoke/live/conversatorios/podcast/etc.
evita duplicados por video y por título
ordena para que no repita artista seguido
prioriza lo que más escuchas + recencia
DJ actualiza más seguido:
playlists personales cada 10 minutos
globales se revisan con menos frecuencia
Al actualizar el DJ, se refresca automáticamente la vista de playlists.

🖼️ Diseño / UI

Covers de playlists en playlists.html arreglados con collage correcto.
Sección DJ Seax aparece siempre en Inicio y también en Playlists.
Modal DJ ya no se descuadra (altura y scroll).
Loader del DJ aparece encima del modal (z-index alto).

🧩 Comportamiento

Click en playlist DJ ahora abre la playlist (no solo reproduce).
Playlists DJ “personalizadas” solo lectura (reproducir sí, editar no).
Playlists DJ creadas por el usuario sí se pueden editar (modo manual).
Si no hay playlists locales, igual aparecen las del usuario en global.

🛠️ Correcciones

DJ Seax ya no desaparece al volver al Inicio.
Loader ya no se dispara solo al navegar entre HTMLs.
El loader para crear DJ Mix ahora sí sale bien.
Se corrigió la mezcla de cuentas y refresh de playlist DJ.

git status

git add .
git commit -a
git tag v2.1.1
npm run publish
$env:GH_TOKEN = "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"
 npm run publish