/**
 * Guía en 4 pasos para poner el puente go2rtc en la bodega.
 * Sin puente no hay video en el navegador: el navegador no lee RTSP.
 */
export function BridgeGuide() {
  return (
    <section className="panel" aria-label="Guía del puente go2rtc">
      <h2>Guía del puente — 5 pasos</h2>
      <ol className="guide-steps">
        <li>
          <strong>Consigue la IP del DVR.</strong> En el DVR: Menú Principal → Sistema →
          Red → TCP/IP. O desde el celular con Fing (misma WiFi de la bodega),
          buscando el equipo Dahua. Sin adivinar 192.168.1.108.
        </li>
        <li>
          <strong>Instala go2rtc en una compu de la bodega</strong> que quede prendida
          (Windows, Mac o Linux). Descárgalo de{' '}
          <a href="https://github.com/AlexxIT/go2rtc" target="_blank" rel="noreferrer">
            github.com/AlexxIT/go2rtc
          </a>
          . No necesita instalarse: es un solo ejecutable.
        </li>
        <li>
          <strong>Genera el archivo en Ajustes.</strong> Pon la IP, usuario y clave
          del DVR en la pestaña Ajustes y copia o descarga el{' '}
          <code>go2rtc.yaml</code> que genera la app. Guárdalo junto al
          ejecutable de go2rtc, en esa compu. No lo subas a GitHub.
        </li>
        <li>
          <strong>Arranca go2rtc y pon su dirección en Ajustes.</strong> Al
          arrancar escucha en el puerto 1984. En Ajustes, en “Puente go2rtc”,
          pon por ejemplo <code>http://192.168.1.100:1984</code> (la IP de esa
          compu). Vuelve al mosaico: las cámaras deben pasar a “En vivo”.
        </li>
        <li>
          <strong>Ver desde casa o desde otra red: Tailscale.</strong> Instala
          Tailscale en la Mac mini y en cada aparato que va a ver (celular,
          compu, Apple TV), con la misma cuenta. La Mac mini queda arriba,
          por cable junto al DVR, corriendo go2rtc. En Ajustes, en “Puente
          go2rtc”, pon la IP de Tailscale de la Mac mini, por ejemplo{' '}
          <code>http://100.64.0.10:1984</code> (la IP 100.x que le da
          Tailscale, no la de la bodega). Así se ve desde casa, desde abajo
          aunque sea otra red, y desde cualquier lugar donde Tailscale esté
          prendido. Sin abrir puertos ni exponer el DVR a internet.
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
      <h3>Si una cámara dice “Sin señal”</h3>
      <ul>
        <li>Revisa que go2rtc siga corriendo en la compu de la bodega.</li>
        <li>Verifica IP, usuario y clave en Ajustes.</li>
        <li>Confirma que la compu y el DVR estén en la misma red (o que ambos
        estén en Tailscale, si ves desde fuera).</li>
        <li>En el DVR, el video debe estar en H.264 (no H.265) para el puente.</li>
      </ul>
    </section>
  );
}
