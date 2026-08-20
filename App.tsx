import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { BiometricGate } from './src/auth/BiometricGate';
import { ErrorBoundary } from './src/components';
import { registrarTareaDeFondo } from './src/lib/backgroundSync';
import { comprobarActualizacion } from './src/lib/updates';
import { ResumenScreen } from './src/screens/ResumenScreen';

/**
 * Raíz de la aplicación.
 *
 * `ErrorBoundary` envuelve todo, incluida la puerta biométrica: es la última
 * red antes de que una excepción de render llegue al runtime nativo y cierre
 * el proceso. Dentro de eso, `BiometricGate` sigue siendo el candado real —
 * sin huella válida no se monta ninguna pantalla ni se abre la red hacia
 * Supabase.
 */
export default function App() {
  useEffect(() => {
    // Ninguna de las dos debe poder impedir el arranque: si el sistema no
    // concede trabajo en segundo plano, o si no hay red para preguntar por
    // actualizaciones, la app sigue con lo que ya tiene cargado.
    void registrarTareaDeFondo().catch(() => undefined);
    void comprobarActualizacion().catch(() => undefined);
  }, []);

  return (
    <ErrorBoundary>
      <BiometricGate>
        <StatusBar style="dark" />
        <ResumenScreen />
      </BiometricGate>
    </ErrorBoundary>
  );
}
