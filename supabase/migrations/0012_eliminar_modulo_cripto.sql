-- Elimina por completo el módulo de cripto/trading (Simulación, Real, señales
-- y la integración con Binance): decisión explícita del dueño de no seguir
-- con esa funcionalidad. Revierte lo agregado en las migraciones 0009, 0010
-- y 0011.

-- El refresco periódico de precios ya no tiene sentido sin el módulo.
select cron.unschedule('refrescar-precios-cripto-cada-15-min');

drop table if exists crypto_ordenes_reales;
drop table if exists crypto_movimientos;
drop table if exists crypto_config;
drop table if exists crypto_data_runs;
drop table if exists crypto_precios;

drop type if exists entorno_cripto_real;
drop type if exists tipo_movimiento_cripto;
drop type if exists modo_cripto;
