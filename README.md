# DIMENSIONA

**Mide y reconstruye una habitación con la cámara del teléfono.** Apuntas, recorres las paredes y la app entrega el plano 2D, la vista 3D, área, perímetro, volumen y altura — cada medida con su nivel de confiabilidad. Funciona sin internet.

> App Android (Expo + React Native + TypeScript) con realidad aumentada (ARCore vía ViroReact) y reconocimiento de objetos en el propio teléfono.

## El problema

Medir un espacio interior hoy exige cinta métrica, dos personas, papel y pasar los datos a mano. Los errores de transcripción y las medidas sin contexto ("¿esto se midió bien?") son comunes en remodelaciones, mudanzas, avalúos y compras de muebles.

## La solución

| Función | Qué hace |
|---|---|
| **Habitación automática** | Detecta piso, paredes y techo con ARCore; un RANSAC sobre los puntos muestreados ajusta las paredes y arma el contorno y la altura sin tocar la pantalla (respaldo manual por esquinas). |
| **Medición rápida** | Distancia entre dos puntos, y medida de objetos con un toque. |
| **Reconocimiento de objetos sin red** | Modelo YOLOE (ONNX) en el teléfono: etiqueta muebles y objetos y mide su ancho/alto con una malla de 16 puntos 3D y mediana temporal. |
| **Confiabilidad visible** | Ninguna medida aparece sin su chip Alta/Media/Baja, calculado a partir del seguimiento, el tipo de superficie y la distancia. Incluye incertidumbre estimada. |
| **Calibración** | Mide un objeto conocido (cinta de 1 m, hoja carta, tarjeta) y corrige la escala de todo el proyecto con un factor *k*. |
| **Plano 2D y vista 3D** | Paredes numeradas, cotas, barra de escala, zoom y desplazamiento. |
| **Fotos y notas** | Por proyecto, sincronizadas. |
| **Offline primero** | SQLite es la copia de trabajo; si hay sesión, sincroniza con Supabase (resolución de conflictos probada). |
| **Identificación con IA** (opcional, en línea) | Edge Function que consulta a Claude; la clave nunca vive en la app. |
| **Demo y tutorial** | Proyecto de ejemplo de 4,20 × 3,60 × 2,50 m para probar sin escanear. |

## Ingeniería

- **Lógica pura y probada**: todo cálculo geométrico (distancias, área por shoelace, validación de polígonos, RANSAC de paredes, calibración, confiabilidad, incertidumbre, unidades) vive en `src/lib/` sin dependencias de UI, con **62 pruebas Jest** y tolerancia de error ≤ 0,01 % (PR-04).
- **Capa AR aislada**: solo `src/ar/` importa ViroReact; el resto de la app usa tipos propios.
- **Privacidad**: solo permiso de cámara (+ internet). Micrófono, ubicación, almacenamiento y contactos bloqueados; telemetría de Viro desactivada. Fotos en bucket privado por usuario.
- **Accesibilidad**: alto contraste (#0B0B0C / #FFD100, ≥ 4,5:1), texto ≥ 14 sp, objetivos táctiles ≥ 48 dp. Toda la UI en español de Colombia.
- **Requisitos trazables**: especificación IEEE 830 en [`docs/SRS.md`](docs/SRS.md).

```
src/app/         pantallas (Expo Router)
src/ar/          sesión AR (única capa que importa Viro)
src/lib/         lógica pura + __tests__/
src/db/          SQLite: esquema, repositorios
src/cloud/       sincronización con Supabase
src/components/  Plan2D, vista 3D, chips de confiabilidad…
supabase/        esquema SQL y Edge Function de IA
```

## Cómo ejecutarla

Requiere un teléfono Android compatible con ARCore. **No funciona en Expo Go** (ViroReact es nativo): se usa una development build.

```bash
npm install
npm test                 # pruebas de la lógica
npx tsc --noEmit         # tipos
npx eas-cli build --profile development --platform android   # APK de desarrollo
npx expo start --dev-client
```

Sin variables de Supabase la app funciona solo en local. Para la nube, copia `.env.example` a `.env.local` y llena `EXPO_PUBLIC_SUPABASE_URL` y `EXPO_PUBLIC_SUPABASE_KEY`.

## Limitaciones honestas

Los resultados son **estimaciones**: dependen de la luz, la textura de las superficies y del sensor del teléfono. Por eso cada medida trae su confiabilidad y la app permite calibrar.
