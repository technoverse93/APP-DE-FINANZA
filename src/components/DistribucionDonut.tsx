import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, G } from 'react-native-svg';
import { formatearColones } from '../core/payroll/distribution';
import { colors, spacing, typography } from '../theme';

export interface SegmentoDonut {
  readonly etiqueta: string;
  readonly valor: number;
  readonly color: string;
}

interface Props {
  readonly segmentos: readonly SegmentoDonut[];
  readonly tamano?: number;
}

const GROSOR_TRAZO = 18;

/**
 * Donut de distribución, dibujado a mano con react-native-svg (unos pocos
 * círculos con stroke-dasharray, no una librería de charting completa).
 * Cada segmento es una fracción de la suma de los valores recibidos — no
 * asume que suman un total externo (como la colilla),
 * así que sigue siendo válido aunque algún escenario (ej. déficit) no cierre
 * exacto contra esa cifra.
 */
export const DistribucionDonut = memo(function DistribucionDonut({ segmentos, tamano = 120 }: Props) {
  const radio = (tamano - GROSOR_TRAZO) / 2;
  const circunferencia = 2 * Math.PI * radio;

  const { arcos, total } = useMemo(() => {
    const positivos = segmentos.filter((s) => s.valor > 0);
    const total = positivos.reduce((suma, s) => suma + s.valor, 0);
    if (total <= 0) return { arcos: [], total: 0 };

    let acumulado = 0;
    const arcos = positivos.map((s) => {
      const largo = (s.valor / total) * circunferencia;
      const arco = { ...s, largo, dashoffset: -acumulado };
      acumulado += largo;
      return arco;
    });
    return { arcos, total };
  }, [segmentos, circunferencia]);

  return (
    <View style={styles.contenedor}>
      <Svg width={tamano} height={tamano}>
        <G rotation={-90} originX={tamano / 2} originY={tamano / 2}>
          <Circle
            cx={tamano / 2}
            cy={tamano / 2}
            r={radio}
            stroke={colors.fill}
            strokeWidth={GROSOR_TRAZO}
            fill="none"
          />
          {arcos.map((arco, i) => (
            <Circle
              key={i}
              cx={tamano / 2}
              cy={tamano / 2}
              r={radio}
              stroke={arco.color}
              strokeWidth={GROSOR_TRAZO}
              strokeDasharray={`${arco.largo} ${circunferencia - arco.largo}`}
              strokeDashoffset={arco.dashoffset}
              fill="none"
            />
          ))}
        </G>
      </Svg>
      <View style={styles.leyenda}>
        {segmentos
          .filter((s) => s.valor > 0)
          .map((s, i) => (
            <View key={i} style={styles.filaLeyenda}>
              <View style={[styles.punto, { backgroundColor: s.color }]} />
              <Text style={styles.etiquetaLeyenda} numberOfLines={1}>
                {s.etiqueta}
              </Text>
              {/* Monto y porcentaje apilados, no en columnas separadas: con
                  tres textos en una sola fila (etiqueta + % + monto) el monto
                  se salía del borde de la tarjeta en 360 dp — no había ancho
                  para los tres. Apilados comparten una sola columna a la
                  derecha. */}
              <View style={styles.columnaValor}>
                <Text style={styles.valorLeyenda}>{formatearColones(s.valor)}</Text>
                <Text style={styles.porcentajeLeyenda}>
                  {total > 0 ? `${Math.round((s.valor / total) * 100)}%` : ''}
                </Text>
              </View>
            </View>
          ))}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  contenedor: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  leyenda: { flex: 1, gap: spacing.sm },
  filaLeyenda: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  punto: { width: 10, height: 10, borderRadius: 5 },
  etiquetaLeyenda: { ...typography.footnote, color: colors.labelSecondary, flex: 1 },
  columnaValor: { alignItems: 'flex-end' },
  porcentajeLeyenda: {
    ...typography.caption2,
    color: colors.labelTertiary,
    fontVariant: ['tabular-nums'],
  },
  valorLeyenda: { ...typography.footnote, color: colors.label, fontVariant: ['tabular-nums'] },
});
