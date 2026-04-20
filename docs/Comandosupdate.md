# Publicar actualización (repo público)

## 1) Preparar commit
```powershell
git add .
git commit -m "vX.Y.Z"
```

## 2) Tag
```powershell
git tag vX.Y.Z
```

## 3) Push (código + tag)
```powershell
git push
git push origin vX.Y.Z
```

## 4) Publicar release (sin guardar token en archivos)
```powershell
$env:GH_TOKEN="TU_TOKEN_NUEVO"
npm run publish
```

## 5) Verificación rápida
- El release debe estar **publicado** (no draft).
- Debe incluir `latest.yml`, `.exe` y `.blockmap`.
- La app solo busca updates **cuando está empaquetada**.
