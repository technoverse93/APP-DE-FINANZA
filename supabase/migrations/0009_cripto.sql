-- Módulo de cripto: modo Simulación (papel) y modo Real, ambos alimentados
-- por precios reales de CoinGecko (API pública, sin key, sin suscripción).
--
-- "Modo Real" no ejecuta órdenes contra un exchange: eso requeriría una
-- cuenta y credenciales de trading reales, que esta sesión no tiene y que
-- por su propio riesgo financiero no se cablean sin autorización explícita
-- del dueño. Lo que separa los dos modos es de dónde sale la posición: en
-- Simulación la genera la propia app contra un capital virtual; en Real la
-- anota el usuario a mano, reflejando lo que efectivamente hizo en su propio
-- exchange — mismo patrón que el Libro Mayor para gastos. El motor de
-- señales (RSI + medias móviles) y el gráfico son iguales en ambos modos,
-- porque los dos usan los mismos precios reales de crypto_precios.

create type modo_cripto as enum ('simulacion', 'real');
create type tipo_movimiento_cripto as enum ('compra', 'venta');

/* -------------------------------------------------------------------------- */
/* Precios reales                                                             */
/* -------------------------------------------------------------------------- */

create table crypto_precios (
  id            uuid primary key default gen_random_uuid(),
  -- Id de moneda de CoinGecko, ej. 'bitcoin', 'ethereum'.
  moneda        text not null,
  momento       timestamptz not null,
  apertura      numeric(18, 8) not null check (apertura > 0),
  maximo        numeric(18, 8) not null check (maximo > 0),
  minimo        numeric(18, 8) not null check (minimo > 0),
  cierre        numeric(18, 8) not null check (cierre > 0),
  fuente        text not null default 'coingecko',
  capturado_en  timestamptz not null default now(),
  unique (moneda, momento)
);

create index crypto_precios_moneda_momento_idx on crypto_precios (moneda, momento desc);

alter table crypto_precios enable row level security;

create policy "cualquier usuario autenticado lee precios de cripto" on crypto_precios
  for select
  to authenticated
  using (true);

create table crypto_data_runs (
  id            uuid primary key default gen_random_uuid(),
  moneda        text not null,
  iniciada_en   timestamptz not null default now(),
  terminada_en  timestamptz,
  velas         integer not null default 0,
  error         text
);

alter table crypto_data_runs enable row level security;

create policy "cualquier usuario autenticado lee la bitácora de cripto" on crypto_data_runs
  for select
  to authenticated
  using (true);

/* -------------------------------------------------------------------------- */
/* Configuración y posiciones por usuario                                     */
/* -------------------------------------------------------------------------- */

create table crypto_config (
  usuario_id                uuid primary key references auth.users (id) on delete cascade,
  modo                      modo_cripto not null default 'simulacion',
  moneda                    text not null default 'bitcoin',
  capital_virtual_inicial   numeric(14, 2) not null default 500000 check (capital_virtual_inicial >= 0),
  actualizado_en            timestamptz not null default now()
);

alter table crypto_config enable row level security;

create policy "dueño gestiona su configuración de cripto" on crypto_config
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

create table crypto_movimientos (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references auth.users (id) on delete cascade,
  modo            modo_cripto not null,
  moneda          text not null,
  tipo            tipo_movimiento_cripto not null,
  cantidad        numeric(20, 10) not null check (cantidad > 0),
  precio_unitario numeric(18, 8) not null check (precio_unitario > 0),
  creado_en       timestamptz not null default now()
);

create index crypto_movimientos_usuario_idx on crypto_movimientos (usuario_id, modo, creado_en desc);

alter table crypto_movimientos enable row level security;

create policy "dueño gestiona sus movimientos de cripto" on crypto_movimientos
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

comment on table crypto_movimientos is
  'Compras/ventas por modo. En simulación las crea la propia app contra el capital virtual; en real las anota el usuario a mano — esta tabla nunca la llena una ejecución automática de órdenes.';
