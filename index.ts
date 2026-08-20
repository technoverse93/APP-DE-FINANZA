// Debe ser el primer import del archivo: react-native-gesture-handler lo
// exige para inicializar sus manejadores nativos antes de que se monte
// cualquier otra cosa. React Navigation lo necesita para los gestos de swipe
// del bottom-tabs.
import 'react-native-gesture-handler';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
