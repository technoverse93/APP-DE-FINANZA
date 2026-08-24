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
import { campoTexto, colors, radius, spacing, typography } from '../theme';
import { Card } from './Card';
import { ListRow } from './ListRow';
import { PrimaryButton } from './PrimaryButton';

interface Props {
  readonly gastos: readonly GastoFijoItem[];
  readonly payday: Payday;
  readonly onCrear: (entrada: EntradaGastoFijo) => void;
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
 * Alta y listado de gastos fijos con su regla de reparto entre quincenas.
 *
 * Es el control que faltaba: el motor (`core/payroll/gastosFijos.ts`) ya sabía
 * repartir un gasto mensual entre las dos quincenas o cargarlo entero en una
 * sola, pero no había forma de decírselo desde la app. Sin esta pantalla un
 * alquiler de 150.000 pesaba igual en las dos quincenas, como si fueran
 * 300.000 al mes.
 *
 * Cada gasto de la lista muestra cuánto aporta **a la quincena en curso**, no
 * su monto mensual: es la cifra que efectivamente se descuenta ahora, y la
 * que hace visible la diferencia entre las tres reglas.
 */
export const GastosFijosEditor = memo(function GastosFijosEditor({
  gastos,
  payday,
  onCrear,
  onEliminar,
}: Props) {
  const [nombre, setNombre] = useState('');
  const [textoMonto, setTextoMonto] = useState('');
  const [modo, setModo] = useState<ModoReparto>('mitades');
  const [diaNominal, setDiaNominal] = useState<13 | 28>(13);
  const [fechaDiferida, setFechaDiferida] = useState('');
  const [aviso, setAviso] = useState<string | null>(null);

  const crear = useCallback(() => {
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

    setAviso(null);
    onCrear({
      nombre: nombre.trim(),
      montoMensual: monto,
      modo,
      diaNominal: modo === 'quincena_fija' ? diaNominal : undefined,
      fechaDiferida: modo === 'diferido' ? fechaDiferida : undefined,
    });
    setNombre('');
    setTextoMonto('');
    setFechaDiferida('');
  }, [nombre, textoMonto, modo, diaNominal, fechaDiferida, onCrear]);

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
                } · tocar para quitar`}
                valor={formatearColones(enEsta)}
                tono={enEsta > 0 ? 'normal' : 'atencion'}
                onPress={() => onEliminar(g.id)}
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

        <PrimaryButton titulo="Agregar gasto fijo" onPress={crear} />
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  contenedor: { gap: spacing.sm },
  formulario: { gap: spacing.sm, marginTop: spacing.sm },
  vacio: { ...typography.subheadline, color: colors.labelSecondary },
  etiqueta: { ...typography.footnote, color: colors.labelSecondary, marginTop: spacing.xs },
  ayuda: { ...typography.caption1, color: colors.labelTertiary },
  filaChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    ...typography.footnote,
    color: colors.labelSecondary,
    backgroundColor: colors.fill,
    borderRadius: radius.pill,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    overflow: 'hidden',
  },
  chipActivo: { color: colors.labelInverse, backgroundColor: colors.brandGold },
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
});
