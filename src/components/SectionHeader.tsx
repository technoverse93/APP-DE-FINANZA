import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';

interface Props {
  readonly titulo: string;
  readonly accion?: string;
  /** Si se pasa, `accion` se vuelve tocable en vez de solo decorativa. */
  readonly onAccionPress?: () => void;
}

/**
 * Rótulo de sección: versalita monoespaciada con una barra de acento delante.
 *
 * La barra no es adorno: en una pantalla densa, donde los paneles se suceden
 * casi sin aire entre ellos, es la marca que dice "acá empieza otra cosa".
 * Sin ella los rótulos se confunden con las etiquetas internas de los
 * paneles, que usan la misma versalita.
 */
export const SectionHeader = memo(function SectionHeader({ titulo, accion, onAccionPress }: Props) {
  return (
    <View style={styles.contenedor}>
      <View style={styles.barra} />
      <Text style={styles.titulo}>{titulo.toUpperCase()}</Text>
      <View style={styles.linea} />
      {accion ? (
        <Text style={styles.accion} onPress={onAccionPress}>
          {accion.toUpperCase()}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  contenedor: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  barra: {
    width: 2,
    height: 11,
    borderRadius: 1,
    backgroundColor: colors.acento,
  },
  titulo: { ...typography.rotulo, color: colors.labelSecondary },
  /** Fila de guía que corre hasta el borde: la retícula del instrumento. */
  linea: { flex: 1, height: 1, backgroundColor: colors.separator },
  accion: { ...typography.rotulo, color: colors.acento },
});
