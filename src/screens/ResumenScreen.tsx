import { useCallback, useMemo, useState } from 'react';
import {
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native';
import {
  BlurHeader,
  Card,
  DistribucionDonut,
  ListRow,
  PrimaryButton,
  SectionHeader,
  type SegmentoDonut,
} from '../components';
import { distribuirQuincena, formatearColones, type GastosFijos } from '../core/payroll/distribution';
import { calcularIngresoDisponible } from '../core/payroll/ingresoDisponible';
import { previousPayday } from '../core/payroll/schedule';
import { calcularCostoTransporteProyectado } from '../core/payroll/transporte';
import { pedirSincronizacion } from '../lib/backgroundSync';
import { useLibroMayor } from '../state/useLibroMayor';
import { useQuincena } from '../state/useQuincena';
import { useRutasTransporte } from '../state/useRutasTransporte';
import { useTransacciones } from '../state/useTransacciones';
import { colors, radius, spacing, typography } from '../theme';

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

const GASTOS_FIJOS_YA_APLICADOS: GastosFijos = { casa: 0, comida: 0, pases: 0, deudaBase: 0 };

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
  const { payday, gastosFijos, guardarGastosFijos, recargar } = useQuincena();
  const libro = useLibroMayor();
  const rutas = useRutasTransporte();
  const transacciones = useTransacciones();

  const [sincronizando, setSincronizando] = useState(false);

  const [editandoGastos, setEditandoGastos] = useState(false);
  const [textoCasa, setTextoCasa] = useState('');
  const [textoComida, setTextoComida] = useState('');
  const [textoDeudaBase, setTextoDeudaBase] = useState('');

  const [textoOrigen, setTextoOrigen] = useState('');
  const [textoDestino, setTextoDestino] = useState('');
  const [textoPrecioTramo, setTextoPrecioTramo] = useState('');

  const empezarEdicionGastos = useCallback(() => {
    setTextoCasa(String(gastosFijos.casa));
    setTextoComida(String(gastosFijos.comida));
    setTextoDeudaBase(String(gastosFijos.deudaBase));
    setEditandoGastos(true);
  }, [gastosFijos]);

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
    void guardarGastosFijos(siguiente);
    setEditandoGastos(false);
  }, [textoCasa, textoComida, textoDeudaBase, guardarGastosFijos]);

  const agregarTramo = useCallback(() => {
    if (!textoOrigen.trim() || !textoDestino.trim()) return;
    const precio = limpiarMonto(textoPrecioTramo);
    if (precio <= 0) return;
    void rutas.agregar({ origen: textoOrigen.trim(), destino: textoDestino.trim(), precio });
    setTextoOrigen('');
    setTextoDestino('');
    setTextoPrecioTramo('');
  }, [textoOrigen, textoDestino, textoPrecioTramo, rutas]);

  const sincronizar = useCallback(async () => {
    setSincronizando(true);
    try {
      await pedirSincronizacion();
      await Promise.all([recargar(), libro.recargar(), rutas.recargar(), transacciones.recargar()]);
    } finally {
      setSincronizando(false);
    }
  }, [recargar, libro, rutas, transacciones]);

  const onRefresh = useCallback(() => {
    void sincronizar();
  }, [sincronizar]);

  /**
   * La quincena en curso va desde el pago anterior (inclusive) hasta el
   * próximo (exclusive). `previousPayday` acepta cualquier "ahora": pasarle
   * el próximo pago devuelve exactamente el pago inmediatamente anterior.
   */
  const inicioQuincena = useMemo(() => previousPayday(payday.date).date, [payday]);

  const ingresosExtraQuincena = useMemo(
    () =>
      libro.movimientos
        .filter((m) => m.tipo === 'ingreso' && dentroDeVentana(m.fecha, inicioQuincena, payday.date))
        .reduce((suma, m) => suma + m.monto, 0),
    [libro.movimientos, inicioQuincena, payday],
  );

  const gastosLibroQuincena = useMemo(
    () =>
      libro.movimientos
        .filter((m) => m.tipo === 'gasto' && dentroDeVentana(m.fecha, inicioQuincena, payday.date))
        .reduce((suma, m) => suma + m.monto, 0),
    [libro.movimientos, inicioQuincena, payday],
  );

  const gastosTransaccionesQuincena = useMemo(
    () =>
      transacciones.transacciones
        .filter(
          (t) => t.moneda === 'CRC' && dentroDeVentana(t.ocurridoEn, inicioQuincena, payday.date),
        )
        .reduce((suma, t) => suma + t.monto, 0),
    [transacciones.transacciones, inicioQuincena, payday],
  );

  const gastosDiariosReales = gastosLibroQuincena + gastosTransaccionesQuincena;

  const transporteProyectado = useMemo(
    () => calcularCostoTransporteProyectado(rutas.costoDiarioTotal, inicioQuincena, payday.date),
    [rutas.costoDiarioTotal, inicioQuincena, payday],
  );

  const otrosGastosFijos = gastosFijos.casa + gastosFijos.comida + gastosFijos.deudaBase;

  const ingresoDisponible = useMemo(
    () =>
      calcularIngresoDisponible({
        ingresosExtra: ingresosExtraQuincena,
        transporteProyectado,
        gastosDiariosReales,
        otrosGastosFijos,
      }),
    [ingresosExtraQuincena, transporteProyectado, gastosDiariosReales, otrosGastosFijos],
  );

  const distribucion = useMemo(
    () => distribuirQuincena({ colilla: ingresoDisponible, gastosFijos: GASTOS_FIJOS_YA_APLICADOS }),
    [ingresoDisponible],
  );

  const segmentosDistribucion: SegmentoDonut[] = useMemo(
    () => [
      { etiqueta: 'Otros gastos fijos', valor: otrosGastosFijos, color: colors.labelTertiary },
      { etiqueta: 'Transporte proyectado', valor: transporteProyectado, color: colors.orange },
      { etiqueta: 'Gastos diarios reales', valor: gastosDiariosReales, color: colors.red },
      { etiqueta: 'Reserva de seguridad', valor: distribucion.reserva, color: colors.blue },
      { etiqueta: 'Abono a capital', valor: distribucion.abonoCapitalSugerido, color: colors.green },
    ],
    [otrosGastosFijos, transporteProyectado, gastosDiariosReales, distribucion],
  );

  return (
    <SafeAreaView style={styles.pantalla}>
      <BlurHeader titulo="Quincena" subtitulo={`Próximo pago: ${fechaLegible(payday.date)}`} />

      <ScrollView
        contentContainerStyle={styles.contenido}
        refreshControl={<RefreshControl refreshing={sincronizando} onRefresh={onRefresh} />}
      >
        <Card>
          <Text style={styles.etiqueta}>Ingreso disponible de esta quincena</Text>
          <Text style={styles.monto}>{formatearColones(ingresoDisponible)}</Text>
          <Text style={styles.pie}>
            170.000 + ingresos extra − transporte proyectado − gastos diarios reales − otros
            gastos fijos
          </Text>
          {payday.movedFromWeekend ? (
            <View style={styles.aviso}>
              <Text style={styles.avisoTexto}>
                El día {payday.nominalDay} cae en fin de semana: el pago se adelanta al viernes.
              </Text>
            </View>
          ) : null}
        </Card>

        <View style={styles.seccion}>
          <SectionHeader titulo="Esta quincena" />
          <Card sinRelleno>
            <ListRow titulo="Ingresos extra" valor={formatearColones(ingresosExtraQuincena)} tono="positivo" />
            <ListRow titulo="Gastos diarios (Libro Mayor)" valor={formatearColones(gastosLibroQuincena)} />
            {gastosTransaccionesQuincena > 0 ? (
              <ListRow
                titulo="Transacciones bancarias detectadas"
                valor={formatearColones(gastosTransaccionesQuincena)}
              />
            ) : null}
            <ListRow
              titulo="Transporte proyectado"
              detalle={`${formatearColones(rutas.costoDiarioTotal)} por día`}
              valor={formatearColones(transporteProyectado)}
              ultima
            />
          </Card>
          <Text style={styles.notaLibroMayor}>
            Los ingresos y gastos diarios se anotan desde Deudas → Libro Mayor.
          </Text>
        </View>

        <View style={styles.seccion}>
          <SectionHeader titulo="Rutas de transporte" />
          <Card sinRelleno={rutas.tramos.length > 0}>
            {rutas.tramos.length > 0 ? (
              rutas.tramos.map((t, i) => (
                <ListRow
                  key={t.id}
                  titulo={`${t.origen} → ${t.destino}`}
                  valor={formatearColones(t.precio)}
                  onPress={() => void rutas.eliminar(t.id)}
                  detalle="Tocar para quitar"
                  ultima={i === rutas.tramos.length - 1}
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
            <TextInput
              style={styles.inputGasto}
              value={textoPrecioTramo}
              onChangeText={setTextoPrecioTramo}
              keyboardType="number-pad"
              placeholder="Precio del tramo"
              placeholderTextColor={colors.labelTertiary}
            />
            <PrimaryButton titulo="Agregar tramo" onPress={agregarTramo} />
          </View>
        </View>

        <View style={styles.seccion}>
          <SectionHeader
            titulo="Otros gastos fijos"
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
                <ListRow titulo="Casa" valor={formatearColones(gastosFijos.casa)} onPress={empezarEdicionGastos} />
                <ListRow
                  titulo="Comida"
                  valor={formatearColones(gastosFijos.comida)}
                  onPress={empezarEdicionGastos}
                />
                <ListRow
                  titulo="Deuda base"
                  valor={formatearColones(gastosFijos.deudaBase)}
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
              detalle={`Banda ${formatearColones(distribucion.banda.min)} – ${formatearColones(distribucion.banda.max)}`}
              valor={formatearColones(distribucion.reserva)}
            />
            <ListRow
              titulo="Abono a capital"
              detalle={
                distribucion.estado === 'holgado'
                  ? `Rango ${formatearColones(distribucion.abonoCapitalRango.min)} – ${formatearColones(distribucion.abonoCapitalRango.max)}`
                  : undefined
              }
              valor={formatearColones(distribucion.abonoCapitalSugerido)}
              tono="positivo"
            />
            <ListRow
              titulo={ETIQUETAS_ESTADO[distribucion.estado].texto}
              valor={distribucion.faltante > 0 ? `Faltan ${formatearColones(distribucion.faltante)}` : undefined}
              tono={ETIQUETAS_ESTADO[distribucion.estado].tono}
              ultima
            />
          </Card>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxxl },
  seccion: { gap: 0 },
  etiqueta: { ...typography.footnote, color: colors.labelSecondary },
  monto: { ...typography.amount, color: colors.label, marginTop: spacing.xs },
  pie: { ...typography.footnote, color: colors.labelSecondary, marginTop: spacing.xs },
  aviso: {
    marginTop: spacing.lg,
    backgroundColor: colors.orangeSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  avisoTexto: { ...typography.footnote, color: colors.label },
  formulario: { gap: spacing.lg },
  formularioTramo: { gap: spacing.sm, marginTop: spacing.sm },
  notaLibroMayor: {
    ...typography.footnote,
    color: colors.labelSecondary,
    marginTop: spacing.sm,
  },
  tarjetaDonut: { marginBottom: spacing.md },
  etiquetaCampo: { ...typography.footnote, color: colors.labelSecondary },
  mensajeVacio: { ...typography.subheadline, color: colors.labelSecondary, padding: spacing.lg },
  inputGasto: {
    ...typography.body,
    backgroundColor: colors.fill,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.label,
  },
});
