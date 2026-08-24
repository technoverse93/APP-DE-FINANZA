import { useCallback, useMemo, useState } from 'react';
import { debePedirColilla } from '../core/payroll/colilla';
import {
  distribuirQuincena,
  type DistribucionQuincenal,
  type GastosFijos,
} from '../core/payroll/distribution';
import { totalEnQuincena } from '../core/payroll/gastosFijos';
import { calcularIngresoDisponible } from '../core/payroll/ingresoDisponible';
import { previousPayday } from '../core/payroll/schedule';
import type { ContextoQuincena } from '../core/payroll/simulador';
import {
  calcularCostoTransporteProyectado,
  diasHabilesTransporte,
} from '../core/payroll/transporte';
import { pedirSincronizacion } from '../lib/backgroundSync';
import { useColilla } from './useColilla';
import { useGastosFijosItems } from './useGastosFijosItems';
import { useLibroMayor } from './useLibroMayor';
import { useQuincena } from './useQuincena';
import { useRutasTransporte } from './useRutasTransporte';
import { useTransacciones } from './useTransacciones';

/** Los gastos fijos ya vienen restados del ingreso disponible. */
const GASTOS_FIJOS_YA_APLICADOS: GastosFijos = { casa: 0, comida: 0, pases: 0, deudaBase: 0 };

/** ¿La fecha/hora ISO cae dentro de [inicio, fin)? */
function dentroDeVentana(fechaIso: string, inicio: Date, fin: Date): boolean {
  const t = new Date(fechaIso).getTime();
  return t >= inicio.getTime() && t < fin.getTime();
}

/**
 * Distribución real de la quincena en curso: ingreso disponible, reparto
 * contra la banda de seguridad y el remanente libre resultante.
 *
 * Se extrajo de `ResumenScreen` porque dejó de ser la única pantalla que lo
 * necesita: la Trituradora de Deudas ahora dimensiona el abono a una deuda
 * como un porcentaje de este mismo remanente libre (`distribucion.
 * abonoCapitalSugerido`), no de una cuota fija que el usuario tecleó aparte.
 * Sin este hook compartido, las dos pantallas habrían tenido que repetir la
 * misma cadena de cálculo y arriesgarse a que un día quedaran desincronizadas
 * — dos "verdades" del mismo remanente que no coinciden.
 */
export function useDistribucionQuincena() {
  const { payday } = useQuincena();
  const libro = useLibroMayor();
  const rutas = useRutasTransporte();
  const transacciones = useTransacciones();
  const colilla = useColilla(payday);
  const gastosFijosItems = useGastosFijosItems();

  const [sincronizando, setSincronizando] = useState(false);

  const sincronizar = useCallback(async () => {
    setSincronizando(true);
    try {
      await pedirSincronizacion();
      await Promise.all([
        gastosFijosItems.recargar(),
        libro.recargar(),
        rutas.recargar(),
        transacciones.recargar(),
      ]);
    } finally {
      setSincronizando(false);
    }
  }, [gastosFijosItems, libro, rutas, transacciones]);

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

  const gastosFijosRepartidos = useMemo(
    () => totalEnQuincena(gastosFijosItems.gastos, payday),
    [gastosFijosItems.gastos, payday],
  );

  const otrosGastosFijos = gastosFijosRepartidos;

  const ingresoDisponible = useMemo(
    () =>
      calcularIngresoDisponible({
        // La colilla confirmada, cuando existe, reemplaza al ingreso base
        // fijo: es el monto real depositado. Sin confirmar, se usa la base.
        ingresoBase: colilla.monto ?? undefined,
        ingresosExtra: ingresosExtraQuincena,
        transporteProyectado,
        gastosDiariosReales,
        otrosGastosFijos,
      }),
    [colilla.monto, ingresosExtraQuincena, transporteProyectado, gastosDiariosReales, otrosGastosFijos],
  );

  const distribucion: DistribucionQuincenal = useMemo(
    () => distribuirQuincena({ colilla: ingresoDisponible, gastosFijos: GASTOS_FIJOS_YA_APLICADOS }),
    [ingresoDisponible],
  );

  /** ¿Estamos dentro de los 2 días previos al pago (o el día mismo)? */
  const pedirColilla = useMemo(() => debePedirColilla(new Date(), payday), [payday]);

  const diasHabiles = useMemo(
    () => diasHabilesTransporte(inicioQuincena, payday.date),
    [inicioQuincena, payday],
  );

  /**
   * Tendencia del disponible.
   *
   * Todavía no se guarda el histórico de quincenas cerradas, así que la serie
   * se arma con los movimientos reales de ESTA quincena: el disponible que
   * habría quedado después de cada gasto anotado, en orden.
   */
  const tendenciaDisponible = useMemo(() => {
    const delPeriodo = libro.movimientos
      .filter((m) => dentroDeVentana(m.fecha, inicioQuincena, payday.date))
      .slice()
      .reverse();
    if (delPeriodo.length === 0) return [];

    const arranque = (colilla.monto ?? 170_000) - transporteProyectado - otrosGastosFijos;
    const serie = [arranque];
    let saldo = arranque;
    for (const m of delPeriodo) {
      saldo += m.tipo === 'ingreso' ? m.monto : -m.monto;
      serie.push(Math.round(saldo));
    }
    return serie;
  }, [libro.movimientos, inicioQuincena, payday, colilla.monto, transporteProyectado, otrosGastosFijos]);

  /** Contexto de la quincena, tal cual lo consume el simulador "qué pasaría si". */
  const contextoSimulador: ContextoQuincena = useMemo(
    () => ({ ingresosExtra: ingresosExtraQuincena, transporteProyectado, gastosDiariosReales, otrosGastosFijos }),
    [ingresosExtraQuincena, transporteProyectado, gastosDiariosReales, otrosGastosFijos],
  );

  return {
    payday,
    libro,
    rutas,
    transacciones,
    colilla,
    gastosFijosItems,
    sincronizando,
    sincronizar,
    inicioQuincena,
    ingresosExtraQuincena,
    gastosLibroQuincena,
    gastosTransaccionesQuincena,
    gastosDiariosReales,
    transporteProyectado,
    gastosFijosRepartidos,
    otrosGastosFijos,
    ingresoDisponible,
    distribucion,
    pedirColilla,
    diasHabiles,
    tendenciaDisponible,
    contextoSimulador,
  };
}
