/**
 * Métricas de disposición del "Centro de Control".
 *
 * Los radios bajan casi a cero respecto del diseño anterior: un panel de
 * datos se lee como un instrumento, y las esquinas muy redondeadas lo
 * suavizan hasta parecer una tarjeta decorativa. La separación entre paneles
 * también se acorta — el punto de esta dirección es que quepa todo sin
 * desplazar.
 */
export const spacing = {
  xs: 4,
  sm: 8,
  md: 10,
  lg: 13,
  xl: 16,
  xxl: 20,
  xxxl: 28,
} as const;

export const radius = {
  sm: 4,
  md: 5,
  card: 6,
  lg: 6,
  pill: 999,
} as const;

/**
 * En un fondo casi negro una sombra no se ve: lo que separa un panel del
 * vacío es su borde de un pixel, no un desenfoque. Por eso `card` deja de
 * proyectar sombra y lo que queda es el resplandor de acento, para los pocos
 * elementos que deben leerse como "encendidos".
 */
export const shadow = {
  card: {
    shadowColor: '#000000',
    shadowOpacity: 0,
    shadowRadius: 0,
    shadowOffset: { width: 0, height: 0 },
    elevation: 0,
  },
  /** Resplandor del acento: solo para el botón principal y el tab activo. */
  glow: {
    shadowColor: '#4ADE80',
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
} as const;

/** Grosor de la línea que dibuja cada panel. */
export const BORDE = 1;

/** Altura mínima táctil recomendada por Apple. */
export const HIT_SLOP_MIN = 44;
