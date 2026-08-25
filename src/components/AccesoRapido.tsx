import { useCallback, useState } from 'react';
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { formatearColones } from '../core/payroll/distribution';
import { campoTexto, colors, radius, spacing, typography } from '../theme';
import { PrimaryButton } from './PrimaryButton';

type Tipo = 'gasto' | 'ingreso';

interface Props {
  /** Alto que hay que dejar libre abajo para no tapar el dock de pestañas. */
  readonly margenInferior: number;
  readonly onGuardar: (entrada: {
    tipo: Tipo;
    monto: number;
    descripcion: string;
    categoria: string | null;
  }) => void;
  /** Remanente libre actual, para mostrar el efecto del gasto antes de anotarlo. */
  readonly remanenteLibre: number;
}

function limpiarMonto(texto: string): number {
  const n = Number(texto.replace(/[^\d]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

/**
 * Acceso rápido para anotar un gasto hormiga o un ingreso extra.
 *
 * Existe porque anotar un gasto de 500 colones no puede costar seis toques.
 * El camino largo (abrir Deudas, bajar hasta el Libro Mayor, llenar tres
 * campos) es tan caro que en la práctica los gastos chicos no se anotan
 * nunca — y son justamente los que se comen el remanente sin que nadie sepa
 * en qué se fue.
 *
 * Vive sobre el dock, en TODAS las pantallas, y guarda contra el estado
 * global compartido: el remanente y los totales se mueven en el mismo render
 * en que se toca "Anotar", sin recargar nada.
 */
export function AccesoRapido({ margenInferior, onGuardar, remanenteLibre }: Props) {
  const [abierto, setAbierto] = useState(false);
  const [tipo, setTipo] = useState<Tipo>('gasto');
  const [textoMonto, setTextoMonto] = useState('');
  const [descripcion, setDescripcion] = useState('');

  const cerrar = useCallback(() => {
    setAbierto(false);
    setTextoMonto('');
    setDescripcion('');
    setTipo('gasto');
  }, []);

  const monto = limpiarMonto(textoMonto);

  const guardar = useCallback(() => {
    if (monto <= 0) return;
    onGuardar({
      tipo,
      monto,
      descripcion: descripcion.trim(),
      // Etiqueta fija: es lo que después permite separar en el desglose lo
      // que se fue en gastos hormiga de lo que se anotó con detalle.
      categoria: tipo === 'gasto' ? 'Gasto hormiga' : 'Ingreso extra',
    });
    // Cierre inmediato: la escritura viaja en segundo plano, así que esperar
    // a que termine solo agregaría una pausa sin información nueva.
    cerrar();
  }, [monto, tipo, descripcion, onGuardar, cerrar]);

  /** Cómo queda el remanente si se anota esto. */
  const remanenteResultante =
    tipo === 'gasto' ? remanenteLibre - monto : remanenteLibre + monto;

  return (
    <>
      <Pressable
        style={({ pressed }) => [
          styles.boton,
          { bottom: margenInferior + spacing.lg },
          pressed && styles.botonPresionado,
        ]}
        onPress={() => setAbierto(true)}
        accessibilityRole="button"
        accessibilityLabel="Anotar un gasto o ingreso rápido"
      >
        <Ionicons name="add" size={30} color={colors.labelInverse} />
      </Pressable>

      <Modal
        visible={abierto}
        animationType="slide"
        transparent
        onRequestClose={cerrar}
        statusBarTranslucent
      >
        <Pressable style={styles.fondo} onPress={cerrar}>
          <KeyboardAvoidingView
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
            style={styles.contenedorTarjeta}
          >
            {/* Detiene la propagación: tocar DENTRO de la tarjeta no debe
                cerrar el modal, solo tocar el fondo. */}
            <Pressable style={styles.tarjeta} onPress={() => {}}>
              <View style={styles.asa} />
              <Text style={styles.titulo}>Anotar rápido</Text>

              <View style={styles.filaTipo}>
                <Text
                  onPress={() => setTipo('gasto')}
                  style={[styles.ficha, tipo === 'gasto' && styles.fichaActivaGasto]}
                >
                  Gasto hormiga
                </Text>
                <Text
                  onPress={() => setTipo('ingreso')}
                  style={[styles.ficha, tipo === 'ingreso' && styles.fichaActivaIngreso]}
                >
                  Ingreso extra
                </Text>
              </View>

              <TextInput
                style={styles.input}
                value={textoMonto}
                onChangeText={setTextoMonto}
                keyboardType="number-pad"
                placeholder="Monto"
                placeholderTextColor={colors.labelTertiary}
                autoFocus
              />
              <TextInput
                style={styles.input}
                value={descripcion}
                onChangeText={setDescripcion}
                placeholder="¿En qué? (opcional)"
                placeholderTextColor={colors.labelTertiary}
              />

              {monto > 0 ? (
                <Text style={styles.previa}>
                  Tu remanente libre queda en{' '}
                  <Text
                    style={{
                      color: remanenteResultante < 0 ? colors.red : colors.acento,
                    }}
                  >
                    {formatearColones(remanenteResultante)}
                  </Text>
                </Text>
              ) : null}

              <PrimaryButton titulo="Anotar" onPress={guardar} />
              <Text style={styles.cancelar} onPress={cerrar}>
                Cancelar
              </Text>
            </Pressable>
          </KeyboardAvoidingView>
        </Pressable>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  boton: {
    position: 'absolute',
    right: spacing.lg,
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: colors.acento,
    alignItems: 'center',
    justifyContent: 'center',
    // Sin elevación el botón se pierde contra las tarjetas oscuras.
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  botonPresionado: { opacity: 0.8 },
  fondo: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.6)',
    justifyContent: 'flex-end',
  },
  contenedorTarjeta: { width: '100%' },
  tarjeta: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: radius.card,
    borderTopRightRadius: radius.card,
    padding: spacing.xl,
    paddingBottom: spacing.xxl,
    gap: spacing.md,
  },
  asa: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.labelTertiary,
    marginBottom: spacing.xs,
  },
  titulo: { ...typography.title2, color: colors.label },
  filaTipo: { flexDirection: 'row', gap: spacing.sm },
  ficha: {
    ...typography.footnote,
    color: colors.labelSecondary,
    backgroundColor: colors.fill,
    borderRadius: radius.pill,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    overflow: 'hidden',
  },
  fichaActivaGasto: { backgroundColor: colors.red, color: colors.labelInverse },
  fichaActivaIngreso: { backgroundColor: colors.acento, color: colors.labelInverse },
  input: { ...campoTexto },
  previa: { ...typography.footnote, color: colors.labelSecondary },
  cancelar: {
    ...typography.footnote,
    color: colors.labelSecondary,
    textAlign: 'center',
    paddingTop: spacing.xs,
  },
});
