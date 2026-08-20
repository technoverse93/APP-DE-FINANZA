import { useMemo, useState } from 'react';
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
import { BlurHeader, Card, ListRow, PriceChart, SectionHeader } from '../components';
import { formatearColones } from '../core/payroll/distribution';
import { proyectarInteresCompuesto } from '../core/investment/compoundInterest';
import { useMarketData } from '../lib/market';
import { useInversionConfig } from '../state/useInversionConfig';
import { colors, radius, spacing, typography } from '../theme';

const PERIODOS_POR_ANIO = 24; // quincenal
const HORIZONTE_ANIOS = 10;

const ETIQUETA_RIESGO: Record<string, { texto: string; tono: 'positivo' | 'atencion' | 'negativo' }> = {
  bajo: { texto: 'Riesgo bajo', tono: 'positivo' },
  medio: { texto: 'Riesgo medio', tono: 'atencion' },
  alto: { texto: 'Riesgo alto', tono: 'negativo' },
};

function formatearPorcentaje(fraccion: number): string {
  return `${(fraccion * 100).toFixed(1)}%`;
}

export function InversionScreen() {
  const { config, guardar } = useInversionConfig();
  const { cotizaciones, metricas, cargando, error, recargar } = useMarketData(config.ticker);
  const [textoAporte, setTextoAporte] = useState('');
  const [textoPrincipal, setTextoPrincipal] = useState('');

  const precios = useMemo(() => cotizaciones.map((c) => c.cierre), [cotizaciones]);
  const ultimoPrecio = precios.length > 0 ? precios[precios.length - 1] : null;

  const proyeccion = useMemo(() => {
    if (!metricas) return null;
    return proyectarInteresCompuesto({
      principalInicial: config.principalInicial,
      aportePeriodico: config.aportePeriodico,
      tasaAnualEsperada: metricas.rendimientoAnual,
      periodosPorAnio: PERIODOS_POR_ANIO,
      numPeriodos: PERIODOS_POR_ANIO * HORIZONTE_ANIOS,
    });
  }, [metricas, config.principalInicial, config.aportePeriodico]);

  const aplicarConfig = () => {
    const aporte = Number(textoAporte.replace(/[^\d]/g, ''));
    const principal = Number(textoPrincipal.replace(/[^\d]/g, ''));
    void guardar({
      ticker: config.ticker,
      aportePeriodico: Number.isFinite(aporte) ? aporte : config.aportePeriodico,
      principalInicial: Number.isFinite(principal) ? principal : config.principalInicial,
    });
  };

  return (
    <SafeAreaView style={styles.pantalla}>
      <BlurHeader titulo="Inversión" subtitulo={`${config.ticker} · S&P 500`} />
      <ScrollView
        contentContainerStyle={styles.contenido}
        refreshControl={<RefreshControl refreshing={cargando} onRefresh={() => void recargar()} />}
      >
        <Card>
          {cargando && precios.length === 0 ? (
            <ActivityIndicator color={colors.blue} />
          ) : error ? (
            <>
              <Text style={styles.etiqueta}>No se pudieron cargar los datos</Text>
              <Text style={styles.mensajeError}>{error}</Text>
            </>
          ) : ultimoPrecio === null ? (
            <>
              <Text style={styles.etiqueta}>Sin cotizaciones todavía</Text>
              <Text style={styles.mensajeVacio}>
                Todavía no hay cierres reales guardados para {config.ticker}. Se completan solos
                con el refresco automático cada 4 horas, o podés forzarlo desde el servidor.
              </Text>
            </>
          ) : (
            <>
              <Text style={styles.etiqueta}>Último cierre real</Text>
              <Text style={styles.monto}>${ultimoPrecio.toFixed(2)}</Text>
              <PriceChart precios={precios} />
            </>
          )}
        </Card>

        {metricas ? (
          <View style={styles.seccion}>
            <SectionHeader titulo="Riesgo y rendimiento" />
            <Card sinRelleno>
              <ListRow
                titulo="Rendimiento anualizado"
                detalle="Calculado sobre los cierres reales cargados"
                valor={formatearPorcentaje(metricas.rendimientoAnual)}
                tono={metricas.rendimientoAnual >= 0 ? 'positivo' : 'negativo'}
              />
              <ListRow
                titulo="Volatilidad anualizada"
                valor={formatearPorcentaje(metricas.volatilidadAnual)}
              />
              <ListRow
                titulo={ETIQUETA_RIESGO[metricas.nivelRiesgo].texto}
                tono={ETIQUETA_RIESGO[metricas.nivelRiesgo].tono}
              />
              <ListRow
                titulo="Peor caída histórica en la serie cargada"
                valor={formatearPorcentaje(metricas.caidaMaximaHistorica)}
                tono="negativo"
                ultima
              />
            </Card>
          </View>
        ) : null}

        <View style={styles.seccion}>
          <SectionHeader titulo="Tu aporte" />
          <Card>
            <View style={styles.formulario}>
              <Text style={styles.etiquetaCampo}>Capital ya invertido</Text>
              <TextInput
                style={styles.input}
                value={textoPrincipal}
                onChangeText={setTextoPrincipal}
                keyboardType="number-pad"
                placeholder={formatearColones(config.principalInicial)}
                placeholderTextColor={colors.labelTertiary}
              />
              <Text style={styles.etiquetaCampo}>Aporte planeado por quincena</Text>
              <TextInput
                style={styles.input}
                value={textoAporte}
                onChangeText={setTextoAporte}
                keyboardType="number-pad"
                placeholder={formatearColones(config.aportePeriodico)}
                placeholderTextColor={colors.labelTertiary}
              />
              <Text onPress={aplicarConfig} style={styles.botonGuardar}>
                Guardar
              </Text>
            </View>
          </Card>
        </View>

        {proyeccion ? (
          <View style={styles.seccion}>
            <SectionHeader titulo={`Proyección a ${HORIZONTE_ANIOS} años`} />
            <Card sinRelleno>
              <ListRow
                titulo="Total aportado"
                valor={formatearColones(proyeccion.totalAportado)}
              />
              <ListRow
                titulo="Ganancia proyectada"
                detalle={`Usando el ${formatearPorcentaje(metricas!.rendimientoAnual)} anual real de arriba`}
                valor={formatearColones(proyeccion.totalGanancia)}
                tono={proyeccion.totalGanancia >= 0 ? 'positivo' : 'negativo'}
              />
              <ListRow
                titulo="Valor final estimado"
                valor={formatearColones(proyeccion.valorFinal)}
                ultima
              />
            </Card>
          </View>
        ) : (
          <Text style={styles.avisoSinProyeccion}>
            La proyección aparece cuando haya al menos dos cotizaciones reales cargadas: sin eso no
            hay una tasa real con la que proyectar, y esta pantalla no inventa una.
          </Text>
        )}
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
  mensajeError: { ...typography.subheadline, color: colors.red, marginTop: spacing.sm },
  mensajeVacio: { ...typography.subheadline, color: colors.labelSecondary, marginTop: spacing.sm },
  formulario: { gap: spacing.md },
  etiquetaCampo: { ...typography.footnote, color: colors.labelSecondary },
  input: {
    ...typography.body,
    backgroundColor: colors.fill,
    borderRadius: radius.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
    color: colors.label,
  },
  botonGuardar: {
    ...typography.headline,
    color: colors.labelInverse,
    backgroundColor: colors.brandGold,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    textAlign: 'center',
    overflow: 'hidden',
  },
  avisoSinProyeccion: {
    ...typography.footnote,
    color: colors.labelSecondary,
    textAlign: 'center',
  },
});
