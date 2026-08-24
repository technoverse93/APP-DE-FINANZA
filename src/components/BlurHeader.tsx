import { memo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { BORDE, colors, radius, spacing, typography } from '../theme';

interface Props {
  readonly titulo: string;
  readonly subtitulo?: string;
  /**
   * Indicador de "en vivo". Se enciende cuando la pantalla tiene datos
   * cargados y al día; parpadea apagado mientras sincroniza.
   */
  readonly enVivo?: boolean;
}

const LOGO_TECHNOVERSE = require('../../assets/brand/technoverse-logo.png');

/**
 * Barra superior del panel de control.
 *
 * Antes usaba `BlurView` de expo-blur para imitar el material translúcido de
 * iOS. Se quitó: el desenfoque en tiempo real es de los efectos más caros que
 * puede pedir una pantalla, se recalcula en cada cuadro del desplazamiento, y
 * en un Galaxy A12 eso se paga en fluidez. Sobre un fondo casi negro, además,
 * el desenfoque casi no se percibe — se estaba pagando el costo sin recibir
 * el efecto. Una línea de un pixel separa igual de bien.
 *
 * El punto de "EN VIVO" es el único elemento con color saturado de la barra:
 * dice de un vistazo si lo que estás mirando está al día o todavía cargando.
 */
export const BlurHeader = memo(function BlurHeader({ titulo, subtitulo, enVivo }: Props) {
  return (
    <View style={styles.contenedor}>
      <View style={styles.masthead}>
        <Image source={LOGO_TECHNOVERSE} style={styles.logo} />
        <Text style={styles.nombreApp}>FINANZAS</Text>
        <View style={styles.espaciador} />
        <View style={styles.estado}>
          <View style={[styles.punto, !enVivo && styles.puntoApagado]} />
          <Text style={[styles.textoEstado, !enVivo && styles.textoApagado]}>
            {enVivo ? 'EN VIVO' : 'CARGANDO'}
          </Text>
        </View>
      </View>
      <View style={styles.textos}>
        <Text style={styles.titulo}>{titulo}</Text>
        {subtitulo ? <Text style={styles.subtitulo}>{subtitulo}</Text> : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  contenedor: {
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    borderBottomWidth: BORDE,
    borderBottomColor: colors.separator,
  },
  masthead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xs,
  },
  logo: { width: 18, height: 18, borderRadius: radius.sm },
  nombreApp: { ...typography.rotulo, color: colors.labelSecondary },
  espaciador: { flex: 1 },
  estado: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  punto: { width: 6, height: 6, borderRadius: 3, backgroundColor: colors.acento },
  puntoApagado: { backgroundColor: colors.orange },
  textoEstado: { ...typography.caption2, color: colors.acento },
  textoApagado: { color: colors.orange },
  textos: { gap: 1 },
  titulo: { ...typography.largeTitle, color: colors.label },
  subtitulo: { ...typography.caption1, color: colors.labelSecondary },
});
