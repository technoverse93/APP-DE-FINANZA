import { useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import { BiometricGate } from './src/auth/BiometricGate';
import { registrarTareaDeFondo } from './src/lib/backgroundSync';
import { ResumenScreen } from './src/screens/ResumenScreen';

/**
 * Raíz de la aplicación.
 *
 * Todo cuelga de `BiometricGate`: sin huella válida no se monta ninguna
 * pantalla ni se abre la red hacia Supabase.
 */
export default function App() {
  useEffect(() => {
    // Falla en silencio si el sistema no concede trabajo en segundo plano; el
    // cron del servidor sigue cubriendo la sincronización de todas formas.
    void registrarTareaDeFondo().catch(() => undefined);
  }, []);

  return (
    <BiometricGate>
      <StatusBar style="dark" />
      <ResumenScreen />
    </BiometricGate>
  );
}
