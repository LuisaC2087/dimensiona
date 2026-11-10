---
name: logica
description: Añadir o modificar cálculos puros de DIMENSIONA (geometría, calibración, confiabilidad, incertidumbre, unidades) en src/lib con pruebas Jest.
---

1. El código va en `src/lib/<modulo>.ts`; **no** importar React, Expo, Viro ni SQLite.
2. Tipos compartidos en `src/lib/types.ts`. Entradas y salidas en metros.
3. Fórmulas exactas del Apéndice D (ver `docs/SRS.md`). Constantes ajustables (pesos, umbrales, % de incertidumbre) exportadas en un objeto de configuración, no "mágicas".
4. Escribe pruebas en `src/lib/__tests__/<modulo>.test.ts`: casos conocidos (rectángulo 4,20×3,60×2,50, L, trapecio, triángulo…), bordes y errores. Tolerancia relativa 1e-4 (0,01 %).
5. Ejecuta `npm test` y `npx tsc --noEmit`; ambos en verde antes de terminar.
