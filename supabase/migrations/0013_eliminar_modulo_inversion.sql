-- Elimina por completo el módulo de Inversión (SPY/S&P 500 vía Alpha
-- Vantage): decisión explícita del dueño. Revierte lo agregado en las
-- migraciones 0003, 0004 y 0005.
--
-- No se toca la migración 0006 (leer_secreto_vault): esa función es
-- compartida — email-sync sigue dependiendo de ella para sus propios
-- secretos. Tampoco se deshabilitan las extensiones pg_cron/pg_net: el
-- polling de correo (migración 0002) las sigue usando.

select cron.unschedule('refrescar-cotizaciones-cada-4-horas');

drop table if exists inversion_config;
drop table if exists market_data_runs;
drop table if exists market_quotes;
