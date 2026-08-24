import { StyleSheet, View, ViewProps } from 'react-native';
import { BORDE, colors, radius, spacing } from '../theme';

interface Props extends ViewProps {
  /** Quita el relleno interno cuando el panel contiene una lista a sangre. */
  readonly sinRelleno?: boolean;
  /** Marca el panel como "encendido": borde de acento en vez de neutro. */
  readonly activo?: boolean;
}

/**
 * Panel de datos.
 *
 * Sobre un fondo casi negro lo que separa un panel del vacío es su borde de
 * un pixel, no una sombra: un desenfoque oscuro sobre fondo oscuro no se ve.
 * Por eso el panel se define por línea y por un fondo apenas más claro que
 * el de la aplicación.
 */
export function Card({ sinRelleno, activo, style, children, ...rest }: Props) {
  return (
    <View
      style={[styles.panel, sinRelleno && styles.sinRelleno, activo && styles.activo, style]}
      {...rest}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    borderWidth: BORDE,
    borderColor: colors.separator,
    padding: spacing.lg,
  },
  sinRelleno: { padding: 0, overflow: 'hidden' },
  activo: { borderColor: colors.acento },
});
