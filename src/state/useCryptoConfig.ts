import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type ModoCripto = 'simulacion' | 'real';

export interface CryptoConfig {
  readonly modo: ModoCripto;
  readonly moneda: string;
  readonly capitalVirtualInicial: number;
}

const CONFIG_VACIA: CryptoConfig = {
  modo: 'simulacion',
  moneda: 'bitcoin',
  capitalVirtualInicial: 500_000,
};

/** Configuración de cripto por usuario: modo activo, moneda seguida y capital
 * virtual de partida para el modo Simulación. Vive en `crypto_config`. */
export function useCryptoConfig() {
  const [config, setConfig] = useState<CryptoConfig>(CONFIG_VACIA);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('crypto_config')
        .select('modo, moneda, capital_virtual_inicial')
        .maybeSingle();
      if (e) throw e;
      if (data) {
        setConfig({
          modo: data.modo as ModoCripto,
          moneda: data.moneda as string,
          capitalVirtualInicial: Number(data.capital_virtual_inicial),
        });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo cargar la configuración de cripto');
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const guardar = useCallback(async (siguiente: CryptoConfig) => {
    setConfig(siguiente);
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) {
      setError('No hay sesión activa: no se puede guardar la configuración de cripto');
      return;
    }
    const { error: e } = await supabase.from('crypto_config').upsert(
      {
        usuario_id: user.id,
        modo: siguiente.modo,
        moneda: siguiente.moneda,
        capital_virtual_inicial: siguiente.capitalVirtualInicial,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: 'usuario_id' },
    );
    if (e) setError(e.message);
  }, []);

  return { config, cargando, error, guardar, recargar: cargar };
}
