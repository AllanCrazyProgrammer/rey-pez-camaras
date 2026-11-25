import type { CapacitorConfig } from '@capacitor/cli';

// App de Android. Abre la web publicada en GitHub Pages: así cada vez que
// se publica la web, la app ya tiene la versión nueva sin bajar otro APK.
// Sin internet muestra offline.html (va dentro del APK).
// No lleva la dirección del puente ni claves: se pega en la app la primera vez.
const config: CapacitorConfig = {
  appId: 'com.reypez.camaras',
  appName: 'Cámaras Rey Pez',
  webDir: 'dist-app',
  server: {
    url: 'https://allancrazyprogrammer.github.io/rey-pez-camaras/',
    errorPath: 'offline.html',
  },
  android: {
    backgroundColor: '#141412',
  },
};

export default config;
