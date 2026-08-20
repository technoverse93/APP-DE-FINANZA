/**
 * Edge Function `email-sync`.
 *
 * Recorre las cuentas de correo activas, se conecta por IMAP a Gmail y a
 * Outlook simultáneamente, extrae los comprobantes del BCR y de SINPE, y los
 * guarda en `transacciones`. Los correos del BAC se descartan antes de
 * cualquier análisis.
 *
 * La ejecuta pg_cron cada 30 minutos (ver la migración 0002). Es idempotente:
 * la clave única (usuario_id, message_id) hace que releer la misma bandeja no
 * duplique transacciones, que es justamente lo que permite volver a pasar cada
 * media hora a la espera de los comprobantes atrasados del BCR.
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { ImapClient, SERVIDORES, type AuthMethod, type Proveedor } from '../_shared/imap.ts';
import { fechaImap, type MensajeCrudo } from '../_shared/message.ts';
import {
  decodeEncodedWords,
  decodeQuotedPrintable,
  htmlATexto,
  parsearCorreo,
  type CorreoCrudo,
} from '../_shared/parse.ts';

interface CuentaCorreo {
  id: string;
  usuario_id: string;
  proveedor: Proveedor;
  direccion: string;
  metodo_auth: 'plain' | 'xoauth2';
  host: string;
  puerto: number;
  secreto_ref: string;
}

interface PeticionSync {
  /** Limita la búsqueda a los correos del día en curso. */
  readonly soloHoy?: boolean;
  /** Restringe la corrida a una cuenta concreta. */
  readonly cuentaId?: string;
  readonly origen?: string;
}

interface ResumenCuenta {
  cuenta: string;
  proveedor: Proveedor;
  mensajesVistos: number;
  insertadas: number;
  descartadasBac: number;
  error?: string;
}

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') {
    return json({ error: 'Se espera POST' }, 405);
  }

  const peticion: PeticionSync = await req.json().catch(() => ({}));
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  let consulta = supabase.from('cuentas_correo').select('*').eq('activa', true);
  if (peticion.cuentaId) consulta = consulta.eq('id', peticion.cuentaId);

  const { data: cuentas, error } = await consulta;
  if (error) return json({ error: error.message }, 500);
  if (!cuentas?.length) return json({ resumen: [], mensaje: 'No hay cuentas activas' });

  // Gmail y Outlook se recorren en paralelo: son conexiones independientes y
  // el tiempo de la función lo domina la latencia de red.
  const resumen = await Promise.all(
    (cuentas as CuentaCorreo[]).map((cuenta) =>
      sincronizarCuenta(supabase, cuenta, peticion.soloHoy ?? true),
    ),
  );

  return json({ resumen });
});

async function sincronizarCuenta(
  supabase: SupabaseClient,
  cuenta: CuentaCorreo,
  soloHoy: boolean,
): Promise<ResumenCuenta> {
  const base: ResumenCuenta = {
    cuenta: cuenta.direccion,
    proveedor: cuenta.proveedor,
    mensajesVistos: 0,
    insertadas: 0,
    descartadasBac: 0,
  };

  const { data: corrida } = await supabase
    .from('corridas_sync')
    .insert({ usuario_id: cuenta.usuario_id, cuenta_id: cuenta.id })
    .select('id')
    .single();

  let cliente: ImapClient | null = null;
  try {
    const auth = await construirAuth(supabase, cuenta);
    const servidor = SERVIDORES[cuenta.proveedor];

    cliente = await ImapClient.connect({
      host: cuenta.host || servidor.host,
      port: cuenta.puerto || servidor.port,
      auth,
    });

    await cliente.selectMailbox('INBOX');

    // SINCE es inclusivo por fecha, así que "hoy" vuelve a traer todo lo del
    // día en cada pasada. Eso es intencional: un comprobante del BCR que
    // llegue con horas de retraso entra en la siguiente corrida de 30 minutos.
    const criterios = soloHoy ? ['SINCE', fechaImap(new Date())] : ['ALL'];
    const uids = await cliente.uidSearch(criterios);
    const mensajes = await cliente.uidFetch(uids);
    base.mensajesVistos = mensajes.length;

    const filas: Record<string, unknown>[] = [];
    for (const mensaje of mensajes) {
      const correo = aCorreoCrudo(mensaje);
      const resultado = parsearCorreo(correo);

      if (!resultado.ok) {
        if (resultado.motivo === 'bac_excluido') base.descartadasBac += 1;
        continue;
      }

      const c = resultado.comprobante;
      filas.push({
        usuario_id: cuenta.usuario_id,
        cuenta_id: cuenta.id,
        banco: c.banco,
        monto: c.monto,
        moneda: c.moneda,
        referencia: c.referencia,
        contraparte: c.contraparte,
        descripcion: c.descripcion,
        ocurrido_en: c.ocurridoEn.toISOString(),
        message_id: c.messageId,
      });
    }

    if (filas.length > 0) {
      // ignoreDuplicates deja pasar los correos ya registrados en corridas
      // anteriores sin convertir la repetición en un error.
      const { data, error: errorInsert } = await supabase
        .from('transacciones')
        .upsert(filas, { onConflict: 'usuario_id,message_id', ignoreDuplicates: true })
        .select('id');
      if (errorInsert) throw new Error(errorInsert.message);
      base.insertadas = data?.length ?? 0;
    }

    await cerrarCorrida(supabase, corrida?.id, base);
    return base;
  } catch (e) {
    base.error = e instanceof Error ? e.message : String(e);
    await cerrarCorrida(supabase, corrida?.id, base);
    return base;
  } finally {
    await cliente?.logout();
  }
}

async function cerrarCorrida(
  supabase: SupabaseClient,
  corridaId: string | undefined,
  resumen: ResumenCuenta,
): Promise<void> {
  if (!corridaId) return;
  await supabase
    .from('corridas_sync')
    .update({
      terminada_en: new Date().toISOString(),
      mensajes_vistos: resumen.mensajesVistos,
      insertadas: resumen.insertadas,
      descartadas_bac: resumen.descartadasBac,
      error: resumen.error ?? null,
    })
    .eq('id', corridaId);
}

/**
 * Resuelve la credencial desde Vault. Gmail usa contraseña de aplicación;
 * Outlook exige XOAUTH2 desde que Microsoft retiró la autenticación básica.
 *
 * Se lee vía RPC a `public.leer_secreto_vault` (migración 0006), no con
 * `.schema('vault').from('decrypted_secrets')`: PostgREST no expone el schema
 * `vault` por la API, ni siquiera con la service role key.
 */
async function construirAuth(
  supabase: SupabaseClient,
  cuenta: CuentaCorreo,
): Promise<AuthMethod> {
  const { data, error } = await supabase.rpc('leer_secreto_vault', {
    p_nombre: cuenta.secreto_ref,
  });

  if (error || !data) {
    throw new Error(`No se pudo leer el secreto "${cuenta.secreto_ref}" desde Vault`);
  }

  const secreto = data as string;
  return cuenta.metodo_auth === 'plain'
    ? { tipo: 'plain', usuario: cuenta.direccion, password: secreto }
    : { tipo: 'xoauth2', usuario: cuenta.direccion, accessToken: secreto };
}

/** Normaliza un mensaje IMAP al formato que entiende el parser. */
export function aCorreoCrudo(mensaje: MensajeCrudo): CorreoCrudo {
  const headers = mensaje.headers;
  const codificacion = (headers['content-transfer-encoding'] ?? '').toLowerCase();
  const tipo = headers['content-type'] ?? '';

  let cuerpo = mensaje.body;
  if (codificacion.includes('quoted-printable')) {
    cuerpo = decodeQuotedPrintable(cuerpo);
  } else if (codificacion.includes('base64')) {
    cuerpo = decodificarBase64Seguro(cuerpo);
  }
  if (/text\/html/i.test(tipo) || /<[a-z][\s\S]*>/i.test(cuerpo)) {
    cuerpo = htmlATexto(cuerpo);
  }

  const fecha = headers.date ? new Date(headers.date) : new Date();

  return {
    messageId: headers['message-id'] ?? `uid-${mensaje.uid}`,
    from: decodeEncodedWords(headers.from ?? ''),
    subject: decodeEncodedWords(headers.subject ?? ''),
    body: cuerpo,
    date: Number.isNaN(fecha.getTime()) ? new Date() : fecha,
  };
}

function decodificarBase64Seguro(texto: string): string {
  try {
    const bin = atob(texto.replace(/\s+/g, ''));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new TextDecoder('utf-8').decode(bytes);
  } catch {
    return texto;
  }
}

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
