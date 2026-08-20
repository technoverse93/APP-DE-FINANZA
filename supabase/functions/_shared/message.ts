/**
 * Utilidades puras de mensajería IMAP/RFC 822.
 *
 * Viven separadas del cliente porque no dependen del runtime de Deno, lo que
 * permite probarlas bajo Jest junto con el resto de la lógica.
 */

export interface MensajeCrudo {
  readonly uid: number;
  readonly headers: Record<string, string>;
  readonly body: string;
}

const CRLF = '\r\n';


/**
 * Extrae los mensajes de una respuesta UID FETCH ya resuelta, es decir con los
 * literales sustituidos por su contenido.
 */
export function parsearRespuestaFetch(lineas: readonly string[]): MensajeCrudo[] {
  const mensajes: MensajeCrudo[] = [];
  for (const linea of lineas) {
    const encabezado = /^\* \d+ FETCH .*?\bUID (\d+)/i.exec(linea);
    if (!encabezado) continue;

    const marca = linea.indexOf('BODY[]');
    if (marca === -1) continue;
    const inicioCuerpo = linea.indexOf(CRLF, marca);
    if (inicioCuerpo === -1) continue;

    const crudo = linea.slice(inicioCuerpo + CRLF.length);
    mensajes.push({ uid: Number(encabezado[1]), ...separarHeadersYCuerpo(crudo) });
  }
  return mensajes;
}

/** Separa los encabezados del cuerpo en un mensaje RFC 822. */
export function separarHeadersYCuerpo(crudo: string): {
  headers: Record<string, string>;
  body: string;
} {
  const corte = crudo.search(/\r?\n\r?\n/);
  const bloqueHeaders = corte === -1 ? crudo : crudo.slice(0, corte);
  const body = corte === -1 ? '' : crudo.slice(corte).replace(/^\r?\n\r?\n/, '');

  const headers: Record<string, string> = {};
  // Se despliegan las continuaciones antes de partir por línea.
  const desplegado = bloqueHeaders.replace(/\r?\n[ \t]+/g, ' ');
  for (const linea of desplegado.split(/\r?\n/)) {
    const sep = linea.indexOf(':');
    if (sep === -1) continue;
    headers[linea.slice(0, sep).trim().toLowerCase()] = linea.slice(sep + 1).trim();
  }
  return { headers, body };
}

/** Formatea una fecha como la espera IMAP en los criterios SINCE/BEFORE. */
export function fechaImap(fecha: Date): string {
  const meses = [
    'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
  ];
  const dia = String(fecha.getUTCDate()).padStart(2, '0');
  return `${dia}-${meses[fecha.getUTCMonth()]}-${fecha.getUTCFullYear()}`;
}
