import { colors } from './colors';
import { radius, spacing } from './layout';
import { typography } from './typography';

/**
 * Estilo único de campo de texto.
 *
 * Existe porque cada pantalla tenía su propia copia del mismo bloque, y todas
 * repetían el mismo error: el fondo era `colors.fill` (#F2F2F7), que es
 * EXACTAMENTE el mismo color que `colors.background`. Dentro de una tarjeta
 * blanca el campo se distinguía, pero cualquier formulario apoyado directo
 * sobre el fondo de la pantalla quedaba invisible — solo se veía el texto de
 * ayuda flotando, sin caja, y no había forma de saber dónde tocar.
 *
 * El borde es lo que lo arregla en los dos contextos a la vez: sobre el fondo
 * gris delimita el campo, y sobre una tarjeta blanca lo refuerza sin
 * estorbar. Definirlo una sola vez acá evita que el próximo formulario nazca
 * con el mismo defecto.
 *
 * `minHeight` mantiene el campo dentro del mínimo táctil aunque el tipo de
 * letra del sistema venga más chico.
 */
export const campoTexto = {
  ...typography.body,
  backgroundColor: colors.surface,
  borderWidth: 1,
  borderColor: colors.separator,
  borderRadius: radius.md,
  paddingHorizontal: spacing.lg,
  paddingVertical: spacing.md,
  minHeight: 48,
  color: colors.label,
} as const;
