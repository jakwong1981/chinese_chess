// Minimal STOMP 1.2 broker over a raw WebSocket.
// Implements just enough of the protocol for the Xiangqi client: CONNECT, SUBSCRIBE,
// UNSUBSCRIBE, SEND, DISCONNECT, and server-pushed MESSAGE frames.

const NULL = '\0';

export function parseFrame(raw) {
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

export function serializeFrame(command, headers = {}, body = '') {
  let out = command + '\n';
  for (const [k, v] of Object.entries(headers)) out += `${k}:${v}\n`;
  out += '\n';
  out += body;
  out += NULL;
  return out;
}

// Broker keeps topic subscriptions per session and lets the app layer publish to topics.
export class StompBroker {
  constructor() {
    this.sessions = new Map(); // ws -> { id, subs: Map<subId, destination>, onSend }
  }

  attach(ws, handlers = {}) {
    const session = {
      ws,
      id: null,
      connected: false,
      subs: new Map(),
      handlers
    };
    this.sessions.set(ws, session);

    ws.on('message', (data) => {
      const raw = data.toString();
      let frame;
      try { frame = parseFrame(raw); } catch { return; }
      this._handle(session, frame);
    });

    ws.on('close', () => {
      if (handlers.onDisconnect) handlers.onDisconnect(session);
      this.sessions.delete(ws);
    });

    ws.on('error', () => {
      this.sessions.delete(ws);
    });

    return session;
  }

  _handle(session, frame) {
    switch (frame.command) {
      case 'CONNECT':
      case 'STOMP': {
        session.id = frame.headers['login'] || 'sess-' + Math.random().toString(36).slice(2, 10);
        session.connected = true;
        this._send(session.ws, 'CONNECTED', {
          version: '1.2',
          'heart-beat': '0,0',
          'server': 'xiangqi-mock/0.1',
          'session': session.id
        });
        if (session.handlers.onConnect) session.handlers.onConnect(session);
        break;
      }
      case 'SUBSCRIBE': {
        const id = frame.headers.id;
        const dest = frame.headers.destination;
        if (!id || !dest) return;
        session.subs.set(id, dest);
        if (session.handlers.onSubscribe) session.handlers.onSubscribe(session, dest, id);
        break;
      }
      case 'UNSUBSCRIBE': {
        const id = frame.headers.id;
        const dest = session.subs.get(id);
        session.subs.delete(id);
        if (dest && session.handlers.onUnsubscribe) session.handlers.onUnsubscribe(session, dest, id);
        break;
      }
      case 'SEND': {
        const dest = frame.headers.destination;
        if (!dest) return;
        if (session.handlers.onSend) session.handlers.onSend(session, dest, frame.body, frame.headers);
        break;
      }
      case 'DISCONNECT': {
        this._send(session.ws, 'RECEIPT', { receipt: frame.headers.receipt || 'bye' });
        if (session.handlers.onDisconnect) session.handlers.onDisconnect(session);
        try { session.ws.close(); } catch { /* ignore */ }
        this.sessions.delete(session.ws);
        break;
      }
      default:
        break;
    }
  }

  _send(ws, command, headers, body) {
    if (!ws || ws.readyState !== 1) return;
    try { ws.send(serializeFrame(command, headers, body || '')); } catch { /* ignore */ }
  }

  // Deliver a MESSAGE to every session subscribed to `destination`.
  publish(destination, body, extraHeaders = {}) {
    for (const session of this.sessions.values()) {
      for (const [subId, dest] of session.subs) {
        if (dest === destination) {
          this._send(session.ws, 'MESSAGE', {
            subscription: subId,
            'message-id': `${session.id}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            destination,
            'content-type': 'application/json',
            ...extraHeaders
          }, typeof body === 'string' ? body : JSON.stringify(body));
        }
      }
    }
  }

  // Deliver to a single session (e.g. personal error channel).
  sendTo(session, destination, body) {
    this._send(session.ws, 'MESSAGE', {
      subscription: 'personal',
      'message-id': `${session.id}-${Date.now()}`,
      destination,
      'content-type': 'application/json'
    }, typeof body === 'string' ? body : JSON.stringify(body));
  }

  error(session, message, receipt) {
    this._send(session.ws, 'ERROR', {
      version: '1.2',
      'content-type': 'text/plain',
      message,
      ...(receipt ? { receipt } : {})
    }, message);
  }
}
