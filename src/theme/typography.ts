import { Platform, TextStyle } from 'react-native';

/**
 * Escala tipográfica monoespaciada del "Centro de Control".
 *
 * Toda la app va en monoespaciada, y no por gusto: en una pantalla de
 * finanzas casi todo lo que importa son cifras en columna. Con una fuente
 * proporcional, ₡170,000 y ₡21,000 ocupan anchos distintos y las columnas
 * bailan al actualizarse; con monoespaciada quedan alineadas por
 * construcción, sin tener que declarar `tabular-nums` en cada estilo.
 *
 * Se usa la monoespaciada del sistema en vez de empacar JetBrains Mono: en
 * Android es Roboto Mono, ya está en el dispositivo, y evitar un archivo de
 * fuente ahorra ~200 KB de descarga y el parpadeo de texto sin estilo
 * mientras carga — las dos cosas se notan en un teléfono de gama baja con
 * datos móviles.
 *
 * Los tamaños bajan respecto de la escala de iOS porque esta dirección es
 * deliberadamente densa: cabe más información sin desplazar. El piso son
 * 11 pt, que sigue siendo legible; nada baja de ahí.
 */
const familia = Platform.select({ ios: 'Menlo', default: 'monospace' });

const base: TextStyle = { fontFamily: familia, color: undefined };

/** Versalitas de panel: etiqueta corta, muy espaciada, en mayúsculas. */
const rotulo: TextStyle = { ...base, fontWeight: '600', letterSpacing: 1.1 };

export const typography = {
  largeTitle: { ...base, fontSize: 26, lineHeight: 32, fontWeight: '700', letterSpacing: -0.5 },
  title1: { ...base, fontSize: 22, lineHeight: 28, fontWeight: '700', letterSpacing: -0.3 },
  title2: { ...base, fontSize: 19, lineHeight: 25, fontWeight: '700' },
  title3: { ...base, fontSize: 17, lineHeight: 23, fontWeight: '600' },
  headline: { ...base, fontSize: 15, lineHeight: 20, fontWeight: '600' },
  body: { ...base, fontSize: 15, lineHeight: 21, fontWeight: '400' },
  callout: { ...base, fontSize: 14, lineHeight: 19, fontWeight: '400' },
  subheadline: { ...base, fontSize: 13, lineHeight: 19, fontWeight: '400' },
  footnote: { ...base, fontSize: 12, lineHeight: 17, fontWeight: '400' },
  caption1: { ...base, fontSize: 11, lineHeight: 15, fontWeight: '400' },
  caption2: { ...rotulo, fontSize: 10, lineHeight: 14 },
  /** Rótulo de panel: la versalita que encabeza cada bloque de datos. */
  rotulo: { ...rotulo, fontSize: 10, lineHeight: 14 },
  /** Cifra principal de un panel. */
  amount: {
    ...base,
    fontSize: 34,
    lineHeight: 40,
    fontWeight: '700',
    letterSpacing: -1.2,
    fontVariant: ['tabular-nums'],
  },
  /** Cifra secundaria, la de las celdas de la rejilla de datos. */
  amountSmall: {
    ...base,
    fontSize: 17,
    lineHeight: 22,
    fontWeight: '600',
    letterSpacing: -0.4,
    fontVariant: ['tabular-nums'],
  },
} as const satisfies Record<string, TextStyle>;

export type TypographyName = keyof typeof typography;
