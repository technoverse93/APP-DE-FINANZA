-- Polling de correos cada 30 minutos.
--
-- El intervalo se programa en el servidor con pg_cron en lugar de dejarlo al
-- dispositivo: ni Android ni iOS garantizan que una tarea en segundo plano
-- corra a intervalos exactos, y los comprobantes del BCR llegan con retraso.
-- El cron es la fuente de verdad; la app además puede disparar la función a
-- mano al abrirse.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- La función se invoca con la service role key, guardada en Vault y nunca
-- expuesta al cliente.
select cron.schedule(
  'sincronizar-correos-cada-30-min',
  '*/30 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_url_email_sync'),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body    := jsonb_build_object('origen', 'cron', 'soloHoy', true)
  );
  $$
);

comment on extension pg_cron is
  'Programa la sincronización de correos cada 30 minutos (ver job sincronizar-correos-cada-30-min).';
