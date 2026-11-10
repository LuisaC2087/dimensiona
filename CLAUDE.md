# DIMENSIONA — guía del proyecto

App móvil (Android, Expo + React Native + TypeScript) que mide y reconstruye habitaciones interiores con cámara y AR (ARCore vía ViroReact). Fuente de verdad: el SRS IEEE 830 Rev. 1.0 (`docs/SRS.md` resume lo esencial). Lee también `AGENTS.md` (reglas de Expo).

## Reglas no negociables
- **Idioma**: toda la UI en español de Colombia (ROT-01). Código e identificadores en inglés; comentarios breves en español permitidos.
- **Unidades internas en metros** siempre; convertir solo al mostrar (RF-15).
- **Ninguna medida sin su confiabilidad** (RNF-15) ni sin unidad. Resultados = "estimaciones" (ROT-05).
- **Offline y local**: sin servidores, sin analítica, sin red (RNF-07, RNF-16). Único permiso Android: `CAMERA` (RNF-08).
- **Lógica pura separada**: todo cálculo (distancia, área, perímetro, volumen, calibración, confiabilidad, incertidumbre, unidades, validación de polígonos) vive en `src/lib/` sin importar React, Expo ni Viro. Cada función con pruebas Jest (PR-04: error ≤ 0,01 %).
- **Identidad visual**: fondo `#0B0B0C`, acento `#FFD100`, texto ≥ 14 sp, contraste ≥ 4,5:1, objetivos táctiles ≥ 48 dp (ROT-03, ROT-06). Usar `src/theme.ts`.
- **No funciona en Expo Go**: requiere development build (ViroReact es nativo).
- Usar `npx expo install <pkg>`; nunca editar `android/` a mano (CNG + config plugins).

## Estructura
```
src/app/          rutas Expo Router (pantallas)
src/components/   UI reutilizable (Plan2D, ReliabilityChip, ...)
src/ar/           sesión AR: wrappers de ViroReact (única capa que importa Viro)
src/lib/          lógica pura + __tests__/
src/db/           expo-sqlite: esquema (Apéndice I), repositorios, transacciones
src/demo/         proyecto demo 4,20 × 3,60 × 2,50 m
src/theme.ts      colores, tipografía, espaciado
```

## Comandos
```bash
npm test                 # Jest (lógica pura)
npx tsc --noEmit         # typecheck
npx expo lint            # lint
npx expo run:android     # development build en el teléfono
```
Antes de declarar una tarea terminada: `npm test` y `npx tsc --noEmit` en verde.

## Fases (Apéndice A) — estado
1. Preparación (RF-01, Viro, punto 3D) — código listo; **pendiente probar en dispositivo**
2. Medición (RF-02..04) — código listo (pantalla scan/[id]); pendiente dispositivo
3. Geometría (RF-05..08) — lógica + plano 2D listos
4. Datos y confiabilidad (RF-09, RF-10) — SQLite, autoguardado, chips listos
5. Precisión (PR-01..03, ajustar umbrales) — pendiente
6. Mejoras Media (RF-11..15) — RF-13 y RF-15 listos; faltan RF-11 (3D), RF-12 (UI calibración), RF-14 (fotos)
7. Demo, tutorial y APK (RF-16) — demo y tutorial listos; falta APK

Actualiza esta lista al cerrar cada fase.

## Versiones fijadas
- **Expo SDK 57 / RN 0.86**: ViroReact 3.1.1 exige `expo <58` y `react-native 0.86.x`. No actualizar el SDK hasta que Viro lo soporte.
- Telemetría de Viro desactivada (plugin `telemetry: false` + `ViroTelemetry.setEnabled(false)`) por RNF-07.
- Permisos bloqueados en `app.json` (`blockedPermissions`): micrófono, ubicación, almacenamiento, contactos (RNF-08).
- Viro (Android) responde la compatibilidad como SUPPORTED / UNSUPPORTED / UNKNOWN / TRANSIENT.

## Skills del proyecto
- `/srs` — consultar requisitos, criterios de aceptación y trazabilidad.
- `/logica` — añadir/modificar cálculos en `src/lib` con pruebas.
- `/ar` — trabajar en la capa AR (ViroReact/ARCore).
- `/verificar` — checklist de verificación de un RF contra su criterio.
