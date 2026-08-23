-- Rutas de transporte y categorías del Libro Mayor.
--
-- El campo plano `gastos_fijos.pases` se reemplaza en el cálculo real por una
-- lista de tramos (origen, destino, precio) cuya suma da el costo diario de
-- transporte — la columna `pases` no se borra (evitar una migración
-- destructiva sobre datos que ya existen), simplemente el cliente deja de
-- leerla/escribirla.
--
-- `categoria` en libro_mayor permite distinguir el origen de un ingreso
-- extra o gasto diario (ej. "Ventas", "Reparaciones de hardware") sin abrir
-- tablas nuevas para lo que ya cubre libro_mayor (ingresos y gastos
-- anotados a mano, ver migración 0007).

create table rutas_transporte (
  id          uuid primary key default gen_random_uuid(),
  usuario_id  uuid not null references auth.users (id) on delete cascade,
  origen      text not null,
  destino     text not null,
  precio      numeric(10, 2) not null check (precio >= 0),
  -- Orden de despliegue del tramo dentro de la ruta del día (Casa -> San
  -- José -> Coronado -> ...); no tiene efecto en la suma, solo en la lista.
  orden       integer not null default 0,
  creado_en   timestamptz not null default now()
);

create index rutas_transporte_usuario_orden_idx on rutas_transporte (usuario_id, orden);

alter table rutas_transporte enable row level security;

create policy "dueño gestiona sus rutas de transporte" on rutas_transporte
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);

alter table libro_mayor add column categoria text;
