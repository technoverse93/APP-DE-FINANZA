import { memo, useMemo, useState } from 'react';
import { View, StyleSheet, type LayoutChangeEvent } from 'react-native';
import Svg, { G, Rect, Line } from 'react-native-svg';
import { colors, spacing } from '../theme';

export interface Vela {
  readonly apertura: number;
  readonly maximo: number;
  readonly minimo: number;
  readonly cierre: number;
}

interface Props {
  readonly velas: readonly Vela[];
  readonly height?: number;
}

interface VelaGeometria {
  readonly x: number;
  readonly anchoBarra: number;
  readonly yMaximo: number;
  readonly yMinimo: number;
  readonly yCuerpoTop: number;
  readonly altoCuerpo: number;
  readonly alcista: boolean;
}

/**
 * Velas japonesas nativas con react-native-svg, mismo enfoque sin librería
 * externa que PriceChart: pocos elementos SVG calculados una vez por cambio
 * de datos (useMemo), no una librería de charting completa con su propio
 * ciclo de render.
 */
export const CandlestickChart = memo(function CandlestickChart({ velas, height = 200 }: Props) {
  const [ancho, setAncho] = useState(0);

  const onLayout = (e: LayoutChangeEvent) => {
    setAncho(e.nativeEvent.layout.width);
  };

  const geometria = useMemo(
    () => construirGeometria(velas, ancho, height),
    [velas, ancho, height],
  );

  if (velas.length === 0 || ancho === 0) {
    return <View onLayout={onLayout} style={{ height }} />;
  }

  return (
    <View onLayout={onLayout} style={[styles.contenedor, { height }]}>
      <Svg width={ancho} height={height}>
        {geometria.map((v, i) => {
          const color = v.alcista ? colors.green : colors.red;
          return (
            <G key={i}>
              <Line
                x1={v.x + v.anchoBarra / 2}
                y1={v.yMaximo}
                x2={v.x + v.anchoBarra / 2}
                y2={v.yMinimo}
                stroke={color}
                strokeWidth={1}
              />
              <Rect
                x={v.x}
                y={v.yCuerpoTop}
                width={v.anchoBarra}
                height={Math.max(1, v.altoCuerpo)}
                fill={color}
              />
            </G>
          );
        })}
      </Svg>
    </View>
  );
});

function construirGeometria(
  velas: readonly Vela[],
  ancho: number,
  alto: number,
): VelaGeometria[] {
  if (velas.length === 0 || ancho === 0) return [];

  const maximos = velas.map((v) => v.maximo);
  const minimos = velas.map((v) => v.minimo);
  const min = Math.min(...minimos);
  const max = Math.max(...maximos);
  const rango = max - min || 1;
  const margen = alto * 0.08;

  const anchoBarra = Math.max(2, (ancho / velas.length) * 0.6);
  const paso = ancho / velas.length;

  const escalarY = (precio: number): number =>
    alto - margen - ((precio - min) / rango) * (alto - margen * 2);

  return velas.map((v, i) => {
    const x = i * paso + (paso - anchoBarra) / 2;
    const alcista = v.cierre >= v.apertura;
    const yCuerpoA = escalarY(v.apertura);
    const yCuerpoB = escalarY(v.cierre);
    return {
      x,
      anchoBarra,
      yMaximo: escalarY(v.maximo),
      yMinimo: escalarY(v.minimo),
      yCuerpoTop: Math.min(yCuerpoA, yCuerpoB),
      altoCuerpo: Math.abs(yCuerpoB - yCuerpoA),
      alcista,
    };
  });
}

const styles = StyleSheet.create({
  contenedor: { width: '100%', marginVertical: spacing.sm },
});
