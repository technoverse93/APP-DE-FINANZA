import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as LocalAuthentication from 'expo-local-authentication';
import { bloquearRed, desbloquearRed } from '../lib/supabase';
import { colors, radius, spacing, typography } from '../theme';

/**
 * Puerta biométrica de la aplicación.
 *
 * Requisitos que impone este componente:
 *  - Solo huella dactilar. `disableDeviceFallback: true` elimina el respaldo
 *    por PIN o contraseña del dispositivo, así que no existe forma de entrar
 *    sin biometría.
 *  - Nada se renderiza hasta que la validación pasa, y la red hacia Supabase
 *    permanece cortada mientras tanto.
 *  - Al volver de segundo plano se vuelve a bloquear.
 */

type Estado =
  | { fase: 'verificando' }
  | { fase: 'no_disponible'; motivo: string }
  | { fase: 'bloqueada'; error?: string }
  | { fase: 'abierta' };

interface Props {
  readonly children: React.ReactNode;
}

export function BiometricGate({ children }: Props) {
  const [estado, setEstado] = useState<Estado>({ fase: 'verificando' });
  const autenticando = useRef(false);

  const autenticar = useCallback(async () => {
    // El diálogo del sistema es modal: dispararlo dos veces lo hace fallar.
    if (autenticando.current) return;
    autenticando.current = true;

    try {
      const tieneHardware = await LocalAuthentication.hasHardwareAsync();
      if (!tieneHardware) {
        setEstado({
          fase: 'no_disponible',
          motivo: 'Este dispositivo no tiene lector de huella.',
        });
        return;
      }

      const tipos = await LocalAuthentication.supportedAuthenticationTypesAsync();
      const soportaHuella = tipos.includes(
        LocalAuthentication.AuthenticationType.FINGERPRINT,
      );
      if (!soportaHuella) {
        setEstado({
          fase: 'no_disponible',
          motivo: 'Este dispositivo no admite autenticación por huella.',
        });
        return;
      }

      const inscrito = await LocalAuthentication.isEnrolledAsync();
      if (!inscrito) {
        setEstado({
          fase: 'no_disponible',
          motivo: 'No hay ninguna huella registrada en el dispositivo.',
        });
        return;
      }

      const resultado = await LocalAuthentication.authenticateAsync({
        promptMessage: 'Desbloqueá Finanza con tu huella',
        cancelLabel: 'Cancelar',
        // Sin respaldo por PIN ni contraseña: la huella es el único acceso.
        disableDeviceFallback: true,
        requireConfirmation: false,
      });

      if (resultado.success) {
        desbloquearRed();
        setEstado({ fase: 'abierta' });
        return;
      }

      setEstado({
        fase: 'bloqueada',
        error: resultado.error === 'user_cancel' ? undefined : 'No se pudo validar la huella.',
      });
    } catch (e) {
      setEstado({
        fase: 'bloqueada',
        error: e instanceof Error ? e.message : 'Error inesperado al validar la huella.',
      });
    } finally {
      autenticando.current = false;
    }
  }, []);

  useEffect(() => {
    void autenticar();
  }, [autenticar]);

  // Al salir de la app se corta la red y se exige la huella de nuevo al volver.
  useEffect(() => {
    const onChange = (siguiente: AppStateStatus) => {
      if (siguiente === 'background' || siguiente === 'inactive') {
        bloquearRed();
        setEstado((actual) => (actual.fase === 'abierta' ? { fase: 'bloqueada' } : actual));
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, []);

  if (estado.fase === 'abierta') {
    return <>{children}</>;
  }

  return (
    <View style={styles.contenedor}>
      <View style={styles.tarjeta}>
        <Text style={styles.titulo}>Finanza</Text>

        {estado.fase === 'verificando' && (
          <>
            <ActivityIndicator color={colors.blue} />
            <Text style={styles.detalle}>Validando tu huella…</Text>
          </>
        )}

        {estado.fase === 'no_disponible' && (
          <Text style={styles.detalle}>{estado.motivo}</Text>
        )}

        {estado.fase === 'bloqueada' && (
          <>
            <Text style={styles.detalle}>
              {estado.error ?? 'La aplicación está bloqueada.'}
            </Text>
            <Pressable
              style={({ pressed }) => [styles.boton, pressed && styles.botonPresionado]}
              onPress={() => void autenticar()}
              accessibilityRole="button"
            >
              <Text style={styles.botonTexto}>Desbloquear con huella</Text>
            </Pressable>
          </>
        )}
      </View>
    </View>
  );
}

/**
 * Variante como HOC, para envolver un componente raíz ya existente.
 *
 * @example
 *   export default withBiometricGate(App);
 */
export function withBiometricGate<P extends object>(
  Componente: React.ComponentType<P>,
): React.ComponentType<P> {
  const Protegido = (props: P) => (
    <BiometricGate>
      <Componente {...props} />
    </BiometricGate>
  );
  Protegido.displayName = `withBiometricGate(${Componente.displayName ?? Componente.name})`;
  return Protegido;
}

const styles = StyleSheet.create({
  contenedor: {
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
