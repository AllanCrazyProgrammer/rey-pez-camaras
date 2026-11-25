import type { CapacitorConfig } from '@capacitor/cli';

// App de Android: la misma web empaquetada (npm run build:app).
// No lleva la dirección del puente ni claves: se pega en la app la primera vez.
const config: CapacitorConfig = {
  appId: 'com.reypez.camaras',
  appName: 'Cámaras Rey Pez',
  webDir: 'dist-app',
  android: {
    backgroundColor: '#141412',
  },
};

export default config;
