/**
 * Edge Function `gmail-sync`.
 *
 * A diferencia de `email-sync` (que corre por pg_cron sobre TODAS las
 * cuentas IMAP activas, de todos los usuarios), esta función la dispara el
 * propio teléfono a demanda, para el usuario que ya inició sesión: el
 * cliente hace el login de Google con `expo-auth-session`
 * (`src/lib/googleAuth.ts`) y manda acá el access token de Gmail; el JWT de
 * Supabase del usuario viaja solo, en el header Authorization, porque
 * `supabase.functions.invoke()` lo agrega automáticamente. La plataforma ya
 * valida ese JWT antes de dejar correr esta función (verify_jwt); acá se
 * vuelve a leer con `auth.getUser()` porque hace falta el `user.id` real
 * para identificar a quién pertenecen las transacciones que se insertan.
 *
 * Reusa el mismo parser y el mismo filtro del BAC que `email-sync`
 * (`_shared/parse.ts`): un mensaje de Gmail se normaliza al mismo
 * `CorreoCrudo` y pasa por `parsearCorreo`, así que la exclusión del BAC y
 * el reconocimiento de BCR/SINPE son exactamente el mismo código, no una
 * copia.
 *
 * El `message_id` que se guarda es el header `Message-ID` real del correo
 * (el mismo campo que usa `email-sync`), a propósito: si el usuario tiene
 * IMAP y Gmail configurados a la vez, el mismo correo cae bajo la misma
 * clave única (usuario_id, message_id) sin importar qué camino lo procesó
 * primero, y el segundo se descarta solo por `ignoreDuplicates`.
 */

import { createClient, type SupabaseClient } from 'jsr:@supabase/supabase-js@2';
import { decodeEncodedWords, htmlATexto, parsearCorreo, type CorreoCrudo } from '../_shared/parse.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const GMAIL_MENSAJES_URL = 'https://gmail.googleapis.com/gmail/v1/users/me/messages';

interface PeticionGmailSync {
  readonly googleAccessToken: string;
  /** Cuántos correos revisar en esta corrida. Por defecto 20. */
  readonly maxResultados?: number;
}

interface EncabezadoGmail {
  readonly name: string;
  readonly value: string;
}

interface ParteGmail {
  readonly mimeType?: string;
  readonly body?: { readonly data?: string };
}

interface MensajeGmail {
  readonly id: string;
  readonly internalDate?: string;
  readonly payload?: {
    readonly headers?: readonly EncabezadoGmail[];
    readonly body?: { readonly data?: string };
    readonly parts?: readonly ParteGmail[];
  };
}

interface ResumenGmailSync {
  mensajesVistos: number;
  insertadas: number;
  descartadasBac: number;
}

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== 'POST') return json({ error: 'Se espera POST' }, 405);

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return json({ error: 'Falta el encabezado Authorization' }, 401);

  const supabaseUsuario = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false },
  });
  const {
    data: { user },
    error: errorUsuario,
  } = await supabaseUsuario.auth.getUser();
  if (errorUsuario || !user) return json({ error: 'Sesión inválida' }, 401);

  const peticion: PeticionGmailSync = await req.json().catch(() => null);
  if (!peticion?.googleAccessToken) {
    return json({ error: 'Falta googleAccessToken' }, 400);
  }

  // Service role, igual que email-sync: la inserción en `transacciones` la
  // hace el servidor por el usuario ya identificado arriba, no el cliente
  // directamente contra PostgREST.
  const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  try {
    const resumen = await sincronizarGmail(supabaseAdmin, user.id, peticion);
    return json({ resumen });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : String(e) }, 500);
  }
});

async function sincronizarGmail(
  supabaseAdmin: SupabaseClient,
  usuarioId: string,
  peticion: PeticionGmailSync,
): Promise<ResumenGmailSync> {
  const maxResultados = peticion.maxResultados ?? 20;
  const query = encodeURIComponent('in:inbox newer_than:2d');
  const listUrl = `${GMAIL_MENSAJES_URL}?maxResults=${maxResultados}&q=${query}`;

  const listResp = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${peticion.googleAccessToken}` },
  });
  if (!listResp.ok) {
    throw new Error(`Gmail API (list) respondió ${listResp.status}: ${await listResp.text()}`);
  }
  const listado = (await listResp.json()) as { messages?: { id: string }[] };
  const ids = listado.messages ?? [];

  const resumen: ResumenGmailSync = { mensajesVistos: 0, insertadas: 0, descartadasBac: 0 };
  const filas: Record<string, unknown>[] = [];

  for (const { id } of ids) {
    resumen.mensajesVistos += 1;

    const msgResp = await fetch(`${GMAIL_MENSAJES_URL}/${id}?format=full`, {
      headers: { Authorization: `Bearer ${peticion.googleAccessToken}` },
    });
    if (!msgResp.ok) continue;

    const mensaje = (await msgResp.json()) as MensajeGmail;
    const correo = aCorreoCrudo(mensaje);
    const resultado = parsearCorreo(correo);

    if (!resultado.ok) {
      if (resultado.motivo === 'bac_excluido') resumen.descartadasBac += 1;
      continue;
    }

    const c = resultado.comprobante;
    filas.push({
      usuario_id: usuarioId,
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
    const { data, error } = await supabaseAdmin
      .from('transacciones')
      .upsert(filas, { onConflict: 'usuario_id,message_id', ignoreDuplicates: true })
      .select('id');
    if (error) throw new Error(error.message);
    resumen.insertadas = data?.length ?? 0;
  }

  return resumen;
}

function base64UrlAUtf8(data: string): string {
  const normal = data.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(normal);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder('utf-8').decode(bytes);
}

/** Junta el cuerpo del mensaje: texto plano si existe, si no el HTML a texto. */
function extraerCuerpo(payload: MensajeGmail['payload']): string {
  if (!payload) return '';
  if (payload.body?.data) return base64UrlAUtf8(payload.body.data);

  const partes = payload.parts ?? [];
  const textoPlano = partes.find((p) => p.mimeType === 'text/plain' && p.body?.data);
  if (textoPlano?.body?.data) return base64UrlAUtf8(textoPlano.body.data);

  const html = partes.find((p) => p.mimeType === 'text/html' && p.body?.data);
  if (html?.body?.data) return htmlATexto(base64UrlAUtf8(html.body.data));

  return '';
}

function aCorreoCrudo(mensaje: MensajeGmail): CorreoCrudo {
  const headers = mensaje.payload?.headers ?? [];
  const obtener = (nombre: string) =>
    headers.find((h) => h.name.toLowerCase() === nombre.toLowerCase())?.value ?? '';

  const fechaHeader = obtener('Date');
  const fecha = fechaHeader
    ? new Date(fechaHeader)
    : new Date(Number(mensaje.internalDate ?? Date.now()));

  return {
    // Mismo campo que usa email-sync (headers['message-id']): así, si el
    // mismo correo también llega por IMAP, cae en la misma fila.
    messageId: obtener('Message-ID') || `gmail-${mensaje.id}`,
    from: decodeEncodedWords(obtener('From')),
    subject: decodeEncodedWords(obtener('Subject')),
    body: extraerCuerpo(mensaje.payload),
    date: Number.isNaN(fecha.getTime()) ? new Date() : fecha,
  };
}

function json(cuerpo: unknown, status = 200): Response {
  return new Response(JSON.stringify(cuerpo), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
