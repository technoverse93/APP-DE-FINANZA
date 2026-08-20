-- Libro Mayor y deudas: lo que faltaba para la Trituradora de Deudas.
--
-- El calendario de pagos (13/28) y la distribución de la colilla contra
-- gastos_fijos ya existen desde la 0001; esto no los repite. Lo nuevo es:
--
--  - libro_mayor: gastos diarios e ingresos variables que el usuario anota a
--    mano. Es distinto de `transacciones` (eso es lo que captura el correo
--    automáticamente) y de `gastos_fijos` (montos recurrentes fijos).
--
--  - deudas: saldo más tasa de interés anual, el modelo que necesita el
--    proyector de amortización. `gastos_fijos.deuda_base` sigue siendo el
--    monto de pago mensual fijo; esto es el préstamo en sí.

create type tipo_movimiento_libro as enum ('gasto', 'ingreso');

create table libro_mayor (
  id           uuid primary key default gen_random_uuid(),
  usuario_id   uuid not null references auth.users (id) on delete cascade,
  tipo         tipo_movimiento_libro not null,
  monto        numeric(14, 2) not null check (monto > 0),
  descripcion  text not null default '',
  fecha        date not null default current_date,
  creado_en    timestamptz not null default now()
);

create index libro_mayor_usuario_fecha_idx on libro_mayor (usuario_id, fecha desc);

alter table libro_mayor enable row level security;

create policy "dueño gestiona su libro mayor" on libro_mayor
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

create table deudas (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references auth.users (id) on delete cascade,
  nombre          text not null,
  saldo_actual    numeric(14, 2) not null check (saldo_actual >= 0),
  -- Tasa nominal anual como fracción: 0.24 = 24% anual.
  tasa_anual      numeric(6, 4) not null check (tasa_anual >= 0),
  abono_objetivo  numeric(14, 2) not null default 0 check (abono_objetivo >= 0),
  creada_en       timestamptz not null default now(),
  actualizada_en  timestamptz not null default now()
);

alter table deudas enable row level security;

create policy "dueño gestiona sus deudas" on deudas
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);
