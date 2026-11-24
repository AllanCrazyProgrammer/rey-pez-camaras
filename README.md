# Cámaras · Bodega Rey Pez

Visor web propio para las cámaras Dahua de la bodega de Rey Pez (Tampico).
Sustituye a DMSS: un solo mosaico con las 14 cámaras, sin dos apps.

- **DVR:** Dahua DH-XVR1B16H-I/T, 16CH hasta 5MP. Solo Dahua por ahora; el
  Hikvision queda fuera de este repo hasta que se decida su alcance.
- **Video:** el navegador no lee RTSP. Un puente **go2rtc** en la red local
  de la bodega convierte RTSP → HLS y esta app reproduce ese HLS.
- **Stack:** Vite + React 19 + TypeScript. Componentes funcionales y hooks,
  nada de clases (salvo `ErrorBoundary`, que React exige como clase).
  `hls.js` para HLS con fallback nativo en Safari.

## Cómo correr

```bash
npm install
npm run dev     # desarrollo, http://localhost:5173
npm run build   # build de producción (tsc + vite build)
npm run preview # servir el build
```

## Cómo poner el puente go2rtc (Mac mini, arriba junto al DVR)

1. Consigue la IP local del DVR: en el DVR, Menú Principal → Sistema →
   Red → TCP/IP. O con Fing desde el celular, en la misma red. Déjala fija.
2. En la Mac mini (por cable junto al DVR, siempre prendida), descarga
   go2rtc (<https://github.com/AlexxIT/go2rtc>).
3. Abre esta app → **Ajustes**, pon IP, usuario y clave del DVR. Copia o
   descarga el `go2rtc.yaml` que genera y guárdalo junto al ejecutable de
   go2rtc en la Mac mini.
4. Arranca go2rtc. Escucha solo en la propia Mac (`127.0.0.1:1984`).
   Prueba ahí `http://localhost:1984`.
5. **HTTPS con Tailscale Serve** (obligatorio para la web en vivo):
   - Tailscale en la Mac mini y en cada visor, con la misma cuenta.
   - En <https://login.tailscale.com/admin/dns> activa MagicDNS y HTTPS
     Certificates.
   - En la Mac mini: `tailscale serve --bg 1984` → da
     `https://mac-mini.tu-red.ts.net`.
   - Esa dirección va en Ajustes → “Puente go2rtc”.

La pestaña **Guía del puente** dentro de la app explica los 5 pasos.

### Por qué HTTPS y CORS

- La app vive en `https://…github.io`. Los navegadores bloquean video
  `http://` dentro de una página `https://` (contenido mixto). Por eso
  `http://100.x.x.x:1984` no sirve desde la web: hace falta la dirección
  `https://…ts.net` de Tailscale Serve. Excepción: `http://localhost` en la
  propia Mac mini.
- Si el puente en Ajustes es `http://`, la app lo avisa (“Puente sin
  HTTPS”) en vez de mostrar “Sin señal”.
- El `go2rtc.yaml` generado trae `api.origin: "*"` (CORS), para que la web
  pueda leer el HLS del puente, y `listen: "127.0.0.1:1984"` para que go2rtc
  no quede abierto en la red; Tailscale Serve lo publica solo a tus aparatos.

## Rendimiento

- Mosaico con **substream** (ligero); vista grande con **stream principal**.
- `React.memo` en `CameraTile`, `useMemo`/`useCallback` para no
  re-renderizar todo el mosaico al cambiar una cámara.
- El player solo se monta cuando la baldosa es visible
  (`IntersectionObserver`); al desmontar, el hook `useHls` destruye la
  instancia de hls.js (cleanup de `useEffect`).
- `React.lazy` + `Suspense`: Ajustes y Guía se cargan solo al abrirlas.
- `ErrorBoundary` para que un fallo de render no tumbe toda la app.

## Seguridad: la IP y la clave NO van en el repo

- Se escriben en la app y se guardan solo en `localStorage` del navegador.
- `.env.example` trae solo placeholders. `.gitignore` excluye `.env` y
  `go2rtc.yaml` (que lleva la clave real).
- Nunca subas un `go2rtc.yaml` generado a GitHub: vive solo en la compu
  de la bodega.

## Estructura

```
src/
  App.tsx                  # Tabs (Mosaico / Ajustes / Guía) + vista grande
  components/
    CameraGrid.tsx         # Mosaico 2×2 / 3×3 / 4×4
    CameraTile.tsx         # Baldosa memoizada, lazy por visibilidad
    CameraDetail.tsx       # Vista grande, stream principal, foto del momento
    SettingsPanel.tsx      # DVR, puente, renombrar cámaras, RTSP, go2rtc.yaml
    BridgeGuide.tsx        # Guía del puente en 4 pasos
    ErrorBoundary.tsx      # Único componente de clase
  hooks/
    useCameras.ts          # Estado + persistencia en localStorage
    useHls.ts              # hls.js con cleanup, fallback Safari nativo
  lib/
    rtsp.ts                # URLs RTSP, HLS y generador de go2rtc.yaml
    types.ts               # CameraConfig, DvrSettings
  data/
    defaultCameras.ts      # 14 cámaras (Cámara 1..14, editables en la app)
```

## Licencia

MIT — ver `LICENSE`.
