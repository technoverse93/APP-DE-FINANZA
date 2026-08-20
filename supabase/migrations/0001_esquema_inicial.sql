-- Esquema inicial de APP-DE-FINANZA.
--
-- Todas las tablas llevan RLS activo y políticas por usuario: la app es
-- personal, pero las credenciales de correo y el detalle financiero no deben
-- ser legibles con la clave anónima.

create extension if not exists pgcrypto;

/* -------------------------------------------------------------------------- */
/* Cuentas de correo                                                          */
/* -------------------------------------------------------------------------- */

create type proveedor_correo as enum ('gmail', 'outlook');
create type metodo_auth_correo as enum ('plain', 'xoauth2');

create table cuentas_correo (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references auth.users (id) on delete cascade,
  proveedor       proveedor_correo not null,
  direccion       text not null,
  metodo_auth     metodo_auth_correo not null,
  host            text not null,
  puerto          integer not null default 993,
  -- El secreto (contraseña de aplicación o refresh token) NO se guarda aquí:
  -- esta columna solo referencia la entrada correspondiente en Supabase Vault.
  secreto_ref     text not null,
  activa          boolean not null default true,
  creada_en       timestamptz not null default now(),
  unique (usuario_id, direccion)
);

comment on column cuentas_correo.secreto_ref is
  'Nombre del secreto en Supabase Vault. Nunca se almacena la credencial en claro.';

/* -------------------------------------------------------------------------- */
/* Transacciones capturadas                                                   */
/* -------------------------------------------------------------------------- */

create type banco_origen as enum ('BCR', 'SINPE');

create table transacciones (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references auth.users (id) on delete cascade,
  cuenta_id       uuid references cuentas_correo (id) on delete set null,
  banco           banco_origen not null,
  monto           numeric(14, 2) not null check (monto > 0),
  moneda          char(3) not null default 'CRC',
  referencia      text,
  contraparte     text,
  descripcion     text not null default '',
  ocurrido_en     timestamptz not null,
  -- Message-ID del correo: es lo que hace idempotente el polling de 30 minutos.
  message_id      text not null,
  capturado_en    timestamptz not null default now(),
  unique (usuario_id, message_id)
);

create index transacciones_usuario_fecha_idx
  on transacciones (usuario_id, ocurrido_en desc);

comment on constraint transacciones_usuario_id_message_id_key on transacciones is
  'Cada correo se registra una sola vez, aunque el polling lo vuelva a leer.';

/* -------------------------------------------------------------------------- */
/* Nómina y distribución                                                      */
/* -------------------------------------------------------------------------- */

create table gastos_fijos (
  usuario_id      uuid primary key references auth.users (id) on delete cascade,
  casa            numeric(14, 2) not null default 0 check (casa >= 0),
  comida          numeric(14, 2) not null default 0 check (comida >= 0),
  pases           numeric(14, 2) not null default 0 check (pases >= 0),
  deuda_base      numeric(14, 2) not null default 0 check (deuda_base >= 0),
  actualizado_en  timestamptz not null default now()
);

create table periodos_nomina (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references auth.users (id) on delete cascade,
  -- Fecha de pago ya ajustada por fin de semana.
  fecha_pago      date not null,
  dia_nominal     smallint not null check (dia_nominal in (13, 28)),
  colilla         numeric(14, 2) check (colilla >= 0),
  colilla_en      timestamptz,
  unique (usuario_id, fecha_pago)
);

create table distribuciones (
  id                    uuid primary key default gen_random_uuid(),
  periodo_id            uuid not null references periodos_nomina (id) on delete cascade,
  usuario_id            uuid not null references auth.users (id) on delete cascade,
  total_gastos_fijos    numeric(14, 2) not null,
  remanente             numeric(14, 2) not null,
  reserva               numeric(14, 2) not null,
  abono_capital         numeric(14, 2) not null check (abono_capital >= 0),
  estado                text not null check (estado in ('deficit', 'ajustado', 'holgado')),
  calculada_en          timestamptz not null default now(),
  unique (periodo_id)
);

/* -------------------------------------------------------------------------- */
/* Bitácora de sincronización                                                 */
/* -------------------------------------------------------------------------- */

create table corridas_sync (
  id              uuid primary key default gen_random_uuid(),
  usuario_id      uuid not null references auth.users (id) on delete cascade,
  cuenta_id       uuid references cuentas_correo (id) on delete set null,
  iniciada_en     timestamptz not null default now(),
  terminada_en    timestamptz,
  mensajes_vistos integer not null default 0,
  insertadas      integer not null default 0,
  descartadas_bac integer not null default 0,
  error           text
);

create index corridas_sync_usuario_idx on corridas_sync (usuario_id, iniciada_en desc);

/* -------------------------------------------------------------------------- */
/* RLS                                                                        */
/* -------------------------------------------------------------------------- */

alter table cuentas_correo   enable row level security;
alter table transacciones    enable row level security;
alter table gastos_fijos     enable row level security;
alter table periodos_nomina  enable row level security;
alter table distribuciones   enable row level security;
alter table corridas_sync    enable row level security;

create policy "dueño gestiona sus cuentas de correo" on cuentas_correo
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

create policy "dueño gestiona sus transacciones" on transacciones
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

create policy "dueño gestiona sus gastos fijos" on gastos_fijos
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

create policy "dueño gestiona sus periodos" on periodos_nomina
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

create policy "dueño gestiona sus distribuciones" on distribuciones
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

create policy "dueño lee sus corridas de sync" on corridas_sync
  for select using (auth.uid() = usuario_id);
