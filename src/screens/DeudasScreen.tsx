import { memo, useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurHeader, Card, ListRow, PrimaryButton, SectionHeader } from '../components';
import { priorizarAbonoExtra, proyectarConGamificacion } from '../core/debt/crusher';
import { formatearColones } from '../core/payroll/distribution';
import { type Deuda, useDeudas } from '../state/useDeudas';
import { type MovimientoLibro, useLibroMayor } from '../state/useLibroMayor';
import { colors, radius, spacing, typography } from '../theme';

function limpiarMonto(texto: string): number {
  const n = Number(texto.replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

const FORMATO_FECHA_CORTA = new Intl.DateTimeFormat('es-CR', {
  day: 'numeric',
  month: 'long',
  year: 'numeric',
  timeZone: 'America/Costa_Rica',
});

function fechaLegible(fecha: Date | null): string {
  if (!fecha) return 'No se alcanza a saldar en el horizonte proyectado';
  try {
    return FORMATO_FECHA_CORTA.format(fecha);
  } catch {
    return fecha.toISOString().slice(0, 10);
  }
}

/** Fila del Libro Mayor. Memoizada: la lista puede crecer a 200 entradas y no
 * hay razón para re-renderizar las que no cambiaron en cada tecla del form. */
const FilaMovimiento = memo(function FilaMovimiento({
  movimiento,
  ultima,
}: {
  movimiento: MovimientoLibro;
  ultima: boolean;
}) {
  return (
    <ListRow
      titulo={movimiento.descripcion || (movimiento.tipo === 'gasto' ? 'Gasto' : 'Ingreso')}
      detalle={movimiento.fecha}
      valor={formatearColones(movimiento.monto)}
      tono={movimiento.tipo === 'gasto' ? 'negativo' : 'positivo'}
      ultima={ultima}
    />
  );
});

export function DeudasScreen() {
  const libro = useLibroMayor();
  const deudasHook = useDeudas();

  const [textoMontoLibro, setTextoMontoLibro] = useState('');
  const [descripcionLibro, setDescripcionLibro] = useState('');
  const [tipoLibro, setTipoLibro] = useState<'gasto' | 'ingreso'>('gasto');

  const [deudaSeleccionadaId, setDeudaSeleccionadaId] = useState<string | null>(null);
  const [textoAbonoExtra, setTextoAbonoExtra] = useState('');

  const agregarMovimiento = useCallback(() => {
    const monto = limpiarMonto(textoMontoLibro);
    if (monto <= 0) return;
    void libro.agregar({ tipo: tipoLibro, monto, descripcion: descripcionLibro });
    setTextoMontoLibro('');
    setDescripcionLibro('');
  }, [textoMontoLibro, descripcionLibro, tipoLibro, libro]);

  const deudaSeleccionada: Deuda | null = useMemo(
    () => deudasHook.deudas.find((d) => d.id === deudaSeleccionadaId) ?? deudasHook.deudas[0] ?? null,
    [deudasHook.deudas, deudaSeleccionadaId],
  );

  const abonoExtra = limpiarMonto(textoAbonoExtra);

  const proyeccion = useMemo(() => {
    if (!deudaSeleccionada || deudaSeleccionada.abonoObjetivo <= 0) return null;
    return proyectarConGamificacion(
      {
        saldoInicial: deudaSeleccionada.saldoActual,
        tasaAnualNominal: deudaSeleccionada.tasaAnual,
        abonoBase: deudaSeleccionada.abonoObjetivo,
        abonoExtra,
      },
      new Date(),
    );
  }, [deudaSeleccionada, abonoExtra]);

  /** Cómo repartir el abono extra entre TODAS las deudas (método avalancha):
   * solo tiene sentido mostrarlo con dos o más deudas — con una sola, el
   * extra ya va completo a esa deuda y esta tarjeta no agregaría nada. */
  const asignacionAvalancha = useMemo(() => {
    if (abonoExtra <= 0 || deudasHook.deudas.length < 2) return null;
    return priorizarAbonoExtra(abonoExtra, deudasHook.deudas);
  }, [abonoExtra, deudasHook.deudas]);

  const refrescando = libro.cargando || deudasHook.cargando;
  const recargarTodo = useCallback(() => {
    void libro.recargar();
    void deudasHook.recargar();
  }, [libro, deudasHook]);

  return (
    <SafeAreaView style={styles.pantalla}>
      <BlurHeader titulo="Deudas" subtitulo="Libro Mayor y Trituradora de Deudas" />
      <ScrollView
        contentContainerStyle={styles.contenido}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={recargarTodo} />}
      >
        <View style={styles.seccion}>
          <SectionHeader titulo="Libro Mayor" />
          <Card>
            <View style={styles.formulario}>
              <View style={styles.filaTipo}>
                <Text
                  onPress={() => setTipoLibro('gasto')}
                  style={[styles.chip, tipoLibro === 'gasto' && styles.chipActivo]}
                >
                  Gasto
                </Text>
                <Text
                  onPress={() => setTipoLibro('ingreso')}
                  style={[styles.chip, tipoLibro === 'ingreso' && styles.chipActivo]}
                >
                  Ingreso
                </Text>
              </View>
              <TextInput
                style={styles.input}
                value={textoMontoLibro}
                onChangeText={setTextoMontoLibro}
                keyboardType="number-pad"
                placeholder="Monto"
                placeholderTextColor={colors.labelTertiary}
              />
              <TextInput
                style={styles.input}
                value={descripcionLibro}
                onChangeText={setDescripcionLibro}
                placeholder="Descripción (opcional)"
                placeholderTextColor={colors.labelTertiary}
              />
              <PrimaryButton titulo="Anotar" onPress={agregarMovimiento} />
            </View>
          </Card>
        </View>

        <View style={styles.seccion}>
          <SectionHeader titulo="Resumen del período" />
          <Card sinRelleno>
            <ListRow titulo="Ingresos variables" valor={formatearColones(libro.resumen.totalIngresos)} tono="positivo" />
            <ListRow titulo="Gastos anotados" valor={formatearColones(libro.resumen.totalGastos)} tono="negativo" />
            <ListRow
              titulo="Neto"
              valor={formatearColones(libro.resumen.neto)}
              tono={libro.resumen.neto >= 0 ? 'positivo' : 'negativo'}
              ultima
            />
          </Card>
        </View>

        {libro.movimientos.length > 0 ? (
          <View style={styles.seccion}>
            <SectionHeader titulo="Movimientos recientes" />
            <Card sinRelleno>
              {libro.movimientos.slice(0, 10).map((m, i) => (
                <FilaMovimiento key={m.id} movimiento={m} ultima={i === Math.min(9, libro.movimientos.length - 1)} />
              ))}
            </Card>
          </View>
        ) : null}

        <View style={styles.seccion}>
          <SectionHeader titulo="Trituradora de Deudas" />
          <Card>
            {deudasHook.deudas.length === 0 ? (
              <Text style={styles.mensajeVacio}>
                Todavía no hay deudas registradas. Se agregan desde Supabase (tabla `deudas`) con
                saldo, tasa anual y abono objetivo.
              </Text>
            ) : (
              <View style={styles.formulario}>
                <View style={styles.filaTipo}>
                  {deudasHook.deudas.map((d) => (
                    <Text
                      key={d.id}
                      onPress={() => setDeudaSeleccionadaId(d.id)}
                      style={[
                        styles.chip,
                        (deudaSeleccionada?.id === d.id) && styles.chipActivo,
                      ]}
                    >
                      {d.nombre}
                    </Text>
                  ))}
                </View>
                {deudaSeleccionada ? (
                  <>
                    <Text style={styles.etiquetaCampo}>
                      Saldo {formatearColones(deudaSeleccionada.saldoActual)} · Abono objetivo{' '}
                      {formatearColones(deudaSeleccionada.abonoObjetivo)} por quincena
                    </Text>
                    <TextInput
                      style={styles.input}
                      value={textoAbonoExtra}
                      onChangeText={setTextoAbonoExtra}
                      keyboardType="number-pad"
                      placeholder="Abono extra por quincena"
                      placeholderTextColor={colors.labelTertiary}
                    />
                  </>
                ) : null}
              </View>
            )}
          </Card>
        </View>

        {proyeccion ? (
          <View style={styles.seccion}>
            <SectionHeader titulo="Ahorro proyectado" />
            <Card sinRelleno>
              <ListRow
                titulo="Fecha en que quedás libre (plan base)"
                valor={fechaLegible(proyeccion.fechaSaldoBase)}
              />
              <ListRow
                titulo="Fecha en que quedás libre (con extra)"
                valor={fechaLegible(proyeccion.fechaSaldoConExtra)}
                tono="positivo"
              />
              <ListRow
                titulo="Interés que te ahorrás"
                valor={formatearColones(proyeccion.comparacion.interesAhorrado)}
                tono="positivo"
                ultima
              />
            </Card>
            <Text style={styles.mensajeGamificado}>{proyeccion.mensaje}</Text>
          </View>
        ) : null}

        {asignacionAvalancha ? (
          <View style={styles.seccion}>
            <SectionHeader titulo="Reparto sugerido del abono extra" />
            <Card sinRelleno>
              <Text style={styles.avisoAvalancha}>
                Repartido por tasa de interés: primero se llena la deuda más cara hasta saldarla, y
                el resto pasa a la siguiente.
              </Text>
              {asignacionAvalancha.map((asig, i) => {
                const deuda = deudasHook.deudas.find((d) => d.id === asig.deudaId);
                return (
                  <ListRow
                    key={asig.deudaId}
                    titulo={deuda?.nombre ?? asig.deudaId}
                    detalle={`Objetivo ${formatearColones(deuda?.abonoObjetivo ?? 0)} + extra ${formatearColones(asig.abonoExtraAsignado)}`}
                    valor={formatearColones(asig.abonoTotal)}
                    tono={asig.abonoExtraAsignado > 0 ? 'positivo' : 'normal'}
                    ultima={i === asignacionAvalancha.length - 1}
                  />
                );
              })}
            </Card>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxxl },
  seccion: { gap: 0 },
  formulario: { gap: spacing.md },
  filaTipo: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: {
    ...typography.footnote,
    color: colors.labelSecondary,
    backgroundColor: colors.fill,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    overflow: 'hidden',
  },
  chipActivo: {
    color: colors.labelInverse,
    backgroundColor: colors.brandGold,
  },
  etiquetaCampo: { ...typography.footnote, color: colors.labelSecondary },
  mensajeGamificado: {
    ...typography.subheadline,
    color: colors.label,
    backgroundColor: colors.brandGoldSoft,
    borderRadius: radius.md,
    padding: spacing.md,
    marginTop: spacing.sm,
  },
  avisoAvalancha: {
    ...typography.footnote,
    color: colors.labelSecondary,
    padding: spacing.lg,
    paddingBottom: 0,
  },
  input: {
    ...typography.body,
    backgroundColor: colors.fill,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.label,
  },
  mensajeVacio: { ...typography.subheadline, color: colors.labelSecondary },
});
