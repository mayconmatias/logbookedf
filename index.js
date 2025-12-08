import 'react-native-gesture-handler'; // <--- ADICIONE ISTO NA LINHA 1
import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent chama AppRegistry.registerComponent('main', () => App);
// Isso garante que o app carregue corretamente tanto no Expo Go quanto na Build Nativa.
registerRootComponent(App);