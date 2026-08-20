/**
 * Cliente IMAP mínimo sobre TLS, escrito para el runtime Deno de las Edge
 * Functions de Supabase.
 *
 * Se implementa a mano en lugar de usar una librería de npm porque los
 * clientes IMAP de Node dependen de los módulos `net` y `tls`, que no existen
 * en Deno Deploy. Aquí se usa `Deno.connectTls`, que sí da un socket TLS real.
 *
 * Cubre el subconjunto del protocolo que necesita la app: autenticación
 * (PLAIN y XOAUTH2), SELECT, UID SEARCH, UID FETCH y LOGOUT.
 */

export type AuthMethod =
  /** Usuario y contraseña de aplicación. Es lo que admite Gmail. */
  | { readonly tipo: 'plain'; readonly usuario: string; readonly password: string }
  /** Token OAuth2. Es lo que exige Outlook desde que retiró la autenticación básica. */
  | { readonly tipo: 'xoauth2'; readonly usuario: string; readonly accessToken: string };

export interface ImapConfig {
  readonly host: string;
  readonly port: number;
  readonly auth: AuthMethod;
  /** Milisegundos máximos por operación de lectura. */
  readonly timeoutMs?: number;
}

import { parsearRespuestaFetch, type MensajeCrudo } from './message.ts';

export type { MensajeCrudo };

const CRLF = '\r\n';
const TIMEOUT_POR_DEFECTO = 30_000;

const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: false });

/** Servidores IMAP de los proveedores soportados. */
export const SERVIDORES = {
  gmail: { host: 'imap.gmail.com', port: 993 },
  outlook: { host: 'outlook.office365.com', port: 993 },
} as const;

export type Proveedor = keyof typeof SERVIDORES;

export class ImapError extends Error {
  constructor(
    message: string,
    readonly respuesta?: string,
  ) {
    super(message);
    this.name = 'ImapError';
  }
}

export class ImapClient {
  #conn: Deno.TlsConn;
  #buffer: Uint8Array = new Uint8Array(0);
  #contadorTag = 0;
  #timeoutMs: number;
  #cerrado = false;

  private constructor(conn: Deno.TlsConn, timeoutMs: number) {
    this.#conn = conn;
    this.#timeoutMs = timeoutMs;
  }

  static async connect(config: ImapConfig): Promise<ImapClient> {
    const conn = await Deno.connectTls({ hostname: config.host, port: config.port });
    const cliente = new ImapClient(conn, config.timeoutMs ?? TIMEOUT_POR_DEFECTO);
    // El servidor saluda antes de aceptar comandos.
    const saludo = await cliente.#readLine();
    if (!/^\* (OK|PREAUTH)/i.test(saludo)) {
      cliente.close();
      throw new ImapError('El servidor IMAP no envió un saludo válido', saludo);
    }
    await cliente.#autenticar(config.auth);
    return cliente;
  }

  /* ---------------------------------------------------------------------- */
  /* Transporte                                                             */
  /* ---------------------------------------------------------------------- */

  async #rellenarBuffer(): Promise<void> {
    const chunk = new Uint8Array(16 * 1024);
    const leido = await this.#conTimeout(this.#conn.read(chunk));
    if (leido === null) throw new ImapError('La conexión IMAP se cerró inesperadamente');
    const combinado = new Uint8Array(this.#buffer.length + leido);
    combinado.set(this.#buffer, 0);
    combinado.set(chunk.subarray(0, leido), this.#buffer.length);
    this.#buffer = combinado;
  }

  #conTimeout<T>(promesa: Promise<T>): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const id = setTimeout(
        () => reject(new ImapError(`Tiempo de espera agotado (${this.#timeoutMs} ms)`)),
        this.#timeoutMs,
      );
      promesa.then(
        (v) => {
          clearTimeout(id);
          resolve(v);
        },
        (e) => {
          clearTimeout(id);
          reject(e);
        },
      );
    });
  }

  /** Lee una línea completa terminada en CRLF, sin incluir el CRLF. */
  async #readLine(): Promise<string> {
    for (;;) {
      const corte = this.#indiceDeCrlf();
      if (corte !== -1) {
        const linea = decoder.decode(this.#buffer.subarray(0, corte));
        this.#buffer = this.#buffer.subarray(corte + 2);
        return linea;
      }
      await this.#rellenarBuffer();
    }
  }

  #indiceDeCrlf(): number {
    for (let i = 0; i + 1 < this.#buffer.length; i++) {
      if (this.#buffer[i] === 0x0d && this.#buffer[i + 1] === 0x0a) return i;
    }
    return -1;
  }

  /** Lee exactamente `n` bytes, usados por los literales `{n}` de IMAP. */
  async #readBytes(n: number): Promise<string> {
    while (this.#buffer.length < n) {
      await this.#rellenarBuffer();
    }
    const datos = this.#buffer.subarray(0, n);
    this.#buffer = this.#buffer.subarray(n);
    return decoder.decode(datos);
  }

  async #write(texto: string): Promise<void> {
    await this.#conTimeout(this.#conn.write(encoder.encode(texto)));
  }

  /* ---------------------------------------------------------------------- */
  /* Comandos                                                               */
  /* ---------------------------------------------------------------------- */

  #siguienteTag(): string {
    this.#contadorTag += 1;
    return `A${String(this.#contadorTag).padStart(4, '0')}`;
  }

  /**
   * Envía un comando y acumula las líneas de respuesta hasta la línea etiquetada
   * final. Los literales `{n}` se leen como bloque de `n` bytes.
   */
  async #comando(comando: string): Promise<string[]> {
    const tag = this.#siguienteTag();
    await this.#write(`${tag} ${comando}${CRLF}`);
    return await this.#leerHastaTag(tag);
  }

  async #leerHastaTag(tag: string): Promise<string[]> {
    const lineas: string[] = [];
    for (;;) {
      let linea = await this.#readLine();

      // Un literal anuncia cuántos bytes vienen a continuación.
      const literal = /\{(\d+)\}$/.exec(linea);
      if (literal) {
        const contenido = await this.#readBytes(Number(literal[1]));
        const resto = await this.#readLine();
        linea = `${linea.slice(0, literal.index)}${CRLF}${contenido}${resto}`;
      }

      lineas.push(linea);

      if (linea.startsWith(`${tag} `)) {
        const estado = linea.slice(tag.length + 1).trim();
        if (/^OK\b/i.test(estado)) return lineas;
        throw new ImapError(`El servidor rechazó el comando: ${estado}`, lineas.join('\n'));
      }
    }
  }

  async #autenticar(auth: AuthMethod): Promise<void> {
    if (auth.tipo === 'plain') {
      // SASL PLAIN (RFC 4616): NUL usuario NUL contraseña, en base64.
      const payload = btoa(`\0${auth.usuario}\0${auth.password}`);
      await this.#comando(`AUTHENTICATE PLAIN ${payload}`);
      return;
    }

    // XOAUTH2 según la especificación de Google y Microsoft:
    // "user=<correo>^Aauth=Bearer <token>^A^A", donde ^A es 0x01.
    const cadena = `user=${auth.usuario}\x01auth=Bearer ${auth.accessToken}\x01\x01`;
    const tag = this.#siguienteTag();
    await this.#write(`${tag} AUTHENTICATE XOAUTH2 ${btoa(cadena)}${CRLF}`);

    const primera = await this.#readLine();
    if (primera.startsWith('+')) {
      // Ante un fallo el servidor manda el detalle en base64 y espera una
      // línea vacía antes de emitir la respuesta etiquetada.
      await this.#write(CRLF);
      let detalle = primera;
      try {
        detalle = (await this.#leerHastaTag(tag)).join('\n');
      } catch (e) {
        if (e instanceof ImapError) detalle = e.respuesta ?? e.message;
      }
      throw new ImapError('XOAUTH2 rechazado por el servidor', detalle);
    }
    if (!primera.startsWith(`${tag} `) || !/\bOK\b/i.test(primera)) {
      throw new ImapError('XOAUTH2 rechazado por el servidor', primera);
    }
  }

  async selectMailbox(nombre = 'INBOX'): Promise<void> {
    await this.#comando(`SELECT "${nombre}"`);
  }

  /**
   * Busca por UID. `criterios` se concatena tal cual, por ejemplo
   * `['SINCE', '20-Aug-2026']`.
   */
  async uidSearch(criterios: readonly string[]): Promise<number[]> {
    const lineas = await this.#comando(`UID SEARCH ${criterios.join(' ')}`);
    const linea = lineas.find((l) => /^\* SEARCH/i.test(l));
    if (!linea) return [];
    return linea
      .replace(/^\* SEARCH/i, '')
      .trim()
      .split(/\s+/)
      .filter((t) => /^\d+$/.test(t))
      .map(Number);
  }

  /**
   * Descarga los mensajes indicados. Usa BODY.PEEK para no marcarlos como
   * leídos: la app no debe alterar el estado de la bandeja del usuario.
   */
  async uidFetch(uids: readonly number[]): Promise<MensajeCrudo[]> {
    if (uids.length === 0) return [];
    const lineas = await this.#comando(`UID FETCH ${uids.join(',')} (UID BODY.PEEK[])`);
    return parsearRespuestaFetch(lineas);
  }

  async logout(): Promise<void> {
    if (this.#cerrado) return;
    try {
      await this.#comando('LOGOUT');
    } catch {
      // Un LOGOUT fallido no debe tapar el error real de la sincronización.
    } finally {
      this.close();
    }
  }

  close(): void {
    if (this.#cerrado) return;
    this.#cerrado = true;
    try {
      this.#conn.close();
    } catch {
      // La conexión ya estaba cerrada.
    }
  }
}
