# PuntoK Incidents Feed

Feed gratuito de incidencias para PuntoK Rescate.

## Que hace

- Consulta incidencias de carreteras de Palencia en Datos Abiertos de la Junta de Castilla y Leon.
- Genera `puntok-incidents-palencia.json`.
- Publica el JSON con GitHub Pages.
- Se actualiza cada 15 minutos con GitHub Actions.

## Activar

1. Crear un repositorio publico en GitHub, por ejemplo `puntok-incidents-feed`.
2. Subir estos archivos al repositorio.
3. Entrar en `Settings > Pages`.
4. En `Build and deployment > Source`, seleccionar `GitHub Actions`.
5. Entrar en `Actions` y ejecutar `Update PuntoK incidents` una vez manualmente.

La URL final sera parecida a:

```text
https://TU_USUARIO.github.io/puntok-incidents-feed/puntok-incidents-palencia.json
```

Esa URL se copia en `www/data/puntok-update-config.js` de la app PuntoK Rescate.

## Probar local

```bash
node scripts/build-incidents-feed.js --out /tmp/puntok-incidents-palencia.json
```

## DGT

La DGT/NAP se puede anadir despues si tenemos un endpoint JSON ya transformado. Se pasa al workflow con la variable `DGT_INCIDENTS_JSON_URL`.
