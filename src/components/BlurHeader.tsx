import { BlurView } from 'expo-blur';
import { Image, StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  readonly titulo: string;
  readonly subtitulo?: string;
}

const LOGO_TECHNOVERSE = require('../../assets/brand/technoverse-logo.png');

/**
 * Encabezado con material translúcido, el efecto que iOS aplica sobre el
 * contenido que se desplaza por debajo.
 *
 * Lleva una fila superior fija con el logo de Technoverse y el nombre de la
 * app ("Finanzas"), la misma en todas las pantallas; el `titulo` que recibe
 * cada pantalla es el título grande de esa sección en particular (p. ej.
 * "Quincena", "Inversión"), no el nombre de la app.
 */
export function BlurHeader({ titulo, subtitulo }: Props) {
  return (
    <BlurView intensity={60} tint="light" style={styles.contenedor}>
      <View style={styles.masthead}>
        <Image source={LOGO_TECHNOVERSE} style={styles.logo} />
        <Text style={styles.nombreApp}>Finanzas</Text>
      </View>
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
  masthead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  logo: {
    width: 22,
    height: 22,
    borderRadius: radius.sm,
  },
  nombreApp: {
    ...typography.footnote,
    fontWeight: '600',
    color: colors.brandNavy,
    letterSpacing: 0.3,
  },
  textos: { gap: 2 },
  titulo: { ...typography.largeTitle, color: colors.label },
  subtitulo: { ...typography.subheadline, color: colors.labelSecondary },
});
