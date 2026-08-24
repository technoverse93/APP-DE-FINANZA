import { memo, useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
// De safe-area-context, NO de react-native (ese es exclusivo de iOS).
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AvisoError,
  BlurHeader,
  Card,
  GmailSyncCard,
  GraficoAmortizacion,
  ListRow,
  OpportunityAlertToast,
  PrimaryButton,
  SectionHeader,
  type SerieAmortizacion,
} from '../components';
import { calcularCostoOportunidad, type CostoOportunidad } from '../core/analytics/opportunityCost';
import { priorizarAbonoExtra, proyectarConGamificacion } from '../core/debt/crusher';
import { formatearColones } from '../core/payroll/distribution';
import { googleAuthConfigurado } from '../lib/googleAuth';
import { type Deuda, useDeudas } from '../state/useDeudas';
import { type MovimientoLibro, useLibroMayor } from '../state/useLibroMayor';
import { campoTexto, colors, ficha, fichaActiva, radius, spacing, typography } from '../theme';

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
      detalle={movimiento.categoria ? `${movimiento.categoria} · ${movimiento.fecha}` : movimiento.fecha}
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
  const [categoriaLibro, setCategoriaLibro] = useState('');
  const [tipoLibro, setTipoLibro] = useState<'gasto' | 'ingreso'>('gasto');

  const [deudaSeleccionadaId, setDeudaSeleccionadaId] = useState<string | null>(null);
  const [textoAbonoExtra, setTextoAbonoExtra] = useState('');

  const [alertaCosto, setAlertaCosto] = useState<CostoOportunidad | null>(null);

  const [nombreDeuda, setNombreDeuda] = useState('');
  const [textoSaldo, setTextoSaldo] = useState('');
  const [textoTasa, setTextoTasa] = useState('');
  const [textoAbonoObjetivo, setTextoAbonoObjetivo] = useState('');
  const [avisoDeuda, setAvisoDeuda] = useState<string | null>(null);

  const agregarDeuda = useCallback(() => {
    const saldo = limpiarMonto(textoSaldo);
    const abono = limpiarMonto(textoAbonoObjetivo);
    // La tasa se escribe como porcentaje ("24") porque es como viene en el
    // estado de cuenta; el motor la quiere como fracción (0.24).
    const tasaPorciento = Number(textoTasa.replace(',', '.').replace(/[^\d.]/g, ''));
    if (!nombreDeuda.trim() || saldo <= 0) {
      setAvisoDeuda('Poné un nombre y el saldo que debés hoy.');
      return;
    }
    if (!Number.isFinite(tasaPorciento) || tasaPorciento < 0) {
      setAvisoDeuda('Escribí la tasa anual como número, por ejemplo 24 para 24%.');
      return;
    }
    if (abono <= 0) {
      setAvisoDeuda('Poné cuánto abonás por quincena. Sin eso no se puede proyectar el plazo.');
      return;
    }
    setAvisoDeuda(null);
    void deudasHook.guardar({
      nombre: nombreDeuda.trim(),
      saldoActual: saldo,
      tasaAnual: tasaPorciento / 100,
      abonoObjetivo: abono,
    });
    setNombreDeuda('');
    setTextoSaldo('');
    setTextoTasa('');
    setTextoAbonoObjetivo('');
  }, [nombreDeuda, textoSaldo, textoTasa, textoAbonoObjetivo, deudasHook]);

  const agregarMovimiento = useCallback(() => {
    const monto = limpiarMonto(textoMontoLibro);
    if (monto <= 0) return;
    void libro.agregar({
      tipo: tipoLibro,
      monto,
      descripcion: descripcionLibro,
      categoria: categoriaLibro.trim() || null,
    });
    // El costo de oportunidad solo aplica a gastos: un ingreso no compite con
    // la deuda por el mismo colón.
    setAlertaCosto(
      tipoLibro === 'gasto' ? calcularCostoOportunidad(monto, deudasHook.deudas) : null,
    );
    setTextoMontoLibro('');
    setDescripcionLibro('');
    setCategoriaLibro('');
  }, [textoMontoLibro, descripcionLibro, categoriaLibro, tipoLibro, libro, deudasHook.deudas]);

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

  /** Las dos curvas de saldo, para ver el efecto del abono extra en vez de
   * solo leerlo como una fecha. Solo se dibujan si hay extra que comparar:
   * dos curvas idénticas superpuestas no dicen nada. */
  const seriesAmortizacion: SerieAmortizacion[] = useMemo(() => {
    if (!proyeccion || abonoExtra <= 0) return [];
    const curva = (periodos: readonly { saldoInicial: number; saldoFinal: number }[]) =>
      periodos.length === 0
        ? []
        : [periodos[0]!.saldoInicial, ...periodos.map((p) => p.saldoFinal)];
    return [
      {
        etiqueta: 'Plan base',
        color: colors.labelTertiary,
        saldos: curva(proyeccion.comparacion.base.periodos),
      },
      {
        etiqueta: `Con ${formatearColones(abonoExtra)} extra`,
        color: colors.green,
        saldos: curva(proyeccion.comparacion.conExtra.periodos),
      },
    ];
  }, [proyeccion, abonoExtra]);

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
    <SafeAreaView style={styles.pantalla} edges={['top', 'left', 'right']}>
      <BlurHeader
        titulo="Deudas"
        subtitulo="Libro Mayor · Trituradora"
        enVivo={!refrescando}
      />
      <KeyboardAvoidingView
        style={styles.flexible}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.contenido}
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={refrescando} onRefresh={recargarTodo} />}
        >
        <AvisoError errores={[libro.error, deudasHook.error]} />

        {googleAuthConfigurado ? (
          <View style={styles.seccion}>
            <GmailSyncCard />
          </View>
        ) : null}

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
                value={categoriaLibro}
                onChangeText={setCategoriaLibro}
                placeholder={
                  tipoLibro === 'ingreso'
                    ? 'Categoría (ej. Ventas, Reparaciones de hardware)'
                    : 'Categoría (opcional)'
                }
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
          {alertaCosto ? (
            <View style={styles.avisoCostoOportunidad}>
              <OpportunityAlertToast costo={alertaCosto} onCerrar={() => setAlertaCosto(null)} />
            </View>
          ) : null}
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
                Todavía no hay deudas registradas. Agregá la primera abajo y la Trituradora te
                dice en qué fecha quedás libre.
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

          {/* El alta de deudas vive acá y no en una pantalla aparte: es lo
              primero que hay que hacer para que la Trituradora tenga algo
              que triturar, así que esconderlo detrás de otro toque sería
              esconder justamente el punto de entrada. */}
          <View style={styles.formularioDeuda}>
            <Text style={styles.etiquetaCampo}>Agregar una deuda</Text>
            <TextInput
              style={styles.input}
              value={nombreDeuda}
              onChangeText={setNombreDeuda}
              placeholder="Nombre (ej. Tarjeta BAC, Préstamo)"
              placeholderTextColor={colors.labelTertiary}
            />
            <TextInput
              style={styles.input}
              value={textoSaldo}
              onChangeText={setTextoSaldo}
              keyboardType="number-pad"
              placeholder="Saldo que debés hoy"
              placeholderTextColor={colors.labelTertiary}
            />
            <TextInput
              style={styles.input}
              value={textoTasa}
              onChangeText={setTextoTasa}
              keyboardType="decimal-pad"
              placeholder="Tasa anual en % (ej. 24)"
              placeholderTextColor={colors.labelTertiary}
            />
            <TextInput
              style={styles.input}
              value={textoAbonoObjetivo}
              onChangeText={setTextoAbonoObjetivo}
              keyboardType="number-pad"
              placeholder="Cuánto abonás por quincena"
              placeholderTextColor={colors.labelTertiary}
            />
            {avisoDeuda ? <Text style={styles.avisoDeuda}>{avisoDeuda}</Text> : null}
            <PrimaryButton titulo="Guardar deuda" onPress={agregarDeuda} />
          </View>
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
            {seriesAmortizacion.length > 0 ? (
              <Card style={styles.tarjetaGrafico}>
                <GraficoAmortizacion series={seriesAmortizacion} />
              </Card>
            ) : null}
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
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  flexible: { flex: 1 },
  contenido: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxxl },
  seccion: { gap: 0 },
  avisoCostoOportunidad: { marginTop: spacing.md },
  formulario: { gap: spacing.md },
  filaTipo: { flexDirection: 'row', gap: spacing.sm, flexWrap: 'wrap' },
  chip: { ...ficha },
  chipActivo: { ...fichaActiva },
  etiquetaCampo: { ...typography.footnote, color: colors.labelSecondary },
  formularioDeuda: { gap: spacing.sm, marginTop: spacing.md },
  tarjetaGrafico: { marginTop: spacing.md },
  avisoDeuda: {
    ...typography.footnote,
    color: colors.label,
    backgroundColor: colors.orangeSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  mensajeGamificado: {
    ...typography.subheadline,
    color: colors.label,
    backgroundColor: colors.greenSoft,
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
    ...campoTexto,
  },
  mensajeVacio: { ...typography.subheadline, color: colors.labelSecondary },
});
