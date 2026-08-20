import { Ionicons } from '@expo/vector-icons';
import { NavigationContainer, DefaultTheme } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { DeudasScreen } from '../screens/DeudasScreen';
import { InversionScreen } from '../screens/InversionScreen';
import { ResumenScreen } from '../screens/ResumenScreen';
import { colors, typography } from '../theme';

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
  Inversión: undefined;
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
    primary: colors.brandGold,
  },
};

const ICONOS: Record<keyof RootTabParamList, { activo: keyof typeof Ionicons.glyphMap; inactivo: keyof typeof Ionicons.glyphMap }> = {
  Inicio: { activo: 'home', inactivo: 'home-outline' },
  Deudas: { activo: 'flame', inactivo: 'flame-outline' },
  Inversión: { activo: 'trending-up', inactivo: 'trending-up-outline' },
};

export function RootTabs() {
  return (
    <NavigationContainer theme={temaNavegacion}>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.brandGold,
          tabBarInactiveTintColor: colors.labelSecondary,
          tabBarStyle: {
            backgroundColor: colors.surface,
            borderTopColor: colors.separator,
          },
          tabBarLabelStyle: { ...typography.caption2, fontWeight: '600' },
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
        <Tab.Screen name="Inversión" component={InversionScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
