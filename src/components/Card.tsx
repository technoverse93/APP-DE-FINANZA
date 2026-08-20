import { StyleSheet, View, ViewProps } from 'react-native';
import { colors, radius, shadow, spacing } from '../theme';

interface Props extends ViewProps {
  /** Quita el relleno interno cuando la tarjeta contiene una lista a sangre. */
  readonly sinRelleno?: boolean;
}

/** Tarjeta agrupada al estilo de los ajustes de iOS. */
export function Card({ sinRelleno, style, children, ...rest }: Props) {
  return (
    <View style={[styles.card, sinRelleno && styles.sinRelleno, style]} {...rest}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.lg,
    ...shadow.card,
  },
  sinRelleno: { padding: 0, overflow: 'hidden' },
});
