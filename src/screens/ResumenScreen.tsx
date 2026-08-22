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
import { formatearColones, type GastosFijos } from '../core/payroll/distribution';
import { useQuincena } from '../state/useQuincena';
import { pedirSincronizacion } from '../lib/backgroundSync';
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

function limpiarMonto(texto: string): number {
  const n = Number(texto.replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

export function ResumenScreen() {
  const {
    payday,
    ventanaAbierta,
    abreEl,
    gastosFijos,
    distribucion,
    setColilla,
    guardarGastosFijos,
    recargar,
  } = useQuincena();
  const [texto, setTexto] = useState('');
  const [sincronizando, setSincronizando] = useState(false);

  const [editandoGastos, setEditandoGastos] = useState(false);
  const [textoCasa, setTextoCasa] = useState('');
  const [textoComida, setTextoComida] = useState('');
  const [textoPases, setTextoPases] = useState('');
  const [textoDeudaBase, setTextoDeudaBase] = useState('');

  const empezarEdicionGastos = useCallback(() => {
    setTextoCasa(String(gastosFijos.casa));
    setTextoComida(String(gastosFijos.comida));
    setTextoPases(String(gastosFijos.pases));
    setTextoDeudaBase(String(gastosFijos.deudaBase));
    setEditandoGastos(true);
  }, [gastosFijos]);

  const guardarGastos = useCallback(() => {
    const siguiente: GastosFijos = {
      casa: limpiarMonto(textoCasa),
      comida: limpiarMonto(textoComida),
      pases: limpiarMonto(textoPases),
      deudaBase: limpiarMonto(textoDeudaBase),
    };
    void guardarGastosFijos(siguiente);
    setEditandoGastos(false);
  }, [textoCasa, textoComida, textoPases, textoDeudaBase, guardarGastosFijos]);

  const aplicarColilla = useCallback(() => {
    const monto = Number(texto.replace(/[^\d]/g, ''));
    setColilla(Number.isFinite(monto) && monto > 0 ? monto : null);
  }, [texto, setColilla]);

  const sincronizar = useCallback(async () => {
    setSincronizando(true);
    try {
      await pedirSincronizacion();
      await recargar();
    } finally {
      setSincronizando(false);
    }
  }, [recargar]);

  const onRefresh = useCallback(() => {
    void sincronizar();
  }, [sincronizar]);

  const segmentosDistribucion: SegmentoDonut[] = useMemo(() => {
    if (!distribucion) return [];
    return [
      { etiqueta: 'Gastos fijos', valor: distribucion.totalGastosFijos, color: colors.labelTertiary },
      { etiqueta: 'Reserva de seguridad', valor: distribucion.reserva, color: colors.blue },
      { etiqueta: 'Abono a capital', valor: distribucion.abonoCapitalSugerido, color: colors.green },
      { etiqueta: 'Falta para la reserva', valor: distribucion.faltante, color: colors.red },
    ];
  }, [distribucion]);

  return (
    <SafeAreaView style={styles.pantalla}>
      <BlurHeader titulo="Quincena" subtitulo={`Próximo pago: ${fechaLegible(payday.date)}`} />

      <ScrollView
        contentContainerStyle={styles.contenido}
        refreshControl={
          <RefreshControl refreshing={sincronizando} onRefresh={onRefresh} />
        }
      >
        <Card>
          <Text style={styles.etiqueta}>
            {payday.kind === 'quincena' ? 'Pago de quincena' : 'Pago de fin de mes'}
          </Text>
          <Text style={styles.monto}>
            {distribucion ? formatearColones(distribucion.remanente) : '—'}
          </Text>
          <Text style={styles.pie}>
            {distribucion
              ? 'Remanente después de gastos fijos'
              : 'Ingresá la colilla para ver el remanente'}
          </Text>
          {payday.movedFromWeekend ? (
            <View style={styles.aviso}>
              <Text style={styles.avisoTexto}>
                El día {payday.nominalDay} cae en fin de semana: el pago se adelanta al
                viernes.
              </Text>
            </View>
          ) : null}
        </Card>

        <View style={styles.seccion}>
          <SectionHeader titulo="Colilla" />
          <Card>
            {ventanaAbierta ? (
              <View style={styles.formulario}>
                <TextInput
                  style={styles.input}
                  value={texto}
                  onChangeText={setTexto}
                  keyboardType="number-pad"
                  placeholder="Monto de la colilla"
                  placeholderTextColor={colors.labelTertiary}
                  accessibilityLabel="Monto de la colilla"
                />
                <PrimaryButton titulo="Calcular distribución" onPress={aplicarColilla} />
              </View>
            ) : (
              <Text style={styles.bloqueado}>
                El ingreso se habilita 48 horas antes del pago, el {fechaLegible(abreEl)}.
              </Text>
            )}
          </Card>
        </View>

        <View style={styles.seccion}>
          <SectionHeader
            titulo="Gastos fijos"
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
                <Text style={styles.etiquetaCampo}>Pases</Text>
                <TextInput
                  style={styles.inputGasto}
                  value={textoPases}
                  onChangeText={setTextoPases}
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
                <ListRow
                  titulo="Casa"
                  valor={formatearColones(gastosFijos.casa)}
                  onPress={empezarEdicionGastos}
                />
                <ListRow
                  titulo="Comida"
                  valor={formatearColones(gastosFijos.comida)}
                  onPress={empezarEdicionGastos}
                />
                <ListRow
                  titulo="Pases"
                  valor={formatearColones(gastosFijos.pases)}
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

        {distribucion ? (
          <View style={styles.seccion}>
            <SectionHeader titulo="Distribución" />
            <Card style={styles.tarjetaDonut}>
              <DistribucionDonut segmentos={segmentosDistribucion} />
            </Card>
            <Card sinRelleno>
              <ListRow
                titulo="Total gastos fijos"
                valor={formatearColones(distribucion.totalGastosFijos)}
              />
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
                valor={
                  distribucion.faltante > 0
                    ? `Faltan ${formatearColones(distribucion.faltante)}`
                    : undefined
                }
                tono={ETIQUETAS_ESTADO[distribucion.estado].tono}
                ultima
              />
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
  input: {
    ...typography.title3,
    backgroundColor: colors.fill,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.label,
  },
  bloqueado: { ...typography.subheadline, color: colors.labelSecondary },
  tarjetaDonut: { marginBottom: spacing.md },
  etiquetaCampo: { ...typography.footnote, color: colors.labelSecondary },
  inputGasto: {
    ...typography.body,
    backgroundColor: colors.fill,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.label,
  },
});
