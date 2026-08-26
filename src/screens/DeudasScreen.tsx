import { memo, useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Switch,
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
  SimuladorRemanente,
  type SerieAmortizacion,
} from '../components';
import { calcularCostoOportunidad, type CostoOportunidad } from '../core/analytics/opportunityCost';
import {
  interesPorPeriodo,
  priorizarAbonoExtra,
  proyectarPorPorcentajeRemanente,
  proyectarTrituradora,
} from '../core/debt/crusher';
import { formatearColones } from '../core/payroll/distribution';
import { avanzarNPeriodos } from '../core/payroll/schedule';
import { googleAuthConfigurado } from '../lib/googleAuth';
import { useDatosFinancieros } from '../state/DatosFinancierosProvider';
import { type Deuda } from '../state/useDeudas';
import { type MovimientoLibro } from '../state/useLibroMayor';
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

/** Porcentajes de un toque, para no obligar a teclear en el teléfono. */
const PORCENTAJES_ATAJO = [25, 50, 75, 100] as const;

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
  // Fuente única del remanente libre: el mismo cálculo que ve la pantalla de
  // Quincena. Sin esto, la Trituradora habría tenido que repetir toda la
  // cadena de ingreso disponible por su cuenta, con el riesgo real de que un
  // día las dos pantallas dieran números distintos para "lo mismo".
  const { q, deudasHook } = useDatosFinancieros();
  const libro = q.libro;

  const [textoMontoLibro, setTextoMontoLibro] = useState('');
  const [descripcionLibro, setDescripcionLibro] = useState('');
  const [categoriaLibro, setCategoriaLibro] = useState('');
  const [tipoLibro, setTipoLibro] = useState<'gasto' | 'ingreso'>('gasto');

  const [deudaSeleccionadaId, setDeudaSeleccionadaId] = useState<string | null>(null);
  const [porcentajeRemanente, setPorcentajeRemanente] = useState(50);
  const [textoPorcentaje, setTextoPorcentaje] = useState('');

  const [alertaCosto, setAlertaCosto] = useState<CostoOportunidad | null>(null);

  const [nombreDeuda, setNombreDeuda] = useState('');
  const [textoSaldo, setTextoSaldo] = useState('');
  const [textoTasa, setTextoTasa] = useState('');
  // La cuota fija es opcional: una deuda como un alquiler atrasado puede no
  // tener pago mínimo pactado, solo interés moratorio que corre sobre el
  // saldo. Sin este interruptor, el alta obligaba a inventar un monto de
  // cuota que esa deuda no tiene.
  const [tieneCuotaFija, setTieneCuotaFija] = useState(false);
  const [textoAbonoObjetivo, setTextoAbonoObjetivo] = useState('');
  const [textoPlazo, setTextoPlazo] = useState('');
  // Marca las deudas cuyo interés corre por día. No cambia el cálculo (la
  // tasa sigue siendo mensual) pero sí la prioridad con que se muestran.
  const [moraDiaria, setMoraDiaria] = useState(false);
  const [avisoDeuda, setAvisoDeuda] = useState<string | null>(null);

  const agregarDeuda = useCallback(async () => {
    const saldo = limpiarMonto(textoSaldo);
    // La tasa se escribe como porcentaje MENSUAL ("2") porque es como viene
    // en el estado de cuenta; el motor la quiere como fracción (0.02).
    const tasaPorciento = Number(textoTasa.replace(',', '.').replace(/[^\d.]/g, ''));
    if (!nombreDeuda.trim() || saldo <= 0) {
      setAvisoDeuda('Poné un nombre y el saldo que debés hoy.');
      return;
    }
    if (!Number.isFinite(tasaPorciento) || tasaPorciento < 0) {
      setAvisoDeuda('Escribí la tasa mensual como número, por ejemplo 2 para 2%.');
      return;
    }

    const abono = tieneCuotaFija ? limpiarMonto(textoAbonoObjetivo) : 0;
    const plazo = tieneCuotaFija ? limpiarMonto(textoPlazo) : 0;
    if (tieneCuotaFija && (abono <= 0 || plazo <= 0)) {
      setAvisoDeuda('Con cuota fija, poné cuánto pagás por quincena y el plazo estimado en quincenas.');
      return;
    }

    setAvisoDeuda(null);
    const nuevoId = await deudasHook.guardar({
      nombre: nombreDeuda.trim(),
      saldoActual: saldo,
      tasaMensual: tasaPorciento / 100,
      abonoObjetivo: abono,
      plazoQuincenas: tieneCuotaFija ? plazo : null,
      interesMoratorioDiario: moraDiaria,
    });

    // Con cuota fija, esa cuota es un compromiso real del presupuesto —no un
    // abono opcional del remanente— así que se registra como gasto fijo
    // mientras dure el plazo. `modo: 'mitades'` con el doble del monto
    // reproduce "la misma cuota en las dos quincenas del mes", que es
    // justamente lo que pide una cuota fija quincenal.
    if (nuevoId && tieneCuotaFija) {
      const venceEn = avanzarNPeriodos(q.payday.date, plazo).toISOString().slice(0, 10);
      void q.gastosFijosItems.crear({
        nombre: `Cuota: ${nombreDeuda.trim()}`,
        montoMensual: abono * 2,
        modo: 'mitades',
        venceEn,
        deudaId: nuevoId,
      });
    }

    setNombreDeuda('');
    setTextoSaldo('');
    setTextoTasa('');
    setTieneCuotaFija(false);
    setTextoAbonoObjetivo('');
    setTextoPlazo('');
    setMoraDiaria(false);
  }, [
    nombreDeuda,
    textoSaldo,
    textoTasa,
    tieneCuotaFija,
    textoAbonoObjetivo,
    textoPlazo,
    moraDiaria,
    deudasHook,
    q,
  ]);

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

  /**
   * Remanente libre REAL de esta quincena: el excedente que queda por
   * encima de la banda de seguridad, tal cual lo calcula la pantalla de
   * Quincena. No es una cuota mínima que alguien tecleó una vez y quedó
   * grabada — cambia solo con cambiar el porcentaje o con lo que de verdad
   * pasó esta quincena (ingresos, gastos, transporte).
   */
  const remanenteLibre = Math.max(0, q.distribucion.abonoCapitalSugerido);

  const porcentajePersonalizado = limpiarMonto(textoPorcentaje);
  const porcentajeActivo =
    porcentajePersonalizado > 0 ? Math.min(porcentajePersonalizado, 100) : porcentajeRemanente;

  const montoDestinado = Math.round(remanenteLibre * (porcentajeActivo / 100));

  const tieneCuotaLaDeudaSeleccionada = (deudaSeleccionada?.abonoObjetivo ?? 0) > 0;

  /** El gasto fijo que esta deuda generó automáticamente al registrarse con
   * cuota fija, si lo tiene — es lo que permite confirmarle al usuario que
   * esa cuota YA se está contando en el presupuesto, sin que tenga que ir a
   * buscarlo a la otra pantalla para comprobarlo. */
  const cuotaVinculada = useMemo(
    () =>
      deudaSeleccionada
        ? q.gastosFijosItems.gastos.find((g) => g.deudaId === deudaSeleccionada.id) ?? null
        : null,
    [deudaSeleccionada, q.gastosFijosItems.gastos],
  );

  /** Interés que se sigue sumando esta quincena si no se le destina nada —
   * la cifra que explica por qué "sin remanente" no es lo mismo que "no pasa
   * nada": el saldo de una deuda sin cuota fija crece igual por el interés
   * moratorio. */
  const interesSinAbonar = useMemo(
    () =>
      deudaSeleccionada && !tieneCuotaLaDeudaSeleccionada
        ? interesPorPeriodo(deudaSeleccionada.saldoActual, deudaSeleccionada.tasaMensual)
        : 0,
    [deudaSeleccionada, tieneCuotaLaDeudaSeleccionada],
  );

  /** Plan de pago con SOLO la cuota fija, sin remanente extra — la primera
   * de las dos posibilidades que hay que mostrar cuando la deuda tiene
   * cuota pactada. */
  const proyeccionSoloCuota = useMemo(() => {
    if (!deudaSeleccionada || !tieneCuotaLaDeudaSeleccionada || deudaSeleccionada.saldoActual <= 0) {
      return null;
    }
    const resultado = proyectarTrituradora({
      saldoInicial: deudaSeleccionada.saldoActual,
      tasaMensualNominal: deudaSeleccionada.tasaMensual,
      abonoPorPeriodo: deudaSeleccionada.abonoObjetivo,
    });
    return {
      resultado,
      fechaSaldoCero: resultado.saldado
        ? avanzarNPeriodos(new Date(), resultado.periodosParaSaldar)
        : null,
    };
  }, [deudaSeleccionada, tieneCuotaLaDeudaSeleccionada]);

  /** Segunda posibilidad: la cuota fija (si la hay) más el porcentaje del
   * remanente libre elegido. Para una deuda sin cuota, esto es 100% lo que
   * ya mostraba el selector de porcentaje — no cambia nada para esas. */
  const proyeccionPorcentaje = useMemo(() => {
    if (!deudaSeleccionada || deudaSeleccionada.saldoActual <= 0) return null;
    return proyectarPorPorcentajeRemanente(
      deudaSeleccionada.saldoActual,
      deudaSeleccionada.tasaMensual,
      remanenteLibre,
      porcentajeActivo,
      new Date(),
      deudaSeleccionada.abonoObjetivo,
    );
  }, [deudaSeleccionada, remanenteLibre, porcentajeActivo]);

  /** La curva de saldo de la deuda seleccionada bajo el porcentaje elegido. */
  const seriesAmortizacion: SerieAmortizacion[] = useMemo(() => {
    if (!proyeccionPorcentaje) return [];
    const periodos = proyeccionPorcentaje.resultado.periodos;
    if (periodos.length === 0) return [];
    const series: SerieAmortizacion[] = [];
    if (proyeccionSoloCuota && proyeccionSoloCuota.resultado.periodos.length > 0) {
      const p = proyeccionSoloCuota.resultado.periodos;
      series.push({
        etiqueta: `Solo cuota (${formatearColones(deudaSeleccionada!.abonoObjetivo)}/quincena)`,
        color: colors.labelTertiary,
        saldos: [p[0]!.saldoInicial, ...p.map((x) => x.saldoFinal)],
      });
    }
    series.push({
      etiqueta: `${formatearColones(proyeccionPorcentaje.abonoPorPeriodo)}/quincena (${porcentajeActivo}% del remanente)`,
      color: colors.acento,
      saldos: [periodos[0]!.saldoInicial, ...periodos.map((p) => p.saldoFinal)],
    });
    return series;
  }, [proyeccionPorcentaje, proyeccionSoloCuota, porcentajeActivo, deudaSeleccionada]);

  /** Cómo repartir el monto destinado entre TODAS las deudas (método
   * avalancha): solo tiene sentido mostrarlo con dos o más deudas — con una
   * sola, el monto ya va completo a esa deuda y esta tarjeta no agregaría
   * nada. El monto a repartir es el mismo remanente × porcentaje de arriba,
   * no un número aparte que alguien escriba dos veces. */
  const asignacionAvalancha = useMemo(() => {
    if (montoDestinado <= 0 || deudasHook.deudas.length < 2) return null;
    return priorizarAbonoExtra(montoDestinado, deudasHook.deudas);
  }, [montoDestinado, deudasHook.deudas]);

  const refrescando = libro.cargando || deudasHook.cargando || q.gastosFijosItems.cargando;
  const recargarTodo = useCallback(() => {
    void libro.recargar();
    void deudasHook.recargar();
    void q.gastosFijosItems.recargar();
  }, [libro, deudasHook, q]);

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
        <AvisoError errores={[libro.error, deudasHook.error, q.gastosFijosItems.error]} />

        {googleAuthConfigurado ? (
          <View style={styles.seccion}>
            <GmailSyncCard />
          </View>
        ) : null}

        {/* La Trituradora va primero: es el propósito de esta pestaña. El
            Libro Mayor (anotar gastos/ingresos del día) es una herramienta
            auxiliar que vive acá porque el costo de oportunidad de un gasto
            se calcula contra las deudas, pero no es lo que alguien viene a
            buscar al abrir "Deudas". */}
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
                  <Text style={styles.etiquetaCampo}>
                    Saldo {formatearColones(deudaSeleccionada.saldoActual)} · Tasa{' '}
                    {(deudaSeleccionada.tasaMensual * 100).toFixed(1)}% mensual
                    {tieneCuotaLaDeudaSeleccionada
                      ? ` · Cuota ${formatearColones(deudaSeleccionada.abonoObjetivo)}/quincena`
                      : ' · Sin cuota fija'}
                  </Text>
                ) : null}

                <Text style={styles.etiquetaCampo}>
                  Remanente libre de esta quincena: {formatearColones(remanenteLibre)}
                </Text>
                <Text style={styles.ayuda}>
                  {tieneCuotaLaDeudaSeleccionada
                    ? 'Esto es lo que le sumás de más a tu cuota, no lo que la reemplaza.'
                    : 'No es una cuota fija: es lo que sobra hoy por encima de tu banda de seguridad.'}
                </Text>

                <View style={styles.filaTipo}>
                  {PORCENTAJES_ATAJO.map((pct) => (
                    <Text
                      key={pct}
                      onPress={() => {
                        setPorcentajeRemanente(pct);
                        setTextoPorcentaje('');
                      }}
                      style={[
                        styles.chip,
                        porcentajeActivo === pct && !textoPorcentaje && styles.chipActivo,
                      ]}
                    >
                      {pct}%
                    </Text>
                  ))}
                </View>
                <TextInput
                  style={styles.input}
                  value={textoPorcentaje}
                  onChangeText={setTextoPorcentaje}
                  keyboardType="number-pad"
                  placeholder="Otro porcentaje (1-100)"
                  placeholderTextColor={colors.labelTertiary}
                />
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
              placeholder="Nombre (ej. Tarjeta BAC, Alquiler atrasado)"
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
              placeholder="Tasa mensual en % (ej. 2, o la moratoria)"
              placeholderTextColor={colors.labelTertiary}
            />

            <View style={styles.filaSwitch}>
              <View style={styles.textoSwitch}>
                <Text style={styles.etiquetaCampo}>¿Tiene cuota fija?</Text>
                <Text style={styles.ayuda}>
                  {tieneCuotaFija
                    ? 'La cuota se descuenta como gasto fijo mientras dure el plazo.'
                    : 'Apagalo si solo acumula interés, sin pago mínimo pactado (ej. un alquiler atrasado). Se paga con el remanente libre que le destines.'}
                </Text>
              </View>
              <Switch
                value={tieneCuotaFija}
                onValueChange={setTieneCuotaFija}
                trackColor={{ true: colors.acento, false: colors.fill }}
                thumbColor={colors.label}
              />
            </View>

            {tieneCuotaFija ? (
              <>
                <TextInput
                  style={styles.input}
                  value={textoAbonoObjetivo}
                  onChangeText={setTextoAbonoObjetivo}
                  keyboardType="number-pad"
                  placeholder="Cuota por quincena"
                  placeholderTextColor={colors.labelTertiary}
                />
                <TextInput
                  style={styles.input}
                  value={textoPlazo}
                  onChangeText={setTextoPlazo}
                  keyboardType="number-pad"
                  placeholder="Plazo estimado (en quincenas)"
                  placeholderTextColor={colors.labelTertiary}
                />
              </>
            ) : null}

            <View style={styles.filaSwitch}>
              <View style={styles.textoSwitch}>
                <Text style={styles.etiquetaCampo}>¿El interés corre por día?</Text>
                <Text style={styles.ayuda}>
                  {moraDiaria
                    ? 'Se marca como MORA DIARIA y se prioriza sobre las demás.'
                    : 'Encendelo si es una mora que suma cada día (ej. un alquiler atrasado).'}
                </Text>
              </View>
              <Switch
                value={moraDiaria}
                onValueChange={setMoraDiaria}
                trackColor={{ true: colors.red, false: colors.fill }}
                thumbColor={colors.label}
              />
            </View>

            {avisoDeuda ? <Text style={styles.avisoDeuda}>{avisoDeuda}</Text> : null}
            <PrimaryButton titulo="Guardar deuda" onPress={() => void agregarDeuda()} />
          </View>
        </View>

        {/* El simulador va ANTES de las proyecciones: la pregunta que la
            persona trae al abrir esta pantalla es "¿me conviene meterle el
            excedente?", y esa se contesta con la diferencia entre escenarios,
            no con el detalle de uno solo. */}
        {deudaSeleccionada && deudaSeleccionada.saldoActual > 0 ? (
          <View style={styles.seccion}>
            <SectionHeader titulo={`Simular abono a ${deudaSeleccionada.nombre}`} />
            <SimuladorRemanente deuda={deudaSeleccionada} remanenteLibre={remanenteLibre} />
          </View>
        ) : null}

        {proyeccionSoloCuota ? (
          <View style={styles.seccion}>
            <SectionHeader titulo="Solo con tu cuota fija" />
            <Card sinRelleno>
              <ListRow
                titulo="Fecha en que quedás libre"
                valor={fechaLegible(proyeccionSoloCuota.fechaSaldoCero)}
              />
              <ListRow
                titulo="Intereses totales a pagar"
                valor={formatearColones(proyeccionSoloCuota.resultado.totalInteresPagado)}
                ultima
              />
            </Card>
            {!proyeccionSoloCuota.resultado.saldado ? (
              <Text style={styles.avisoDeuda}>
                Con solo la cuota pactada, el interés crece más rápido de lo que abonás: esta
                deuda no se termina de pagar así. Necesita remanente extra o renegociar la cuota.
              </Text>
            ) : null}
            {cuotaVinculada ? (
              <Text style={styles.ayuda}>
                Esta cuota ({formatearColones(cuotaVinculada.montoMensual)}/mes) ya está anotada
                como gasto fijo
                {cuotaVinculada.venceEn ? ` hasta el ${fechaLegible(new Date(`${cuotaVinculada.venceEn}T00:00:00Z`))}` : ''}
                : se descuenta sola del presupuesto, no hace falta anotarla aparte.
              </Text>
            ) : null}
          </View>
        ) : null}

        {proyeccionPorcentaje ? (
          <View style={styles.seccion}>
            <SectionHeader
              titulo={
                tieneCuotaLaDeudaSeleccionada
                  ? `Cuota + ${porcentajeActivo}% del remanente`
                  : `Proyección con ${porcentajeActivo}% del remanente`
              }
            />
            <Card sinRelleno>
              <ListRow
                titulo="Abono por quincena"
                detalle={
                  tieneCuotaLaDeudaSeleccionada
                    ? 'Cuota fija + remanente × porcentaje elegido'
                    : 'Remanente libre × porcentaje elegido'
                }
                valor={formatearColones(proyeccionPorcentaje.abonoPorPeriodo)}
              />
              <ListRow
                titulo="Fecha en que quedás libre"
                valor={fechaLegible(proyeccionPorcentaje.fechaSaldoCero)}
                tono={proyeccionPorcentaje.resultado.saldado ? 'positivo' : 'negativo'}
              />
              <ListRow
                titulo="Plazo estimado"
                valor={
                  proyeccionPorcentaje.resultado.saldado
                    ? `${proyeccionPorcentaje.resultado.periodosParaSaldar} quincenas`
                    : 'No alcanza a saldar en 10 años'
                }
              />
              <ListRow
                titulo="Intereses totales a pagar"
                valor={formatearColones(proyeccionPorcentaje.resultado.totalInteresPagado)}
                ultima
              />
            </Card>
            {!proyeccionPorcentaje.resultado.saldado ? (
              <Text style={styles.avisoDeuda}>
                Con este porcentaje el abono no alcanza a cubrir ni el interés: el saldo va a
                crecer en vez de bajar. Subí el porcentaje destinado.
              </Text>
            ) : null}
            {seriesAmortizacion.length > 0 ? (
              <Card style={styles.tarjetaGrafico}>
                <GraficoAmortizacion series={seriesAmortizacion} />
              </Card>
            ) : null}
          </View>
        ) : deudaSeleccionada ? (
          <View style={styles.seccion}>
            <SectionHeader titulo="Proyección" />
            <Card sinRelleno>
              <ListRow
                titulo="Interés que se suma esta quincena"
                detalle="Sin abono, esto se acumula igual al saldo"
                valor={formatearColones(interesSinAbonar)}
                tono="negativo"
                ultima
              />
            </Card>
            <Text style={styles.avisoDeuda}>
              Esta quincena no hay remanente libre para destinarle: todavía no hay nada que
              abonarle. Ojo: pagar tus gastos fijos normales (alquiler del mes, servicios, etc.) no
              abona nada a esta deuda — son cosas separadas, y mientras tanto el interés de arriba
              se sigue sumando solo. En cuanto haya remanente, elegí un porcentaje arriba.
            </Text>
          </View>
        ) : null}

        {asignacionAvalancha ? (
          <View style={styles.seccion}>
            <SectionHeader titulo="Reparto sugerido del remanente" />
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
                    detalle={`Cuota fija ${formatearColones(deuda?.abonoObjetivo ?? 0)} + remanente ${formatearColones(asig.abonoExtraAsignado)}`}
                    valor={formatearColones(asig.abonoTotal)}
                    tono={asig.abonoExtraAsignado > 0 ? 'positivo' : 'normal'}
                    ultima={i === asignacionAvalancha.length - 1}
                  />
                );
              })}
            </Card>
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
  ayuda: { ...typography.caption1, color: colors.labelTertiary },
  formularioDeuda: { gap: spacing.sm, marginTop: spacing.md },
  filaSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  textoSwitch: { flex: 1, gap: 2 },
  tarjetaGrafico: { marginTop: spacing.md },
  avisoDeuda: {
    ...typography.footnote,
    color: colors.label,
    backgroundColor: colors.orangeSoft,
    borderRadius: radius.md,
    padding: spacing.md,
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
  mensajeVacio: { ...typography.subheadline, color: colors.labelSecondary, padding: spacing.lg },
});
