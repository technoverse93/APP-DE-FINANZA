-- Configuración de inversión por usuario.
--
-- El aporte periódico y el capital ya invertido son datos reales que declara
-- el usuario, no un supuesto fijo del código: la proyección de interés
-- compuesto los combina con el rendimiento anualizado calculado sobre
-- cotizaciones reales de market_quotes.

create table inversion_config (
  usuario_id         uuid primary key references auth.users (id) on delete cascade,
  principal_inicial  numeric(14, 2) not null default 0 check (principal_inicial >= 0),
  aporte_periodico   numeric(14, 2) not null default 0 check (aporte_periodico >= 0),
  ticker             text not null default 'SPY',
  actualizado_en     timestamptz not null default now()
);

alter table inversion_config enable row level security;

create policy "dueño gestiona su configuración de inversión" on inversion_config
  for all using (auth.uid() = usuario_id) with check (auth.uid() = usuario_id);
