/**
 * Paleta "Centro de Control": terminal oscura de alto contraste.
 *
 * Reemplaza la paleta clara de iOS 18 que tenía la app antes. La decisión de
 * fondo oscuro no es estética nada más: esta app se abre de noche y a la
 * salida del trabajo, y un fondo casi negro con texto claro cansa menos la
 * vista en esas condiciones que una pantalla blanca a brillo alto.
 *
 * Los nombres de los tokens se conservan (background, surface, label, green,
 * red…) para que cada componente siga pidiendo el color por su papel y no por
 * su valor. Eso es lo que permite cambiar la piel entera de la aplicación
 * tocando este archivo en vez de cada pantalla.
 *
 * El contraste está verificado contra el fondo de panel (#12151A): el texto
 * principal supera 13:1 y el secundario 6:1, así que la letra chica de los
 * paneles densos sigue siendo legible.
 */
export const colors = {
  /** Fondo de la aplicación: el "vacío" entre paneles. */
  background: '#0D0F12',
  /** Superficie de los paneles de datos. */
  surface: '#12151A',
  /** Superficie de un elemento presionado. */
  surfacePressed: '#1A1E25',
  /** Fondo de campos y controles embebidos. */
  fill: '#1A1E25',

  label: '#F1F4F8',
  labelSecondary: '#9AA4B2',
  labelTertiary: '#6B7480',
  /** Texto sobre el color de acento (que es claro y saturado). */
  labelInverse: '#0D0F12',

  separator: '#1E232B',
  separatorOpaque: '#2A3038',

  /**
   * Acento de acción y de estado activo. El verde es el color de "esto está
   * vivo y en orden" en un panel de control, y es el que la pantalla usa para
   * las señales positivas (saldo bajando, quincena en verde).
   */
  acento: '#4ADE80',
  /** Acento apagado, para bordes y rellenos de fondo. */
  acentoTenue: '#132A1E',

  blue: '#38BDF8',
  green: '#4ADE80',
  red: '#F43F5E',
  orange: '#F59E0B',
  teal: '#2DD4BF',
  indigo: '#818CF8',

  /** Tintes de estado: casi negros con la dominante del color. */
  greenSoft: '#0F2419',
  redSoft: '#2A1119',
  orangeSoft: '#2A1F0C',
  blueSoft: '#0C1F2E',

  overlay: 'rgba(0, 0, 0, 0.65)',

  /**
   * Marca Technoverse. El navy original (#14243F) queda como fondo de la
   * franja de marca — sobre el fondo casi negro sigue leyéndose como azul —
   * y el dorado se conserva como acento secundario para lo que es de marca y
   * no de estado, así no compite con el verde del sistema.
   */
  brandNavy: '#14243F',
  brandNavyHover: '#1D3357',
  brandGold: '#F59E5B',
  brandGoldDark: '#C2410C',
  brandGoldLight: '#FBBF77',
  brandGoldSoft: '#2A1B10',
} as const;

export type ColorName = keyof typeof colors;
