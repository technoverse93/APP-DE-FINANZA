-- Refresco periódico de precios de cripto.
--
-- El cripto cotiza 24/7, así que tiene sentido refrescarlo más seguido que
-- las acciones (cada 4 horas, migración 0004). La API pública de CoinGecko
-- sin key tolera bastante más que esto: cada 15 minutos son 96 llamadas al
-- día, lejos de cualquier límite práctico de su tier gratuito.

select cron.schedule(
  'refrescar-precios-cripto-cada-15-min',
  '*/15 * * * *',
  $$
  select net.http_post(
    url     := (select decrypted_secret from vault.decrypted_secrets where name = 'edge_url_crypto_data'),
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'service_role_key')
    ),
    body    := jsonb_build_object('moneda', 'bitcoin')
  );
  $$
);
