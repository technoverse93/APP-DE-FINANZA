import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, Line, LinearGradient, Path, Stop } from 'react-native-svg';
import { formatearColones } from '../core/payroll/distribution';
import { colors, spacing, typography } from '../theme';

interface Props {
  /** Valor de cada período, del más viejo al más nuevo. */
  readonly valores: readonly number[];
  readonly alto?: number;
  /** Línea horizontal de referencia (por ejemplo, el piso de la banda). */
  readonly referencia?: number;
}

const ANCHO = 200;
const PAD_SUP = 6;
const PAD_INF = 6;

/**
 * Línea de tendencia de liquidez: cómo viene el disponible período a período.
 *
 * Una sola cifra dice cómo estás hoy; la línea dice hacia dónde vas, que en
 * una app de deuda es la pregunta real. El punto final va marcado y el área
 * bajo la curva lleva un degradado que se desvanece: sobre fondo casi negro,
 * una línea de un pixel sola se pierde, y el relleno le da peso sin tapar
 * nada.
 *
 * La escala se calcula sobre el rango real de los valores, no desde cero: con
 * montos que rondan siempre los ₡170.000, anclar en cero aplastaría toda la
 * variación contra el borde superior y la línea se vería plana aunque
 * estuviera moviéndose miles de colones.
 */
export const GraficoTendencia = memo(function GraficoTendencia({
  valores,
  alto = 56,
  referencia,
}: Props) {
  const grafico = useMemo(() => {
    if (valores.length < 2) return null;

    const candidatos = referencia !== undefined ? [...valores, referencia] : [...valores];
    const min = Math.min(...candidatos);
    const max = Math.max(...candidatos);
    // Con todos los valores iguales el rango es cero: se fuerza a 1 para no
    // dividir por cero y la línea sale recta al medio, que es la verdad.
    const rango = max - min || 1;

    const x = (i: number) => (i / (valores.length - 1)) * ANCHO;
    const y = (v: number) => PAD_SUP + (1 - (v - min) / rango) * (alto - PAD_SUP - PAD_INF);

    const puntos = valores.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const linea = `M${puntos.join(' L')}`;
    const area = `${linea} L${ANCHO},${alto} L0,${alto} Z`;
    const ultimo = valores[valores.length - 1]!;
    const subiendo = ultimo >= valores[0]!;

    return {
      linea,
      area,
      fin: { cx: x(valores.length - 1), cy: y(ultimo) },
      yReferencia: referencia !== undefined ? y(referencia) : null,
      color: subiendo ? colors.acento : colors.orange,
      min,
      max,
    };
  }, [valores, alto, referencia]);

  if (!grafico) return null;

  return (
    <View>
      <Svg width="100%" height={alto} viewBox={`0 0 ${ANCHO} ${alto}`} preserveAspectRatio="none">
        <Defs>
          <LinearGradient id="degradadoTendencia" x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={grafico.color} stopOpacity="0.28" />
            <Stop offset="1" stopColor={grafico.color} stopOpacity="0" />
          </LinearGradient>
        </Defs>

        {grafico.yReferencia !== null ? (
          <Line
            x1="0"
            y1={grafico.yReferencia}
            x2={ANCHO}
            y2={grafico.yReferencia}
            stroke={colors.separatorOpaque}
            strokeWidth={1}
            strokeDasharray="3 3"
            vectorEffect="non-scaling-stroke"
          />
        ) : null}

        <Path d={grafico.area} fill="url(#degradadoTendencia)" />
        <Path
          d={grafico.linea}
          stroke={grafico.color}
          strokeWidth={1.6}
          fill="none"
          strokeLinejoin="round"
          strokeLinecap="round"
          vectorEffect="non-scaling-stroke"
        />
        <Circle cx={grafico.fin.cx} cy={grafico.fin.cy} r={2.2} fill={grafico.color} />
      </Svg>

      <View style={styles.pie}>
        <Text style={styles.textoPie}>Mín {formatearColones(grafico.min)}</Text>
        <Text style={styles.textoPie}>Máx {formatearColones(grafico.max)}</Text>
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  pie: { flexDirection: 'row', justifyContent: 'space-between', marginTop: spacing.xs },
  textoPie: { ...typography.caption1, color: colors.labelTertiary },
});
