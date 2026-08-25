import { Platform, requireOptionalNativeModule } from 'expo-modules-core';

/**
 * Entrada rápida nativa: widget de pantalla de inicio y ventana emergente por
 * botones físicos.
 *
 * `requireOptionalNativeModule` y no `requireNativeModule`: en Expo Go y en la
 * versión web no existe el binario nativo, y la variante estricta lanzaría al
 * importar, tumbando la app entera antes de pintar nada. Acá se degrada a
 * "funciones que no hacen nada", que es el comportamiento correcto en una
 * plataforma donde esto no puede existir.
 */
interface ModuloNativo {
  configurar(url: string, anonKey: string): void;
  guardarSesion(accessToken: string, refreshToken: string, usuarioId: string): void;
  limpiarSesion(): void;
  actualizarRemanente(remanente: number): void;
  mostrarMonto(): boolean;
  guardarMostrarMonto(mostrar: boolean): void;
  pendientes(): number;
  sincronizarPendientes(): Promise<number>;
  permisoSuperposicion(): boolean;
  accesibilidadActiva(): boolean;
  abrirAjustesSuperposicion(): void;
  abrirAjustesAccesibilidad(): void;
  abrirVentanaPrueba(): void;
}

const nativo = requireOptionalNativeModule<ModuloNativo>('EntradaRapida');

/** Solo existe en Android: en iOS y web las llamadas son inocuas. */
export const entradaRapidaDisponible = Platform.OS === 'android' && nativo !== null;

export function configurarEntradaRapida(url: string, anonKey: string): void {
  nativo?.configurar(url, anonKey);
}

export function guardarSesionNativa(
  accessToken: string,
  refreshToken: string,
  usuarioId: string,
): void {
  nativo?.guardarSesion(accessToken, refreshToken, usuarioId);
}

export function limpiarSesionNativa(): void {
  nativo?.limpiarSesion();
}

export function actualizarRemanenteNativo(remanente: number): void {
  nativo?.actualizarRemanente(remanente);
}

export function mostrarMontoEnWidget(): boolean {
  return nativo?.mostrarMonto() ?? true;
}

export function guardarMostrarMontoEnWidget(mostrar: boolean): void {
  nativo?.guardarMostrarMonto(mostrar);
}

export function movimientosPendientes(): number {
  return nativo?.pendientes() ?? 0;
}

export async function sincronizarPendientesNativos(): Promise<number> {
  return (await nativo?.sincronizarPendientes()) ?? 0;
}

export function tienePermisoSuperposicion(): boolean {
  return nativo?.permisoSuperposicion() ?? false;
}

export function tieneAccesibilidadActiva(): boolean {
  return nativo?.accesibilidadActiva() ?? false;
}

export function abrirAjustesSuperposicion(): void {
  nativo?.abrirAjustesSuperposicion();
}

export function abrirAjustesAccesibilidad(): void {
  nativo?.abrirAjustesAccesibilidad();
}

export function abrirVentanaPrueba(): void {
  nativo?.abrirVentanaPrueba();
}
