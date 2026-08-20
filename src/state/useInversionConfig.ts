import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export interface InversionConfig {
  readonly principalInicial: number;
  readonly aportePeriodico: number;
  readonly ticker: string;
}

const CONFIG_VACIA: InversionConfig = { principalInicial: 0, aportePeriodico: 0, ticker: 'SPY' };

/**
 * Configuración de inversión persistida en Supabase: cuánto capital ya está
 * invertido y cuánto se planea aportar cada quincena. Son datos reales que
 * declara el usuario, nunca un supuesto fijo en el código — por eso viven en
 * `inversion_config` y no como una constante.
 */
export function useInversionConfig() {
  const [config, setConfig] = useState<InversionConfig>(CONFIG_VACIA);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('inversion_config')
        .select('principal_inicial, aporte_periodico, ticker')
        .maybeSingle();
      if (e) throw e;
      if (data) {
        setConfig({
          principalInicial: Number(data.principal_inicial),
          aportePeriodico: Number(data.aporte_periodico),
          ticker: data.ticker as string,
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la configuración de inversión');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = useCallback(async (siguiente: InversionConfig) => {
    setConfig(siguiente);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('No hay sesión activa: no se puede guardar la configuración de inversión');
      return;
    }
    const { error: e } = await supabase.from('inversion_config').upsert(
      {
        usuario_id: user.id,
        principal_inicial: siguiente.principalInicial,
        aporte_periodico: siguiente.aportePeriodico,
        ticker: siguiente.ticker,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: 'usuario_id' },
    );
    if (e) setError(e.message);
  }, []);

  return { config, cargando, error, guardar, recargar: cargar };
}
