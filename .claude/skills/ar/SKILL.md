---
name: ar
description: Trabajar en la capa de realidad aumentada de DIMENSIONA (ViroReact sobre ARCore): sesión, planos, hit-test, anclas, estado del seguimiento.
---

1. Solo `src/ar/` importa `@reactvision/react-viro`. Exponer al resto de la app tipos propios (`Point3`, `TrackingState`, `SurfaceKind`) definidos en `src/lib/types.ts`.
2. Antes de usar una API de Viro, verifica la versión instalada y su documentación actual (github.com/ReactVision/viro); no confíes en memoria. Confirma compatibilidad con la versión de Expo de `package.json` y su config plugin en `app.json`.
3. Cada punto colocado debe registrar: `{x,y,z}` en metros, estado de seguimiento, tipo de superficie (plano detectado vs. punto de características) y distancia cámara–punto → insumos de `computeReliability`.
4. Bloquear colocación con seguimiento "Perdido" (RF-03). Marcador visible ≤ 500 ms (RNF-01).
5. No se puede probar en Expo Go ni en emulador sin ARCore: indica al usuario cuándo debe probar en el teléfono con `npx expo run:android`. Si ARCore no está disponible, la app debe degradar a proyectos + demo (RNF-17).
