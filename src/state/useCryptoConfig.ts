import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';

export type ModoCripto = 'simulacion' | 'real';

/**
 * Entorno de Modo Real: 'testnet' usa la Testnet pública de Binance (fondos
 * ficticios, misma API real) y es el valor por defecto para poder validar
 * todo el flujo sin arriesgar dinero. 'mainnet' es dinero real y solo se
 * activa si el usuario lo elige a propósito.
 */
export type EntornoReal = 'testnet' | 'mainnet';

export interface CryptoConfig {
  readonly modo: ModoCripto;
  readonly moneda: string;
  readonly capitalVirtualInicial: number;
  readonly entornoReal: EntornoReal;
}

const CONFIG_VACIA: CryptoConfig = {
  modo: 'simulacion',
  moneda: 'bitcoin',
  capitalVirtualInicial: 500_000,
  entornoReal: 'testnet',
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
        .select('modo, moneda, capital_virtual_inicial, entorno_real')
        .maybeSingle();
      if (e) throw e;
      if (data) {
        setConfig({
          modo: data.modo as ModoCripto,
          moneda: data.moneda as string,
          capitalVirtualInicial: Number(data.capital_virtual_inicial),
          entornoReal: data.entorno_real as EntornoReal,
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
        entorno_real: siguiente.entornoReal,
        actualizado_en: new Date().toISOString(),
      },
      { onConflict: 'usuario_id' },
    );
    if (e) setError(e.message);
  }, []);

  return { config, cargando, error, guardar, recargar: cargar };
}
