# DIMENSIONA · Smart Logistics Platform

**Mide. Empaca. Envía.** Plataforma de envíos para emprendimientos que venden por Instagram, WhatsApp o tiendas virtuales. La cámara y la realidad aumentada miden el producto **antes** de enviarlo; con esa medida la plataforma elige la caja justa, calcula el peso volumétrico, cotiza y gestiona toda la operación.

## Roles

| Rol | Qué hace |
|---|---|
| **Tienda / Emprendedor** | Mide productos con AR (o foto), arma envíos, ve la caja recomendada en 3D, compara servicios, paga contra entrega, comparte el rastreo por WhatsApp y ve su ahorro. |
| **Mensajero** | Toma envíos disponibles, **verifica medidas con AR al recoger**, avanza estados, reporta novedades y registra la prueba de entrega con foto. Ve ganancias y recaudos. |
| **Administrador** | Panel de métricas, aprobación de mensajeros, asignación de envíos, catálogo de cajas y tarifas por zona. |
| **Cliente final** | Rastrea su envío sin cuenta en `/rastreo/<código>`. |

## Arquitectura

```
app/     Expo SDK 57 + Expo Router · Android (ARCore vía ViroReact) y web
server/  Node + Express · servicios unidos en un solo despliegue:
         identidad · catálogo · embalaje/cotización · envíos/rastreo · visión (Gemini) · legal
         + página de descarga del APK (/) + app web (/app) · PostgreSQL (PGlite en local)
```

- **Optimizador de embalaje 3D**: «extreme points» con 6 rotaciones, relleno por fragilidad, peso máximo por caja, reparto en varios paquetes y caja a medida.
- **Tarifas**: peso cobrable = máx(real, volumétrico L×A×H/5000), zonas local/regional/nacional (Colombia), seguro y contra entrega.
- **AR**: planos de ARCore, cara superior + superficie de apoyo → largo, ancho, alto; medición por puntos; la caja sugerida se dibuja en AR alrededor del producto.
- **Legal**: Términos y Condiciones y Política de Tratamiento de Datos (Ley 1581 de 2012), aceptación registrada con versión, fecha e IP; descarga y eliminación de datos; consentimiento previo para la IA.

## Ejecutar en local

```bash
cd server && npm install && npm run dev        # http://localhost:4000 (PGlite, cuentas demo)
cd app && npm install && npx expo export -p web # luego abre http://localhost:4000/app
```
Cuentas demo: `tienda@demo.app` / `demo1234`, `mensajero@demo.app` / `demo1234`. El admin local es `admin@dimensiona.app` / `admin1234` (en producción la contraseña viene de `ADMIN_PASSWORD`).

## Pruebas

```bash
cd server && npm test                                   # unitarias + integración de la API
cd app && npx jest && npx tsc --noEmit && npx expo lint
```

## Despliegue

- **Render**: New → Blueprint con `render.yaml` (servicio web gratuito + PostgreSQL). Completa `APK_URL`, `GEMINI_API_KEY` (opcional) y `LEGAL_*`.
- **APK**: `cd app && npx eas-cli build -p android --profile production`. Pon la URL del APK en `APK_URL`.

## Limitaciones honestas

- Las medidas son estimaciones (luz, textura y teléfono influyen); cada una trae su confiabilidad. El peso se ingresa con báscula.
- La AR requiere un Android compatible con ARCore; en los demás y en la web se mide con foto y objeto de referencia.
- Los textos legales son una base: deben revisarse con un abogado y completarse con los datos reales de la empresa. Operar mensajería en Colombia exige habilitación como operador postal ante MinTIC (Ley 1369 de 2009).
- El plan gratuito de Render duerme tras 15 min sin uso (primer acceso ≈ 1 min) y su PostgreSQL gratuito vence a los 30 días.
