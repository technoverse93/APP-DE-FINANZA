-- Refresco periódico de cotizaciones de mercado.
--
-- Alpha Vantage limita el tier gratuito a 25 llamadas por día. Un refresco
-- cada 30 minutos como el del correo (0002) agotaría el cupo del día en un
-- rato: cada 4 horas son 6 llamadas diarias, con margen de sobra para
-- reintentos manuales sin acercarse al límite. Esto es honesto sobre lo que
-- ofrece un tier gratuito: cotizaciones reales, refrescadas periódicamente,
-- no un stream de precio en vivo tick a tick (eso requiere un plan pago).

create extension if not exists pg_cron;
create extension if not exists pg_net;

select cron.schedule(
  'refrescar-cotizaciones-cada-4-horas',
  '0 */4 * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_url_market_data'),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body    := jsonb_build_object('ticker', 'SPY')
  );
  $$
);

comment on extension pg_cron is
  'También programa refrescar-cotizaciones-cada-4-horas (ver migración 0004), además del polling de correo de la 0002.';
