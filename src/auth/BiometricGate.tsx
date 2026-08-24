import { useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  AppState,
  AppStateStatus,
  InteractionManager,
  Modal,
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
 *  - La red hacia Supabase permanece cortada mientras no valida.
 *  - Al volver de segundo plano SIEMPRE se vuelve a pedir la huella, y se
 *    pide sola — nunca hace falta tocar un botón para que aparezca el
 *    diálogo del sistema.
 *  - `children` queda montado TODO el tiempo, detrás de un candado modal en
 *    vez de reemplazarlo: así lo que el usuario tenía a medio escribir en un
 *    formulario sigue ahí cuando la huella valida, en vez de perderse cada
 *    vez que la app pasa un instante a segundo plano (un mensaje, una
 *    notificación). Pasados 2 minutos afuera, eso deja de aplicar a
 *    propósito: se fuerza un remonte completo, como si la app se hubiera
 *    cerrado del todo, porque a esa altura ya es otra sesión de uso.
 */

type Estado =
  | { fase: 'verificando' }
  | { fase: 'no_disponible'; motivo: string }
  | { fase: 'bloqueada'; error?: string }
  | { fase: 'abierta' };

/** Ventana de gracia: volver dentro de este tiempo conserva lo que había a
 * medio llenar. Pasarse de esto se trata como un cierre completo. */
const VENTANA_GRACIA_MS = 2 * 60 * 1000;

interface Props {
  readonly children: React.ReactNode;
}

export function BiometricGate({ children }: Props) {
  const [estado, setEstado] = useState<Estado>({ fase: 'verificando' });
  const [claveMontaje, setClaveMontaje] = useState(0);
  // Antes de la PRIMERA validación exitosa, `children` ni se monta: si se
  // montara ya, cada hook de datos dispararía su carga inicial contra la red
  // todavía cortada (`AppBloqueadaError`) y quedaría en ese error para
  // siempre, porque nada lo reintenta después. Una vez que abrió por primera
  // vez, queda montado para siempre — es lo que permite que un bloqueo
  // posterior no le borre el estado a medio llenar.
  const [huboAperturaPrevia, setHuboAperturaPrevia] = useState(false);
  const autenticando = useRef(false);
  const estadoRef = useRef(estado);
  const salioAlSegundoPlanoEn = useRef<number | null>(null);

  useEffect(() => {
    estadoRef.current = estado;
  }, [estado]);

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
        promptMessage: 'Desbloqueá Finanzas con tu huella',
        cancelLabel: 'Cancelar',
        // Sin respaldo por PIN ni contraseña: la huella es el único acceso.
        disableDeviceFallback: true,
        requireConfirmation: false,
      });

      if (resultado.success) {
        // Pasados los 2 minutos de gracia, esto se trata como si la app se
        // hubiera cerrado del todo: forzar un remonte de `children` (vía el
        // cambio de `key`) es lo único que de verdad descarta el estado de
        // React que quedó a medio llenar (formularios, scrolls, selecciones).
        // Dentro de la ventana, no se toca la clave y todo sigue tal cual.
        const salioEn = salioAlSegundoPlanoEn.current;
        if (salioEn !== null && Date.now() - salioEn >= VENTANA_GRACIA_MS) {
          setClaveMontaje((k) => k + 1);
        }
        salioAlSegundoPlanoEn.current = null;
        desbloquearRed();
        setEstado({ fase: 'abierta' });
        setHuboAperturaPrevia(true);
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
    // BiometricPrompt (el diálogo nativo detrás de authenticateAsync) necesita
    // una ventana ya adjunta y con foco. Justo tras un arranque en frío la
    // Activity puede seguir animando su primer layout; invocar el hardware en
    // ese instante falla en silencio o cuelga la promesa en algunos OEMs.
    // runAfterInteractions espera a que termine el primer pintado/animaciones
    // antes de disparar el prompt.
    const tarea = InteractionManager.runAfterInteractions(() => {
      void autenticar();
    });
    return () => tarea.cancel();
  }, [autenticar]);

  // Al salir de la app se corta la red y se exige la huella de nuevo al
  // volver — y esa huella se pide SOLA, sin que haga falta tocar nada.
  useEffect(() => {
    const onChange = (siguiente: AppStateStatus) => {
      if (siguiente === 'background' || siguiente === 'inactive') {
        // Se guarda el momento de salida solo la primera vez: pasar de
        // "inactive" a "background" (típico al minimizar en Android) no debe
        // reiniciar el reloj de los 2 minutos.
        if (salioAlSegundoPlanoEn.current === null) {
          salioAlSegundoPlanoEn.current = Date.now();
        }
        bloquearRed();
        setEstado((actual) => (actual.fase === 'abierta' ? { fase: 'bloqueada' } : actual));
      } else if (siguiente === 'active' && estadoRef.current.fase === 'bloqueada') {
        void autenticar();
      }
    };
    const sub = AppState.addEventListener('change', onChange);
    return () => sub.remove();
  }, [autenticar]);

  return (
    <>
      {huboAperturaPrevia ? (
        <View key={claveMontaje} style={styles.flex}>
          {children}
        </View>
      ) : null}

      <Modal
        visible={estado.fase !== 'abierta'}
        animationType="none"
        transparent={false}
        // El botón "atrás" de Android no debe poder saltarse el candado.
        onRequestClose={() => {}}
      >
        <View style={styles.contenedor}>
          <View style={styles.tarjeta}>
            <Text style={styles.titulo}>Finanzas</Text>

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
                <ActivityIndicator color={colors.blue} />
                <Text style={styles.detalle}>{estado.error ?? 'Validando tu huella…'}</Text>
                {/* Solo aparece si el intento automático falló o lo canceló
                    el usuario — no es la forma normal de entrar, es el
                    respaldo para reintentar sin salir y volver a abrir. */}
                {estado.error ? (
                  <Pressable
                    style={({ pressed }) => [styles.boton, pressed && styles.botonPresionado]}
                    onPress={() => void autenticar()}
                    accessibilityRole="button"
                  >
                    <Text style={styles.botonTexto}>Reintentar</Text>
                  </Pressable>
                ) : null}
              </>
            )}
          </View>
        </View>
      </Modal>
    </>
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
  flex: { flex: 1 },
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
