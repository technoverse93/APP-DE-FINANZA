import { memo, useCallback, useMemo, useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Svg, { Path, Circle, Line } from 'react-native-svg';
import { colors, spacing } from '../theme';

interface Props {
  /** Precios de cierre en orden cronológico. */
  readonly precios: readonly number[];
  readonly height?: number;
}

/**
 * Gráfico de línea nativo, dibujado a mano con react-native-svg.
 *
 * Se evitó una librería de charting completa a propósito: con un solo trazo
 * de línea y un punto final, el costo de una dependencia grande (con su
 * propia gestión de temas, leyendas y animaciones que no usamos) no se
 * justifica frente a un puñado de líneas de SVG propio.
 *
 * Memoizado: el cálculo de la geometría en `construirTrazado` es el más
 * caro de la pantalla y no debería repetirse cuando `precios` no cambió.
 */
export const PriceChart = memo(function PriceChart({ precios, height = 160 }: Props) {
  const [ancho, setAncho] = useState(0);

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setAncho(e.nativeEvent.layout.width);
  }, []);

  const trazado = useMemo(() => construirTrazado(precios, ancho, height), [precios, ancho, height]);

  if (precios.length < 2 || ancho === 0) {
    return <View onLayout={onLayout} style={{ height }} />;
  }

  const trazo = trazado.subio ? colors.green : colors.red;

  return (
    <View onLayout={onLayout} style={[styles.contenedor, { height }]}>
      <Svg width={ancho} height={height}>
        <Line
          x1={0}
          y1={height / 2}
          x2={ancho}
          y2={height / 2}
          stroke={colors.separator}
          strokeWidth={1}
        />
        <Path d={trazado.path} stroke={trazo} strokeWidth={2} fill="none" />
        <Circle cx={trazado.ultimoX} cy={trazado.ultimoY} r={4} fill={trazo} />
      </Svg>
    </View>
  );
});

function construirTrazado(
  precios: readonly number[],
  ancho: number,
  alto: number,
): { path: string; subio: boolean; ultimoX: number; ultimoY: number } {
  if (precios.length < 2 || ancho === 0) {
    return { path: '', subio: true, ultimoX: 0, ultimoY: 0 };
  }

  const min = Math.min(...precios);
  const max = Math.max(...precios);
  const rango = max - min || 1;
  // Margen vertical del 10% para que el trazo no toque los bordes.
  const margen = alto * 0.1;

  const puntos = precios.map((precio, i) => {
    const x = (i / (precios.length - 1)) * ancho;
    const y = alto - margen - ((precio - min) / rango) * (alto - margen * 2);
    return { x, y };
  });

  const path = puntos
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x.toFixed(2)} ${p.y.toFixed(2)}`)
    .join(' ');

  const ultimo = puntos[puntos.length - 1];
  return {
    path,
    subio: precios[precios.length - 1] >= precios[0],
    ultimoX: ultimo.x,
    ultimoY: ultimo.y,
  };
}

const styles = StyleSheet.create({
  contenedor: { width: '100%', marginVertical: spacing.sm },
});
