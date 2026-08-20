-- Cotizaciones de mercado reales, cacheadas server-side.
--
-- No son datos por usuario: son el mismo precio de cierre para cualquiera
-- que abra la app, así que la tabla es de lectura pública para usuarios
-- autenticados y de escritura exclusiva del service role (la Edge Function
-- market-data), igual que corridas_sync.

create table market_quotes (
  id           uuid primary key default gen_random_uuid(),
  ticker       text not null,
  fecha        date not null,
  cierre       numeric(14, 4) not null check (cierre > 0),
  fuente       text not null default 'alpha_vantage',
  capturado_en timestamptz not null default now(),
  unique (ticker, fecha)
);

create index market_quotes_ticker_fecha_idx
  on market_quotes (ticker, fecha desc);

comment on table market_quotes is
  'Cierres diarios reales de la API de mercado. Nunca se escribe un valor simulado o de relleno aquí.';

alter table market_quotes enable row level security;

create policy "cualquier usuario autenticado lee las cotizaciones" on market_quotes
  for select
  to authenticated
  using (true);

-- Bitácora de las corridas de market-data, para diagnosticar sin adivinar
-- (mismo patrón que corridas_sync para el correo).
create table market_data_runs (
  id             uuid primary key default gen_random_uuid(),
  ticker         text not null,
  iniciada_en    timestamptz not null default now(),
  terminada_en   timestamptz,
  cotizaciones   integer not null default 0,
  error          text
);

alter table market_data_runs enable row level security;

create policy "cualquier usuario autenticado lee la bitácora de mercado" on market_data_runs
  for select
  to authenticated
  using (true);
