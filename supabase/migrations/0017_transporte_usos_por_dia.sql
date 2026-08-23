-- Frecuencia de uso por tramo.
--
-- Hasta ahora cada tramo contaba una sola vez por día hábil: el costo diario
-- era la suma directa de los precios. Pero un mismo tramo se puede usar más
-- de una vez al día (ida y vuelta por el mismo recorrido), y eso obligaba a
-- cargar el tramo duplicado para que la cuenta diera.
--
-- Default 1 para que las filas ya cargadas sigan valiendo exactamente lo
-- mismo que antes de esta migración.
alter table rutas_transporte
  add column usos_por_dia smallint not null default 1
  check (usos_por_dia > 0);
