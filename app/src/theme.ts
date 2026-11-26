/**
 * Identidad visual: constructivismo. Papel crema, tinta negra y rojo; tipografía condensada en
 * mayúsculas, bloques duros, sombras desplazadas sin desenfoque y diagonales.
 */
export const colors = {
  paper: '#F8F4EC',
  paper2: '#EEE6D6',
  paper3: '#DDD2BC',
  ink: '#141414',
  ink2: '#2A2826',
  red: '#D7261E',
  redDark: '#A91B14',
  grey: '#5B5750',
  ok: '#1F7A3A',
  warn: '#9A5B00',
  white: '#FFFFFF',
} as const;

export const fonts = {
  display: 'Oswald_700Bold',
  displayMedium: 'Oswald_500Medium',
} as const;

export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 } as const;

/** Sombra dura desplazada (sin desenfoque): funciona igual en web y Android vía un bloque detrás. */
export const SHADOW_OFFSET = 6;

export const MAX_WIDTH = 520; // ancho máximo en web: diseño móvil primero
