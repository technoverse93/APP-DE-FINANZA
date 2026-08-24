import { memo, useCallback, useState } from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';
import { formatearColones } from '../core/payroll/distribution';
import {
  montoEnQuincena,
  type GastoFijoItem,
  type ModoReparto,
} from '../core/payroll/gastosFijos';
import type { Payday } from '../core/payroll/schedule';
import type { EntradaGastoFijo } from '../state/useGastosFijosItems';
import { campoTexto, colors, ficha, fichaActiva, radius, spacing, typography } from '../theme';
import { Card } from './Card';
import { ListRow } from './ListRow';
import { PrimaryButton } from './PrimaryButton';

interface Props {
  readonly gastos: readonly GastoFijoItem[];
  readonly payday: Payday;
  readonly onCrear: (entrada: EntradaGastoFijo) => void;
  readonly onActualizar: (id: string, entrada: EntradaGastoFijo) => void;
  readonly onEliminar: (id: string) => void;
}

/** Etiquetas de cada regla, en los términos en que se piensa el gasto. */
const MODOS: readonly { modo: ModoReparto; titulo: string; ayuda: string }[] = [
  {
    modo: 'mitades',
    titulo: 'Mitad y mitad',
    ayuda: 'Se parte 50/50 entre las dos quincenas del mes.',
  },
  {
    modo: 'quincena_fija',
    titulo: 'Una sola quincena',
    ayuda: 'El monto completo cae en la quincena que elijas.',
  },
  {
    modo: 'diferido',
    titulo: 'Posponer a una fecha',
    ayuda: 'Cae entero en un solo pago y en ninguno más.',
  },
];

const FORMULARIO_VACIO = {
  nombre: '',
  textoMonto: '',
  modo: 'mitades' as ModoReparto,
  diaNominal: 13 as 13 | 28,
  fechaDiferida: '',
};

function limpiarMonto(texto: string): number {
  const n = Number(texto.replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/** ¿Es una fecha `YYYY-MM-DD` real (no "2026-02-31")? */
function fechaIsoValida(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const fecha = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(fecha.getTime()) && fecha.toISOString().slice(0, 10) === texto;
}

/**
 * Alta, edición y listado de gastos fijos con su regla de reparto entre
 * quincenas.
 *
 * Es el control que faltaba: el motor (`core/payroll/gastosFijos.ts`) ya sabía
 * repartir un gasto mensual entre las dos quincenas o cargarlo entero en una
 * sola, pero no había forma de decírselo desde la app. Sin esta pantalla un
 * alquiler de 150.000 pesaba igual en las dos quincenas, como si fueran
 * 300.000 al mes.
 *
 * Tocar un gasto ya guardado lo carga en el mismo formulario del alta en vez
 * de abrir uno aparte: es exactamente los mismos campos, y duplicarlos
 * habría significado mantener dos formularios que pueden desalinearse. Lo
 * que faltaba de verdad era poder CAMBIAR la regla de un gasto que ya existe
 * — por ejemplo, pasar un alquiler que hoy cae entero en una quincena a
 * repartirse mitad y mitad — sin tener que borrarlo y crearlo de nuevo.
 *
 * Cada gasto de la lista muestra cuánto aporta **a la quincena en curso**, no
 * su monto mensual: es la cifra que efectivamente se descuenta ahora, y la
 * que hace visible la diferencia entre las tres reglas.
 */
export const GastosFijosEditor = memo(function GastosFijosEditor({
  gastos,
  payday,
  onCrear,
  onActualizar,
  onEliminar,
}: Props) {
  const [editandoId, setEditandoId] = useState<string | null>(null);
  const [nombre, setNombre] = useState(FORMULARIO_VACIO.nombre);
  const [textoMonto, setTextoMonto] = useState(FORMULARIO_VACIO.textoMonto);
  const [modo, setModo] = useState<ModoReparto>(FORMULARIO_VACIO.modo);
  const [diaNominal, setDiaNominal] = useState<13 | 28>(FORMULARIO_VACIO.diaNominal);
  const [fechaDiferida, setFechaDiferida] = useState(FORMULARIO_VACIO.fechaDiferida);
  const [aviso, setAviso] = useState<string | null>(null);

  const limpiarFormulario = useCallback(() => {
    setEditandoId(null);
    setNombre(FORMULARIO_VACIO.nombre);
    setTextoMonto(FORMULARIO_VACIO.textoMonto);
    setModo(FORMULARIO_VACIO.modo);
    setDiaNominal(FORMULARIO_VACIO.diaNominal);
    setFechaDiferida(FORMULARIO_VACIO.fechaDiferida);
    setAviso(null);
  }, []);

  const empezarEdicion = useCallback((gasto: GastoFijoItem) => {
    setEditandoId(gasto.id);
    setNombre(gasto.nombre);
    setTextoMonto(String(gasto.montoMensual));
    setModo(gasto.modo);
    setDiaNominal(gasto.diaNominal ?? 13);
    setFechaDiferida(gasto.fechaDiferida ?? '');
    setAviso(null);
  }, []);

  const guardar = useCallback(() => {
    const monto = limpiarMonto(textoMonto);
    if (!nombre.trim() || monto <= 0) {
      setAviso('Poné un nombre y un monto mayor a cero.');
      return;
    }
    // La restricción `reparto_coherente` de la base rechaza un diferido sin
    // fecha, así que se avisa acá en vez de dejar que falle el guardado con
    // un mensaje de Postgres que no le dice nada a nadie.
    if (modo === 'diferido' && !fechaIsoValida(fechaDiferida)) {
      setAviso('Para posponer, escribí la fecha del pago como 2026-09-13.');
      return;
    }

    const entrada: EntradaGastoFijo = {
      nombre: nombre.trim(),
      montoMensual: monto,
      modo,
      diaNominal: modo === 'quincena_fija' ? diaNominal : undefined,
      fechaDiferida: modo === 'diferido' ? fechaDiferida : undefined,
    };
    if (editandoId) {
      onActualizar(editandoId, entrada);
    } else {
      onCrear(entrada);
    }
    limpiarFormulario();
  }, [nombre, textoMonto, modo, diaNominal, fechaDiferida, editandoId, onCrear, onActualizar, limpiarFormulario]);

  const eliminarEnEdicion = useCallback(() => {
    if (!editandoId) return;
    onEliminar(editandoId);
    limpiarFormulario();
  }, [editandoId, onEliminar, limpiarFormulario]);

  const ayudaModo = MODOS.find((m) => m.modo === modo)?.ayuda ?? '';

  return (
    <View style={styles.contenedor}>
      <Card sinRelleno={gastos.length > 0}>
        {gastos.length > 0 ? (
          gastos.map((g, i) => {
            const enEsta = montoEnQuincena(g, payday);
            return (
              <ListRow
                key={g.id}
                titulo={g.nombre}
                detalle={`${formatearColones(g.montoMensual)}/mes · ${
                  g.modo === 'mitades'
                    ? 'mitad y mitad'
                    : g.modo === 'quincena_fija'
                      ? `solo el ${g.diaNominal}`
                      : `pospuesto al ${g.fechaDiferida}`
                } · tocar para editar`}
                valor={formatearColones(enEsta)}
                tono={g.id === editandoId ? 'atencion' : enEsta > 0 ? 'normal' : 'atencion'}
                onPress={() => empezarEdicion(g)}
                ultima={i === gastos.length - 1}
              />
            );
          })
        ) : (
          <Text style={styles.vacio}>
            Todavía no hay gastos fijos. Agregá cada uno (alquiler, internet, préstamo) y elegí
            cómo se reparte entre las dos quincenas del mes.
          </Text>
        )}
      </Card>

      <View style={styles.formulario}>
        {editandoId ? (
          <Text style={styles.tituloFormulario}>Editando "{nombre}"</Text>
        ) : null}
        <TextInput
          style={styles.input}
          value={nombre}
          onChangeText={setNombre}
          placeholder="Nombre (ej. Alquiler, Internet)"
          placeholderTextColor={colors.labelTertiary}
        />
        <TextInput
          style={styles.input}
          value={textoMonto}
          onChangeText={setTextoMonto}
          keyboardType="number-pad"
          placeholder="Monto del mes completo"
          placeholderTextColor={colors.labelTertiary}
        />

        <Text style={styles.etiqueta}>¿Cómo se paga?</Text>
        <View style={styles.filaChips}>
          {MODOS.map((m) => (
            <Text
              key={m.modo}
              onPress={() => {
                setModo(m.modo);
                setAviso(null);
              }}
              style={[styles.chip, modo === m.modo && styles.chipActivo]}
            >
              {m.titulo}
            </Text>
          ))}
        </View>
        <Text style={styles.ayuda}>{ayudaModo}</Text>

        {modo === 'quincena_fija' ? (
          <View style={styles.filaChips}>
            {([13, 28] as const).map((dia) => (
              <Text
                key={dia}
                onPress={() => setDiaNominal(dia)}
                style={[styles.chip, diaNominal === dia && styles.chipActivo]}
              >
                Quincena del {dia}
              </Text>
            ))}
          </View>
        ) : null}

        {modo === 'diferido' ? (
          <TextInput
            style={styles.input}
            value={fechaDiferida}
            onChangeText={(t) => {
              setFechaDiferida(t);
              setAviso(null);
            }}
            placeholder="Fecha del pago (2026-09-13)"
            placeholderTextColor={colors.labelTertiary}
            autoCapitalize="none"
          />
        ) : null}

        {aviso ? <Text style={styles.aviso}>{aviso}</Text> : null}

        <PrimaryButton titulo={editandoId ? 'Guardar cambios' : 'Agregar gasto fijo'} onPress={guardar} />
        {editandoId ? (
          <View style={styles.filaAccionesEdicion}>
            <Text style={styles.accionSecundaria} onPress={limpiarFormulario}>
              Cancelar
            </Text>
            <Text style={styles.accionEliminar} onPress={eliminarEnEdicion}>
              Eliminar este gasto
            </Text>
          </View>
        ) : null}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  contenedor: { gap: spacing.sm },
  formulario: { gap: spacing.sm, marginTop: spacing.sm },
  vacio: { ...typography.subheadline, color: colors.labelSecondary },
  tituloFormulario: { ...typography.headline, color: colors.label },
  etiqueta: { ...typography.footnote, color: colors.labelSecondary, marginTop: spacing.xs },
  ayuda: { ...typography.caption1, color: colors.labelTertiary },
  filaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: { ...ficha },
  chipActivo: { ...fichaActiva },
  aviso: {
    ...typography.footnote,
    color: colors.label,
    backgroundColor: colors.orangeSoft,
    borderRadius: radius.md,
    padding: spacing.md,
  },
  input: {
    ...campoTexto,
  },
  filaAccionesEdicion: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingTop: spacing.xs,
  },
  accionSecundaria: { ...typography.footnote, color: colors.labelSecondary },
  accionEliminar: { ...typography.footnote, color: colors.red },
});
