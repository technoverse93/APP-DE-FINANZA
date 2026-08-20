import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors, spacing, typography } from '../theme';

interface Props {
  readonly titulo: string;
  readonly valor?: string;
  readonly detalle?: string;
  readonly tono?: 'normal' | 'positivo' | 'negativo' | 'atencion';
  readonly onPress?: () => void;
  /** Oculta el separador en el último elemento de la lista. */
  readonly ultima?: boolean;
}

const TONOS = {
  normal: colors.label,
  positivo: colors.green,
  negativo: colors.red,
  atencion: colors.orange,
} as const;

/** Fila de lista agrupada, con separador que respeta la sangría del título. */
export function ListRow({ titulo, valor, detalle, tono = 'normal', onPress, ultima }: Props) {
  const contenido = (
    <View style={styles.fila}>
      <View style={styles.textos}>
        <Text style={styles.titulo}>{titulo}</Text>
        {detalle ? <Text style={styles.detalle}>{detalle}</Text> : null}
      </View>
      {valor ? <Text style={[styles.valor, { color: TONOS[tono] }]}>{valor}</Text> : null}
    </View>
  );

  return (
    <View style={!ultima && styles.conSeparador}>
      {onPress ? (
        <Pressable
          onPress={onPress}
          accessibilityRole="button"
          style={({ pressed }) => pressed && styles.presionada}
        >
          {contenido}
        </Pressable>
      ) : (
        contenido
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fila: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    minHeight: 44,
    gap: spacing.md,
  },
  conSeparador: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.separator,
  },
  presionada: { backgroundColor: colors.surfacePressed },
  textos: { flex: 1, gap: 2 },
  titulo: { ...typography.body, color: colors.label },
  detalle: { ...typography.footnote, color: colors.labelSecondary },
  valor: { ...typography.body, fontVariant: ['tabular-nums'] },
});
