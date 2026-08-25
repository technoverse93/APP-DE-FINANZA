import { memo, useMemo, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { simularAbonoExtra } from '../core/debt/simulacion';
import { formatearColones } from '../core/payroll/distribution';
import type { Deuda } from '../state/useDeudas';
import { campoTexto, colors, ficha, fichaActiva, radius, spacing, typography } from '../theme';
import { Card } from './Card';
import { ListRow } from './ListRow';

interface Props {
  readonly deuda: Deuda;
  /** Remanente libre real de la quincena, ya calculado por la app. */
  readonly remanenteLibre: number;
}

/** Porcentajes de un toque, para no obligar a teclear en el teléfono. */
const PORCENTAJES = [25, 50, 75, 100] as const;

function limpiarMonto(texto: string): number {
  const n = Number(texto.replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Simulador de abono al capital con el remanente libre.
 *
 * La pregunta que contesta no es "en cuánto tiempo se paga esta deuda" —eso
 * ya lo dice la proyección— sino "cuánto me AHORRA meterle el excedente de
 * esta quincena". Sin esa diferencia explícita, destinar el remanente a la
 * deuda es un acto de fe; con ella es una decisión con número.
 *
 * Solo se habilita con remanente positivo: ofrecer "simular un abono" cuando
 * no hay de dónde sacarlo sería ofrecer algo que no se puede hacer.
 */
export const SimuladorRemanente = memo(function SimuladorRemanente({
  deuda,
  remanenteLibre,
}: Props) {
  const [porcentaje, setPorcentaje] = useState(100);
  const [textoPersonalizado, setTextoPersonalizado] = useState('');

  const montoPersonalizado = limpiarMonto(textoPersonalizado);
  /** Un monto tecleado manda sobre el porcentaje, y nunca supera el remanente. */
  const abonoExtra =
    montoPersonalizado > 0
      ? Math.min(montoPersonalizado, remanenteLibre)
      : Math.round(remanenteLibre * (porcentaje / 100));

  const comparacion = useMemo(
    () =>
      simularAbonoExtra({
        saldoActual: deuda.saldoActual,
        tasaMensualNominal: deuda.tasaMensual,
        abonoObjetivo: deuda.abonoObjetivo,
        abonoExtra,
      }),
    [deuda.saldoActual, deuda.tasaMensual, deuda.abonoObjetivo, abonoExtra],
  );

  if (remanenteLibre <= 0) {
    return (
      <Card>
        <Text style={styles.bloqueado}>
          Esta quincena no hay remanente libre por encima de tu banda de seguridad, así que no
          hay excedente que simular. En cuanto lo haya, acá vas a poder ver cuánto te ahorra
          volcarlo a esta deuda.
        </Text>
      </Card>
    );
  }

  return (
    <View style={styles.contenedor}>
      <Card>
        <Text style={styles.rotulo}>REMANENTE LIBRE DISPONIBLE</Text>
        <Text style={styles.remanente}>{formatearColones(remanenteLibre)}</Text>
        <Text style={styles.ayuda}>
          ¿Cuánto le volcás a {deuda.nombre}?
        </Text>

        <View style={styles.filaFichas}>
          {PORCENTAJES.map((p) => (
            <Text
              key={p}
              onPress={() => {
                setPorcentaje(p);
                setTextoPersonalizado('');
              }}
              style={[
                styles.ficha,
                porcentaje === p && !textoPersonalizado && styles.fichaActiva,
              ]}
            >
              {p}%
            </Text>
          ))}
        </View>

        <TextInput
          style={styles.input}
          value={textoPersonalizado}
          onChangeText={setTextoPersonalizado}
          keyboardType="number-pad"
          placeholder="O un monto exacto"
          placeholderTextColor={colors.labelTertiary}
        />

        <Text style={styles.abono}>
          Abono simulado: <Text style={styles.abonoMonto}>{formatearColones(abonoExtra)}</Text>
          {deuda.abonoObjetivo > 0
            ? ` sobre tu cuota de ${formatearColones(deuda.abonoObjetivo)}`
            : ' (esta deuda no tiene cuota fija)'}
        </Text>
      </Card>

      {comparacion ? (
        <>
          <Card sinRelleno>
            {comparacion.baseSeSalda ? (
              <>
                <ListRow
                  titulo="Quincenas que te ahorrás"
                  detalle={`De ${comparacion.base!.resultado.periodosParaSaldar} bajás a ${comparacion.conAbono.resultado.periodosParaSaldar}`}
                  valor={`${comparacion.quincenasAhorradas}`}
                  tono={comparacion.quincenasAhorradas > 0 ? 'positivo' : 'normal'}
                />
                <ListRow
                  titulo="Plazo que se recorta"
                  detalle={`Equivale a ${comparacion.mesesAhorrados} ${comparacion.mesesAhorrados === 1 ? 'mes' : 'meses'}`}
                  valor={`${comparacion.porcentajePlazoReducido}%`}
                  tono={comparacion.porcentajePlazoReducido > 0 ? 'positivo' : 'normal'}
                />
                <ListRow
                  titulo="Intereses que dejás de pagar"
                  valor={formatearColones(comparacion.interesAhorrado)}
                  tono={comparacion.interesAhorrado > 0 ? 'positivo' : 'normal'}
                  ultima
                />
              </>
            ) : (
              <ListRow
                titulo="Quedás libre en"
                detalle={
                  comparacion.conAbono.resultado.saldado
                    ? `${comparacion.conAbono.resultado.periodosParaSaldar} quincenas con este abono`
                    : 'Con este abono todavía no alcanza a saldarse'
                }
                valor={
                  comparacion.conAbono.resultado.saldado
                    ? `${comparacion.conAbono.resultado.periodosParaSaldar} q.`
                    : '—'
                }
                tono={comparacion.conAbono.resultado.saldado ? 'positivo' : 'negativo'}
                ultima
              />
            )}
          </Card>

          {/* Sin cuota fija no hay "plazo original" contra el cual medir un
              ahorro: la deuda no se paga sola, solo crece. Se dice así en vez
              de mostrar un 0% que parecería que el abono no sirve de nada. */}
          {!comparacion.baseSeSalda && comparacion.base === null ? (
            <Text style={styles.notaSinBase}>
              Esta deuda no tiene cuota fija: sin abonarle nada no se paga nunca, solo acumula
              interés. Por eso no hay un plazo original del cual descontar — cualquier abono es
              ganancia neta.
            </Text>
          ) : null}

          {!comparacion.baseSeSalda && comparacion.base !== null ? (
            <Text style={styles.notaSinBase}>
              Con la sola cuota pactada esta deuda nunca terminaría de pagarse: el interés crece
              más rápido de lo que abonás. El abono extra no "acorta un plazo", lo hace posible.
            </Text>
          ) : null}

          {deuda.interesMoratorioDiario ? (
            <Text style={styles.notaMora}>
              Mora diaria: cada día que esperés suma{' '}
              {formatearColones(comparacion.interesDiarioActual)} al saldo. Abonar hoy vale más
              que abonar lo mismo la semana entrante.
            </Text>
          ) : null}
        </>
      ) : (
        <Card>
          <Text style={styles.bloqueado}>
            Elegí un porcentaje o un monto mayor a cero para ver el efecto.
          </Text>
        </Card>
      )}
    </View>
  );
});

const styles = StyleSheet.create({
  contenedor: { gap: spacing.sm },
  rotulo: { ...typography.caption2, color: colors.labelTertiary },
  remanente: { ...typography.amount, color: colors.acento, marginTop: 2 },
  ayuda: { ...typography.footnote, color: colors.labelSecondary, marginTop: spacing.sm },
  filaFichas: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap', marginTop: spacing.sm },
  ficha: { ...ficha },
  fichaActiva: { ...fichaActiva },
  input: { ...campoTexto, marginTop: spacing.sm },
  abono: { ...typography.footnote, color: colors.labelSecondary, marginTop: spacing.md },
  abonoMonto: { color: colors.acento },
  bloqueado: { ...typography.subheadline, color: colors.labelSecondary },
  notaSinBase: {
    ...typography.footnote,
    color: colors.label,
    backgroundColor: colors.blueSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  notaMora: {
    ...typography.footnote,
    color: colors.label,
    backgroundColor: colors.redSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
});
