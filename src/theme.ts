/** Identidad visual DIMENSIONA (ROT-03, ROT-06). */
export const colors = {
  bg: '#0B0B0C',
  surface: '#1A1A1D',
  surfaceAlt: '#26262A',
  border: '#3A3A40',
  accent: '#FFD100',
  onAccent: '#0B0B0C',
  text: '#F5F5F5',
  textMuted: '#B4B4BA', // contraste ≥ 4,5:1 sobre bg
  ok: '#4ADE80',
  warn: '#FFB020',
  danger: '#FF6B6B',
};

export const levelColors = { Alta: colors.ok, Media: colors.warn, Baja: colors.danger } as const;

export const font = { body: 16, small: 14, title: 22, big: 28 };
export const space = { xs: 4, sm: 8, md: 16, lg: 24 };
export const minTouch = 48;
