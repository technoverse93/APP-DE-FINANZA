import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  readonly mensaje: string;
}

/**
 * Aviso de configuración faltante, visible en la app en vez de solo en logs.
 *
 * `supabaseConfigError` (src/lib/supabase.ts) existe desde que se corrigió el
 * crash de arranque por variables de entorno faltantes, pero nunca se
 * mostraba en ninguna pantalla: sin `.env`, la app abre bien pero cada
 * pantalla que depende de Supabase falla con un error genérico, sin decir
 * por qué. Esto muestra el motivo real y accionable apenas se monta la app.
 */
export const ConfigWarning = memo(function ConfigWarning({ mensaje }: Props) {
  return (
    <View style={styles.contenedor}>
      <Text style={styles.titulo}>Configuración incompleta</Text>
      <Text style={styles.detalle}>{mensaje}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  contenedor: {
    margin: spacing.lg,
    backgroundColor: colors.orangeSoft,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.xs,
  },
  titulo: { ...typography.headline, color: colors.label },
  detalle: { ...typography.footnote, color: colors.labelSecondary },
});
