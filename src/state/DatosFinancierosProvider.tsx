import { createContext, useContext, useEffect, useMemo, type ReactNode } from 'react';
import { actualizarRemanenteNativo } from '../../modules/entrada-rapida';
import { useDeudas, type Deuda } from './useDeudas';
import { useDistribucionQuincena } from './useDistribucionQuincena';

/**
 * Estado financiero global de la app.
 *
 * Hasta ahora `ResumenScreen` y `DeudasScreen` llamaban cada una por su lado a
 * `useDistribucionQuincena()` y a `useDeudas()`. Un hook no comparte estado
 * entre componentes: cada llamada crea su PROPIA copia, con su propia carga
 * de red. O sea que había dos libros mayores, dos listas de deudas y dos
 * remanentes distintos en memoria, y anotar un gasto en una pestaña dejaba a
 * la otra mostrando la cifra vieja hasta que se recargara sola.
 *
 * Con el acceso rápido (que vive fuera de las dos pantallas, sobre el dock)
 * eso dejaba de ser un detalle y pasaba a ser un bug garantizado: sería una
 * TERCERA copia, y guardar desde ahí no habría movido ni un número de las
 * pantallas. Por eso el estado se levanta acá una sola vez y las dos
 * pantallas —y el acceso rápido— consumen exactamente la misma instancia:
 * cuando la fila optimista entra al libro, los totales de todas se recalculan
 * en el mismo render.
 */

interface DatosFinancieros {
  readonly q: ReturnType<typeof useDistribucionQuincena>;
  readonly deudasHook: ReturnType<typeof useDeudas>;
  readonly deudas: readonly Deuda[];
}

const Contexto = createContext<DatosFinancieros | null>(null);

export function DatosFinancierosProvider({ children }: { children: ReactNode }) {
  const q = useDistribucionQuincena();
  const deudasHook = useDeudas();

  const remanenteLibre = Math.max(0, q.distribucion.abonoCapitalSugerido);

  /**
   * Deja el remanente escrito para el widget.
   *
   * El widget se dibuja fuera del proceso de React Native y no puede consultar
   * nada: solo muestra lo último que la app haya dejado en disco. Esto corre
   * cuando el número cambia de verdad —no en cada render— porque cada llamada
   * dispara además un redibujado del widget.
   */
  useEffect(() => {
    actualizarRemanenteNativo(remanenteLibre);
  }, [remanenteLibre]);

  const valor = useMemo<DatosFinancieros>(
    () => ({ q, deudasHook, deudas: deudasHook.deudas }),
    [q, deudasHook],
  );

  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

/**
 * Acceso al estado financiero compartido.
 *
 * Lanza si se usa fuera del proveedor: un componente que se monte por error
 * afuera vería datos vacíos para siempre y sin ninguna pista de por qué, que
 * es justo el tipo de fallo silencioso que cuesta horas encontrar.
 */
export function useDatosFinancieros(): DatosFinancieros {
  const valor = useContext(Contexto);
  if (!valor) {
    throw new Error('useDatosFinancieros debe usarse dentro de <DatosFinancierosProvider>');
  }
  return valor;
}
