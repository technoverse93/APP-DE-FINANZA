import { memo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

export interface RubroTermometro {
  readonly etiqueta: string;
  /** Cuánto se lleva consumido de este rubro. */
  readonly consumido: number;
  /** Presupuesto o proyección del rubro. 0 o menos = sin techo definido. */
  readonly techo: number;
}

interface Props {
  readonly rubros: readonly RubroTermometro[];
  /** Porcentaje a partir del cual el rubro se marca en rojo. */
  readonly umbralAlerta?: number;
}

/** Colores del termómetro según qué tan consumido está el rubro. */
function colorPorConsumo(pct: number, umbral: number): string {
  if (pct >= 100) return colors.red;
  if (pct >= umbral) return colors.orange;
  return colors.acento;
}

/**
 * Termómetros de consumo por rubro.
 *
 * Un monto suelto ("transporte: ₡21.000") no dice si vas bien o mal — para
 * saberlo hay que compararlo contra lo que tenías previsto, y esa cuenta es
 * justo la que nadie hace de cabeza a mitad de quincena. El termómetro la
 * hace: la barra es la proporción consumida y la marca vertical es el umbral
 * de alerta, así que "voy pasado" se ve sin leer un solo número.
 *
 * La barra se recorta al 100% pero el porcentaje sigue creciendo: si un rubro
 * va en 140%, la barra llena y el número en rojo dicen cosas distintas y las
 * dos importan — que ya te pasaste, y por cuánto.
 */
export const Termometro = memo(function Termometro({ rubros, umbralAlerta = 80 }: Props) {
  if (rubros.length === 0) return null;

  return (
    <View style={styles.lista}>
      {rubros.map((rubro) => {
        // Sin techo definido no hay proporción que mostrar: se dibuja el riel
        // vacío en vez de inventar un 100% que no significa nada.
        const pct = rubro.techo > 0 ? Math.round((rubro.consumido / rubro.techo) * 100) : 0;
        const ancho = Math.min(pct, 100);
        const color = colorPorConsumo(pct, umbralAlerta);

        return (
          <View key={rubro.etiqueta} style={styles.fila}>
            <Text style={styles.nombre} numberOfLines={1}>
              {rubro.etiqueta}
            </Text>
            <View style={styles.riel}>
              <View style={[styles.relleno, { width: `${ancho}%`, backgroundColor: color }]} />
              {rubro.techo > 0 ? (
                <View style={[styles.marca, { left: `${umbralAlerta}%` }]} />
              ) : null}
            </View>
            <Text style={[styles.pct, { color }]}>{rubro.techo > 0 ? `${pct}%` : '—'}</Text>
          </View>
        );
      })}
      <Text style={styles.pie}>
        La marca roja es el {umbralAlerta}% de lo previsto para la quincena.
      </Text>
    </View>
  );
});

const styles = StyleSheet.create({
  lista: { gap: spacing.md },
  fila: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nombre: { ...typography.caption1, color: colors.labelSecondary, width: 92 },
  riel: {
    flex: 1,
    height: 10,
    backgroundColor: colors.fill,
    borderRadius: radius.sm,
    overflow: 'hidden',
    justifyContent: 'center',
  },
  relleno: { height: '100%', borderRadius: radius.sm },
  marca: { position: 'absolute', top: 0, bottom: 0, width: 1, backgroundColor: colors.red },
  pct: {
    ...typography.caption1,
    fontWeight: '600',
    width: 42,
    textAlign: 'right',
    fontVariant: ['tabular-nums'],
  },
  pie: { ...typography.caption1, color: colors.labelTertiary, marginTop: spacing.xs },
});
