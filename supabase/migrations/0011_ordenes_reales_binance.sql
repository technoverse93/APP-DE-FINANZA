-- Ejecución real de órdenes en Modo Real, vía la API de Binance (gratuita,
-- sin suscripción; el único costo es la comisión estándar de la red/exchange
-- por operación, que ya existía antes de esto).
--
-- El entorno por defecto es 'testnet': la Testnet pública de Binance usa
-- fondos ficticios contra la misma API real, así que permite validar todo el
-- flujo (firma de peticiones, símbolo, redondeo de cantidades) sin arriesgar
-- dinero real. Cambiar a 'mainnet' es una decisión explícita del dueño,
-- nunca el valor por defecto.
--
-- La orden sigue siendo 100% iniciada por el usuario desde la pantalla: la
-- Edge Function `binance-order` solo se invoca cuando se toca "Comprar" o
-- "Vender" en Modo Real. Nada en este esquema programa una ejecución
-- automática — el requerimiento original de que el motor de señales nunca
-- opere solo sigue intacto.

create type entorno_cripto_real as enum ('testnet', 'mainnet');

alter table crypto_config
  add column entorno_real entorno_cripto_real not null default 'testnet';

-- Bitácora de auditoría de cada orden real enviada al exchange: qué se pidió
-- y qué efectivamente se ejecutó, tal como respondió Binance. Es un rastro
-- de solo lectura para el usuario; la escribe únicamente la Edge Function
-- con la service role, nunca el cliente.
create table crypto_ordenes_reales (
  id                    uuid primary key default gen_random_uuid(),
  usuario_id            uuid not null references auth.users (id) on delete cascade,
  entorno               entorno_cripto_real not null,
  simbolo_exchange       text not null,
  lado                  tipo_movimiento_cripto not null,
  cantidad_solicitada   numeric(20, 10) not null check (cantidad_solicitada > 0),
  cantidad_ejecutada    numeric(20, 10) not null check (cantidad_ejecutada >= 0),
  precio_promedio       numeric(18, 8),
  orden_id_exchange     bigint,
  error                 text,
  creado_en             timestamptz not null default now()
);

create index crypto_ordenes_reales_usuario_idx on crypto_ordenes_reales (usuario_id, creado_en desc);

alter table crypto_ordenes_reales enable row level security;

create policy "dueño lee sus órdenes reales" on crypto_ordenes_reales
  for select
  using (auth.uid() = usuario_id);

comment on table crypto_ordenes_reales is
  'Auditoría de cada orden real enviada a Binance (testnet o mainnet). La inserta únicamente la Edge Function binance-order con la service role; el cliente solo tiene permiso de lectura.';
