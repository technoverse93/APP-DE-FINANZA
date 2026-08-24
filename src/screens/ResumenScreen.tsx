import { useCallback, useMemo, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  Switch,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
// De safe-area-context, NO de react-native: el SafeAreaView de react-native
// es exclusivo de iOS y en Android no reserva nada, así que el contenido
// terminaba debajo de la barra de navegación del sistema.
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  AvisoError,
  BlurHeader,
  Card,
  DistribucionDonut,
  GastosFijosEditor,
  GraficoBarrasFlujo,
  GraficoTendencia,
  ListRow,
  PrimaryButton,
  RejillaDatos,
  SectionHeader,
  SimuladorCard,
  Termometro,
  type BarraFlujo,
  type CeldaDato,
  type RubroTermometro,
  type SegmentoDonut,
} from '../components';
import { formatearColones, type GastosFijos } from '../core/payroll/distribution';
import type { DeudaSimulada } from '../core/payroll/simulador';
import { useDeudas } from '../state/useDeudas';
import { useDistribucionQuincena } from '../state/useDistribucionQuincena';
import { useSesion } from '../state/useSesion';
import { campoTexto, colors, radius, spacing, typography } from '../theme';

const FORMATO_FECHA = new Intl.DateTimeFormat('es-CR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'America/Costa_Rica',
});

function fechaLegible(fecha: Date): string {
  try {
    return FORMATO_FECHA.format(fecha);
  } catch {
    // Hermes puede no traer los datos de es-CR; el ISO corto es el respaldo.
    return fecha.toISOString().slice(0, 10);
  }
}

const ETIQUETAS_ESTADO = {
  deficit: { texto: 'No alcanza el margen de seguridad', tono: 'negativo' },
  ajustado: { texto: 'Justo dentro del margen', tono: 'atencion' },
  holgado: { texto: 'Con excedente para capital', tono: 'positivo' },
} as const;

/** El color con que se pinta el estado de la quincena en el panel principal. */
const ETIQUETAS_COLOR = {
  deficit: colors.red,
  ajustado: colors.orange,
  holgado: colors.acento,
} as const;

function limpiarMonto(texto: string): number {
  const n = Number(texto.replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** ¿La fecha/hora ISO cae dentro de [inicio, fin)? */
function dentroDeVentana(fechaIso: string, inicio: Date, fin: Date): boolean {
  const t = new Date(fechaIso).getTime();
  return t >= inicio.getTime() && t < fin.getTime();
}

export function ResumenScreen() {
  const q = useDistribucionQuincena();
  const deudasHook = useDeudas();
  const { sesion, cerrarSesion } = useSesion();

  const [textoColilla, setTextoColilla] = useState('');

  const [editandoGastos, setEditandoGastos] = useState(false);
  const [textoCasa, setTextoCasa] = useState('');
  const [textoComida, setTextoComida] = useState('');
  const [textoDeudaBase, setTextoDeudaBase] = useState('');

  const [textoOrigen, setTextoOrigen] = useState('');
  const [textoDestino, setTextoDestino] = useState('');
  const [textoPrecioTramo, setTextoPrecioTramo] = useState('');
  const [textoUsosTramo, setTextoUsosTramo] = useState('1');
  // Un pase ocasional (ej. dos pases extra para una salida) no es parte de la
  // ruta recurrente: se anota como gasto variable del día y no vuelve a
  // pesar en las quincenas siguientes.
  const [esOcasional, setEsOcasional] = useState(false);

  const empezarEdicionGastos = useCallback(() => {
    setTextoCasa(String(q.gastosFijos.casa));
    setTextoComida(String(q.gastosFijos.comida));
    setTextoDeudaBase(String(q.gastosFijos.deudaBase));
    setEditandoGastos(true);
  }, [q.gastosFijos]);

  const guardarGastos = useCallback(() => {
    const siguiente: GastosFijos = {
      casa: limpiarMonto(textoCasa),
      comida: limpiarMonto(textoComida),
      // El transporte ya no vive acá: lo calcula la sección "Rutas de
      // transporte" a partir de los tramos. Se conserva en 0 para no romper
      // la columna `pases` ya guardada de instalaciones anteriores.
      pases: 0,
      deudaBase: limpiarMonto(textoDeudaBase),
    };
    void q.guardarGastosFijos(siguiente);
    setEditandoGastos(false);
  }, [textoCasa, textoComida, textoDeudaBase, q]);

  const agregarTramo = useCallback(() => {
    const precio = limpiarMonto(textoPrecioTramo);
    if (precio <= 0) return;
    const usos = Math.max(1, limpiarMonto(textoUsosTramo) || 1);

    if (esOcasional) {
      // No toca rutas_transporte: entra al Libro Mayor como gasto del día,
      // así descuenta del disponible ahora y no se repite en las próximas
      // quincenas.
      const etiqueta = [textoOrigen.trim(), textoDestino.trim()].filter(Boolean).join(' → ');
      void q.libro.agregar({
        tipo: 'gasto',
        monto: precio * usos,
        descripcion: etiqueta ? `Pase ocasional: ${etiqueta}` : 'Pase ocasional',
        categoria: 'Transporte ocasional',
      });
    } else {
      if (!textoOrigen.trim() || !textoDestino.trim()) return;
      void q.rutas.agregar({
        origen: textoOrigen.trim(),
        destino: textoDestino.trim(),
        precio,
        usosPorDia: usos,
      });
    }

    setTextoOrigen('');
    setTextoDestino('');
    setTextoPrecioTramo('');
    setTextoUsosTramo('1');
  }, [textoOrigen, textoDestino, textoPrecioTramo, textoUsosTramo, esOcasional, q]);

  const onRefresh = useCallback(() => {
    void q.sincronizar();
  }, [q]);

  /** Los cuatro datos duros que encabezan el panel. */
  const celdasDatos: CeldaDato[] = useMemo(
    () => [
      {
        etiqueta: 'Reserva',
        valor: formatearColones(q.distribucion.reserva),
        detalle: `Piso ${formatearColones(q.distribucion.banda.min)}`,
        tono: q.distribucion.estado === 'deficit' ? 'negativo' : 'normal',
      },
      {
        etiqueta: 'A capital',
        valor: formatearColones(q.distribucion.abonoCapitalSugerido),
        detalle: q.distribucion.estado === 'holgado' ? 'Excedente libre' : 'Sin excedente',
        tono: q.distribucion.abonoCapitalSugerido > 0 ? 'positivo' : 'normal',
      },
      { etiqueta: 'Días hábiles', valor: String(q.diasHabiles), detalle: 'De la quincena' },
      {
        etiqueta: 'Costo/día',
        valor: formatearColones(q.rutas.costoDiarioTotal),
        detalle: `${q.rutas.tramos.length} tramo${q.rutas.tramos.length === 1 ? '' : 's'}`,
      },
    ],
    [q.distribucion, q.diasHabiles, q.rutas.costoDiarioTotal, q.rutas.tramos.length],
  );

  /**
   * Consumo por rubro contra lo previsto.
   *
   * El techo de transporte es la proyección de la quincena; el de gastos
   * diarios, lo que queda del ingreso una vez apartados transporte y fijos —
   * o sea, lo que de verdad hay para gastar día a día.
   */
  const rubrosConsumo: RubroTermometro[] = useMemo(() => {
    const ingresoBruto = (q.colilla.monto ?? 170_000) + q.ingresosExtraQuincena;
    const transporteGastado = q.libro.movimientos
      .filter(
        (m) =>
          m.categoria === 'Transporte ocasional' &&
          dentroDeVentana(m.fecha, q.inicioQuincena, q.payday.date),
      )
      .reduce((suma, m) => suma + m.monto, 0);

    return [
      { etiqueta: 'Transporte', consumido: transporteGastado, techo: q.transporteProyectado },
      {
        etiqueta: 'Diarios',
        consumido: q.gastosDiariosReales,
        techo: Math.max(0, ingresoBruto - q.transporteProyectado - q.otrosGastosFijos),
      },
      { etiqueta: 'Fijos', consumido: q.otrosGastosFijos, techo: ingresoBruto },
    ];
  }, [
    q.colilla.monto,
    q.ingresosExtraQuincena,
    q.libro.movimientos,
    q.inicioQuincena,
    q.payday,
    q.transporteProyectado,
    q.gastosDiariosReales,
    q.otrosGastosFijos,
  ]);

  const barrasFlujo: BarraFlujo[] = useMemo(
    () => [
      {
        etiqueta: 'Ingreso base + extra',
        valor: (q.colilla.monto ?? 170_000) + q.ingresosExtraQuincena,
        color: colors.green,
      },
      { etiqueta: 'Otros gastos fijos', valor: q.otrosGastosFijos, color: colors.labelTertiary },
      { etiqueta: 'Transporte proyectado', valor: q.transporteProyectado, color: colors.orange },
      { etiqueta: 'Gastos diarios reales', valor: q.gastosDiariosReales, color: colors.red },
    ],
    [q.colilla.monto, q.ingresosExtraQuincena, q.otrosGastosFijos, q.transporteProyectado, q.gastosDiariosReales],
  );

  const segmentosDistribucion: SegmentoDonut[] = useMemo(
    () => [
      { etiqueta: 'Otros gastos fijos', valor: q.otrosGastosFijos, color: colors.labelTertiary },
      { etiqueta: 'Transporte proyectado', valor: q.transporteProyectado, color: colors.orange },
      { etiqueta: 'Gastos diarios reales', valor: q.gastosDiariosReales, color: colors.red },
      { etiqueta: 'Reserva de seguridad', valor: q.distribucion.reserva, color: colors.blue },
      { etiqueta: 'Abono a capital', valor: q.distribucion.abonoCapitalSugerido, color: colors.green },
    ],
    [q.otrosGastosFijos, q.transporteProyectado, q.gastosDiariosReales, q.distribucion],
  );

  const confirmarColilla = useCallback(() => {
    const monto = limpiarMonto(textoColilla);
    if (monto <= 0) return;
    void q.colilla.confirmar(monto);
    setTextoColilla('');
  }, [textoColilla, q.colilla]);

  /** Se simula contra la deuda más cara: es la que un colón extra alivia más. */
  const deudaMasCara: DeudaSimulada | null = useMemo(() => {
    const cara = [...deudasHook.deudas].sort((a, b) => b.tasaMensual - a.tasaMensual)[0];
    return cara
      ? { saldoActual: cara.saldoActual, tasaMensual: cara.tasaMensual, abonoObjetivo: cara.abonoObjetivo }
      : null;
  }, [deudasHook.deudas]);

  return (
    // `edges` sin 'bottom': el dock de pestañas ya reserva ese borde por su
    // cuenta (ver RootTabs), y reservarlo dos veces deja una franja muerta.
    <SafeAreaView style={styles.pantalla} edges={['top', 'left', 'right']}>
      <BlurHeader
        titulo="Quincena"
        subtitulo={`Próximo pago · ${fechaLegible(q.payday.date)}`}
        enVivo={!q.sincronizando && !q.colilla.cargando}
      />

      <KeyboardAvoidingView
        style={styles.flexible}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={styles.contenido}
          // Sin esto, con el teclado abierto el primer toque sobre un botón
          // solo cierra el teclado y el botón parece no responder.
          keyboardShouldPersistTaps="handled"
          refreshControl={<RefreshControl refreshing={q.sincronizando} onRefresh={onRefresh} />}
        >
        {/* Antes de cualquier número: si algo falló al guardar o al leer, se
            dice acá. Un total calculado sobre datos que no se guardaron es
            peor que un error visible. */}
        <AvisoError
          errores={[
            q.error,
            q.libro.error,
            q.rutas.error,
            q.transacciones.error,
            q.colilla.error,
            q.gastosFijosItems.error,
            deudasHook.error,
          ]}
        />

        {/* Panel principal, marcado como "encendido": es la única cifra de la
            pantalla que se lee antes que cualquier otra cosa. */}
        <Card activo>
          <Text style={styles.etiqueta}>DISPONIBLE</Text>
          <Text style={[styles.monto, q.ingresoDisponible < 0 && styles.montoNegativo]}>
            {formatearColones(q.ingresoDisponible)}
          </Text>
          <Text style={[styles.estadoBanda, { color: ETIQUETAS_COLOR[q.distribucion.estado] }]}>
            Banda {formatearColones(q.distribucion.banda.min)}–
            {formatearColones(q.distribucion.banda.max)} ·{' '}
            {ETIQUETAS_ESTADO[q.distribucion.estado].texto}
          </Text>

          {q.tendenciaDisponible.length > 1 ? (
            <View style={styles.tendencia}>
              <GraficoTendencia
                valores={q.tendenciaDisponible}
                referencia={q.distribucion.banda.min}
              />
            </View>
          ) : null}

          <Text style={styles.pie}>
            {q.colilla.monto !== null
              ? `Colilla ${formatearColones(q.colilla.monto)} + extra − transporte − diarios − fijos`
              : 'Base 170.000 + extra − transporte − diarios − fijos'}
          </Text>
          {q.payday.movedFromWeekend ? (
            <View style={styles.aviso}>
              <Text style={styles.avisoTexto}>
                El día {q.payday.nominalDay} cae en fin de semana: el pago se adelanta al viernes.
              </Text>
            </View>
          ) : null}
        </Card>

        <RejillaDatos celdas={celdasDatos} />

        <View style={styles.seccion}>
          <SectionHeader titulo="Consumo por rubro" />
          <Card>
            <Termometro rubros={rubrosConsumo} />
          </Card>
        </View>

        {q.pedirColilla ? (
          <View style={styles.seccion}>
            <SectionHeader titulo="Colilla de esta quincena" />
            <Card>
              <Text style={styles.etiquetaCampo}>
                {q.colilla.monto !== null
                  ? `Confirmaste ${formatearColones(q.colilla.monto)}. Podés corregirlo si el monto cambió.`
                  : 'Faltan menos de 2 días para el pago. Confirmá el monto exacto que te depositan para ajustar el cálculo de esta quincena.'}
              </Text>
              <View style={styles.formularioColilla}>
                <TextInput
                  style={styles.inputGasto}
                  value={textoColilla}
                  onChangeText={setTextoColilla}
                  keyboardType="number-pad"
                  placeholder="Monto exacto de la colilla"
                  placeholderTextColor={colors.labelTertiary}
                />
                <PrimaryButton titulo="Confirmar colilla" onPress={confirmarColilla} />
              </View>
            </Card>
          </View>
        ) : null}

        <View style={styles.seccion}>
          <SectionHeader titulo="Esta quincena" />
          <Card sinRelleno>
            <ListRow titulo="Ingresos extra" valor={formatearColones(q.ingresosExtraQuincena)} tono="positivo" />
            <ListRow titulo="Gastos diarios (Libro Mayor)" valor={formatearColones(q.gastosLibroQuincena)} />
            {q.gastosTransaccionesQuincena > 0 ? (
              <ListRow
                titulo="Transacciones bancarias detectadas"
                valor={formatearColones(q.gastosTransaccionesQuincena)}
              />
            ) : null}
            <ListRow
              titulo="Transporte proyectado"
              detalle={`${formatearColones(q.rutas.costoDiarioTotal)} por día`}
              valor={formatearColones(q.transporteProyectado)}
              ultima
            />
          </Card>
          <Text style={styles.notaLibroMayor}>
            Los ingresos y gastos diarios se anotan desde Deudas → Libro Mayor.
          </Text>
        </View>

        <View style={styles.seccion}>
          <SectionHeader titulo="Rutas de transporte" />
          <Card sinRelleno={q.rutas.tramos.length > 0}>
            {q.rutas.tramos.length > 0 ? (
              q.rutas.tramos.map((t, i) => (
                <ListRow
                  key={t.id}
                  titulo={`${t.origen} → ${t.destino}`}
                  valor={formatearColones(t.precio * t.usosPorDia)}
                  onPress={() => void q.rutas.eliminar(t.id)}
                  detalle={`${formatearColones(t.precio)} × ${t.usosPorDia}/día · tocar para quitar`}
                  ultima={i === q.rutas.tramos.length - 1}
                />
              ))
            ) : (
              <Text style={styles.mensajeVacio}>
                Todavía no hay tramos. Agregá cada parte del recorrido diario (ej. Casa → San
                José) y su precio.
              </Text>
            )}
          </Card>
          <View style={styles.formularioTramo}>
            <TextInput
              style={styles.inputGasto}
              value={textoOrigen}
              onChangeText={setTextoOrigen}
              placeholder="Origen"
              placeholderTextColor={colors.labelTertiary}
            />
            <TextInput
              style={styles.inputGasto}
              value={textoDestino}
              onChangeText={setTextoDestino}
              placeholder="Destino"
              placeholderTextColor={colors.labelTertiary}
            />
            <View style={styles.filaCampos}>
              <TextInput
                style={[styles.inputGasto, styles.campoFlexible]}
                value={textoPrecioTramo}
                onChangeText={setTextoPrecioTramo}
                keyboardType="number-pad"
                placeholder="Precio del pase"
                placeholderTextColor={colors.labelTertiary}
              />
              <TextInput
                style={[styles.inputGasto, styles.campoAngosto]}
                value={textoUsosTramo}
                onChangeText={setTextoUsosTramo}
                keyboardType="number-pad"
                placeholder="Usos"
                placeholderTextColor={colors.labelTertiary}
              />
            </View>
            <View style={styles.filaSwitch}>
              <View style={styles.textoSwitch}>
                <Text style={styles.etiquetaCampo}>Gasto ocasional (no permanente)</Text>
                <Text style={styles.ayudaSwitch}>
                  {esOcasional
                    ? 'Se anota como gasto del día y no se repite en las próximas quincenas.'
                    : 'Se guarda como tramo fijo y cuenta en todas las quincenas.'}
                </Text>
              </View>
              <Switch
                value={esOcasional}
                onValueChange={setEsOcasional}
                trackColor={{ true: colors.acento, false: colors.fill }}
                thumbColor={colors.label}
              />
            </View>
            <PrimaryButton
              titulo={esOcasional ? 'Anotar gasto ocasional' : 'Agregar tramo fijo'}
              onPress={agregarTramo}
            />
          </View>
        </View>

        <View style={styles.seccion}>
          <SectionHeader titulo="Gastos fijos del mes" />
          <GastosFijosEditor
            gastos={q.gastosFijosItems.gastos}
            payday={q.payday}
            onCrear={(entrada) => void q.gastosFijosItems.crear(entrada)}
            onActualizar={(id, entrada) => void q.gastosFijosItems.actualizar(id, entrada)}
            onEliminar={(id) => void q.gastosFijosItems.eliminar(id)}
          />
        </View>

        <View style={styles.seccion}>
          <SectionHeader titulo="Ingresos contra gastos" />
          <Card>
            <GraficoBarrasFlujo barras={barrasFlujo} />
          </Card>
        </View>

        <View style={styles.seccion}>
          <SectionHeader titulo="¿Y si ganara más?" />
          <SimuladorCard
            contexto={q.contextoSimulador}
            ingresoBaseReal={q.colilla.monto ?? undefined}
            deuda={deudaMasCara}
          />
        </View>

        <View style={styles.seccion}>
          <SectionHeader
            titulo="Casa, comida y deuda base"
            accion={editandoGastos ? undefined : 'Editar'}
            onAccionPress={empezarEdicionGastos}
          />
          <Card sinRelleno={!editandoGastos}>
            {editandoGastos ? (
              <View style={styles.formulario}>
                <Text style={styles.etiquetaCampo}>Casa</Text>
                <TextInput
                  style={styles.inputGasto}
                  value={textoCasa}
                  onChangeText={setTextoCasa}
                  keyboardType="number-pad"
                  placeholderTextColor={colors.labelTertiary}
                />
                <Text style={styles.etiquetaCampo}>Comida</Text>
                <TextInput
                  style={styles.inputGasto}
                  value={textoComida}
                  onChangeText={setTextoComida}
                  keyboardType="number-pad"
                  placeholderTextColor={colors.labelTertiary}
                />
                <Text style={styles.etiquetaCampo}>Deuda base</Text>
                <TextInput
                  style={styles.inputGasto}
                  value={textoDeudaBase}
                  onChangeText={setTextoDeudaBase}
                  keyboardType="number-pad"
                  placeholderTextColor={colors.labelTertiary}
                />
                <PrimaryButton titulo="Guardar gastos fijos" onPress={guardarGastos} />
              </View>
            ) : (
              <>
                <ListRow titulo="Casa" valor={formatearColones(q.gastosFijos.casa)} onPress={empezarEdicionGastos} />
                <ListRow
                  titulo="Comida"
                  valor={formatearColones(q.gastosFijos.comida)}
                  onPress={empezarEdicionGastos}
                />
                <ListRow
                  titulo="Deuda base"
                  valor={formatearColones(q.gastosFijos.deudaBase)}
                  onPress={empezarEdicionGastos}
                  ultima
                />
              </>
            )}
          </Card>
        </View>

        <View style={styles.seccion}>
          <SectionHeader titulo="Distribución" />
          <Card style={styles.tarjetaDonut}>
            <DistribucionDonut segmentos={segmentosDistribucion} />
          </Card>
          <Card sinRelleno>
            <ListRow
              titulo="Reserva de seguridad"
              detalle={`Banda ${formatearColones(q.distribucion.banda.min)} – ${formatearColones(q.distribucion.banda.max)}`}
              valor={formatearColones(q.distribucion.reserva)}
            />
            <ListRow
              titulo="Abono a capital"
              detalle={
                q.distribucion.estado === 'holgado'
                  ? `Rango ${formatearColones(q.distribucion.abonoCapitalRango.min)} – ${formatearColones(q.distribucion.abonoCapitalRango.max)}`
                  : undefined
              }
              valor={formatearColones(q.distribucion.abonoCapitalSugerido)}
              tono="positivo"
            />
            <ListRow
              titulo={ETIQUETAS_ESTADO[q.distribucion.estado].texto}
              valor={q.distribucion.faltante > 0 ? `Faltan ${formatearColones(q.distribucion.faltante)}` : undefined}
              tono={ETIQUETAS_ESTADO[q.distribucion.estado].tono}
              ultima
            />
          </Card>
        </View>

        <View style={styles.seccion}>
          <SectionHeader titulo="Cuenta" />
          <Card>
            <Text style={styles.etiquetaCampo}>
              {sesion?.user.email ?? 'Sin sesión'}
            </Text>
            <Text style={styles.pie}>
              Tus datos se guardan bajo esta cuenta. Si salís, la app vuelve a
              pedir el correo y la contraseña, pero nada se borra.
            </Text>
            <PrimaryButton titulo="Cerrar sesión" onPress={() => void cerrarSesion()} />
          </Card>
        </View>
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
  etiqueta: { ...typography.rotulo, color: colors.labelTertiary },
  monto: { ...typography.amount, color: colors.label, marginTop: spacing.xs },
  montoNegativo: { color: colors.red },
  estadoBanda: { ...typography.caption1, marginTop: 2 },
  tendencia: { marginTop: spacing.md },
  pie: { ...typography.caption1, color: colors.labelTertiary, marginTop: spacing.sm },
  aviso: {
    marginTop: spacing.lg,
    backgroundColor: colors.orangeSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  avisoTexto: { ...typography.footnote, color: colors.label },
  formulario: { gap: spacing.lg },
  formularioTramo: { gap: spacing.sm, marginTop: spacing.sm },
  formularioColilla: { gap: spacing.md, marginTop: spacing.md },
  filaCampos: { flexDirection: 'row', gap: spacing.sm },
  // `flex` en los dos campos dejaba que el de la derecha se saliera del
  // borde: en monoespaciada el texto del marcador es más ancho que el
  // espacio que le tocaba, y sin `minWidth: 0` un campo no se encoge por
  // debajo de su contenido. El de usos lleva ancho fijo — siempre son uno o
  // dos dígitos — y el de precio se queda con el resto.
  campoFlexible: { flex: 1, minWidth: 0 },
  campoAngosto: { width: 74 },
  filaSwitch: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xs,
  },
  textoSwitch: { flex: 1 },
  ayudaSwitch: { ...typography.caption2, color: colors.labelTertiary, marginTop: 2 },
  notaLibroMayor: {
    ...typography.footnote,
    color: colors.labelSecondary,
    marginTop: spacing.sm,
  },
  tarjetaDonut: { marginBottom: spacing.md },
  etiquetaCampo: { ...typography.footnote, color: colors.labelSecondary },
  mensajeVacio: { ...typography.subheadline, color: colors.labelSecondary, padding: spacing.lg },
  inputGasto: {
    ...campoTexto,
  },
});
