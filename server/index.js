// Mock backend for the 3D Xiangqi MVP.
// - Serves the static frontend from /public and the shared rules module from /shared.
// - Exposes a STOMP-over-WebSocket endpoint at /ws for online rooms.
// - Provides REST endpoints for match persistence (in-memory substitute for PostgreSQL).

import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';

import { StompBroker } from './stomp.js';
import { RoomManager } from './rooms.js';
import { RatingsStore } from './ratings.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(ROOT, 'public');
const SHARED_DIR = path.join(ROOT, 'shared');

const PORT = Number(process.env.PORT || 8080);
const HOST = process.env.HOST || '0.0.0.0';

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2'
};

// In-memory match store — stand-in for PostgreSQL.
const matchStore = new Map();

// Persistent Elo ladder for ranked online play.
const ratings = new RatingsStore();
await ratings.load();

async function serveStatic(req, res) {
  let urlPath = decodeURIComponent(req.url.split('?')[0]);
  if (urlPath === '/') urlPath = '/index.html';
  let baseDir = PUBLIC_DIR;
  if (urlPath.startsWith('/shared/')) {
    baseDir = SHARED_DIR;
    urlPath = urlPath.slice('/shared'.length);
  }
  const safeRel = path.normalize(urlPath).replace(/^([/\\])+/, '');
  const filePath = path.join(baseDir, safeRel);
  if (!filePath.startsWith(baseDir)) {
    res.writeHead(403); res.end('Forbidden'); return;
  }
  try {
    const s = await stat(filePath);
    if (!s.isFile()) throw new Error('not-file');
    const type = MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': type,
      'Content-Length': body.length,
      'Cache-Control': 'no-cache'
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' });
    res.end('Not found');
  }
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = '';
    req.on('data', chunk => {
      data += chunk;
      if (data.length > 1_000_000) { reject(new Error('body-too-large')); req.destroy(); }
    });
    req.on('end', () => resolve(data));
    req.on('error', reject);
  });
}

function json(res, status, body) {
  const buf = Buffer.from(JSON.stringify(body));
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': buf.length,
    'Cache-Control': 'no-store',
    'Access-Control-Allow-Origin': '*'
  });
  res.end(buf);
}

async function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const p = url.pathname;
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    res.end();
    return true;
  }
  if (p === '/api/v1/matches/save' && req.method === 'POST') {
    try {
      const raw = await readBody(req);
      const payload = JSON.parse(raw || '{}');
      const id = payload.matchId || `m_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
      const record = {
        matchId: id,
        savedAt: new Date().toISOString(),
        mode: payload.mode || 'offline',
        players: payload.players || null,
        result: payload.result || null,
        history: payload.history || [],
        board: payload.board || null
      };
      matchStore.set(id, record);
      json(res, 200, { ok: true, matchId: id });
    } catch (e) {
      json(res, 400, { ok: false, error: String(e.message || e) });
    }
    return true;
  }
  if (p === '/api/v1/matches' && req.method === 'GET') {
    const list = [...matchStore.values()].map(m => ({
      matchId: m.matchId, savedAt: m.savedAt, mode: m.mode, result: m.result,
      players: m.players, plies: m.history?.length ?? 0
    })).sort((a, b) => (a.savedAt < b.savedAt ? 1 : -1));
    json(res, 200, { ok: true, matches: list });
    return true;
  }
  const m = p.match(/^\/api\/v1\/matches\/([A-Za-z0-9_\-]+)$/);
  if (m && req.method === 'GET') {
    const rec = matchStore.get(m[1]);
    if (!rec) { json(res, 404, { ok: false, error: 'not-found' }); return true; }
    json(res, 200, { ok: true, match: rec });
    return true;
  }
  const lb = p.match(/^\/api\/v1\/leaderboard$/);
  if (lb && req.method === 'GET') {
    const limit = Math.min(200, Number(url.searchParams.get('limit')) || 50);
    json(res, 200, { ok: true, players: ratings.leaderboard(limit) });
    return true;
  }
  const rm = p.match(/^\/api\/v1\/ratings\/([A-Za-z0-9_\-]+)$/);
  if (rm && req.method === 'GET') {
    const rec = ratings.get(rm[1]);
    if (!rec) { json(res, 404, { ok: false, error: 'not-found' }); return true; }
    json(res, 200, { ok: true, player: rec });
    return true;
  }
  if (p === '/api/v1/health' && req.method === 'GET') {
    json(res, 200, { ok: true, ts: Date.now() });
    return true;
  }
  return false;
}

const server = http.createServer(async (req, res) => {
  try {
    if (req.url.startsWith('/api/')) {
      const handled = await handleApi(req, res);
      if (handled) return;
    }
    await serveStatic(req, res);
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal error: ' + (e.message || e));
  }
});

// WebSocket / STOMP wiring.
const wss = new WebSocketServer({ noServer: true });
const broker = new StompBroker();
const rooms = new RoomManager(broker, ratings);

server.on('upgrade', (req, socket, head) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  if (url.pathname !== '/ws' && url.pathname !== '/stomp') {
    socket.destroy();
    return;
  }
  wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
});

wss.on('connection', (ws) => {
  const session = broker.attach(ws, {
    onSend: (sess, dest, body) => {
      let payload = {};
      try { payload = body ? JSON.parse(body) : {}; } catch { /* keep empty */ }
      // A stable client-supplied player id enables persistent ratings across sessions.
      if (typeof payload.playerId === 'string' && payload.playerId) {
        sess.playerId = payload.playerId.slice(0, 64);
      }
      routeSend(sess, dest, payload);
    },
    onDisconnect: (sess) => rooms.handleDisconnect(sess)
  });
  ws.on('close', () => rooms.handleDisconnect(session));
});

function routeSend(session, dest, payload) {
  // /app/match/quick, /app/match/cancel, /app/room/{code}/join,
  // /app/game/{code}/move, /app/game/{code}/resign,
  // /app/game/{code}/undo/request, /app/game/{code}/undo/respond
  if (dest === '/app/match/quick') {
    rooms.quickMatch(session, payload.name || 'player');
    return;
  }
  if (dest === '/app/match/cancel') {
    rooms.leaveQueue(session);
    broker.sendTo(session, '/user/queue/matchmaking', { status: 'cancelled' });
    return;
  }
  let m = dest.match(/^\/app\/room\/([A-Za-z0-9_\-]+)\/join$/);
  if (m) {
    rooms.joinByCode(session, m[1].toUpperCase(), payload.name || 'player');
    return;
  }
  m = dest.match(/^\/app\/game\/([A-Za-z0-9_\-]+)\/move$/);
  if (m) { rooms.handleMove(session, m[1].toUpperCase(), payload); return; }
  m = dest.match(/^\/app\/game\/([A-Za-z0-9_\-]+)\/resign$/);
  if (m) { rooms.handleResign(session, m[1].toUpperCase()); return; }
  m = dest.match(/^\/app\/game\/([A-Za-z0-9_\-]+)\/undo\/request$/);
  if (m) { rooms.handleUndoRequest(session, m[1].toUpperCase()); return; }
  m = dest.match(/^\/app\/game\/([A-Za-z0-9_\-]+)\/undo\/respond$/);
  if (m) { rooms.handleUndoResponse(session, m[1].toUpperCase(), !!payload.accept); return; }
  broker.error(session, `Unknown destination: ${dest}`);
}

server.listen(PORT, HOST, () => {
  console.log(`[xiangqi-mock] http://${HOST}:${PORT}`);
  console.log(`[xiangqi-mock] open  http://localhost:${PORT}/  in your browser`);
  console.log(`[xiangqi-mock] WS    ws://localhost:${PORT}/ws  (STOMP 1.2)`);
});
