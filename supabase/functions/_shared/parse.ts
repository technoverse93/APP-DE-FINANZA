/**
 * Extracción de comprobantes bancarios desde correos.
 *
 * Este módulo es TypeScript puro, sin APIs de Deno ni de React Native, para
 * que la misma lógica corra dentro de la Edge Function y bajo Jest.
 *
 * Alcance deliberado: solo se procesan comprobantes del BCR y de SINPE. Todo
 * lo que provenga del BAC se descarta antes de cualquier otro análisis.
 */

export type Banco = 'BCR' | 'SINPE' | 'DESCONOCIDO';

export interface CorreoCrudo {
  readonly messageId: string;
  readonly from: string;
  readonly subject: string;
  readonly body: string;
  /** Fecha del encabezado Date del correo. */
  readonly date: Date;
}

export interface Comprobante {
  readonly messageId: string;
  readonly banco: Exclude<Banco, 'DESCONOCIDO'>;
  readonly monto: number;
  readonly moneda: 'CRC' | 'USD';
  readonly referencia: string | null;
  readonly contraparte: string | null;
  readonly descripcion: string;
  readonly ocurridoEn: Date;
}

export type ResultadoParseo =
  | { readonly ok: true; readonly comprobante: Comprobante }
  | { readonly ok: false; readonly motivo: MotivoDescarte; readonly detalle?: string };

export type MotivoDescarte =
  | 'bac_excluido'
  | 'banco_no_reconocido'
  | 'sin_monto'
  | 'monto_invalido';

/* -------------------------------------------------------------------------- */
/* Decodificación MIME                                                        */
/* -------------------------------------------------------------------------- */

/** Decodifica quoted-printable (RFC 2045). */
export function decodeQuotedPrintable(input: string): string {
  const sinSoftBreaks = input.replace(/=\r?\n/g, '');
  const bytes: number[] = [];
  for (let i = 0; i < sinSoftBreaks.length; i++) {
    const ch = sinSoftBreaks[i];
    if (ch === '=' && /^[0-9A-Fa-f]{2}$/.test(sinSoftBreaks.slice(i + 1, i + 3))) {
      bytes.push(parseInt(sinSoftBreaks.slice(i + 1, i + 3), 16));
      i += 2;
    } else {
      for (const b of new TextEncoder().encode(ch)) bytes.push(b);
    }
  }
  return new TextDecoder('utf-8').decode(new Uint8Array(bytes));
}

function base64ToUtf8(input: string): string {
  const limpio = input.replace(/\s+/g, '');
  const bin = atob(limpio);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

/** Decodifica encoded-words de encabezados: `=?UTF-8?B?...?=` (RFC 2047). */
export function decodeEncodedWords(input: string): string {
  return input.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (_todo, _charset: string, codificacion: string, texto: string) => {
      try {
        if (codificacion.toUpperCase() === 'B') return base64ToUtf8(texto);
        return decodeQuotedPrintable(texto.replace(/_/g, ' '));
      } catch {
        return texto;
      }
    },
  );
}

/** Convierte HTML a texto plano conservando la separación entre bloques. */
export function htmlATexto(html: string): string {
  return html
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/(p|div|tr|td|th|li|h[1-6]|table)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_m, d: string) => String.fromCodePoint(Number(d)))
    .replace(/[ \t ]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{2,}/g, '\n')
    .trim();
}

/* -------------------------------------------------------------------------- */
/* Filtro de banco                                                            */
/* -------------------------------------------------------------------------- */

/**
 * Marcadores del BAC. El filtro es absoluto: si alguno aparece en el remitente,
 * el asunto o el cuerpo, el correo se descarta sin analizarse.
 *
 * `\bBAC\b` usa límites de palabra para no capturar palabras que contengan las
 * letras (por ejemplo "BACK" o "tabaco").
 */
const MARCADORES_BAC: readonly RegExp[] = [
  /baccredomatic\.com/i,
  /\bbac\s+credomatic\b/i,
  /\bbac\s+san\s+jos[eé]\b/i,
  /\bbanco\s+bac\b/i,
  /\bBAC\b/,
];

const MARCADORES_BCR: readonly RegExp[] = [
  /bancobcr\.(com|fi\.cr)/i,
  /\bbanco\s+de\s+costa\s+rica\b/i,
  /\bBCR\b/,
];

const MARCADORES_SINPE: readonly RegExp[] = [/\bsinpe\b/i, /\bsinpe\s*m[oó]vil\b/i];

/** ¿El correo proviene del BAC? Se evalúa sobre remitente, asunto y cuerpo. */
export function esDelBac(correo: Pick<CorreoCrudo, 'from' | 'subject' | 'body'>): boolean {
  const universo = `${correo.from}\n${correo.subject}\n${correo.body}`;
  return MARCADORES_BAC.some((re) => re.test(universo));
}

export function detectarBanco(correo: Pick<CorreoCrudo, 'from' | 'subject' | 'body'>): Banco {
  const universo = `${correo.from}\n${correo.subject}\n${correo.body}`;
  if (MARCADORES_BCR.some((re) => re.test(universo))) return 'BCR';
  if (MARCADORES_SINPE.some((re) => re.test(universo))) return 'SINPE';
  return 'DESCONOCIDO';
}

/* -------------------------------------------------------------------------- */
/* Montos                                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Interpreta un monto escrito en cualquiera de las convenciones que usan los
 * bancos costarricenses: `25,000.00` (coma de miles) y `25.000,00` (punto de
 * miles) conviven en los mismos correos según la plantilla.
 *
 * Cuando aparecen ambos separadores, el último es el decimal. Cuando aparece
 * uno solo, se asume decimal si deja exactamente dos dígitos al final y no se
 * repite; en cualquier otro caso es separador de miles.
 */
export function parseMontoCR(raw: string): number | null {
  // Se recortan los separadores de los extremos: el punto final de la oración
  // que sigue al monto en los correos del banco entra en la captura.
  const limpio = raw.replace(/[^\d.,]/g, '').replace(/^[.,]+/, '').replace(/[.,]+$/, '');
  if (!limpio || !/\d/.test(limpio)) return null;

  const ultimaComa = limpio.lastIndexOf(',');
  const ultimoPunto = limpio.lastIndexOf('.');

  let normalizado: string;
  if (ultimaComa !== -1 && ultimoPunto !== -1) {
    const decimal = ultimaComa > ultimoPunto ? ',' : '.';
    const miles = decimal === ',' ? '.' : ',';
    normalizado = limpio.split(miles).join('').replace(decimal, '.');
  } else if (ultimaComa !== -1 || ultimoPunto !== -1) {
    const sep = ultimaComa !== -1 ? ',' : '.';
    const partes = limpio.split(sep);
    const esDecimal = partes.length === 2 && partes[1].length === 2;
    normalizado = esDecimal ? `${partes[0]}.${partes[1]}` : partes.join('');
  } else {
    normalizado = limpio;
  }

  const valor = Number(normalizado);
  return Number.isFinite(valor) ? valor : null;
}

const RE_MONTO_CRC =
  /(?:₡|¢|CRC|colones)\s*([\d][\d.,]*)|([\d][\d.,]*)\s*(?:₡|¢|CRC|colones)/i;
const RE_MONTO_USD = /(?:\$|USD|d[oó]lares)\s*([\d][\d.,]*)|([\d][\d.,]*)\s*(?:USD|d[oó]lares)/i;

export function extraerMonto(texto: string): { monto: number; moneda: 'CRC' | 'USD' } | null {
  const crc = RE_MONTO_CRC.exec(texto);
  if (crc) {
    const monto = parseMontoCR(crc[1] ?? crc[2] ?? '');
    if (monto !== null) return { monto, moneda: 'CRC' };
  }
  const usd = RE_MONTO_USD.exec(texto);
  if (usd) {
    const monto = parseMontoCR(usd[1] ?? usd[2] ?? '');
    if (monto !== null) return { monto, moneda: 'USD' };
  }
  return null;
}

const RE_REFERENCIA =
  /(?:referencia|comprobante|documento|n[uú]mero de (?:transacci[oó]n|operaci[oó]n))\s*[:#]?\s*([A-Za-z0-9-]{4,})/i;

const RE_CONTRAPARTE =
  /(?:^|\n)\s*(?:para|a nombre de|beneficiario|destinatario|de|origen)\s*[:]\s*([^\n]{2,80})/i;

export function extraerReferencia(texto: string): string | null {
  const m = RE_REFERENCIA.exec(texto);
  return m ? m[1].trim() : null;
}

export function extraerContraparte(texto: string): string | null {
  const m = RE_CONTRAPARTE.exec(texto);
  if (!m) return null;
  const valor = m[1].trim().replace(/\s{2,}/g, ' ');
  return valor.length > 0 ? valor : null;
}

/* -------------------------------------------------------------------------- */
/* Parseo principal                                                           */
/* -------------------------------------------------------------------------- */

/**
 * Convierte un correo en un comprobante, o explica por qué se descarta.
 *
 * El orden importa: el filtro del BAC corre primero y de forma incondicional,
 * antes de cualquier intento de reconocer el banco o el monto.
 */
export function parsearCorreo(correo: CorreoCrudo): ResultadoParseo {
  if (esDelBac(correo)) {
    return { ok: false, motivo: 'bac_excluido' };
  }

  const banco = detectarBanco(correo);
  if (banco === 'DESCONOCIDO') {
    return { ok: false, motivo: 'banco_no_reconocido' };
  }

  const texto = `${correo.subject}\n${correo.body}`;
  const encontrado = extraerMonto(texto);
  if (!encontrado) {
    return { ok: false, motivo: 'sin_monto' };
  }
  if (encontrado.monto <= 0) {
    return { ok: false, motivo: 'monto_invalido', detalle: String(encontrado.monto) };
  }

  return {
    ok: true,
    comprobante: {
      messageId: correo.messageId,
      banco,
      monto: encontrado.monto,
      moneda: encontrado.moneda,
      referencia: extraerReferencia(texto),
      contraparte: extraerContraparte(texto),
      descripcion: correo.subject.trim(),
      ocurridoEn: correo.date,
    },
  };
}
