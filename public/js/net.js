// Minimal STOMP 1.2 client over the browser's native WebSocket.
// Speaks directly to the mock backend at ws://<host>/ws — no external library needed.

const NULL = '\0';

function serialize(command, headers = {}, body = '') {
  let out = command + '\n';
  for (const [k, v] of Object.entries(headers)) out += `${k}:${v}\n`;
  out += '\n' + body + NULL;
  return out;
}

function parse(raw) {
  if (!raw || raw === '\n' || raw === '\r\n') return { command: 'HEARTBEAT', headers: {}, body: '' };
  const end = raw.indexOf(NULL);
  const text = end >= 0 ? raw.slice(0, end) : raw;
  const parts = text.split('\n\n');
  const head = parts.shift() || '';
  const body = parts.join('\n\n');
  const lines = head.split('\n');
  const command = (lines.shift() || '').trim();
  const headers = {};
  for (const line of lines) {
    const i = line.indexOf(':');
    if (i < 0) continue;
    headers[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return { command, headers, body };
}

export class StompClient {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.connected = false;
    this.subs = new Map();       // destination -> { id, cb }
    this.userQueues = new Map(); // personal /user/queue/* handlers
    this._subSeq = 0;
    this._pendingConnect = null;
    this.onStatusChange = null;
  }

  connect(login = 'anonymous') {
    return new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.url);
      } catch (e) { reject(e); return; }
      this._pendingConnect = { resolve, reject };
      this.ws.onopen = () => {
        this._send('CONNECT', { 'accept-version': '1.2', 'host': location.host, login, 'heart-beat': '0,0' });
      };
      this.ws.onmessage = (ev) => this._onMessage(ev.data);
      this.ws.onerror = (ev) => {
        this._setStatus('error', ev);
        if (this._pendingConnect) { this._pendingConnect.reject(new Error('ws-error')); this._pendingConnect = null; }
      };
      this.ws.onclose = () => {
        this.connected = false;
        this._setStatus('closed');
      };
    });
  }

  _setStatus(state, extra) {
    this.onStatusChange?.(state, extra);
  }

  _send(command, headers, body) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.ws.send(serialize(command, headers, body || ''));
    return true;
  }

  _onMessage(raw) {
    const frame = parse(raw);
    switch (frame.command) {
      case 'CONNECTED':
        this.connected = true;
        this._setStatus('connected');
        // Re-subscribe anything that was queued before CONNECT.
        for (const [dest, entry] of this.subs) {
          this._send('SUBSCRIBE', { id: entry.id, destination: dest, ack: 'auto' });
        }
        for (const [dest, entry] of this.userQueues) {
          this._send('SUBSCRIBE', { id: entry.id, destination: dest, ack: 'auto' });
        }
        if (this._pendingConnect) { this._pendingConnect.resolve(frame.headers); this._pendingConnect = null; }
        break;
      case 'MESSAGE': {
        const dest = frame.headers.destination;
        let payload = frame.body;
        try { payload = frame.body ? JSON.parse(frame.body) : null; } catch { /* keep string */ }
        const entry = this.subs.get(dest) || this.userQueues.get(dest);
        if (entry?.cb) entry.cb(payload, frame.headers);
        // Also fan-out to wildcard subscribers of /topic/room/*
        for (const [pattern, e] of this.subs) {
          if (pattern.includes('*') && _matchWild(pattern, dest)) e.cb(payload, frame.headers);
        }
        break;
      }
      case 'RECEIPT':
        break;
      case 'ERROR':
        this._setStatus('error', frame.headers.message || frame.body);
        break;
      default:
        break;
    }
  }

  subscribe(destination, cb) {
    const id = 'sub-' + (++this._subSeq);
    const entry = { id, cb };
    this.subs.set(destination, entry);
    if (this.connected) this._send('SUBSCRIBE', { id, destination, ack: 'auto' });
    return () => this.unsubscribe(destination);
  }

  subscribeUser(queue, cb) {
    const dest = queue.startsWith('/user/') ? queue : `/user/queue/${queue}`;
    const id = 'sub-' + (++this._subSeq);
    this.userQueues.set(dest, { id, cb });
    if (this.connected) this._send('SUBSCRIBE', { id, destination: dest, ack: 'auto' });
    return () => { this.userQueues.delete(dest); if (this.connected) this._send('UNSUBSCRIBE', { id }); };
  }

  unsubscribe(destination) {
    const entry = this.subs.get(destination);
    if (!entry) return;
    this.subs.delete(destination);
    if (this.connected) this._send('UNSUBSCRIBE', { id: entry.id });
  }

  send(destination, body, headers = {}) {
    const payload = typeof body === 'string' ? body : JSON.stringify(body || {});
    this._send('SEND', {
      destination,
      'content-type': 'application/json',
      'content-length': payload.length,
      ...headers
    }, payload);
  }

  disconnect() {
    if (this.ws) {
      this._send('DISCONNECT', { receipt: 'bye' });
      try { this.ws.close(); } catch { /* ignore */ }
    }
    this.connected = false;
  }
}

function _matchWild(pattern, dest) {
  const p = pattern.split('/');
  const d = dest.split('/');
  if (p.length !== d.length && p[p.length - 1] !== '*') return false;
  for (let i = 0; i < p.length; i++) {
    if (p[i] === '*') continue;
    if (p[i] !== d[i]) return false;
  }
  return true;
}

// Convenience helpers matching the spec's endpoint names.
export const DEST = {
  quickMatch: '/app/match/quick',
  cancelMatch: '/app/match/cancel',
  joinRoom: (code) => `/app/room/${code}/join`,
  move: (code) => `/app/game/${code}/move`,
  resign: (code) => `/app/game/${code}/resign`,
  undoRequest: (code) => `/app/game/${code}/undo/request`,
  undoRespond: (code) => `/app/game/${code}/undo/respond`,
  roomTopic: (code) => `/topic/room/${code}`
};
