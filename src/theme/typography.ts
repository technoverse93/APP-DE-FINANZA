import { Platform, TextStyle } from 'react-native';

/**
 * Escala tipográfica de iOS 18.
 *
 * En iOS se usa la fuente de sistema (San Francisco); en Android se cae a
 * Roboto, que es la métrica más cercana disponible sin empacar la tipografía.
 */
const familia = Platform.select({ ios: 'System', default: 'sans-serif' });

const base: TextStyle = { fontFamily: familia, color: undefined };

export const typography = {
  largeTitle: { ...base, fontSize: 34, lineHeight: 41, fontWeight: '700' },
  title1: { ...base, fontSize: 28, lineHeight: 34, fontWeight: '700' },
  title2: { ...base, fontSize: 22, lineHeight: 28, fontWeight: '700' },
  title3: { ...base, fontSize: 20, lineHeight: 25, fontWeight: '600' },
  headline: { ...base, fontSize: 17, lineHeight: 22, fontWeight: '600' },
  body: { ...base, fontSize: 17, lineHeight: 22, fontWeight: '400' },
  callout: { ...base, fontSize: 16, lineHeight: 21, fontWeight: '400' },
  subheadline: { ...base, fontSize: 15, lineHeight: 20, fontWeight: '400' },
  footnote: { ...base, fontSize: 13, lineHeight: 18, fontWeight: '400' },
  caption1: { ...base, fontSize: 12, lineHeight: 16, fontWeight: '400' },
  caption2: { ...base, fontSize: 11, lineHeight: 13, fontWeight: '400' },
  /** Cifras grandes: tabulares para que no bailen al actualizarse. */
  amount: {
    ...base,
    fontSize: 40,
    lineHeight: 46,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
} as const satisfies Record<string, TextStyle>;

export type TypographyName = keyof typeof typography;
