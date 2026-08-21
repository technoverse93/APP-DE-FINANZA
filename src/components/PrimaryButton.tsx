import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

interface Props {
  readonly titulo: string;
  readonly onPress: () => void;
  readonly deshabilitado?: boolean;
  readonly cargando?: boolean;
}

/** Memoizado: solo evita re-render real si quien lo usa pasa un `onPress`
 * estable (`useCallback`) — de lo contrario una prop función nueva en cada
 * render invalida la comparación igual. */
export const PrimaryButton = memo(function PrimaryButton({
  titulo,
  onPress,
  deshabilitado,
  cargando,
}: Props) {
  const inactivo = deshabilitado || cargando;
  return (
    <Pressable
      onPress={onPress}
      disabled={inactivo}
      accessibilityRole="button"
      accessibilityState={{ disabled: !!inactivo, busy: !!cargando }}
      style={({ pressed }) => [
        styles.boton,
        pressed && !inactivo && styles.presionado,
        inactivo && styles.inactivo,
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={colors.labelInverse} />
      ) : (
        <Text style={styles.texto}>{titulo}</Text>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  boton: {
    backgroundColor: colors.blue,
    borderRadius: radius.lg,
    paddingVertical: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 50,
  },
  presionado: { opacity: 0.7 },
  inactivo: { backgroundColor: colors.labelTertiary },
  texto: { ...typography.headline, color: colors.labelInverse },
});
