import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { formatearColones } from '../core/payroll/distribution';
import { colors, radius, spacing, typography } from '../theme';

export interface BarraFlujo {
  readonly etiqueta: string;
  readonly valor: number;
  readonly color: string;
}

interface Props {
  readonly barras: readonly BarraFlujo[];
}

/**
 * Barras horizontales comparativas de ingresos contra egresos.
 *
 * Van horizontales y no verticales por el ancho real del teléfono: en 360 dp,
 * unas barras verticales dejan ~50 dp por columna, donde una etiqueta como
 * "Transporte proyectado" no cabe ni rotada. En horizontal cada barra tiene
 * la fila entera para su etiqueta y su monto.
 *
 * Se dibuja con Views y `flex`, sin SVG: son rectángulos con esquinas
 * redondeadas, y el layout nativo los resuelve más barato que un canvas.
 */
export const GraficoBarrasFlujo = memo(function GraficoBarrasFlujo({ barras }: Props) {
  const maximo = useMemo(
    () => Math.max(0, ...barras.map((b) => Math.abs(b.valor))),
    [barras],
  );

  if (barras.length === 0) return null;

  return (
    <View style={styles.contenedor}>
      {barras.map((barra) => {
        // Con todo en cero, todas las barras quedan vacías en vez de llenas:
        // dividir por cero daría NaN y React Native descarta ese ancho,
        // dejando la barra al 100%, que leería como "gastaste todo".
        const proporcion = maximo > 0 ? Math.abs(barra.valor) / maximo : 0;
        return (
          <View key={barra.etiqueta} style={styles.fila}>
            <View style={styles.encabezadoFila}>
              <Text style={styles.etiqueta} numberOfLines={1}>
                {barra.etiqueta}
              </Text>
              <Text style={styles.monto}>{formatearColones(barra.valor)}</Text>
            </View>
            <View style={styles.riel}>
              <View
                style={[
                  styles.barra,
                  {
                    // El mínimo de 2 deja visible una barra de monto muy
                    // pequeño pero real, que si no se vería idéntica a cero.
                    width: `${Math.max(proporcion * 100, barra.valor !== 0 ? 2 : 0)}%`,
                    backgroundColor: barra.color,
                  },
                ]}
              />
            </View>
          </View>
        );
      })}
    </View>
  );
});

const styles = StyleSheet.create({
  contenedor: { gap: spacing.md },
  fila: { gap: spacing.xs },
  encabezadoFila: { flexDirection: 'row', justifyContent: 'space-between', gap: spacing.sm },
  etiqueta: { ...typography.footnote, color: colors.labelSecondary, flex: 1 },
  monto: { ...typography.footnote, color: colors.label, fontWeight: '600' },
  riel: {
    height: 8,
    borderRadius: radius.pill,
    backgroundColor: colors.fill,
    overflow: 'hidden',
  },
  barra: { height: '100%', borderRadius: radius.pill },
});
