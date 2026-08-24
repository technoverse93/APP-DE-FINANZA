import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { BORDE, colors, radius, spacing, typography } from '../theme';

export interface CeldaDato {
  readonly etiqueta: string;
  readonly valor: string;
  /** Línea de contexto bajo la cifra (una variación, un rango, una fecha). */
  readonly detalle?: string;
  readonly tono?: 'normal' | 'positivo' | 'negativo' | 'atencion';
}

interface Props {
  readonly celdas: readonly CeldaDato[];
}

const TONOS = {
  normal: colors.label,
  positivo: colors.green,
  negativo: colors.red,
  atencion: colors.orange,
} as const;

/**
 * Rejilla de datos duros: dos columnas de cifras con su rótulo.
 *
 * Es la unidad de lectura rápida de esta dirección. Cada celda es un panel
 * mínimo — borde, rótulo en versalita, cifra — y dos por fila es lo máximo
 * que entra en 360 dp sin que una cifra de siete dígitos se parta en dos
 * líneas.
 *
 * Un número impar de celdas deja el último hueco vacío en vez de estirar la
 * celda a lo ancho: mantener el ancho constante es lo que permite comparar
 * las cifras de un vistazo, que es para lo que existe la rejilla.
 */
export const RejillaDatos = memo(function RejillaDatos({ celdas }: Props) {
  if (celdas.length === 0) return null;

  return (
    <View style={styles.rejilla}>
      {celdas.map((celda) => (
        <View key={celda.etiqueta} style={styles.celda}>
          <Text style={styles.etiqueta} numberOfLines={1}>
            {celda.etiqueta.toUpperCase()}
          </Text>
          <Text style={[styles.valor, { color: TONOS[celda.tono ?? 'normal'] }]} numberOfLines={1}>
            {celda.valor}
          </Text>
          {celda.detalle ? (
            <Text style={styles.detalle} numberOfLines={1}>
              {celda.detalle}
            </Text>
          ) : null}
        </View>
      ))}
    </View>
  );
});

const styles = StyleSheet.create({
  rejilla: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  celda: {
    // El 50% menos la mitad del `gap`: dos por fila exactas.
    width: '48.5%',
    backgroundColor: colors.surface,
    borderWidth: BORDE,
    borderColor: colors.separator,
    borderRadius: radius.md,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.md,
    gap: 1,
  },
  etiqueta: { ...typography.rotulo, color: colors.labelTertiary },
  valor: { ...typography.amountSmall },
  detalle: { ...typography.caption1, color: colors.labelTertiary },
});
