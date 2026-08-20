-- La 0006 revocó EXECUTE de PUBLIC en leer_secreto_vault, pero Supabase
-- otorga EXECUTE en cada función nueva de `public` directamente a los roles
-- `anon` y `authenticated` vía ALTER DEFAULT PRIVILEGES del proyecto —
-- revocar de PUBLIC no alcanza a un grant directo ya hecho a esos roles.
-- Confirmado con Supabase Advisors: la función seguía siendo ejecutable por
-- ambos vía /rest/v1/rpc/leer_secreto_vault, lo que dejaría leer CUALQUIER
-- secreto de Vault (incluida la service role key) a cualquier cliente
-- autenticado o incluso anónimo.

revoke execute on function public.leer_secreto_vault(text) from anon, authenticated;
