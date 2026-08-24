import { memo } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { BORDE, colors, radius, shadow, spacing, typography } from '../theme';

interface Props {
  readonly titulo: string;
  readonly onPress: () => void;
  readonly deshabilitado?: boolean;
  readonly cargando?: boolean;
  /** Acción secundaria: contorno en vez de relleno sólido. */
  readonly secundario?: boolean;
}

/**
 * Botón de acción.
 *
 * En esta dirección el botón es el único elemento con relleno saturado de la
 * pantalla, y lleva un resplandor tenue del mismo verde: sobre un fondo casi
 * negro es lo que lo hace leer como "encendido" y lo separa de los paneles,
 * que son todos línea y superficie apagada.
 *
 * Memoizado: solo evita re-render real si quien lo usa pasa un `onPress`
 * estable (`useCallback`) — de lo contrario una prop función nueva en cada
 * render invalida la comparación igual.
 */
export const PrimaryButton = memo(function PrimaryButton({
  titulo,
  onPress,
  deshabilitado,
  cargando,
  secundario,
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
        secundario ? styles.secundario : styles.primario,
        pressed && !inactivo && styles.presionado,
        inactivo && styles.inactivo,
      ]}
    >
      {cargando ? (
        <ActivityIndicator color={secundario ? colors.acento : colors.labelInverse} />
      ) : (
        <Text style={[styles.texto, secundario && styles.textoSecundario]}>
          {titulo.toUpperCase()}
        </Text>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  boton: {
    borderRadius: radius.md,
    paddingVertical: spacing.lg,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
    borderWidth: BORDE,
  },
  primario: {
    backgroundColor: colors.acento,
    borderColor: colors.acento,
    ...shadow.glow,
  },
  secundario: {
    backgroundColor: 'transparent',
    borderColor: colors.separatorOpaque,
  },
  presionado: { opacity: 0.65 },
  inactivo: {
    backgroundColor: colors.fill,
    borderColor: colors.separator,
    shadowOpacity: 0,
    elevation: 0,
  },
  texto: { ...typography.headline, color: colors.labelInverse, letterSpacing: 0.8 },
  textoSecundario: { color: colors.labelSecondary },
});
