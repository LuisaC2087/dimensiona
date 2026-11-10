---
name: verificar
description: Verificar que un requisito de DIMENSIONA cumple su criterio de aceptación y registrar el resultado para el plan de pruebas (Apéndice G).
---

1. Identifica el RF/RNF y su prueba PR en `docs/SRS.md`.
2. Automatizable (PR-04, PR-05 parcial, lógica): ejecuta `npm test` y `npx tsc --noEmit`; reporta la salida.
3. Manual en dispositivo (PR-01..03, 06..13): genera una hoja de registro en `docs/pruebas/PR-xx.md` con columnas: fecha, dispositivo, iluminación, distancia, valor app, valor cinta, error relativo, confiabilidad, resultado.
4. Revisa transversales: unidad + confiabilidad visibles, textos en español, descargo de estimaciones donde aplica.
5. Informa: cumple / no cumple / pendiente de dispositivo, sin suavizar resultados.
