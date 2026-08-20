/**
 * Motor de distribución quincenal.
 *
 * A partir del monto de la colilla se restan los gastos fijos, y el remanente
 * se reparte entre la reserva de seguridad de la siguiente quincena y el abono
 * a capital de la deuda.
 *
 * El umbral de seguridad es una banda de 170.000 a 175.000 colones que debe
 * quedar disponible para la quincena siguiente. Solo se abona a capital lo que
 * sobra por encima de esa banda.
 */

/** Piso de la banda de seguridad, en colones. */
export const SAFETY_MIN = 170_000;

/** Techo de la banda de seguridad, en colones. */
export const SAFETY_MAX = 175_000;

export interface SafetyBand {
  readonly min: number;
  readonly max: number;
}

export const DEFAULT_SAFETY_BAND: SafetyBand = { min: SAFETY_MIN, max: SAFETY_MAX };

/** Gastos fijos de la quincena, en colones. */
export interface GastosFijos {
  readonly casa: number;
  readonly comida: number;
  readonly pases: number;
  readonly deudaBase: number;
}

export type EstadoQuincena =
  /** El remanente no alcanza el piso de la banda de seguridad. */
  | 'deficit'
  /** El remanente cae dentro de la banda: se conserva completo, sin abono. */
  | 'ajustado'
  /** El remanente supera la banda: el excedente va a capital. */
  | 'holgado';

export interface DistribucionQuincenal {
  readonly colilla: number;
  readonly gastosFijos: GastosFijos;
  readonly totalGastosFijos: number;
  /** Colilla menos gastos fijos. */
  readonly remanente: number;
  /** Monto que se conserva para la siguiente quincena. */
  readonly reserva: number;
  /** Abono a capital recomendado. */
  readonly abonoCapitalSugerido: number;
  /**
   * Rango de abono posible: el mínimo conserva el techo de la banda y el
   * máximo conserva apenas el piso.
   */
  readonly abonoCapitalRango: { readonly min: number; readonly max: number };
  readonly estado: EstadoQuincena;
  /** Cuánto falta para alcanzar el piso de seguridad. 0 salvo en déficit. */
  readonly faltante: number;
  readonly banda: SafetyBand;
}

export interface DistribuirInput {
  readonly colilla: number;
  readonly gastosFijos: GastosFijos;
  readonly banda?: SafetyBand;
}

const CAMPOS_FIJOS: readonly (keyof GastosFijos)[] = ['casa', 'comida', 'pases', 'deudaBase'];

function assertMontoValido(valor: number, nombre: string): void {
  if (typeof valor !== 'number' || !Number.isFinite(valor)) {
    throw new TypeError(`${nombre} debe ser un número finito`);
  }
  if (valor < 0) {
    throw new RangeError(`${nombre} no puede ser negativo`);
  }
}

/** Los colones no se manejan en fracciones: se redondea a la unidad. */
function aColones(valor: number): number {
  return Math.round(valor);
}

export function totalGastosFijos(gastos: GastosFijos): number {
  return aColones(CAMPOS_FIJOS.reduce((suma, campo) => suma + gastos[campo], 0));
}

/**
 * Calcula la distribución de una quincena.
 *
 * @throws {TypeError} si algún monto no es un número finito.
 * @throws {RangeError} si algún monto es negativo o la banda es inconsistente.
 */
export function distribuirQuincena({
  colilla,
  gastosFijos,
  banda = DEFAULT_SAFETY_BAND,
}: DistribuirInput): DistribucionQuincenal {
  assertMontoValido(colilla, 'La colilla');
  for (const campo of CAMPOS_FIJOS) {
    assertMontoValido(gastosFijos[campo], `El gasto fijo "${campo}"`);
  }
  assertMontoValido(banda.min, 'El piso de la banda de seguridad');
  assertMontoValido(banda.max, 'El techo de la banda de seguridad');
  if (banda.min > banda.max) {
    throw new RangeError('El piso de la banda de seguridad no puede superar al techo');
  }

  const colillaRedondeada = aColones(colilla);
  const total = totalGastosFijos(gastosFijos);
  const remanente = colillaRedondeada - total;

  if (remanente < banda.min) {
    return {
      colilla: colillaRedondeada,
      gastosFijos,
      totalGastosFijos: total,
      remanente,
      // En déficit no hay nada que abonar: todo lo que quede se conserva.
      reserva: Math.max(remanente, 0),
      abonoCapitalSugerido: 0,
      abonoCapitalRango: { min: 0, max: 0 },
      estado: 'deficit',
      faltante: banda.min - remanente,
      banda,
    };
  }

  if (remanente <= banda.max) {
    return {
      colilla: colillaRedondeada,
      gastosFijos,
      totalGastosFijos: total,
      remanente,
      reserva: remanente,
      abonoCapitalSugerido: 0,
      abonoCapitalRango: { min: 0, max: remanente - banda.min },
      estado: 'ajustado',
      faltante: 0,
      banda,
    };
  }

  // Por defecto se conserva el techo de la banda, que es la postura más
  // protectora; abonar hasta el piso es la alternativa agresiva.
  const abonoConservador = remanente - banda.max;
  const abonoAgresivo = remanente - banda.min;

  return {
    colilla: colillaRedondeada,
    gastosFijos,
    totalGastosFijos: total,
    remanente,
    reserva: banda.max,
    abonoCapitalSugerido: abonoConservador,
    abonoCapitalRango: { min: abonoConservador, max: abonoAgresivo },
    estado: 'holgado',
    faltante: 0,
    banda,
  };
}

/**
 * Formatea un monto en colones costarricenses para mostrarlo en pantalla.
 *
 * La separación de miles se hace a mano en lugar de con `Intl`: Hermes, el
 * motor de JavaScript de React Native, trae soporte parcial de `Intl` y
 * `toLocaleString('es-CR')` devuelve separadores distintos según la build.
 */
export function formatearColones(monto: number): string {
  const signo = monto < 0 ? '-' : '';
  const digitos = String(Math.abs(aColones(monto)));
  const entero = digitos.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${signo}₡${entero}`;
}
