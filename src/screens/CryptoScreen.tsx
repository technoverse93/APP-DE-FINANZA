import { memo, useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { BlurHeader, Card, CandlestickChart, ListRow, PrimaryButton, SectionHeader } from '../components';
import { formatearColones } from '../core/payroll/distribution';
import { gananciaNoRealizada } from '../core/crypto/paperTrading';
import type { ResultadoSenal, Senal } from '../core/crypto/signals';
import { useCryptoConfig, type ModoCripto } from '../state/useCryptoConfig';
import { useCryptoData } from '../state/useCryptoData';
import { useCryptoMovimientos } from '../state/useCryptoMovimientos';
import type { MovimientoCripto } from '../core/crypto/paperTrading';
import { colors, radius, spacing, typography } from '../theme';

const TONO_SENAL: Record<Senal, 'positivo' | 'negativo' | 'normal'> = {
  compra: 'positivo',
  venta: 'negativo',
  mantener: 'normal',
};

const ETIQUETA_SENAL: Record<Senal, string> = {
  compra: 'Posible compra',
  venta: 'Posible venta',
  mantener: 'Mantener',
};

function limpiarNumero(texto: string): number {
  const n = Number(texto.replace(/[^\d.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** Fila de movimiento de cripto. Memoizada por la misma razón que en Deudas:
 * la lista puede crecer y no hay motivo para re-renderizarla en cada tecla. */
const FilaMovimientoCripto = memo(function FilaMovimientoCripto({
  movimiento,
  moneda,
  ultima,
}: {
  movimiento: MovimientoCripto;
  moneda: string;
  ultima: boolean;
}) {
  return (
    <ListRow
      titulo={movimiento.tipo === 'compra' ? 'Compra' : 'Venta'}
      detalle={`${movimiento.cantidad.toFixed(8)} ${moneda}`}
      valor={formatearColones(movimiento.cantidad * movimiento.precioUnitario)}
      tono={movimiento.tipo === 'compra' ? 'negativo' : 'positivo'}
      ultima={ultima}
    />
  );
});

/** Tarjeta de señal algorítmica: siempre trae el detalle de qué la generó y
 * nunca se presenta como una orden — la ejecución queda en manos del usuario. */
function TarjetaSenal({ senal }: { senal: ResultadoSenal }) {
  return (
    <Card sinRelleno>
      <ListRow
        titulo={ETIQUETA_SENAL[senal.senal]}
        detalle={senal.detalle}
        valor={`${Math.round(senal.probabilidad * 100)}%`}
        tono={TONO_SENAL[senal.senal]}
      />
      <ListRow titulo="RSI" valor={senal.rsi.toFixed(1)} />
      <ListRow titulo="Media móvil corta" valor={senal.smaCorta.toFixed(2)} />
      <ListRow titulo="Media móvil larga" valor={senal.smaLarga.toFixed(2)} ultima />
    </Card>
  );
}

export function CryptoScreen() {
  const { config, guardar } = useCryptoConfig();
  const { velas, senal, cargando: cargandoPrecios, error: errorPrecios, recargar: recargarPrecios } =
    useCryptoData(config.moneda);
  const {
    movimientos,
    estado,
    cargando: cargandoMovimientos,
    error: errorMovimientos,
    comprar,
    vender,
    recargar: recargarMovimientos,
  } = useCryptoMovimientos(config.modo, config.moneda, config.capitalVirtualInicial);

  const [textoCantidad, setTextoCantidad] = useState('');
  const [textoPrecio, setTextoPrecio] = useState('');

  const ultimoPrecio = velas.length > 0 ? velas[velas.length - 1].cierre : null;

  const cambiarModo = useCallback(
    (modo: ModoCripto) => {
      void guardar({ ...config, modo });
    },
    [config, guardar],
  );

  const cantidad = limpiarNumero(textoCantidad);
  const precio = precioIngresadoOUltimo(textoPrecio, ultimoPrecio);

  const ejecutarCompra = useCallback(() => {
    if (cantidad <= 0 || precio <= 0) return;
    void comprar(cantidad, precio);
    setTextoCantidad('');
  }, [cantidad, precio, comprar]);

  const ejecutarVenta = useCallback(() => {
    if (cantidad <= 0 || precio <= 0) return;
    void vender(cantidad, precio);
    setTextoCantidad('');
  }, [cantidad, precio, vender]);

  const ganancia = useMemo(
    () => (ultimoPrecio !== null ? gananciaNoRealizada(estado, ultimoPrecio) : 0),
    [estado, ultimoPrecio],
  );

  const refrescando = cargandoPrecios || cargandoMovimientos;
  const recargarTodo = useCallback(() => {
    void recargarPrecios();
    void recargarMovimientos();
  }, [recargarPrecios, recargarMovimientos]);

  return (
    <SafeAreaView style={styles.pantalla}>
      <BlurHeader titulo="Cripto" subtitulo={`${config.moneda} · ${config.modo === 'simulacion' ? 'Simulación' : 'Real'}`} />
      <ScrollView
        contentContainerStyle={styles.contenido}
        refreshControl={<RefreshControl refreshing={refrescando} onRefresh={recargarTodo} />}
      >
        <View style={styles.seccion}>
          <Card>
            <View style={styles.filaTipo}>
              <Text
                onPress={() => cambiarModo('simulacion')}
                style={[styles.chip, config.modo === 'simulacion' && styles.chipActivo]}
              >
                Simulación
              </Text>
              <Text
                onPress={() => cambiarModo('real')}
                style={[styles.chip, config.modo === 'real' && styles.chipActivo]}
              >
                Real
              </Text>
            </View>
            <Text style={styles.avisoModo}>
              {config.modo === 'simulacion'
                ? 'Opera contra un capital virtual propio. No mueve dinero real.'
                : 'Anotá acá las compras y ventas que ya hiciste en tu propio exchange. La app nunca ejecuta órdenes por vos.'}
            </Text>
          </Card>
        </View>

        <Card>
          {cargandoPrecios && velas.length === 0 ? (
            <ActivityIndicator color={colors.blue} />
          ) : errorPrecios ? (
            <>
              <Text style={styles.etiqueta}>No se pudieron cargar los precios</Text>
              <Text style={styles.mensajeError}>{errorPrecios}</Text>
            </>
          ) : ultimoPrecio === null ? (
            <>
              <Text style={styles.etiqueta}>Sin cotizaciones todavía</Text>
              <Text style={styles.mensajeVacio}>
                Todavía no hay velas reales guardadas para {config.moneda}. Se completan solas con
                el refresco automático desde CoinGecko.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.etiqueta}>Último cierre real</Text>
              <Text style={styles.monto}>{formatearColones(ultimoPrecio)}</Text>
              <CandlestickChart velas={velas} />
            </>
          )}
        </Card>

        {senal ? (
          <View style={styles.seccion}>
            <SectionHeader titulo="Señal algorítmica" />
            <TarjetaSenal senal={senal} />
          </View>
        ) : (
          <Text style={styles.avisoVacio}>
            La señal aparece cuando haya al menos 21 velas reales cargadas para {config.moneda}.
          </Text>
        )}

        <View style={styles.seccion}>
          <SectionHeader titulo={config.modo === 'simulacion' ? 'Billetera virtual' : 'Posición registrada'} />
          <Card sinRelleno>
            {config.modo === 'simulacion' ? (
              <ListRow titulo="Efectivo virtual disponible" valor={formatearColones(estado.efectivoDisponible)} />
            ) : null}
            <ListRow titulo={`Posición en ${config.moneda}`} valor={estado.cantidadMoneda.toFixed(8)} />
            {estado.cantidadMoneda > 0 ? (
              <>
                <ListRow titulo="Costo promedio" valor={formatearColones(estado.costoPromedio)} />
                <ListRow
                  titulo="Ganancia/pérdida no realizada"
                  valor={formatearColones(ganancia)}
                  tono={ganancia >= 0 ? 'positivo' : 'negativo'}
                  ultima
                />
              </>
            ) : null}
          </Card>
        </View>

        <View style={styles.seccion}>
          <SectionHeader titulo={config.modo === 'simulacion' ? 'Comprar / vender (simulado)' : 'Anotar movimiento real'} />
          <Card>
            <View style={styles.formulario}>
              {errorMovimientos ? <Text style={styles.mensajeError}>{errorMovimientos}</Text> : null}
              <TextInput
                style={styles.input}
                value={textoCantidad}
                onChangeText={setTextoCantidad}
                keyboardType="decimal-pad"
                placeholder={`Cantidad de ${config.moneda}`}
                placeholderTextColor={colors.labelTertiary}
              />
              <TextInput
                style={styles.input}
                value={textoPrecio}
                onChangeText={setTextoPrecio}
                keyboardType="number-pad"
                placeholder={ultimoPrecio ? `Precio unitario (último: ${formatearColones(ultimoPrecio)})` : 'Precio unitario'}
                placeholderTextColor={colors.labelTertiary}
              />
              <View style={styles.filaBotones}>
                <View style={styles.botonMitad}>
                  <PrimaryButton titulo="Comprar" onPress={ejecutarCompra} deshabilitado={cantidad <= 0 || precio <= 0} />
                </View>
                <View style={styles.botonMitad}>
                  <PrimaryButton titulo="Vender" onPress={ejecutarVenta} deshabilitado={cantidad <= 0 || precio <= 0} />
                </View>
              </View>
            </View>
          </Card>
        </View>

        {movimientos.length > 0 ? (
          <View style={styles.seccion}>
            <SectionHeader titulo="Movimientos recientes" />
            <Card sinRelleno>
              {movimientos
                .slice(-10)
                .reverse()
                .map((m, i, arr) => (
                  <FilaMovimientoCripto
                    key={m.id}
                    movimiento={m}
                    moneda={config.moneda}
                    ultima={i === arr.length - 1}
                  />
                ))}
            </Card>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function precioIngresadoOUltimo(texto: string, ultimo: number | null): number {
  const n = limpiarNumero(texto);
  if (n > 0) return n;
  return ultimo ?? 0;
}

const styles = StyleSheet.create({
  pantalla: { flex: 1, backgroundColor: colors.background },
  contenido: { padding: spacing.lg, gap: spacing.xl, paddingBottom: spacing.xxxl },
  seccion: { gap: 0 },
  etiqueta: { ...typography.footnote, color: colors.labelSecondary },
  monto: { ...typography.amount, color: colors.label, marginTop: spacing.xs },
  mensajeError: { ...typography.subheadline, color: colors.red, marginTop: spacing.sm },
  mensajeVacio: { ...typography.subheadline, color: colors.labelSecondary, marginTop: spacing.sm },
  avisoVacio: { ...typography.footnote, color: colors.labelSecondary, textAlign: 'center' },
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
  avisoModo: { ...typography.footnote, color: colors.labelSecondary, marginTop: spacing.sm },
  input: {
    ...typography.body,
    backgroundColor: colors.fill,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.label,
  },
  filaBotones: { flexDirection: 'row', gap: spacing.md },
  botonMitad: { flex: 1 },
});
