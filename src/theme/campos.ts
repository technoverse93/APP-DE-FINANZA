import { colors } from './colors';
import { BORDE, radius, spacing } from './layout';
import { typography } from './typography';

/**
 * Estilo único de campo de texto.
 *
 * Existe porque cada pantalla tenía su propia copia del mismo bloque, y todas
 * repetían el mismo error: el fondo del campo era el mismo color que el fondo
 * de la pantalla, así que cualquier formulario apoyado directo sobre el fondo
 * quedaba invisible — solo se veía el texto de ayuda flotando, sin caja, y no
 * había forma de saber dónde tocar.
 *
 * El borde es lo que lo arregla en los dos contextos a la vez: sobre el fondo
 * de la app delimita el campo, y dentro de un panel lo refuerza sin estorbar.
 * Definirlo una sola vez acá evita que el próximo formulario nazca con el
 * mismo defecto.
 */
export const campoTexto = {
  ...typography.body,
  backgroundColor: colors.fill,
  borderWidth: BORDE,
  borderColor: colors.separatorOpaque,
  borderRadius: radius.md,
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.md,
  minHeight: 46,
  color: colors.label,
} as const;

/**
 * Ficha seleccionable (elegir modo de reparto, tipo de movimiento, deuda).
 *
 * Lleva borde por la misma razón que el campo de texto: sobre fondo oscuro,
 * un relleno apenas más claro no basta para que se lea como algo tocable.
 * `paddingVertical` la mantiene sobre los 34 pt de alto, que es el mínimo con
 * el que un dedo acierta sin pelear.
 */
export const ficha = {
  ...typography.caption1,
  color: colors.labelSecondary,
  backgroundColor: colors.fill,
  borderWidth: BORDE,
  borderColor: colors.separatorOpaque,
  borderRadius: radius.sm,
  paddingHorizontal: spacing.md,
  paddingVertical: spacing.sm,
  overflow: 'hidden',
} as const;

/** La misma ficha, encendida. */
export const fichaActiva = {
  color: colors.labelInverse,
  backgroundColor: colors.acento,
  borderColor: colors.acento,
  fontWeight: '600',
} as const;
