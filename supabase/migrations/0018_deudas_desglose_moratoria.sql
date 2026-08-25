-- Desglose granular de compromisos crediticios.
--
-- `interes_moratorio_diario` marca las deudas cuyo interés corre por DÍA
-- (típico de un alquiler atrasado o una mora bancaria), no por quincena. No
-- cambia la matemática del motor —la tasa sigue siendo mensual nominal— pero
-- sí la prioridad: un día de atraso en una de estas cuesta plata de verdad,
-- así que la interfaz las tiene que poder señalar aparte.
--
-- `fecha_limite` es la fecha tope real del compromiso cuando existe una
-- pactada. Para una deuda con `plazo_quincenas` se puede derivar, pero una
-- deuda sin cuota fija (un atraso que hay que cubrir antes de tal día) no
-- tiene plazo del cual derivarla: sin esta columna no habría dónde guardarla.
alter table deudas
  add column interes_moratorio_diario boolean not null default false,
  add column fecha_limite date null;
