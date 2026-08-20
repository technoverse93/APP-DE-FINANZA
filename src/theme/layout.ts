/**
 * Métricas de disposición.
 *
 * iOS 18 usa esquinas notoriamente más redondeadas que las versiones previas;
 * las tarjetas agrupadas rondan los 16-20 pt.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 20,
  xxl: 24,
  xxxl: 32,
} as const;

export const radius = {
  sm: 8,
  md: 12,
  card: 18,
  lg: 22,
  pill: 999,
} as const;

/**
 * Sombra de tarjeta: muy tenue. En iOS 18 la separación la da el contraste
 * entre la superficie blanca y el fondo gris, no una sombra marcada.
 */
export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0.05,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
} as const;

/** Altura mínima táctil recomendada por Apple. */
export const HIT_SLOP_MIN = 44;
