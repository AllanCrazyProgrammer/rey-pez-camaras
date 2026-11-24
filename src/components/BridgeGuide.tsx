/**
 * Guía en 5 pasos para poner el puente go2rtc en la Mac mini.
 * Sin puente no hay video en el navegador: el navegador no lee RTSP.
 * Y como la app vive en https://, el puente también tiene que ser https
 * (Tailscale Serve); si no, el navegador bloquea el video.
 */
export function BridgeGuide() {
  return (
    <section className="panel" aria-label="Guía del puente go2rtc">
      <h2>Guía del puente — 5 pasos</h2>
      <ol className="guide-steps">
        <li>
          <strong>Consigue la IP del DVR.</strong> En el DVR: Menú Principal → Sistema →
          Red → TCP/IP. O desde el celular con Fing (misma red del DVR),
          buscando el equipo Dahua. Sin adivinar 192.168.1.108. Déjala fija.
        </li>
        <li>
          <strong>Instala go2rtc en la Mac mini</strong> (arriba, por cable junto
          al DVR, siempre prendida). Descárgalo de{' '}
          <a href="https://github.com/AlexxIT/go2rtc" target="_blank" rel="noreferrer">
            github.com/AlexxIT/go2rtc
          </a>
          . No necesita instalarse: es un solo ejecutable.
        </li>
        <li>
          <strong>Genera el archivo en Ajustes.</strong> Pon la IP, usuario y clave
          del DVR en la pestaña Ajustes y copia o descarga el{' '}
          <code>go2rtc.yaml</code> que genera la app. Guárdalo junto al
          ejecutable de go2rtc, en la Mac mini. No lo subas a GitHub.
        </li>
        <li>
          <strong>Arranca go2rtc y pruébalo en la Mac mini.</strong> Escucha solo
          dentro de la propia Mac mini (<code>127.0.0.1:1984</code>), así no
          queda abierto en la red. En esa Mac abre{' '}
          <code>http://localhost:1984</code>: debe salir la página de go2rtc con
          las cámaras. Para probar el mosaico ahí mismo, en Chrome, pon{' '}
          <code>http://localhost:1984</code> en Ajustes → “Puente go2rtc”.
        </li>
        <li>
          <strong>Publica el puente con HTTPS: Tailscale Serve.</strong>
          <ul>
            <li>
              Instala Tailscale en la Mac mini y en cada aparato que va a ver
              (celular, compu, pantallas de abajo, Apple TV), con la misma
              cuenta.
            </li>
            <li>
              En el panel de Tailscale (
              <a href="https://login.tailscale.com/admin/dns" target="_blank" rel="noreferrer">
                login.tailscale.com/admin/dns
              </a>
              ) activa <strong>MagicDNS</strong> y <strong>HTTPS Certificates</strong>.
            </li>
            <li>
              En la Mac mini, en Terminal: <code>tailscale serve --bg 1984</code>.
              Te da una dirección como{' '}
              <code>https://mac-mini.tu-red.ts.net</code>.
            </li>
            <li>
              Pon esa dirección en Ajustes → “Puente go2rtc”. Sirve desde abajo,
              desde casa y desde el celular, con Tailscale prendido. Solo tus
              aparatos con Tailscale la pueden abrir; no queda pública ni hay que
              abrir puertos.
            </li>
            <li>
              Si Chrome pregunta si la página puede usar dispositivos de tu red
              local, toca <strong>Permitir</strong>.
            </li>
          </ul>
        </li>
      </ol>
      <h3>¿Por qué hace falta un puente?</h3>
      <p>
        El DVR habla RTSP (<code>rtsp://…:554/cam/realmonitor</code>) y ningún
        navegador lo reproduce directo. go2rtc lo convierte a HLS, que sí
        entienden Chrome, Edge, Firefox y Safari (este último de forma
        nativa). El mosaico usa el substream (ligero) y la vista grande el
        stream principal.
      </p>
      <h3>¿Por qué HTTPS y no la IP 100.x?</h3>
      <p>
        La app vive en <code>https://…github.io</code>. Los navegadores
        bloquean video <code>http://</code> dentro de una página{' '}
        <code>https://</code> (“contenido mixto”). Por eso{' '}
        <code>http://100.x.x.x:1984</code> no sirve desde la web: hace falta la
        dirección <code>https://…ts.net</code> de Tailscale Serve. El{' '}
        <code>go2rtc.yaml</code> ya trae <code>origin: &quot;*&quot;</code> para
        que la web pueda leer el video del puente (CORS).
      </p>
      <h3>Si una cámara dice “Puente sin HTTPS”</h3>
      <ul>
        <li>
          En Ajustes, el puente está con <code>http://</code>. Cámbialo por la
          dirección <code>https://…ts.net</code> del paso 5.
        </li>
      </ul>
      <h3>Si una cámara dice “Sin señal”</h3>
      <ul>
        <li>Revisa que go2rtc siga corriendo en la Mac mini.</li>
        <li>
          Revisa que Tailscale Serve siga activo: en la Mac mini,{' '}
          <code>tailscale serve status</code> debe mostrar el puerto 1984.
        </li>
        <li>Verifica IP, usuario y clave del DVR en Ajustes y vuelve a generar el yaml.</li>
        <li>
          Confirma que la Mac mini y el DVR estén en la misma red, y que el
          aparato con el que ves tenga Tailscale prendido.
        </li>
        <li>En el DVR, el video debe estar en H.264 (no H.265) para el puente.</li>
      </ul>
    </section>
  );
}
