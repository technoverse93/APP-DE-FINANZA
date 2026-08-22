import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import type { CostoOportunidad } from '../core/analytics/opportunityCost';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  readonly costo: CostoOportunidad | null;
  readonly onCerrar?: () => void;
}

/**
 * Aviso de costo de oportunidad: aparece después de anotar un gasto variable
 * en el Libro Mayor, mostrando qué habría pasado si ese mismo monto se
 * hubiera abonado a la deuda prioritaria en vez de gastarse.
 *
 * Memoizado: solo toma `costo` (o null) y un callback, así que evita
 * recalcular su árbol en cada tecla de los otros formularios de la pantalla.
 */
export const OpportunityAlertToast = memo(function OpportunityAlertToast({ costo, onCerrar }: Props) {
  if (!costo) return null;
  return (
    <View style={styles.contenedor}>
      <Text style={styles.texto}>{costo.mensaje}</Text>
      {onCerrar ? (
        <Text style={styles.cerrar} onPress={onCerrar}>
          Cerrar
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  contenedor: {
    backgroundColor: colors.orangeSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    gap: spacing.xs,
  },
  texto: { ...typography.footnote, color: colors.label },
  cerrar: {
    ...typography.footnote,
    color: colors.labelSecondary,
    fontWeight: '600',
    alignSelf: 'flex-end',
  },
});
