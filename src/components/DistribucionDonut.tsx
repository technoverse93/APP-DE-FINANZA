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
export const DistribucionDonut = memo(function DistribucionDonut({ segmentos, tamano = 160 }: Props) {
  const radio = (tamano - GROSOR_TRAZO) / 2;
  const circunferencia = 2 * Math.PI * radio;

  const arcos = useMemo(() => {
    const positivos = segmentos.filter((s) => s.valor > 0);
    const total = positivos.reduce((suma, s) => suma + s.valor, 0);
    if (total <= 0) return [];

    let acumulado = 0;
    return positivos.map((s) => {
      const largo = (s.valor / total) * circunferencia;
      const arco = { ...s, largo, dashoffset: -acumulado };
      acumulado += largo;
      return arco;
    });
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
              <Text style={styles.etiquetaLeyenda}>{s.etiqueta}</Text>
              <Text style={styles.valorLeyenda}>{formatearColones(s.valor)}</Text>
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
  valorLeyenda: { ...typography.footnote, color: colors.label, fontVariant: ['tabular-nums'] },
});
