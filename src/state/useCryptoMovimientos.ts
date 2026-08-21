import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../lib/supabase';
import {
  calcularEstadoBilletera,
  puedeComprar,
  puedeVender,
  type EstadoBilletera,
  type MovimientoCripto,
  type TipoMovimientoCripto,
} from '../core/crypto/paperTrading';
import type { EntornoReal, ModoCripto } from './useCryptoConfig';

interface MovimientoRegistrado extends MovimientoCripto {
  readonly id: string;
  readonly creadoEn: string;
}

/**
 * Movimientos de cripto por modo, en `crypto_movimientos`, y la billetera
 * derivada de ellos con `calcularEstadoBilletera`.
 *
 * En Simulación el capital de partida es virtual y esta capa lo hace
 * cumplir (`puedeComprar`/`puedeVender` bloquean lo que excede la
 * billetera): el usuario elige la cantidad y el precio, y el movimiento se
 * guarda directo.
 *
 * En Real, comprar/vender invoca la Edge Function `binance-order`, que
 * envía una orden de mercado real a Binance (testnet o mainnet según
 * `entornoReal`) y, si se ejecuta, inserta ella misma el movimiento con el
 * precio real de llenado — nunca con un precio que el usuario haya
 * tecleado. Sigue siendo 100% iniciado por el usuario: esta función solo
 * corre cuando se toca "Comprar"/"Vender" en la pantalla.
 */
export function useCryptoMovimientos(
  modo: ModoCripto,
  moneda: string,
  capitalVirtualInicial: number,
  entornoReal: EntornoReal,
) {
  const [movimientos, setMovimientos] = useState<MovimientoRegistrado[]>([]);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data, error: e } = await supabase
        .from('crypto_movimientos')
        .select('id, tipo, cantidad, precio_unitario, creado_en')
        .eq('modo', modo)
        .eq('moneda', moneda)
        .order('creado_en', { ascending: true });
      if (e) throw e;
      setMovimientos(
        (data ?? []).map((m) => ({
          id: m.id as string,
          tipo: m.tipo as TipoMovimientoCripto,
          cantidad: Number(m.cantidad),
          precioUnitario: Number(m.precio_unitario),
          creadoEn: m.creado_en as string,
        })),
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudieron cargar los movimientos de cripto');
    } finally {
      setCargando(false);
    }
  }, [modo, moneda]);

  useEffect(() => {
    void cargar();
  }, [cargar]);

  const estado = useMemo<EstadoBilletera>(
    () => calcularEstadoBilletera(modo === 'simulacion' ? capitalVirtualInicial : 0, movimientos),
    [modo, capitalVirtualInicial, movimientos],
  );

  const registrarSimulado = useCallback(
    async (tipo: TipoMovimientoCripto, cantidad: number, precioUnitario: number) => {
      const permitido =
        tipo === 'compra' ? puedeComprar(estado, cantidad, precioUnitario) : puedeVender(estado, cantidad);
      if (!permitido) {
        setError(
          tipo === 'compra'
            ? 'El capital virtual disponible no alcanza para esa compra'
            : 'No hay suficiente posición virtual para vender esa cantidad',
        );
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError('No hay sesión activa: no se puede registrar el movimiento');
        return;
      }
      const { error: e } = await supabase.from('crypto_movimientos').insert({
        usuario_id: user.id,
        modo,
        moneda,
        tipo,
        cantidad,
        precio_unitario: precioUnitario,
      });
      if (e) {
        setError(e.message);
        return;
      }
      await cargar();
    },
    [modo, moneda, estado, cargar],
  );

  const registrarReal = useCallback(
    async (tipo: TipoMovimientoCripto, cantidad: number) => {
      setError(null);
      const { data, error: e } = await supabase.functions.invoke('binance-order', {
        body: { entorno: entornoReal, moneda, lado: tipo, cantidad },
      });
      if (e) {
        setError(e.message ?? 'No se pudo enviar la orden a Binance');
        return;
      }
      if (data?.error) {
        setError(data.error as string);
        return;
      }
      await cargar();
    },
    [moneda, entornoReal, cargar],
  );

  const comprar = useCallback(
    (cantidad: number, precioUnitario?: number) =>
      modo === 'simulacion' ? registrarSimulado('compra', cantidad, precioUnitario ?? 0) : registrarReal('compra', cantidad),
    [modo, registrarSimulado, registrarReal],
  );
  const vender = useCallback(
    (cantidad: number, precioUnitario?: number) =>
      modo === 'simulacion' ? registrarSimulado('venta', cantidad, precioUnitario ?? 0) : registrarReal('venta', cantidad),
    [modo, registrarSimulado, registrarReal],
  );

  return { movimientos, estado, cargando, error, comprar, vender, recargar: cargar };
}
