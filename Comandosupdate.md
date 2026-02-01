git add .
git commit -m "Release v2.0.4"
git tag v2.0.4


Subir todo a GitHub
git push origin main --tags

npm run publish
$env:GH_TOKEN = "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"; npm run publish

Release v2.0.5

🎨 Diseño Premium
- Player bar rediseñado con glassmorphism y gradientes
- Menú de perfil con animaciones y estilo premium
- Modal de logout con diseño moderno (reemplaza confirm nativo)

🎠 NowPlaying Mejorado
- Carrusel con imágenes laterales en alta resolución (maxresdefault)
- CSS optimizado para cropping consistente

🐛 Correcciones
- Botón anterior arreglado (fallback a seek 0 si no hay prev)
- Volumen persiste correctamente al cambiar canción
- Botón lyrics funciona en NowPlaying
- Cola de biblioteca priorizada sobre sugerencias YouTube

🔧 Técnico
- Auto-update salta modal en modo desarrollo
- Fallback chain para thumbnails de YouTube