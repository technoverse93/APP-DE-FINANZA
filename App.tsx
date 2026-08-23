import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { BiometricGate } from './src/auth/BiometricGate';
import { ConfigWarning, ErrorBoundary } from './src/components';
import { registrarTareaDeFondo } from './src/lib/backgroundSync';
import { programarAvisoColilla } from './src/lib/notificaciones';
import { supabaseConfigError } from './src/lib/supabase';
import { comprobarActualizacion } from './src/lib/updates';
import { RootTabs } from './src/navigation/RootTabs';

/**
 * Raíz de la aplicación.
 *
 * `ErrorBoundary` envuelve todo, incluida la puerta biométrica: es la última
 * red antes de que una excepción de render llegue al runtime nativo y cierre
 * el proceso. Dentro de eso, `BiometricGate` sigue siendo el candado real —
 * sin huella válida no se monta ninguna pantalla, no se abre la red hacia
 * Supabase, y por lo tanto tampoco corre ninguna pantalla de datos en vivo
 * (inversión incluida).
 *
 * La comprobación de actualizaciones OTA corre una sola vez al montar, en su
 * propio try/catch, independiente del resto: no es un poll recurrente que
 * compita con las pantallas por red.
 *
 * `SafeAreaProvider` envuelve todo porque los `SafeAreaView` de las pantallas
 * vienen de `react-native-safe-area-context`, no del `SafeAreaView` de
 * react-native: ese último no hace NADA en Android (es un componente
 * exclusivo de iOS), y por eso el contenido quedaba por debajo de la barra
 * de navegación del sistema — los botones de la parte baja se veían
 * cortados a la mitad y no respondían al toque en el teléfono real.
 */
export default function App() {
  useEffect(() => {
    // Ninguna de las dos debe poder impedir el arranque: si el sistema no
    // concede trabajo en segundo plano, o si no hay red para preguntar por
    // actualizaciones, la app sigue con lo que ya tiene cargado.
    void registrarTareaDeFondo().catch(() => undefined);
    void comprobarActualizacion().catch(() => undefined);
    // Se reprograma en cada arranque a propósito: una notificación local
    // solo queda encolada para el próximo pago, así que al abrir la app
    // después de un pago hay que encolar la del siguiente. El identificador
    // fijo hace que reprogramar reemplace en vez de acumular duplicados.
    void programarAvisoColilla().catch(() => undefined);
  }, []);

  return (
    <SafeAreaProvider>
      <ErrorBoundary>
        <BiometricGate>
          <StatusBar style="dark" />
          {supabaseConfigError ? <ConfigWarning mensaje={supabaseConfigError} /> : null}
          <RootTabs />
        </BiometricGate>
      </ErrorBoundary>
    </SafeAreaProvider>
  );
}
