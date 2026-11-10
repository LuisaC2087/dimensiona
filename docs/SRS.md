# DIMENSIONA — resumen del SRS (IEEE 830, Rev. 1.0)

Documento completo: `docs/2_SRS_DIMENSIONA_IEEE830.pdf` (colócalo aquí). Este resumen es la referencia operativa.

## Requisitos funcionales
| RF | Nombre | Prior. | Criterio de aceptación (prueba) |
|---|---|---|---|
| RF-01 | Compatibilidad ARCore + permiso cámara | Alta | Estado correcto ≤ 2 s, sin cierres (PR-12) |
| RF-02 | Escaneo guiado, planos; suficiente con ≥1 horizontal y ≥2 verticales; aviso a los 20 s sin planos | Alta | Piso detectado ≤ 10 s en 8/10 (PR-09) |
| RF-03 | Estado seguimiento Bueno/Limitado/Perdido + causa; bloquea puntos en Perdido; >5 s perdido → ofrecer reiniciar | Alta | Cambio ≤ 1 s con causa correcta (PR-09) |
| RF-04 | Distancia A–B (hit-test + ancla); descarta B si < 1 cm; deshacer/borrar | Alta | Error medio ≤ 5 % en 10 distancias 0,5–3 m (PR-01) |
| RF-05 | Contorno 3–12 esquinas, proyección (x,z), polígono simple, lados ≥ 0,30 m | Alta | ≤ 3 min; ≥ 80 % paredes ≤ 5 % (PR-02) |
| RF-06 | Altura h = \|y_techo − y_piso\|; manual 1,80–6,00 m (fuera: confirmar) | Alta | Error ≤ 5 % en 3 repeticiones (PR-03) |
| RF-07 | Paredes, P, A (shoelace), paredes = P·h, V = A·h; k, k², k³; 2 decimales; confiabilidad = mínima | Alta | ≥ 10 casos, error ≤ 0,01 % (PR-04) |
| RF-08 | Plano 2D: paredes numeradas, cotas, área, barra de escala, zoom/pan | Alta | ≤ 1 s p95; texto ≥ 10 sp (PR-05) |
| RF-09 | S = 100·(0,40T + 0,30P + 0,30D); Alta ≥ 75, Media ≥ 50, Baja; renormaliza si falta factor ("parcial") | Alta | Mediana error Alta < Baja (PR-06) |
| RF-10 | Proyectos locales, autoguardado ≤ 1 s, lista por fecha, borrado en cascada; nombre repetido → sufijo | Alta | 20 mediciones 100 % recuperadas; abrir ≤ 2 s (PR-10) |
| RF-11 | Modelo 3D extruido, giro/pellizco, vista superior/isométrica | Media | Respuesta ≤ 300 ms (PR-09) |
| RF-12 | Calibración k = L_real / L_medida; aplicar si 0,85 ≤ k ≤ 1,15. Refs: tarjeta 0,0856 m, carta 0,2794 m, A4 0,2970 m, cinta 1,00 m | Media | Mejora o igual en ≥ 4/5 (PR-07) |
| RF-13 | Rango ± : Alta 3 %, Media 6 %, Baja 12 %; Baja → advertencia + "Repetir medición" | Media | ≥ 80 % dentro del rango (PR-08) |
| RF-14 | Fotos (JPEG privado) y notas ≤ 500 caracteres | Media | ≥ 10 fotos; borrado con proyecto (PR-10) |
| RF-15 | Unidades m, cm, in, ft-in; decimales | Media | 1 m = 100 cm = 39,37 in = 3,281 ft (PR-04) |
| RF-16 | Demo (sala 4,20 × 3,60 × 2,50 m, "Demo") + tutorial 3 pantallas omitible | Alta | Resultados en ≤ 1 min sin ayuda (PR-13) |

## Factores de confiabilidad (Apéndice D)
- T seguimiento: Bueno 1,0 · Limitado 0,5 · Perdido 0 (bloqueado)
- P superficie: plano detectado 1,0 · punto de características 0,5
- D distancia cámara–punto: 1,0 si ≤ 2 m; lineal hasta 0,3 en 5 m; 0,2 si > 5 m
- Verificación: 4,20 × 3,60, h 2,50 → A 15,12 m², P 15,60 m, V 37,80 m³

## No funcionales clave
RNF-01 marcador ≤ 500 ms · RNF-02 cálculo+plano ≤ 1 s · RNF-03 guardar ≤ 1 s, abrir 50 mediciones ≤ 2 s · RNF-04 ≥ 50 proyectos · RNF-05 arranque ≤ 5 s · RNF-06 APK ≤ 150 MB · RNF-07/08 local, solo CAMERA · RNF-09 transacciones · RNF-12 solo se pierde la última acción · RNF-15 siempre confiabilidad · RNF-16/17 offline y modo degradado sin ARCore · RNF-19 Android 8+ (API 26) · RNF-20 APK · RNF-21 pantallas 5–7".

## Modelo de datos (Apéndice I)
- proyecto(id, nombre, tipo_espacio, altura_m?, factor_k=1, es_demo, creado, modificado)
- esquina(id, proyecto_id, orden, x, z, confiabilidad)
- medicion(id, proyecto_id, tipo[distancia|altura|referencia], valor_m, a_x..b_z, confiabilidad, nivel, factores JSON)
- foto(id, proyecto_id, medicion_id?, ruta, nota≤500, fecha)
- ajustes(unidad, decimales, tutorial_visto)

## Pantallas
Inicio/Proyectos · Tutorial · Escaneo y medición (AR) · Habitación guiada · Resultados (Plano/3D/Datos) · Detalle de confiabilidad · Calibración · Ajustes.

---

# Control de cambios — Rev. 1.1 (CR-01: base de datos en la nube)

**Estado:** propuesto por la desarrolladora · **pendiente de validación del cliente (docente)**.
**Motivo:** contar con una base principal en la nube (gratuita) para no perder proyectos y recuperarlos en otro teléfono, conservando el funcionamiento sin conexión.

## Requisitos nuevos
| RF | Nombre | Prior. | Descripción | Criterio de aceptación |
|---|---|---|---|---|
| RF-17 | Cuenta de usuario | Media | Registro e inicio de sesión con correo y contraseña (Supabase Auth). Opcional: sin cuenta la app funciona solo en local. Autorización expresa de tratamiento del correo (Ley 1581). Al cerrar sesión se borran los datos del teléfono (siguen en la nube); si hay cambios sin subir se advierte. | Crear cuenta, cerrar e iniciar sesión en otro teléfono recupera el 100 % de los proyectos (PR-14). |
| RF-18 | Sincronización nube ⇄ local | Media | La nube (Supabase/PostgreSQL) es la base principal; SQLite es la copia de trabajo offline. Se sube y baja al iniciar sesión, al recuperar conexión, tras cada cambio (1,5 s) y cada 5 min. Conflictos: gana la nube salvo cambio local pendiente más reciente; empate → nube. Borrados lógicos. Se sincronizan proyectos, esquinas y mediciones; **no** las fotos ni el proyecto demo. | Con el teléfono en modo avión se crean 5 mediciones; al reconectar quedan en la nube en ≤ 30 s, sin pérdidas ni duplicados (PR-15). |

## Requisitos modificados
| ID | Antes (Rev. 1.0) | Ahora (Rev. 1.1) |
|---|---|---|
| 1.2 Alcance | «no sincroniza información en la nube» | Sincroniza proyectos y mediciones con una base en la nube si el usuario inicia sesión. |
| 2.1 Perspectiva | «El producto no utiliza servidores» | Usa Supabase (plan gratuito) como base principal; ARCore y la medición siguen siendo locales. |
| 2.4 / 2.5 | Todo en el dispositivo | Dependencia de Supabase. Supuesto: el plan gratuito pausa el proyecto tras 7 días sin actividad (se reactiva desde el panel); límite 500 MB de BD. |
| 3.1.4 Comunicaciones | Solo descarga de ARCore | HTTPS (TLS) a la API REST de Supabase con token de sesión; datos aislados por usuario con Row Level Security. |
| RNF-07 | Datos solo en almacenamiento privado; no se envían a servidores | Sin cuenta: solo en el teléfono. Con cuenta: proyectos y mediciones también en Supabase, cifrados en tránsito y accesibles solo por su dueño (RLS). Fotos nunca salen del teléfono. |
| RNF-08 | Solo CAMERA | CAMERA + INTERNET (ya incluido por Android por defecto). Siguen bloqueados ubicación, contactos y micrófono. |
| RNF-16 | 100 % sin Internet | 100 % de las funciones de medición y consulta sin Internet; solo cuenta y sincronización requieren red. |
| ROT-04 | No recolectar datos personales | Único dato personal: correo de la cuenta, con autorización expresa, finalidad declarada y posibilidad de eliminación. |
| Apéndice I | — | Campos `usuario_id`, `pendiente`, tablas `eliminado` y `sync_meta` (local); en la nube `user_id`, `borrado`, `sync_at`. Esquema: `supabase/schema.sql`. |

## Riesgos nuevos
| ID | Riesgo | Prob./Impacto | Mitigación |
|---|---|---|---|
| R-08 | Proyecto Supabase pausado por inactividad durante la Expo | Media / Medio | Abrir la app o el panel días antes; la app sigue funcionando offline. |
| R-09 | Conflictos de edición entre dos teléfonos | Baja / Bajo | Regla «gana el más reciente / la nube» con pruebas unitarias (PR-04). |

## Pruebas nuevas
- **PR-14** Cuenta: registro, confirmación, inicio de sesión en un 2.º dispositivo y recuperación de proyectos.
- **PR-15** Offline → online: modo avión, crear/editar/borrar, reconectar; verificar en el panel de Supabase.
