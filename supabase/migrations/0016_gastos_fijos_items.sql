-- Gastos fijos como filas individuales con regla de reparto entre quincenas.
--
-- La tabla `gastos_fijos` (migración 0001) es una sola fila por usuario con
-- columnas rígidas (casa/comida/pases/deuda_base) y sin forma de expresar en
-- QUÉ quincena cae cada monto: se aplicaba igual a las dos. Un alquiler de
-- 150.000 al mes no son 150.000 por quincena.
--
-- No se borra `gastos_fijos`: sigue existiendo con los datos ya cargados, y
-- el cliente migra a esta tabla. Borrarla sería destructivo sobre datos
-- reales del usuario, y esta convive sin conflicto.
--
-- Modos de reparto (ver src/core/payroll/gastosFijos.ts):
--   mitades       -> el monto mensual se parte entre las dos quincenas.
--   quincena_fija -> todo el monto en la quincena de `dia_nominal` (13 o 28).
--   diferido      -> todo el monto en la fecha de pago `fecha_diferida`, y en
--                    ninguna otra. Es lo que permite posponer un gasto a una
--                    quincena futura concreta.

create type modo_reparto_gasto as enum ('mitades', 'quincena_fija', 'diferido');

create table gastos_fijos_items (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references auth.users (id) on delete cascade,
  nombre          text not null,
  monto_mensual   numeric(14, 2) not null check (monto_mensual >= 0),
  modo            modo_reparto_gasto not null default 'mitades',
  -- Solo se usa con modo 'quincena_fija'.
  dia_nominal     smallint check (dia_nominal in (13, 28)),
  -- Solo se usa con modo 'diferido'. Es la fecha REAL de pago (ya corrida al
  -- viernes si el 13/28 caía fin de semana), no el día nominal.
  fecha_diferida  date,
  activo          boolean not null default true,
  creado_en       timestamptz not null default now(),
  actualizado_en  timestamptz not null default now(),

  -- Cada modo necesita exactamente su propio campo y ninguno de los otros:
  -- sin esto se podría guardar un 'quincena_fija' sin día, que no sabría en
  -- qué quincena caer, o un 'diferido' sin fecha, que no caería nunca.
  constraint reparto_coherente check (
    (modo = 'mitades'       and dia_nominal is null and fecha_diferida is null) or
    (modo = 'quincena_fija' and dia_nominal is not null and fecha_diferida is null) or
    (modo = 'diferido'      and dia_nominal is null and fecha_diferida is not null)
  )
);

create index gastos_fijos_items_usuario_idx on gastos_fijos_items (usuario_id, activo);

alter table gastos_fijos_items enable row level security;

create policy "dueño gestiona sus gastos fijos" on gastos_fijos_items
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);
