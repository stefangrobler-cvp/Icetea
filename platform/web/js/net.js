// A WebSocket that reconnects by itself. Used by both the game screen and the phones.

export class Connection {
  /**
   * @param {object} handlers { onOpen(conn), onMessage(msg), onClose() }
   */
  constructor(handlers) {
    this.handlers = handlers;
    this.ws = null;
    this.retryMs = 500;
    this.stopped = false;
    this.connect();
  }

  get url() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${location.host}/ws`;
  }

  get open() {
    return this.ws?.readyState === WebSocket.OPEN;
  }

  connect() {
    if (this.stopped) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.onopen = () => {
      this.retryMs = 500;
      this.handlers.onOpen?.(this);
    };
    ws.onmessage = (e) => {
      let msg;
      try { msg = JSON.parse(e.data); } catch { return; }
      this.handlers.onMessage?.(msg);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.handlers.onClose?.();
      clearTimeout(this.timer);
      this.timer = setTimeout(() => this.connect(), this.retryMs);
      this.retryMs = Math.min(this.retryMs * 1.6, 4000);
    };
    ws.onerror = () => ws.close();
  }

  /** Drop the connection now and reconnect straight away (e.g. after the screen wakes up). */
  reconnectNow() {
    if (this.open) return;
    clearTimeout(this.timer);
    const old = this.ws;
    this.ws = null;
    if (old) { old.onclose = null; old.close(); }
    this.retryMs = 500;
    this.connect();
  }

  /** Close on purpose (e.g. the phone screen turned off). */
  closeQuietly() {
    clearTimeout(this.timer);
    const old = this.ws;
    this.ws = null;
    if (old) { old.onclose = null; old.close(); }
    this.handlers.onClose?.();
  }

  send(msg) {
    if (this.open) this.ws.send(typeof msg === 'string' ? msg : JSON.stringify(msg));
  }
}

/** Keep the screen from dimming/locking during play (supported on iOS 16.4+). */
export async function keepScreenOn() {
  try {
    if ('wakeLock' in navigator) {
      const lock = await navigator.wakeLock.request('screen');
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && lock.released) keepScreenOn();
      }, { once: true });
    }
  } catch { /* not supported or not allowed: fine */ }
}
