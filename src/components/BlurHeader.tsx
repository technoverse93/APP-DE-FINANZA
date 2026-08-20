import { BlurView } from 'expo-blur';
import { StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';

interface Props {
  readonly titulo: string;
  readonly subtitulo?: string;
}

/**
 * Encabezado con material translúcido, el efecto que iOS aplica sobre el
 * contenido que se desplaza por debajo.
 */
export function BlurHeader({ titulo, subtitulo }: Props) {
  return (
    <BlurView intensity={60} tint="light" style={styles.contenedor}>
      <View style={styles.textos}>
        <Text style={styles.titulo}>{titulo}</Text>
        {subtitulo ? <Text style={styles.subtitulo}>{subtitulo}</Text> : null}
      </View>
    </BlurView>
  );
}

const styles = StyleSheet.create({
  contenedor: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  textos: { gap: 2 },
  titulo: { ...typography.largeTitle, color: colors.label },
  subtitulo: { ...typography.subheadline, color: colors.labelSecondary },
});
