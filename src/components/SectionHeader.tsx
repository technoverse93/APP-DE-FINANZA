import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';

interface Props {
  readonly titulo: string;
  readonly accion?: string;
  /** Si se pasa, `accion` se vuelve tocable en vez de solo decorativa. */
  readonly onAccionPress?: () => void;
}

/** Encabezado de sección en mayúsculas, como las listas agrupadas de iOS.
 * Solo recibe props primitivas y un callback (sin `children`), así que
 * memoizar sí evita re-renders reales cuando el resto de la pantalla
 * cambia. */
export const SectionHeader = memo(function SectionHeader({ titulo, accion, onAccionPress }: Props) {
  return (
    <View style={styles.contenedor}>
      <Text style={styles.titulo}>{titulo.toUpperCase()}</Text>
      {accion ? (
        <Text style={styles.accion} onPress={onAccionPress}>
          {accion}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  contenedor: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  titulo: { ...typography.footnote, color: colors.labelSecondary, letterSpacing: 0.5 },
  accion: { ...typography.footnote, color: colors.blue },
});
