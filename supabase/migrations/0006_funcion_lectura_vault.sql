-- Lectura de secretos de Vault desde las Edge Functions.
--
-- `supabase.schema('vault').from('decrypted_secrets')` desde el cliente JS no
-- funciona: PostgREST (la capa que atiende esas llamadas, incluso con la
-- service role key) solo expone los schemas configurados como "exposed
-- schemas" en la API del proyecto, y `vault` no es uno de ellos por diseño.
-- Confirmado en runtime: la Edge Function `market-data` devolvía "no se pudo
-- leer el secreto" aunque el secreto existía y se descifraba bien por SQL
-- directo.
--
-- El patrón soportado es una función en `public` que sí corre dentro de la
-- base (con SECURITY DEFINER) y expone el resultado ya leído, invocable por
-- RPC desde el cliente JS. Solo el service role puede ejecutarla: se revoca
-- el permiso por defecto a PUBLIC y se otorga explícitamente.

create function public.leer_secreto_vault(p_nombre text)
returns text
language sql
security definer
set search_path = ''
as $$
  select decrypted_secret
  from vault.decrypted_secrets
  where name = p_nombre;
$$;

revoke execute on function public.leer_secreto_vault(text) from public;
grant execute on function public.leer_secreto_vault(text) to service_role;

comment on function public.leer_secreto_vault(text) is
  'Lee un secreto de Vault por nombre. Solo ejecutable por el service role; las Edge Functions lo llaman vía supabase.rpc(...) en vez de leer el schema vault directamente, que PostgREST no expone.';
