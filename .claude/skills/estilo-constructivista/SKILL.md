---
name: estilo-constructivista
description: Diseñar o modificar pantallas de DIMENSIONA con su identidad constructivista y móvil primero. Úsala al crear o cambiar UI en app/src o server/public.
---

# Estilo constructivista

- Paleta (`app/src/theme.ts`): papel `#F8F4EC`, papel 2 `#EEE6D6`, tinta `#141414`, rojo `#D7261E`, gris `#5B5750`. Estados: ok `#1F7A3A`, alerta `#9A5B00`.
- Tipografía: Oswald 700 en MAYÚSCULAS para títulos, botones y etiquetas; sistema para el texto corrido (≥ 15 px).
- Formas: bordes de 3 px, sombras duras desplazadas (sin desenfoque), bandas diagonales rojas, rombos y círculos de tinta. Nada de esquinas redondeadas.
- Componentes en `app/src/components/ui.tsx`: `Screen`, `Header` (banda diagonal), `Card`, `Button` (primary/ink/outline/ghost/danger), `Field`, `Segmented`, `Toggle`, `Stat`, `Tag`, `StatusTag`, `SectionTitle`, `Empty`, `ErrorBox`. Úsalos antes de crear estilos nuevos.
- Móvil primero: objetivos táctiles ≥ 44–52 px, una columna; en web `WebFrame` limita el ancho a 520.
- Accesibilidad: `accessibilityLabel` en botones e inputs (ya integrado en `Button` y `Field`), contraste ≥ 4,5:1 (texto papel sobre rojo o tinta).
- La página pública `server/public/index.html` sigue las mismas reglas con CSS propio.
