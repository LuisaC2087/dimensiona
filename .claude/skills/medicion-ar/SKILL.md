---
name: medicion-ar
description: Trabajar en la medición de productos de DIMENSIONA (AR con ARCore/ViroReact, foto con referencia, IA). Úsala al tocar app/src/ar, app/src/app/medir*.tsx o app/src/lib/measure.ts.
---

# Medición de productos

## Flujo
1. `app/src/app/medir.tsx` comprueba ARCore (`ar/compat.ts`). Sin soporte o en web → `medir-foto.tsx`.
2. **AUTO**: la retícula central selecciona el plano horizontal más pequeño bajo ella (cara superior del producto). Largo/ancho = `minAreaRect` del contorno; alto = `heightAboveSupport` (plano de apoyo más alto debajo: mesa o piso). Se usa la retícula y no el toque para evitar la ambigüedad dp/px de `performARHitTestWithPoint`.
3. **PUNTOS**: dos puntos de retícula por arista (largo, ancho, alto).
4. **IA**: captura → `lib/image.ts` (JPEG 768 px) → `POST /api/vision/identify` con `consent: true` tras `ensureAiConsent()`.
5. Con las 3 medidas, `POST /api/packing/recommend` y se dibuja la caja sugerida (roja) alrededor del producto en AR.
6. Resultado → `state/measureBus.ts` → `router.back()`. Quien abrió la medición lo toma con `measureBus.take(purpose)` (formulario de producto o `verify:<idEnvío>` del mensajero).

## Reglas
- Solo `app/src/ar/` importa `@reactvision/react-viro`. Mantener `ARProductView.web.tsx` con la misma firma.
- Toda función nueva de cálculo va en `app/src/lib/measure.ts` con su prueba en `__tests__/measure.test.ts`.
- Confiabilidad: `reliability(tracking, surface, distance)`; la del resultado es el mínimo de las lecturas.
- Probar en un teléfono ARCore requiere una build nueva (no funciona en Expo Go).
