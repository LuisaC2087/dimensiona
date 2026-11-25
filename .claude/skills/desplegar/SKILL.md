---
name: desplegar
description: Desplegar DIMENSIONA en Render y publicar un APK nuevo con EAS. Úsala cuando se pida desplegar, publicar el APK o cambiar la configuración de producción.
---

# Despliegue

## Render (servidor + web + página de descarga)
1. El repositorio debe estar en GitHub con `render.yaml` en la raíz.
2. Render → New → Blueprint → elegir el repo. Crea `dimensiona-logistica` (web) y `dimensiona-db` (PostgreSQL).
3. Completar en Environment: `APK_URL`, opcional `GEMINI_API_KEY`, y los `LEGAL_*` (razón social, NIT, dirección, correo). `ADMIN_PASSWORD` se genera: consultarla allí.
4. La build exporta la web de Expo (`app/dist`) y el servidor la sirve en `/app`. La página de descarga está en `/`, el rastreo en `/rastreo/<código>` y lo legal en `/terminos` y `/privacidad`.

## APK (EAS)
1. `cd app && npx eas-cli whoami` (sesión iniciada por la persona; nunca escribir contraseñas).
2. `EXPO_PUBLIC_API_URL` está en `eas.json`. Si Render asignó otra URL, actualizarla antes de compilar (la app también permite cambiar el servidor desde el login).
3. Subir `version` y `android.versionCode` en `app.json`.
4. `npx eas-cli build -p android --profile production --non-interactive --no-wait`.
5. Al terminar, copiar la URL del artefacto `.apk` a `APK_URL` en Render (y `APP_VERSION`). `/descargar` redirige allí.

## Antes de desplegar
`cd server && npm test` · `cd app && npx jest && npx tsc --noEmit && npx expo lint && npx expo export -p web`.
