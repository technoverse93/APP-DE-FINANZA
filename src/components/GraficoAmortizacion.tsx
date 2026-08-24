import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Line, Path } from 'react-native-svg';
import { formatearColones } from '../core/payroll/distribution';
import { colors, spacing, typography } from '../theme';

export interface SerieAmortizacion {
  readonly etiqueta: string;
  readonly color: string;
  /** Saldo al cierre de cada quincena, en orden cronológico. */
  readonly saldos: readonly number[];
}

interface Props {
  readonly series: readonly SerieAmortizacion[];
  readonly alto?: number;
}

const PADDING_IZQ = 4;
const PADDING_DER = 4;
const PADDING_SUP = 8;
const PADDING_INF = 8;

/**
 * Curva de amortización: cómo baja el saldo de la deuda quincena a quincena,
 * con una línea por escenario para poder compararlos de un vistazo.
 *
 * Se dibuja a mano con react-native-svg en vez de traer una librería de
 * charting. En un Galaxy A12 (gama baja, 4G) una librería como victory-native
 * agrega varios MB al bundle y su propio ciclo de layout para lo que acá son
 * dos polilíneas — el costo de arranque no se justifica.
 *
 * Las dos series comparten escala vertical a propósito: el punto de este
 * gráfico es ver que una curva baja más rápido que la otra, y eso solo se lee
 * si ambas se miden contra el mismo saldo máximo.
 */
export const GraficoAmortizacion = memo(function GraficoAmortizacion({
  series,
  alto = 140,
}: Props) {
  // El ancho real lo da el layout; se dibuja sobre un viewBox de 100 unidades
  // y el SVG lo escala, así no hace falta medir el contenedor.
  const ANCHO = 100;

  const { rutas, maxSaldo, maxPeriodos } = useMemo(() => {
    const conDatos = series.filter((s) => s.saldos.length > 0);
    const maxSaldo = Math.max(0, ...conDatos.flatMap((s) => s.saldos));
    const maxPeriodos = Math.max(1, ...conDatos.map((s) => s.saldos.length - 1));

    const x = (i: number) =>
      PADDING_IZQ + (i / maxPeriodos) * (ANCHO - PADDING_IZQ - PADDING_DER);
    const y = (saldo: number) =>
      maxSaldo <= 0
        ? alto - PADDING_INF
        : PADDING_SUP + (1 - saldo / maxSaldo) * (alto - PADDING_SUP - PADDING_INF);

    const rutas = conDatos.map((serie) => ({
      ...serie,
      d: serie.saldos
        .map((saldo, i) => `${i === 0 ? 'M' : 'L'}${x(i).toFixed(2)},${y(saldo).toFixed(2)}`)
        .join(' '),
      // Punto final: dónde queda saldada cada curva.
      fin: { cx: x(serie.saldos.length - 1), cy: y(serie.saldos[serie.saldos.length - 1]!) },
    }));

    return { rutas, maxSaldo, maxPeriodos };
  }, [series, alto]);

  if (rutas.length === 0) return null;

  return (
    <View>
      <Svg width="100%" height={alto} viewBox={`0 0 ${ANCHO} ${alto}`} preserveAspectRatio="none">
        {/* Línea base del cero: sin ella una curva que baja mucho parece
            terminar "en el aire" en vez de llegar a saldo cero. */}
        <Line
          x1={PADDING_IZQ}
          y1={alto - PADDING_INF}
          x2={ANCHO - PADDING_DER}
          y2={alto - PADDING_INF}
          stroke={colors.separator}
          strokeWidth={0.5}
        />
        {rutas.map((r) => (
          <Path
            key={r.etiqueta}
            d={r.d}
            stroke={r.color}
            strokeWidth={1.5}
            fill="none"
            strokeLinejoin="round"
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {rutas.map((r) => (
          <Circle key={`${r.etiqueta}-fin`} cx={r.fin.cx} cy={r.fin.cy} r={1.5} fill={r.color} />
        ))}
      </Svg>

      <View style={styles.ejes}>
        <Text style={styles.textoEje}>Hoy</Text>
        <Text style={styles.textoEje}>
          {maxPeriodos} quincenas (~{Math.round(maxPeriodos / 2)} meses)
        </Text>
      </View>

      <View style={styles.leyenda}>
        {rutas.map((r) => (
          <View key={r.etiqueta} style={styles.itemLeyenda}>
            <View style={[styles.punto, { backgroundColor: r.color }]} />
            <Text style={styles.textoLeyenda}>{r.etiqueta}</Text>
          </View>
        ))}
      </View>

      <Text style={styles.textoEje}>Saldo máximo: {formatearColones(maxSaldo)}</Text>
    </View>
  );
});

const styles = StyleSheet.create({
  ejes: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  textoEje: { ...typography.caption2, color: colors.labelTertiary },
  leyenda: { gap: spacing.xs, marginTop: spacing.sm, marginBottom: spacing.xs },
  itemLeyenda: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
  punto: { width: 8, height: 8, borderRadius: 4 },
  textoLeyenda: { ...typography.caption1, color: colors.labelSecondary, flex: 1 },
});
