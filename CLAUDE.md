# DIMENSIONA Smart Logistics — guía del proyecto

Plataforma de envíos para emprendimientos (Instagram/WhatsApp) que mide productos con cámara + realidad aumentada, recomienda la caja, cotiza y gestiona la operación. Toda la UI en español de Colombia; código en inglés.

## Estructura
```
app/      Expo SDK 57 + Expo Router (Android con ARCore vía ViroReact, y web)
server/   Node + Express: todos los servicios en un solo despliegue + página de descarga + app web
render.yaml  Blueprint de Render (web + PostgreSQL)
```
- `server/src/lib/` lógica pura (embalaje 3D, tarifas, zonas) con pruebas `node:test`.
- `server/src/services/` un router por servicio: users (identidad/admin), passwords, catalog, logistics (embalaje/cotización), shipments (envíos/rastreo/estadísticas/recogidas), billing (facturas y liquidaciones), print (rótulo y factura con enlace firmado), claims (PQR), audit (bitácora), vision (Gemini), legal.
- `server/src/carriers/` adaptadores Servientrega y Coordinadora: modo simulado sin credenciales; modo real con `*_API_URL/_USER/_PASSWORD` (ajustar `realRequest` a la documentación del contrato).
- `app/src/lib/` lógica pura (medición, formatos, markdown) con pruebas Jest.
- `app/src/ar/` única capa que importa ViroReact (`ARProductView.tsx`; `.web.tsx` es el sustituto web).
- Roles: `app/src/app/tienda|mensajero|admin/` (pestañas; la barra muestra solo las rutas con ícono en su `_layout`). Público: `rastreo/`, `legal/`, `pqr`, `olvido`, `restablecer`.
- Íconos: `components/Icon.tsx` (Material Community Icons). Logo: `components/Logo.tsx`; marca en `server/public/brand` y `/marca`.
- Pantallas que requieren sesión: envolver en `RoleGate` (un rol) o `RequireAuth` (cualquiera).

## Reglas
- Medidas internas: AR en metros, API en centímetros y kilos. Toda medida es «estimación» y muestra confiabilidad.
- Estilo constructivista: usar `app/src/theme.ts` y `components/ui.tsx` (papel #F8F4EC, tinta #141414, rojo #D7261E, Oswald). Móvil primero; en web ancho máx. 520.
- Lo legal sale de `server/legal/*.md` (fuente única). Si cambian, subir `LEGAL_VERSION` en `server/src/services/legal.js`.
- Expo SDK 57 / RN 0.86 fijados por ViroReact 3.1.1. Usar `npx expo install`. Nunca editar `android/` a mano. `.npmrc` usa `legacy-peer-deps`.
- La IA (Gemini) solo con consentimiento (`lib/consent.ts`) y clave en el servidor (`GEMINI_API_KEY`).

## Comandos (antes de terminar una tarea, todo en verde)
```bash
cd server && npm test                       # 66 pruebas: unitarias + integración de la API (test/_server.js levanta el servidor)
cd app && npx jest && npx tsc --noEmit && npx expo lint
cd app && npx expo export -p web            # la web que sirve el servidor en /app
cd server && npm run dev                    # local: PGlite embebido si no hay DATABASE_URL
cd app && npx eas-cli build -p android --profile production   # APK
```

## Skills del proyecto
`/medicion-ar`, `/servicios-api`, `/estilo-constructivista`, `/desplegar`.
