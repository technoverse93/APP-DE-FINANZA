import { Component, type ErrorInfo, type ReactNode } from 'react';
import { StyleSheet, Text, View, Pressable, SafeAreaView } from 'react-native';
import { colors, radius, spacing, typography } from '../theme';

/**
 * Red de seguridad de último recurso.
 *
 * React solo puede atrapar excepciones lanzadas durante el render, en
 * lifecycles y en constructores — no en manejadores de eventos ni en código
 * async fuera de esos ciclos — pero eso alcanza para el caso que importa acá:
 * si algo revienta al montar el árbol (una prop mal formada, un módulo nativo
 * que falla al inicializar, un error que se escapó de un catch en otro lado),
 * esto evita que la excepción suba hasta el runtime nativo y termine el
 * proceso. Sin este componente, ese escenario se ve como el cierre inmediato
 * de la app al abrirla, sin ningún mensaje.
 */

interface Props {
  readonly children: ReactNode;
}

interface State {
  readonly error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: unknown): State {
    return { error: error instanceof Error ? error : new Error(String(error)) };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    // eslint-disable-next-line no-console
    console.error('ErrorBoundary atrapó una excepción no controlada:', error, info.componentStack);
  }

  private reintentar = (): void => {
    this.setState({ error: null });
  };

  render(): ReactNode {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <SafeAreaView style={styles.pantalla}>
        <View style={styles.tarjeta}>
          <Text style={styles.titulo}>Algo salió mal</Text>
          <Text style={styles.detalle}>{error.message}</Text>
          <Pressable
            style={({ pressed }) => [styles.boton, pressed && styles.botonPresionado]}
            onPress={this.reintentar}
            accessibilityRole="button"
          >
            <Text style={styles.botonTexto}>Reintentar</Text>
          </Pressable>
        </View>
      </SafeAreaView>
    );
  }
}

const styles = StyleSheet.create({
  pantalla: {
    flex: 1,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  tarjeta: {
    width: '100%',
    maxWidth: 360,
    backgroundColor: colors.surface,
    borderRadius: radius.card,
    padding: spacing.xxl,
    alignItems: 'center',
    gap: spacing.lg,
  },
  titulo: { ...typography.title2, color: colors.label },
  detalle: {
    ...typography.subheadline,
    color: colors.labelSecondary,
    textAlign: 'center',
  },
  boton: {
    backgroundColor: colors.blue,
    borderRadius: radius.pill,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.xxl,
  },
  botonPresionado: { opacity: 0.7 },
  botonTexto: { ...typography.headline, color: colors.labelInverse },
});
