import { useCallback, useEffect, useState } from 'react';
import { supabase } from './supabase';
import {
  caidaMaxima,
  clasificarRiesgo,
  rendimientoAnualizado,
  retornosDesdesPrecios,
  volatilidadAnualizada,
  type NivelRiesgo,
} from '../core/investment/risk';

/** Cierres hábiles al año, para anualizar retornos diarios. */
const DIAS_HABILES_POR_ANIO = 252;

export interface CotizacionDiaria {
  readonly fecha: string;
  readonly cierre: number;
}

export interface MetricasMercado {
  readonly rendimientoAnual: number;
  readonly volatilidadAnual: number;
  readonly nivelRiesgo: NivelRiesgo;
  readonly caidaMaximaHistorica: number;
}

interface EstadoMercado {
  readonly cotizaciones: readonly CotizacionDiaria[];
  readonly metricas: MetricasMercado | null;
  readonly cargando: boolean;
  /**
   * Mensaje de error legible, o null. Nunca hay un estado "sin error pero sin
   * datos tampoco": si no hay cotizaciones reales, `cotizaciones` queda vacío
   * y la pantalla debe mostrarlo como tal, nunca rellenarlo con un ejemplo.
   */
  readonly error: string | null;
}

/**
 * Lee las cotizaciones ya cacheadas de `market_quotes` para un ticker y
 * calcula las métricas de riesgo/rendimiento sobre esos precios reales.
 *
 * Nunca llama a Alpha Vantage: eso lo hace exclusivamente la Edge Function
 * `market-data`, donde vive la clave. Este hook es de solo lectura contra
 * Supabase.
 */
export function useMarketData(ticker: string) {
  const [estado, setEstado] = useState<EstadoMercado>({
    cotizaciones: [],
    metricas: null,
    cargando: true,
    error: null,
  });

  const cargar = useCallback(async () => {
    setEstado((actual) => ({ ...actual, cargando: true, error: null }));
    try {
      const { data, error } = await supabase
        .from('market_quotes')
        .select('fecha, cierre')
        .eq('ticker', ticker)
        .order('fecha', { ascending: true });
      if (error) throw error;

      const cotizaciones: CotizacionDiaria[] = (data ?? []).map((f) => ({
        fecha: f.fecha as string,
        cierre: Number(f.cierre),
      }));

      const metricas = calcularMetricas(cotizaciones);
      setEstado({ cotizaciones, metricas, cargando: false, error: null });
    } catch (e) {
      setEstado({
        cotizaciones: [],
        metricas: null,
        cargando: false,
        error: e instanceof Error ? e.message : 'No se pudieron cargar los datos de mercado',
      });
    }
  }, [ticker]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  return { ...estado, recargar: cargar };
}

/** Devuelve null si no hay suficientes cotizaciones reales para calcular nada. */
function calcularMetricas(cotizaciones: readonly CotizacionDiaria[]): MetricasMercado | null {
  if (cotizaciones.length < 2) return null;

  const precios = cotizaciones.map((c) => c.cierre);
  const retornos = retornosDesdesPrecios(precios);

  return {
    rendimientoAnual: rendimientoAnualizado(retornos, DIAS_HABILES_POR_ANIO),
    volatilidadAnual: volatilidadAnualizada(retornos, DIAS_HABILES_POR_ANIO),
    nivelRiesgo: clasificarRiesgo(volatilidadAnualizada(retornos, DIAS_HABILES_POR_ANIO)),
    caidaMaximaHistorica: caidaMaxima(precios),
  };
}
