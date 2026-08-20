/**
 * Paleta iOS 18 en modo claro.
 *
 * Los valores son los colores de sistema de Apple. La app se fija en claro a
 * propósito: el diseño pedido es de tonos claros y sin saturación, así que no
 * se define una variante oscura que rompería esa intención.
 */
export const colors = {
  /** Fondo de la aplicación. En iOS los agrupados van sobre gris, no blanco. */
  background: '#F2F2F7',
  /** Superficie de las tarjetas. */
  surface: '#FFFFFF',
  /** Superficie de un elemento presionado. */
  surfacePressed: '#EFEFF4',
  /** Fondo de campos y controles embebidos. */
  fill: '#F2F2F7',

  label: '#000000',
  labelSecondary: 'rgba(60, 60, 67, 0.6)',
  labelTertiary: 'rgba(60, 60, 67, 0.3)',
  labelInverse: '#FFFFFF',

  separator: 'rgba(60, 60, 67, 0.18)',
  separatorOpaque: '#C6C6C8',

  blue: '#007AFF',
  green: '#34C759',
  red: '#FF3B30',
  orange: '#FF9500',
  teal: '#30B0C7',
  indigo: '#5856D6',

  /** Tinte suave para fondos de estado, sin saturar. */
  greenSoft: '#E8F8ED',
  redSoft: '#FDECEA',
  orangeSoft: '#FFF4E5',
  blueSoft: '#E9F2FF',

  overlay: 'rgba(0, 0, 0, 0.4)',
} as const;

export type ColorName = keyof typeof colors;
