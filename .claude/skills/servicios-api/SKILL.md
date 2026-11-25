---
name: servicios-api
description: Añadir o cambiar servicios de la API de DIMENSIONA (server/), con su esquema, permisos por rol y pruebas. Úsala al tocar server/src.
---

# Servicios de la API

- Un router por servicio en `server/src/services/`, montado en `server/src/index.js` bajo `/api`.
- Handlers async siempre con `h(...)`; errores con `bad()`, `forbidden()`, `notFound()` o `HttpError`.
- Permisos: `auth()` (cualquier sesión) o `auth('tienda', 'admin')`. La tienda solo ve lo suyo (filtrar por `req.store.id`); el mensajero solo sus envíos o los `creado` sin asignar.
- Esquema en `server/src/db.js` (`CREATE TABLE IF NOT EXISTS` y `ALTER TABLE … ADD COLUMN IF NOT EXISTS`): idempotente, corre al iniciar en Postgres y en PGlite.
- Postgres pasa a minúsculas los alias sin comillas: usar `AS "camelCase"`. Los `numeric` llegan como texto: convertir con `nums()`.
- Cálculo puro en `server/src/lib/` con pruebas en `server/test/lib.test.js`; cada endpoint nuevo con un caso en `server/test/api.test.js` (incluir el caso de permiso denegado).
- Cambios en las respuestas: actualizar `app/src/api/types.ts` y `app/src/api/client.ts`.
- Verificar: `cd server && npm test`.
