/**
 * Video directo de go2rtc (MSE por WebSocket): el video llega continuo en
 * vez de en pedazos como HLS. go2rtc manda fragmentos fMP4 por /api/ws y aquí se meten
 * a un MediaSource. Mismo protocolo que el reproductor web de go2rtc
 * (video-rtc.js): se pide {"type":"mse","value":"<codecs>"} y responde
 * {"type":"mse","value":"video/mp4; codecs=..."} seguido de los datos.
 */

// Solo video: las cámaras se ven sin audio, así no se manda audio.
const VIDEO_CODECS = ['avc1.640029', 'avc1.64002A', 'avc1.640033', 'hvc1.1.6.L153.B0'];

const TARGET_BUFFER_S = 0.7;

type MSClass = typeof MediaSource;

function mediaSourceClass(): MSClass | null {
  const w = window as unknown as { ManagedMediaSource?: MSClass; MediaSource?: MSClass };
  // iPhone (iOS 17.1+) solo tiene ManagedMediaSource.
  return w.ManagedMediaSource ?? w.MediaSource ?? null;
}

/** true si este navegador puede usar el video directo. */
export function mseSupported(): boolean {
  const MS = mediaSourceClass();
  return !!MS && VIDEO_CODECS.some((c) => MS.isTypeSupported(`video/mp4; codecs="${c}"`));
}

/** De la URL HLS (…/api/stream.m3u8?src=cam1sub&mp4) saca la del WebSocket. */
export function wsUrlFromHls(hlsUrl: string): string | null {
  try {
    const u = new URL(hlsUrl);
    const src = u.searchParams.get('src');
    if (!src) return null;
    const base = u.pathname.replace(/\/api\/stream\.m3u8$/, '');
    return `${u.protocol === 'https:' ? 'wss:' : 'ws:'}//${u.host}${base}/api/ws?src=${encodeURIComponent(src)}`;
  } catch {
    return null;
  }
}

/**
 * Conecta `video` al stream. Llama a `onFail` si la conexión se cae o el
 * navegador no acepta el video (el que llama decide reintentar o usar HLS).
 * Devuelve una función para desconectar.
 */
export function startMse(video: HTMLVideoElement, wsUrl: string, onFail: () => void): () => void {
  const MS = mediaSourceClass();
  if (!MS) {
    onFail();
    return () => undefined;
  }
  let stopped = false;
  let failed = false;
  const fail = () => {
    if (stopped || failed) return;
    failed = true;
    onFail();
  };

  const ms = new MS();
  const managed = 'ManagedMediaSource' in window && MS === (window as unknown as { ManagedMediaSource: MSClass }).ManagedMediaSource;
  let objectUrl: string | null = null;
  if (managed) {
    video.disableRemotePlayback = true;
    video.srcObject = ms as unknown as MediaProvider;
  } else {
    objectUrl = URL.createObjectURL(ms);
    video.src = objectUrl;
  }

  const ws = new WebSocket(wsUrl);
  ws.binaryType = 'arraybuffer';
  let sb: SourceBuffer | null = null;
  // Datos que llegan mientras el SourceBuffer está ocupado.
  const pending: ArrayBuffer[] = [];

  const flush = () => {
    if (!sb || sb.updating || !pending.length) return;
    const total = pending.reduce((n, b) => n + b.byteLength, 0);
    const data = new Uint8Array(total);
    let off = 0;
    for (const b of pending) {
      data.set(new Uint8Array(b), off);
      off += b.byteLength;
    }
    pending.length = 0;
    try {
      sb.appendBuffer(data);
    } catch {
      fail();
    }
  };

  const onUpdateEnd = () => {
    if (!sb || stopped) return;
    if (!sb.updating && pending.length) {
      flush();
      return;
    }
    if (sb.updating || !sb.buffered.length) return;
    // Quedarse pegado al "en vivo": guardar solo los últimos 5 s y ajustar
    // la velocidad para no quedarse atrás (igual que go2rtc).
    const end = sb.buffered.end(sb.buffered.length - 1);
    const start = end - 5;
    const start0 = sb.buffered.start(0);
    try {
      if (start > start0) sb.remove(start0, start);
      if ('setLiveSeekableRange' in ms) ms.setLiveSeekableRange(Math.max(0, start), end);
    } catch {
      /* se intenta en el siguiente fragmento */
    }
    if (video.currentTime < start) video.currentTime = start;
    // Colchón objetivo de 0.7 s: si hay más, acelera un poco; si hay
    // menos, frena un poco para no quedarse sin video.
    const gap = end - video.currentTime;
    video.playbackRate = Math.min(1.5, Math.max(0.5, gap / TARGET_BUFFER_S));
  };

  ms.addEventListener('sourceopen', () => {
    if (stopped) return;
    ws.addEventListener('open', () => {
      const codecs = VIDEO_CODECS.filter((c) => MS.isTypeSupported(`video/mp4; codecs="${c}"`)).join();
      ws.send(JSON.stringify({ type: 'mse', value: codecs }));
    });
    if (ws.readyState === WebSocket.OPEN) {
      const codecs = VIDEO_CODECS.filter((c) => MS.isTypeSupported(`video/mp4; codecs="${c}"`)).join();
      ws.send(JSON.stringify({ type: 'mse', value: codecs }));
    }
  });

  ws.addEventListener('message', (ev) => {
    if (stopped) return;
    if (typeof ev.data === 'string') {
      let msg: { type?: string; value?: string } = {};
      try {
        msg = JSON.parse(ev.data);
      } catch {
        return;
      }
      if (msg.type === 'mse' && msg.value && !sb) {
        try {
          sb = ms.addSourceBuffer(msg.value);
          sb.mode = 'segments';
          sb.addEventListener('updateend', onUpdateEnd);
          void video.play().catch(() => undefined);
        } catch {
          fail();
        }
      } else if (msg.type === 'error') {
        fail();
      }
      return;
    }
    pending.push(ev.data as ArrayBuffer);
    flush();
  });
  ws.addEventListener('close', fail);
  ws.addEventListener('error', fail);

  return () => {
    stopped = true;
    ws.removeEventListener('close', fail);
    ws.removeEventListener('error', fail);
    try {
      ws.close();
    } catch {
      /* ya cerrado */
    }
    if (managed) video.srcObject = null;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
  };
}
