import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AccesoRapido } from '../components';
import { DeudasScreen } from '../screens/DeudasScreen';
import { ResumenScreen } from '../screens/ResumenScreen';
import {
  DatosFinancierosProvider,
  useDatosFinancieros,
} from '../state/DatosFinancierosProvider';
import { colors, spacing, typography } from '../theme';

/** Alto del dock sin contar la franja del sistema. */
const ALTO_DOCK = 56;

/**
 * Navegación raíz: dock inferior con ícono + etiqueta corta, el mismo patrón
 * de Technoverse-p-gina- (su AdminShell/adminNav) para el "dock" móvil —
 * unas pocas pestañas fijas en vez de un menú lateral, que en un teléfono no
 * tiene dónde vivir. Se portó el PATRÓN, no el contenido: esta app no tiene
 * un panel de administración, así que las pestañas son las propias del
 * dominio de finanzas personales.
 */

export type RootTabParamList = {
  Inicio: undefined;
  Deudas: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

const temaNavegacion = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.background,
    card: colors.surface,
    text: colors.label,
    border: colors.separator,
    primary: colors.acento,
  },
};

const ICONOS: Record<keyof RootTabParamList, { activo: keyof typeof Ionicons.glyphMap; inactivo: keyof typeof Ionicons.glyphMap }> = {
  Inicio: { activo: 'home', inactivo: 'home-outline' },
  Deudas: { activo: 'flame', inactivo: 'flame-outline' },
};

/**
 * Botón de acceso rápido, montado FUERA del navegador de pestañas.
 *
 * Va acá y no dentro de cada pantalla por dos razones: así queda disponible
 * en todas sin repetirlo, y así sobrevive al cambio de pestaña sin
 * desmontarse. Consume el mismo estado global que las pantallas, que es lo
 * que hace que anotar desde el botón mueva los totales de ambas al instante.
 */
function AccesoRapidoGlobal({ margenInferior }: { margenInferior: number }) {
  const { q } = useDatosFinancieros();
  return (
    <AccesoRapido
      margenInferior={margenInferior}
      remanenteLibre={Math.max(0, q.distribucion.abonoCapitalSugerido)}
      onGuardar={(entrada) => void q.libro.agregar(entrada)}
    />
  );
}

export function RootTabs() {
  // En Android con navegación por gestos (el caso del Galaxy A12) el sistema
  // se reserva una franja inferior; sin sumarla a la altura del dock, la fila
  // de pestañas queda por debajo de esa franja: se ve cortada a la mitad y el
  // toque no llega al botón, lo recibe el sistema.
  const insets = useSafeAreaInsets();

  return (
    <DatosFinancierosProvider>
      <View style={styles.raiz}>
        <NavigationContainer theme={temaNavegacion}>
          <Tab.Navigator
            screenOptions={({ route }) => ({
              headerShown: false,
              tabBarActiveTintColor: colors.acento,
              tabBarInactiveTintColor: colors.labelSecondary,
              tabBarStyle: {
                backgroundColor: colors.surface,
                borderTopWidth: 1,
                borderTopColor: colors.separator,
                height: ALTO_DOCK + insets.bottom,
                paddingBottom: insets.bottom + spacing.xs,
                paddingTop: spacing.xs,
              },
              tabBarLabelStyle: { ...typography.caption2 },
              tabBarIcon: ({ focused, color, size }) => {
                const nombre = ICONOS[route.name as keyof RootTabParamList];
                return (
                  <Ionicons
                    name={focused ? nombre.activo : nombre.inactivo}
                    size={size}
                    color={color}
                  />
                );
              },
            })}
          >
            <Tab.Screen name="Inicio" component={ResumenScreen} />
            <Tab.Screen name="Deudas" component={DeudasScreen} />
          </Tab.Navigator>
        </NavigationContainer>
        <AccesoRapidoGlobal margenInferior={ALTO_DOCK + insets.bottom} />
      </View>
    </DatosFinancierosProvider>
  );
}

const styles = StyleSheet.create({
  raiz: { flex: 1 },
});
