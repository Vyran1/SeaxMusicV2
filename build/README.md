# Recursos de Build para SeaxMusic

## Iconos Requeridos

Para empaquetar la aplicación correctamente, necesitas colocar los siguientes iconos en esta carpeta:

### Windows
- `icon.ico` - Icono de Windows (256x256 o más grande, formato .ico)

### macOS
- `icon.icns` - Icono de macOS (formato .icns)

### Linux
Crea una carpeta `icons/` con los siguientes tamaños:
- `icons/16x16.png`
- `icons/32x32.png`
- `icons/48x48.png`
- `icons/64x64.png`
- `icons/128x128.png`
- `icons/256x256.png`
- `icons/512x512.png`

## Cómo generar iconos

### Desde una imagen PNG de alta resolución (512x512 o 1024x1024):

**Windows (.ico):**
- Usa https://convertico.com/ o
- ImageMagick: `magick convert icon.png -define icon:auto-resize=256,128,64,48,32,16 icon.ico`

**macOS (.icns):**
- Usa https://cloudconvert.com/png-to-icns o
- En macOS: `iconutil -c icns icon.iconset`

**Linux (múltiples PNGs):**
- Usa ImageMagick:
```bash
magick icon.png -resize 16x16 icons/16x16.png
magick icon.png -resize 32x32 icons/32x32.png
magick icon.png -resize 48x48 icons/48x48.png
magick icon.png -resize 64x64 icons/64x64.png
magick icon.png -resize 128x128 icons/128x128.png
magick icon.png -resize 256x256 icons/256x256.png
magick icon.png -resize 512x512 icons/512x512.png
```

## Temporalmente (para testing)

Si no tienes los iconos, electron-builder usará un icono por defecto.
Puedes crear builds de prueba sin iconos personalizados.
