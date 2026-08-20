import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import { calcularSenal, type ResultadoSenal } from '../core/crypto/signals';
import type { Vela } from '../components/CandlestickChart';

interface EstadoPrecios {
  readonly velas: readonly Vela[];
  readonly cargando: boolean;
  readonly error: string | null;
}

/** Mínimo de cierres que exige calcularSenal con sus períodos por defecto (periodoLargo=21). */
const MINIMO_PRECIOS_PARA_SENAL = 21;

/**
 * Lee las velas reales ya cacheadas de `crypto_precios` para la moneda
 * configurada y deriva la señal de compra/venta sobre esos mismos cierres.
 *
 * Nunca llama a CoinGecko: eso lo hace exclusivamente la Edge Function
 * `crypto-data`. Este hook es de solo lectura contra Supabase, igual que
 * `useMarketData` para acciones.
 */
export function useCryptoData(moneda: string) {
  const [estado, setEstado] = useState<EstadoPrecios>({ velas: [], cargando: true, error: null });

  const cargar = useCallback(async () => {
    setEstado((actual) => ({ ...actual, cargando: true, error: null }));
    try {
      const { data, error } = await supabase
        .from('crypto_precios')
        .select('apertura, maximo, minimo, cierre')
        .eq('moneda', moneda)
        .order('momento', { ascending: true });
      if (error) throw error;

      const velas: Vela[] = (data ?? []).map((f) => ({
        apertura: Number(f.apertura),
        maximo: Number(f.maximo),
        minimo: Number(f.minimo),
        cierre: Number(f.cierre),
      }));

      setEstado({ velas, cargando: false, error: null });
    } catch (e) {
      setEstado({
        velas: [],
        cargando: false,
        error: e instanceof Error ? e.message : 'No se pudieron cargar los precios de cripto',
      });
    }
  }, [moneda]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const senal = useMemo<ResultadoSenal | null>(() => {
    if (estado.velas.length < MINIMO_PRECIOS_PARA_SENAL) return null;
    const cierres = estado.velas.map((v) => v.cierre);
    return calcularSenal(cierres);
  }, [estado.velas]);

  return { ...estado, senal, recargar: cargar };
}
