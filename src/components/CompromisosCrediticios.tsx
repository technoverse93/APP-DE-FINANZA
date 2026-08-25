import { memo, useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { interesDiario } from '../core/debt/simulacion';
import { formatearColones } from '../core/payroll/distribution';
import { avanzarNPeriodos, type Payday } from '../core/payroll/schedule';
import type { Deuda } from '../state/useDeudas';
import { colors, radius, spacing, typography } from '../theme';
import { Card } from './Card';

interface Props {
  readonly deudas: readonly Deuda[];
  readonly payday: Payday;
  readonly onSeleccionar?: (id: string) => void;
}

const FORMATO_FECHA_CORTA = new Intl.DateTimeFormat('es-CR', {
  day: 'numeric',
  month: 'short',
  year: 'numeric',
  timeZone: 'America/Costa_Rica',
});

function fechaCorta(fecha: Date): string {
  try {
    return FORMATO_FECHA_CORTA.format(fecha);
  } catch {
    return fecha.toISOString().slice(0, 10);
  }
}

/**
 * Fecha tope del compromiso.
 *
 * La pactada manda; si no hay, se deriva del plazo en quincenas contra el
 * calendario real de pagos (13 y 28, adelantado a viernes), que es el mismo
 * que usa el motor. Una deuda sin plazo ni fecha simplemente no tiene tope
 * que mostrar — y eso es información, no un hueco: significa que se arrastra
 * hasta que uno decida atacarla.
 */
function fechaLimiteDe(deuda: Deuda, payday: Payday): string | null {
  if (deuda.fechaLimite) {
    return fechaCorta(new Date(`${deuda.fechaLimite}T00:00:00Z`));
  }
  if (deuda.plazoQuincenas && deuda.plazoQuincenas > 0) {
    return fechaCorta(avanzarNPeriodos(payday.date, deuda.plazoQuincenas));
  }
  return null;
}

/**
 * Desglose de los compromisos crediticios, uno por uno.
 *
 * Se separa de los gastos fijos operativos a propósito: un recibo de luz y la
 * cuota de un préstamo salen los dos del mismo salario, pero no son la misma
 * clase de obligación. El recibo se paga y se acabó; la cuota amortiza un
 * saldo que además genera intereses, y por eso hay que poder ver de cada una
 * el saldo que falta y hasta cuándo — datos que un total agregado esconde.
 *
 * Las deudas con interés moratorio DIARIO se marcan y se ordenan primero: en
 * esas, cada día que pasa suma, así que son las que hay que atacar antes.
 */
export const CompromisosCrediticios = memo(function CompromisosCrediticios({
  deudas,
  payday,
  onSeleccionar,
}: Props) {
  /** Primero las de mora diaria; dentro de cada grupo, la más cara arriba. */
  const ordenadas = useMemo(
    () =>
      [...deudas].sort((a, b) => {
        if (a.interesMoratorioDiario !== b.interesMoratorioDiario) {
          return a.interesMoratorioDiario ? -1 : 1;
        }
        return b.tasaMensual - a.tasaMensual;
      }),
    [deudas],
  );

  const totalCuotaQuincenal = useMemo(
    () => deudas.reduce((suma, d) => suma + d.abonoObjetivo, 0),
    [deudas],
  );
  const totalSaldo = useMemo(() => deudas.reduce((suma, d) => suma + d.saldoActual, 0), [deudas]);

  if (deudas.length === 0) {
    return (
      <Card>
        <Text style={styles.vacio}>
          No hay compromisos crediticios registrados. Se agregan desde Deudas → Trituradora.
        </Text>
      </Card>
    );
  }

  return (
    <View style={styles.contenedor}>
      {ordenadas.map((d) => {
        const limite = fechaLimiteDe(d, payday);
        const porDia = d.interesMoratorioDiario ? interesDiario(d.saldoActual, d.tasaMensual) : 0;

        return (
          <Card key={d.id} style={styles.tarjeta}>
            <View style={styles.encabezado}>
              <Text style={styles.nombre} numberOfLines={1}>
                {d.nombre}
              </Text>
              {d.interesMoratorioDiario ? (
                <Text style={styles.insigniaMora}>MORA DIARIA</Text>
              ) : null}
            </View>

            <View style={styles.filaDatos}>
              <View style={styles.dato}>
                <Text style={styles.rotulo}>CUOTA QUINCENAL</Text>
                <Text style={styles.valor}>
                  {d.abonoObjetivo > 0 ? formatearColones(d.abonoObjetivo) : 'Sin cuota'}
                </Text>
              </View>
              <View style={styles.dato}>
                <Text style={styles.rotulo}>SALDO RESTANTE</Text>
                <Text style={[styles.valor, styles.valorSaldo]}>
                  {formatearColones(d.saldoActual)}
                </Text>
              </View>
            </View>

            <View style={styles.filaDatos}>
              <View style={styles.dato}>
                <Text style={styles.rotulo}>FECHA LÍMITE</Text>
                <Text style={styles.valorMenor}>{limite ?? 'Sin plazo pactado'}</Text>
              </View>
              <View style={styles.dato}>
                <Text style={styles.rotulo}>TASA</Text>
                <Text style={styles.valorMenor}>
                  {(d.tasaMensual * 100).toFixed(1)}% mensual
                </Text>
              </View>
            </View>

            {porDia > 0 ? (
              <Text style={styles.avisoMora}>
                Cada día que pasa suma {formatearColones(porDia)} a esta deuda.
              </Text>
            ) : null}

            {onSeleccionar ? (
              <Text style={styles.accion} onPress={() => onSeleccionar(d.id)}>
                Simular abono →
              </Text>
            ) : null}
          </Card>
        );
      })}

      <Card sinRelleno>
        <View style={styles.totales}>
          <View style={styles.dato}>
            <Text style={styles.rotulo}>TOTAL CUOTAS/QUINCENA</Text>
            <Text style={styles.valor}>{formatearColones(totalCuotaQuincenal)}</Text>
          </View>
          <View style={styles.dato}>
            <Text style={styles.rotulo}>DEUDA TOTAL</Text>
            <Text style={[styles.valor, styles.valorSaldo]}>{formatearColones(totalSaldo)}</Text>
          </View>
        </View>
      </Card>
    </View>
  );
});

const styles = StyleSheet.create({
  contenedor: { gap: spacing.sm },
  tarjeta: { gap: spacing.md },
  encabezado: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  nombre: { ...typography.headline, color: colors.label, flex: 1 },
  insigniaMora: {
    ...typography.caption2,
    color: colors.red,
    backgroundColor: colors.redSoft,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.sm,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  filaDatos: { flexDirection: 'row', gap: spacing.md },
  dato: { flex: 1, gap: 2 },
  rotulo: { ...typography.caption2, color: colors.labelTertiary },
  valor: { ...typography.amountSmall, color: colors.label },
  valorSaldo: { color: colors.orange },
  valorMenor: { ...typography.subheadline, color: colors.label },
  avisoMora: {
    ...typography.footnote,
    color: colors.label,
    backgroundColor: colors.redSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  accion: { ...typography.footnote, color: colors.acento },
  totales: { flexDirection: 'row', gap: spacing.md, padding: spacing.lg },
  vacio: { ...typography.subheadline, color: colors.labelSecondary },
});
