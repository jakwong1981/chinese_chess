# 3D Xiangqi (中國象棋) — Frontend MVP + Mock Backend

A real-time, cross-platform 3D Chinese Chess (Xiangqi) web game. This repository implements a
**working, playable MVP** of the specification in [`chinese_chess.md`](./chinese_chess.md):

- **Frontend:** HTML5 + ES Modules + Three.js (r160), Web Worker AI, IndexedDB persistence.
- **Mock backend:** Node.js (no framework) serving static files, a minimal **STOMP 1.2** broker over
  WebSocket, an in-memory room/matchmaking/clock manager, and REST endpoints for match persistence.

> The full spec targets Java 21 / Spring Boot / PostgreSQL / Redis / Docker / Nginx. This MVP keeps the
> same **wire contract** (STOMP destinations, REST paths, event names) so the Node mock backend can be
> swapped for the Spring Boot implementation later without touching the frontend.

---

## Quick start

```bash
npm install
npm start          # serves http://localhost:8080
```

Open **http://localhost:8080** in a modern browser (desktop, tablet, or phone).

Optional environment variables:

| Var    | Default   | Purpose                |
| ------ | --------- | ---------------------- |
| `PORT` | `8080`    | HTTP + WebSocket port  |
| `HOST` | `0.0.0.0` | Bind address           |

Run the rules-engine smoke tests:

```bash
node scripts/rules-smoke.mjs
```

---

## Testing

A `node:test` unit suite covers the rules engine, the STOMP frame codec, and the room /
matchmaking / clock / undo manager:

```bash
npm test            # 19 unit tests
npm run test:rules  # extra rules smoke test
```

---

## Deployment (gated on unit tests)

The deployment runbook lives in [`deploy/`](./deploy) and **refuses to run unless the unit
tests pass first**.

```bash
npm run deploy:check   # run tests, then print the deployment plan (no changes)
npm run deploy         # run tests, then deploy for real
```

Or invoke directly:

```bash
bash deploy/deploy.sh               # tests gate, then deploy
bash deploy/deploy.sh --dry-run     # tests gate, then print plan only
bash deploy/deploy.sh --skip-tests  # deploy without the gate (not recommended)
```

What `deploy/deploy.sh` does, in order:

1. **Unit-test gate** — aborts on any failing test.
2. Installs Docker, UFW (allows 22/80/443) and Certbot (Ubuntu 22.04/24.04).
3. Creates `deploy/.env` from `deploy/.env.example` if missing (edit the placeholders).
4. `docker compose up -d --build` → services `xq_postgres`, `xq_redis`, `xq_backend`.
5. Installs the Nginx site (`deploy/nginx/xiangqi.conf`) with SSL termination and
   `proxy_set_header Upgrade $http_upgrade;` for the `/ws` WebSocket route.
6. Requests a Let's Encrypt certificate when `DOMAIN` is set to a real domain.

Files:

| Path                          | Purpose                                   |
| ----------------------------- | ----------------------------------------- |
| `deploy/Dockerfile`           | Multi-stage Node 20 image                 |
| `deploy/docker-compose.yml`   | `xq_postgres`, `xq_redis`, `xq_backend`   |
| `deploy/nginx/xiangqi.conf`   | Reverse proxy + WebSocket upgrade + TLS   |
| `deploy/.env.example`         | Credentials / domain template             |
| `deploy/deploy.sh`            | Test-gated deployment runbook             |

---

## What's implemented

### Game modes
- **Solo vs AI (offline):** 10-tier AI (Lv 1 入門 → Lv 10 棋聖) running in a Web Worker.
  Negamax + alpha-beta, MVV-LVA move ordering, material + piece-square evaluation, per-level
  blunder probability and time budget. Unrestricted 2-ply undo and move hints.
- **Online (mock):** STOMP-over-WebSocket quick match, private room codes, server-authoritative
  move validation, Fischer increment clocks, 15-second consensual undo (casual rooms).

### Ranking (天梯)
- **Quick Match games are ranked**; private rooms are casual and never touch the ladder.
- **Elo rating** per player (start 1200, K=32), persisted to `data/ratings.json` so the ladder
  survives restarts. Winner gains, loser drops; beating a stronger opponent is worth more.
- A stable per-browser `playerId` (stored in `localStorage`) keys the ladder — no accounts needed.
- **Rating-aware matchmaking:** quick match prefers the queued opponent closest in rating.
- Live rating badges beside the clocks, a rating delta (e.g. `+16 / −16`) on the game-over screen,
  and a **Ladder 天梯** leaderboard panel (top players, your rank highlighted).

### 3D interaction
- Flat cylindrical tokens with canvas-rendered Chinese characters (帥/將, 仕/士, 相/象, 傌/馬, …).
- Wooden board with grid, palaces, river, star points; realistic per-side character orientation.
- **Dual input:** drag-and-drop *and* click-to-move.
- **Mobile offset:** +0.35 world-unit vertical lift on touch drag so the finger doesn't hide the piece.
- Camera: elevation slider, drag-to-orbit, wheel/pinch zoom, flip.
- Flying-general laser warning beam when the two kings would face each other.
- Animated moves (parabolic hop) and capture fade-out.

### Persistence & replay
- Offline matches auto-save to **IndexedDB** and are also pushed to the mock backend
  (`POST /api/v1/matches/save`).
- Interactive replay: load a saved match, step / play / pause, **1× / 2× / 4×** speeds, timeline
  scrubbing, and **fork vs AI** (continue a historical position as a live game).

### Responsive layout
- Desktop (≥1200px): 3 columns (settings / board / history+replay).
- Tablet (768–1199px): 2 columns, settings collapses to a drawer.
- Mobile (<768px): single column with a bottom-sheet control bar.

---

## Wire contract (matches the spec)

| Endpoint / destination            | Purpose                                   |
| --------------------------------- | ----------------------------------------- |
| `POST /api/v1/matches/save`       | Persist a match                            |
| `GET  /api/v1/matches/{matchId}`  | Retrieve a match for replay                |
| `GET  /api/v1/matches`            | List saved matches                         |
| `GET  /api/v1/leaderboard`        | Top players by rating (`?limit=`)          |
| `GET  /api/v1/ratings/{playerId}` | One player's rating / W-L-D record         |
| `GET  /api/v1/health`             | Liveness probe                             |
| `WS   /ws`                        | STOMP 1.2 transport                        |
| `SEND /app/match/quick`           | Join quick-match queue                     |
| `SEND /app/room/{code}/join`      | Join / create a private room               |
| `SEND /app/game/{code}/move`      | Submit `{fromX, fromY, toX, toY}`          |
| `SEND /app/game/{code}/resign`    | Resign                                     |
| `SEND /app/game/{code}/undo/request` | Request consensual undo                 |
| `SEND /app/game/{code}/undo/respond` | Accept/decline undo `{accept}`          |
| `SUB  /topic/room/{code}`         | `MOVE_CONFIRMED`, `MOVE_REJECTED`, `GAME_OVER` (with rating deltas on ranked games), `CLOCK`, undo events |
| `SUB  /user/queue/matchmaking`    | Queue status                               |
| `SUB  /user/queue/joined`         | Room assignment (side, clocks)             |

---

## Project layout

```
chinese_chese/
├── chinese_chess.md          # Original specification
├── package.json
├── shared/
│   └── rules.js              # Xiangqi rules engine (used by client AND server)
├── server/
│   ├── index.js              # HTTP server + static + REST + WS upgrade
│   ├── stomp.js              # Minimal STOMP 1.2 broker
│   └── rooms.js              # Rooms, matchmaking, clocks, undo consensus
├── public/
│   ├── index.html
│   ├── css/style.css         # Responsive 3/2/1-column layout
│   └── js/
│       ├── main.js           # Bootstrap
│       ├── scene.js          # Three.js scene, camera, lights, orbit
│       ├── board.js          # Board geometry + canvas texture
│       ├── pieces.js         # Flat-token meshes + highlight rings
│       ├── input.js          # Raycast, drag, click, camera, mobile offset
│       ├── game.js           # Game controller (offline/online/replay)
│       ├── ai.js             # Negamax AI (also runs as a Web Worker)
│       ├── ui.js             # DOM bindings, HUD, dialogs
│       ├── replay.js         # Playback controller (1x/2x/4x, scrub, fork)
│       ├── storage.js        # IndexedDB persistence
│       └── net.js            # STOMP client
└── scripts/
    └── rules-smoke.mjs       # Rules engine smoke tests
```

---

## Keyboard shortcuts

| Key              | Action                       |
| ---------------- | ---------------------------- |
| `N`              | New offline game             |
| `U`              | Undo                         |
| `H`              | Hint                         |
| `F`              | Flip board                   |
| `←` / `→`        | Replay step back / forward   |
| `Home` / `End`   | Replay jump to start / end   |
| `R`              | Replay play / pause          |
| `Esc`            | Deselect piece               |

---

## Notes & known limitations (MVP)

- The AI is intentionally **minimal** (negamax, depth ≤ 5, heuristic eval). It is not the
  16-ply grandmaster engine described in the spec; it is strong enough to play a real game and
  finds basic tactics (e.g. cannon screens).
- Perpetual-check / repetition rules are not enforced.
- The mock backend stores matches in memory; restarting the server clears them. IndexedDB on the
  client persists offline games across sessions.
- 3D pieces are flat tokens with characters (per the chosen fidelity), not sculpted figures.
