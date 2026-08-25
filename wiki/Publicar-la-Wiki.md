# Publicar la carpeta `wiki/` como GitHub Wiki

GitHub no publica automáticamente la carpeta `wiki/` del repositorio principal.
La wiki es otro repositorio Git, con URL terminada en `.wiki.git`.

## Primera activación

1. Abre **Settings -> General -> Features** en el repositorio.
2. Activa **Wikis**.
3. Crea la primera página `Home` desde la pestaña Wiki. Esto inicializa el
   repositorio `NEQ6_worm_gear_calibration.wiki.git`.

## Sincronizar el contenido preparado

En un directorio temporal:

```powershell
git clone https://github.com/PablodlFuente/NEQ6_worm_gear_calibration.wiki.git
cd NEQ6_worm_gear_calibration.wiki
Copy-Item -Recurse -Force ..\NEQ6_worm_gear_calibration\wiki\* .
git add .
git commit -m "publish technical wiki"
git push
```

Después, la URL será:

<https://github.com/PablodlFuente/NEQ6_worm_gear_calibration/wiki>

Mientras la función Wiki no esté inicializada, la aplicación enlaza a la
carpeta de documentación del branch por defecto para evitar un 404.
