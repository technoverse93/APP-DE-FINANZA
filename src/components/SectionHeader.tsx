import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';

interface Props {
  readonly titulo: string;
  readonly accion?: string;
}

/** Encabezado de sección en mayúsculas, como las listas agrupadas de iOS. */
export function SectionHeader({ titulo, accion }: Props) {
  return (
    <View style={styles.contenedor}>
      <Text style={styles.titulo}>{titulo.toUpperCase()}</Text>
      {accion ? <Text style={styles.accion}>{accion}</Text> : null}
    </View>
  );
}

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
