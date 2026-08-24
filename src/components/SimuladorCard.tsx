import { memo, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { formatearColones } from '../core/payroll/distribution';
import { INGRESO_BASE_QUINCENAL } from '../core/payroll/ingresoDisponible';
import {
  compararEscenarioIngreso,
  type ContextoQuincena,
  type DeudaSimulada,
} from '../core/payroll/simulador';
import { campoTexto, colors, ficha, fichaActiva, radius, spacing, typography } from '../theme';
import { Card } from './Card';
import { GraficoAmortizacion, type SerieAmortizacion } from './GraficoAmortizacion';
import { ListRow } from './ListRow';

interface Props {
  readonly contexto: ContextoQuincena;
  /** Ingreso base real, si la colilla ya se confirmó. */
  readonly ingresoBaseReal?: number;
  /** Deuda contra la que medir la aceleración. */
  readonly deuda?: DeudaSimulada | null;
}

/** Montos de un toque, para no obligar a teclear en el teléfono. */
const ATAJOS = [180_000, 200_000, 250_000, 300_000] as const;

function limpiarMonto(texto: string): number {
  const n = Number(texto.replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Simulador "qué pasaría si": cuánto cambia la quincena con otro ingreso.
 *
 * Lo que hace valioso a este simulador no es mostrar la diferencia de
 * ingreso — esa es una resta que cualquiera hace de cabeza — sino que la
 * mayor parte de un aumento NO llega a la deuda: la banda de seguridad se
 * queda con la primera tajada. Por eso las dos cifras se muestran juntas y
 * enfrentadas.
 *
 * Nada de lo que pasa acá se guarda: es un escenario hipotético y cambiar el
 * número no toca ninguna fila ni ningún saldo real.
 */
export const SimuladorCard = memo(function SimuladorCard({
  contexto,
  ingresoBaseReal,
  deuda = null,
}: Props) {
  const [texto, setTexto] = useState('');

  const ingresoSimulado = limpiarMonto(texto);
  const baseReal = ingresoBaseReal ?? INGRESO_BASE_QUINCENAL;

  const comparacion = useMemo(() => {
    if (ingresoSimulado <= 0) return null;
    return compararEscenarioIngreso({
      ingresoBaseReal: baseReal,
      ingresoBaseSimulado: ingresoSimulado,
      contexto,
      deuda,
    });
  }, [ingresoSimulado, baseReal, contexto, deuda]);

  const series: SerieAmortizacion[] = useMemo(() => {
    if (!comparacion?.base.deuda || !comparacion.simulado.deuda) return [];
    const saldos = (p: { readonly saldoFinal: number }[]) => p.map((x) => x.saldoFinal);
    return [
      {
        etiqueta: `Hoy (${formatearColones(baseReal)})`,
        color: colors.labelTertiary,
        saldos: [comparacion.base.deuda.periodos[0]?.saldoInicial ?? 0, ...saldos([...comparacion.base.deuda.periodos])],
      },
      {
        etiqueta: `Simulado (${formatearColones(ingresoSimulado)})`,
        color: colors.green,
        saldos: [
          comparacion.simulado.deuda.periodos[0]?.saldoInicial ?? 0,
          ...saldos([...comparacion.simulado.deuda.periodos]),
        ],
      },
    ];
  }, [comparacion, baseReal, ingresoSimulado]);

  return (
    <Card>
      <Text style={styles.intro}>
        Probá otro ingreso y mirá qué cambia de verdad. Nada de esto se guarda.
      </Text>

      <View style={styles.atajos}>
        {ATAJOS.map((monto) => (
          <Text
            key={monto}
            onPress={() => setTexto(String(monto))}
            style={[styles.chip, ingresoSimulado === monto && styles.chipActivo]}
          >
            {formatearColones(monto)}
          </Text>
        ))}
      </View>

      <TextInput
        style={styles.input}
        value={texto}
        onChangeText={setTexto}
        keyboardType="number-pad"
        placeholder={`Ingreso a simular (hoy: ${formatearColones(baseReal)})`}
        placeholderTextColor={colors.labelTertiary}
      />

      {comparacion ? (
        <View style={styles.resultado}>
          <View style={styles.tarjetaResultado}>
            <ListRow
              titulo="Te entra de más"
              valor={formatearColones(comparacion.diferenciaIngresoDisponible)}
              tono={comparacion.diferenciaIngresoDisponible >= 0 ? 'positivo' : 'negativo'}
            />
            <ListRow
              titulo="De eso, va a la deuda"
              detalle="El resto lo absorbe la reserva de seguridad"
              valor={formatearColones(comparacion.diferenciaAbonoCapital)}
              tono={comparacion.diferenciaAbonoCapital > 0 ? 'positivo' : 'normal'}
              ultima={comparacion.quincenasAhorradas === null}
            />
            {comparacion.quincenasAhorradas !== null ? (
              <>
                <ListRow
                  titulo="Terminás antes"
                  valor={
                    comparacion.quincenasAhorradas > 0
                      ? `${comparacion.quincenasAhorradas} quincenas`
                      : 'Sin cambio'
                  }
                  tono={comparacion.quincenasAhorradas > 0 ? 'positivo' : 'normal'}
                />
                <ListRow
                  titulo="Intereses que te ahorrás"
                  valor={formatearColones(comparacion.interesAhorrado ?? 0)}
                  tono={(comparacion.interesAhorrado ?? 0) > 0 ? 'positivo' : 'normal'}
                  ultima
                />
              </>
            ) : null}
          </View>

          {comparacion.diferenciaIngresoDisponible > 0 &&
          comparacion.diferenciaAbonoCapital < comparacion.diferenciaIngresoDisponible ? (
            <Text style={styles.explicacion}>
              De los {formatearColones(comparacion.diferenciaIngresoDisponible)} extra, solo{' '}
              {formatearColones(comparacion.diferenciaAbonoCapital)} llegan a la deuda: el resto
              se queda como reserva para la quincena siguiente.
            </Text>
          ) : null}

          {series.length > 0 ? (
            <View style={styles.grafico}>
              <Text style={styles.tituloGrafico}>Cómo baja la deuda</Text>
              <GraficoAmortizacion series={series} />
            </View>
          ) : null}
        </View>
      ) : null}
    </Card>
  );
});

const styles = StyleSheet.create({
  intro: { ...typography.footnote, color: colors.labelSecondary, marginBottom: spacing.md },
  atajos: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginBottom: spacing.md },
  chip: { ...ficha },
  chipActivo: { ...fichaActiva },
  input: {
    ...campoTexto,
  },
  resultado: { marginTop: spacing.lg, gap: spacing.md },
  tarjetaResultado: {
    backgroundColor: colors.fill,
    borderRadius: radius.md,
    overflow: 'hidden',
  },
  explicacion: {
    ...typography.footnote,
    color: colors.label,
    backgroundColor: colors.blueSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  grafico: { marginTop: spacing.xs },
  tituloGrafico: { ...typography.footnote, color: colors.labelSecondary, marginBottom: spacing.sm },
});
