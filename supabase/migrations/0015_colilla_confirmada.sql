-- Colilla preconfirmada: el monto real depositado en un día de pago concreto.
--
-- El ingreso disponible se sigue calculando solo (ingreso base + ingresos
-- extra - gastos), pero cuando el usuario confirma el monto real de la
-- colilla para una quincena, ESE monto reemplaza al ingreso base fijo de
-- 170.000 en el cálculo de esa quincena. Es un override opcional, no un
-- requisito: sin fila para la quincena en curso, todo sigue funcionando
-- exactamente como antes.
--
-- La clave única es (usuario_id, fecha_pago): una sola confirmación por día
-- de pago, y volver a confirmar actualiza en vez de duplicar.

create table colillas_confirmadas (
  id            uuid primary key default gen_random_uuid(),
  usuario_id    uuid not null references auth.users (id) on delete cascade,
  -- Fecha REAL de pago (ya corrida al viernes si el 13/28 cayó fin de
  -- semana), no el día nominal.
  fecha_pago    date not null,
  monto         numeric(14, 2) not null check (monto >= 0),
  confirmada_en timestamptz not null default now(),
  unique (usuario_id, fecha_pago)
);

create index colillas_confirmadas_usuario_fecha_idx
  on colillas_confirmadas (usuario_id, fecha_pago desc);

alter table colillas_confirmadas enable row level security;

create policy "dueño gestiona sus colillas confirmadas" on colillas_confirmadas
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);
