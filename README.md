# 3D Xiangqi (中國象棋) — Frontend MVP + Mock Backend

A real-time, cross-platform 3D Chinese Chess (Xiangqi) web game. This repository implements a
**working, playable MVP** of the specification in [`chinese_chess.md`](./chinese_chess.md):

- **Frontend:** HTML5 + ES Modules + Three.js (r160), Web Worker AI, IndexedDB persistence.
- **Mock backend:** Node.js (no framework) serving static files, a minimal **STOMP 1.2** broker over
  WebSocket, an in-memory room/matchmaking/clock manager, and REST endpoints for match persistence.

> The full spec targets Java 21 / Spring Boot / PostgreSQL / Redis / Docker / Nginx. This MVP keeps the
> same **wire contract** (STOMP destinations, REST paths, event names) so the Node mock backend can be
> swapped for the Spring Boot implementation without touching the frontend — see
> [Spring Boot backend](#spring-boot-backend-drop-in-replacement) (`server-java/`).

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
npm test            # 36 unit tests
npm run test:rules  # extra rules smoke test
```

---

## Spring Boot backend (drop-in replacement)

`server-java/` contains a Java / Spring Boot port of the Node mock backend with the
**identical wire contract** — same REST paths, same STOMP destinations, same JSON
payloads — so the frontend runs against either backend **unchanged**.

Run it from `server-java/` (Java 17+ required; the Maven wrapper handles Maven itself).
**PostgreSQL and Redis must be reachable** — the backend persists matches and the Elo
ladder in Postgres, keeps room state and pub/sub in Redis, and refuses to start without
them (set `XQ_CLUSTER_MODE=memory` to run single-process without Redis):

```bash
docker compose -f deploy/docker-compose.yml up -d xq_postgres xq_redis   # one-time, from the repo root
cd server-java
./mvnw spring-boot:run     # serves http://localhost:8080 (stop the Node backend first)
./mvnw test                # unit + integration tests (embedded H2 + memory mode, no Docker needed)
```

Configuration (environment variables):

| Var                          | Default                              | Purpose                                    |
| ---------------------------- | ------------------------------------ | ------------------------------------------ |
| `PORT`                       | `8080`                               | HTTP + WebSocket port                      |
| `XQ_STATIC_ROOT`             | `..` (repo root)                     | Where `public/` and `shared/` live         |
| `SPRING_DATASOURCE_URL`      | `jdbc:postgresql://localhost:5432/xiangqi` | JDBC connection string               |
| `SPRING_DATASOURCE_USERNAME` | `xiangqi`                            | DB user (falls back to `POSTGRES_USER`)    |
| `SPRING_DATASOURCE_PASSWORD` | `xiangqi`                            | DB password (falls back to `POSTGRES_PASSWORD`) |
| `REDIS_HOST`                 | `localhost`                          | Redis host (room state + pub/sub)          |
| `REDIS_PORT`                 | `6379`                               | Redis port                                 |
| `REDIS_PASSWORD`             | _(none)_                             | Redis password                             |
| `XQ_CLUSTER_MODE`            | `redis`                              | `redis` shares rooms across replicas; `memory` runs single-process |
| `XQ_RATINGS_FILE`            | `../data/ratings.json`               | One-time legacy import source (see below)  |

Parity notes:

- Persistence is real PostgreSQL: the `matches` and `players` tables replace the
  mock's in-memory match store and JSON ratings file. On first boot with an empty
  `players` table, an existing `data/ratings.json` (Node-mock shape) is imported
  automatically so the ladder carries over.
- Room state and outbound events run through Redis (`xq:room:*` JSON blobs, a shared
  matchmaking queue, and a single `xq:bus` pub/sub channel). Every instance publishes
  all events to the bus and delivers to its own WebSocket sessions, so replicas
  pointed at the same Redis share rooms — a move submitted to one replica reaches a
  player connected to another. Put replicas behind one L7 proxy. For a local run
  without Redis, start with `XQ_CLUSTER_MODE=memory` (this is also how the test
  suite stays Docker-free).
- Personal STOMP queues (`/user/queue/matchmaking`, `/user/queue/joined`) are delivered
  with the literal destination headers the browser client matches on.
- One deliberate fix: the Java server computes move notation from the pre-move board,
  so `MOVE_CONFIRMED` carries real Chinese notation instead of the mock's `"??"`.

Switching between backends (no frontend changes needed):

```bash
# Node mock (default)
npm start                                   # http://localhost:8080

# Spring Boot — same port; stop the other backend first, Postgres must be up
cd server-java && ./mvnw spring-boot:run    # http://localhost:8080

# Side-by-side A/B via Docker (Java on https://localhost:8081, self-signed;
# Postgres starts automatically). Provision the TLS pair first.
bash deploy/ensure-certs.sh
docker compose -f deploy/docker-compose.yml up -d --build xq_backend_java
```

Deploy the Java backend instead of the Node mock:

```bash
bash deploy/deploy.sh --java          # runs both test suites, then deploys xq_backend_java
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
2. Installs Docker and UFW (allows 22/80/443) on Ubuntu 22.04/24.04.
3. Creates `deploy/.env` from `deploy/.env.example` if missing (edit the placeholders).
4. Ensures the self-signed TLS pair (`deploy/ensure-certs.sh` → `deploy/certs/`).
5. `docker compose up -d --build` → services `xq_postgres`, `xq_redis`, `xq_backend`
   (plus `xq_backend_java`, which serves its own HTTPS on container port 8080).
   When `EXTERNAL_PROXY_NET` is set, `deploy/docker-compose.external-proxy.yml`
   also attaches `xq_backend_java` to the shared proxy docker network.

### Public HTTPS (chinese.jackstudio.app)

Same pattern as hk-live-dashboard and bill-tracker: the public edge is
**hobbyland's caddy** (it owns ports 80/443 on the VPS). Its Caddyfile has a
`chinese.jackstudio.app` block that reverse-proxies to this app's own
self-signed TLS at `https://xiangqi-app:8080` over the `shared-proxy` docker
network (`tls_insecure_skip_verify`). The `/ws` STOMP WebSocket is upgraded
transparently; the frontend picks `wss://` automatically when served over HTTPS.

One-time VPS setup:

```bash
docker network create shared-proxy          # if it doesn't exist yet
# deploy/.env: EXTERNAL_PROXY_NET=shared-proxy
bash deploy/deploy.sh --java
# then reload hobbyland's caddy so it picks up the new Caddyfile block
```

Files:

| Path                          | Purpose                                   |
| ----------------------------- | ----------------------------------------- |
| `deploy/Dockerfile`           | Multi-target image: `node-runtime` (default) + `java-runtime` |
| `deploy/docker-compose.yml`   | `xq_postgres`, `xq_redis`, `xq_backend`, `xq_backend_java` |
| `deploy/docker-compose.external-proxy.yml` | Attaches `xq_backend_java` to the shared proxy network |
| `deploy/ensure-certs.sh`      | Self-signed TLS provisioning (`deploy/certs/`, gitignored) |
| `deploy/.env.example`         | Credentials / domain / proxy-network template |
| `deploy/deploy.sh`            | Test-gated deployment runbook (`--java` for Spring Boot) |

---

## What's implemented

### Game modes
- **Solo vs AI (offline):** 10-tier AI (Lv 1 入門 → Lv 10 棋聖) running in a Web Worker.
  Iterative-deepening negamax + alpha-beta, 64-bit Zobrist transposition table, quiescence
  search, TT/MVV-LVA/killer/history ordering, minimum thinking pacing with breathing HUD
  indicator, per-level blunder probability and time budget. Unrestricted 2-ply undo and move hints.
  See [Solo play vs AI: level design](#solo-play-vs-ai-level-design-lv-110) for the full breakdown.
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
- Sculpted piece per type (帥/將, 仕/士, 相/象, 傌/馬, 俥/車, 炮/砲, 兵/卒), each with its own UV texture. Red faces Black; Black faces Red.
- Wooden camps split by a real river, rendered with high-resolution (2048×1024) wood-and-ink board textures (16× anisotropic filtering, mipmaps, traditional double border and L-shaped star markers) and WebGL2 4× MSAA post-processing for razor-sharp grid lines at oblique camera angles. Edge files cross on bridges; stone steles read 楚河 and 漢界.
- **Dual input:** drag-and-drop *and* click-to-move.
- **Mobile offset:** +0.35 world-unit vertical lift on touch drag so the finger doesn't hide the piece.
- Camera: elevation slider, drag-to-orbit, wheel/pinch zoom, flip.
- Flying-general laser warning beam when the two kings would face each other.
- Animated moves (parabolic hop). Captures play a short effect; a cannon capture fires a shot and blasts the victim. Check calls up a charging army and shouts 將軍 (將死 on checkmate).

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

## Solo play vs AI: level design (Lv 1–10)

Solo games run entirely offline in the browser. The engine lives in
[`public/js/ai.js`](./public/js/ai.js) and executes inside a **Web Worker** (module worker) so
the 3D scene stays responsive while the AI thinks; if Workers are unavailable it falls back to
running on the main thread.

### Engine

- **Fast rules path:** in-place `makeMove()`/`unmakeMove()` (zero per-node 90-cell array
  allocations) plus ray-probing `isKingAttackedAt()` in [`shared/rules.js`](./shared/rules.js).
- **Iterative deepening + transposition table:** negamax with alpha-beta pruning, aspiration
  windows, and a 64-bit Zobrist transposition table (generation-aged typed arrays with
  mate-distance normalization). Completed depths are kept if the hard time budget expires.
- **Quiescence search:** at depth 0, searches captures (with delta pruning) and forced check
  evasions up to `qDepth` plies so the engine avoids horizon-effect blunders.
- **Move ordering:** TT best move → captures (MVV-LVA: `victim × 10 − attacker`) → 2 killer
  moves per ply → history heuristic.
- **Evaluation:** material + piece-square tables (from [`shared/rules.js`](./shared/rules.js)):
  車 R=900, 炮 C=450, 馬 H=400, 仕/士 A=200, 相/象 E=200, 兵/卒 P=100, 帥/將 K=10000. PSTs for
  pawns, horses, rooks and cannons reward crossing the river, central files and developed
  squares; tables are written from Red's perspective and mirrored for Black.
- **Terminal:** checkmate *and* stalemate both lose for the side to move (Xiangqi rules), with a
  mate-distance bias (`-30000 + ply`) so faster mates are preferred over slower ones.
- **Thinking pacing & HUD indicator:** each level enforces a minimum thinking delay (`minMs`,
  ±15% natural jitter) so fast replies never feel robotic; while thinking, the AI's player
  scroll card and turn banner (`AI 思考中 · Lv X`) show a breathing golden glow (degrades
  gracefully under `prefers-reduced-motion`). Pending AI timers and stale worker responses are
  cancelled immediately on undo, reset, resign, or mode switch.

### The ten levels

Difficulty scales along **max depth**, **quiescence depth**, **blunder probability**, **score
jitter**, **max think time**, and **minimum pacing delay**:

| Lv | Title               | Max Depth | Q-Depth | Blunder | Jitter | Max Time | Min Think |
| -- | ------------------- | --------- | ------- | ------- | ------ | -------- | --------- |
| 1  | 入門 Novice          | 1 ply     | 2       | 40%     | 0.55   | 250 ms   | 320 ms    |
| 2  | 初學 Beginner        | 1 ply     | 2       | 30%     | 0.40   | 400 ms   | 320 ms    |
| 3  | 業餘 Amateur         | 2 ply     | 2       | 22%     | 0.28   | 600 ms   | 320 ms    |
| 4  | 熟手 Intermediate    | 2 ply     | 2       | 15%     | 0.20   | 800 ms   | 450 ms    |
| 5  | 好手 Skilled         | 3 ply     | 4       | 10%     | 0.14   | 1.1 s    | 450 ms    |
| 6  | 高手 Advanced        | 3 ply     | 4       | 6%      | 0.09   | 1.4 s    | 450 ms    |
| 7  | 名家 Expert          | 4 ply     | 4       | 3%      | 0.05   | 1.8 s    | 600 ms    |
| 8  | 大師 Master          | 4 ply     | 6       | 1.5%    | 0.03   | 2.4 s    | 600 ms    |
| 9  | 特級大師 Grandmaster  | 5 ply     | 6       | 0.5%    | 0.015  | 3.2 s    | 600 ms    |
| 10 | 棋聖 Chess Sage      | 6 ply     | 6       | 0%      | 0.005  | 4.5 s    | 600 ms    |

- **Blunder injection:** with the listed probability the AI deliberately discards its analysis
  and plays a *random legal move*. This is what makes Lv 1–4 feel human and beatable instead of
  merely shallow.
- **Jitter:** root moves within the jitter band (`jitter × 60` points) receive small random
  noise so evenly matched positions don't repeat the same game every time. High levels are
  nearly deterministic.

### Human-side assists

- **Hints (`H`):** independent of the opponent level — always a fixed 4-ply, blunder-free search
  with a 2.5 s budget, shown as a pair of highlight rings plus a notation toast.
- **Undo (`U`):** unrestricted in solo play; pops two plies (your move + the AI's reply) so a
  misclick never costs a game.
- **Play either side:** pick Red (moves first) or Black — the AI opens when you take Black.
- **Fork from replay:** any saved match can be resumed from any position as a live game against
  the AI at the current level.
- Level (default 3), side and camera preferences persist in `localStorage`; the level slider is
  mirrored in the desktop settings panel and the mobile control bar.

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
├── server-java/              # Spring Boot backend (drop-in replacement)
│   ├── pom.xml               # Maven build (wrapper included: ./mvnw)
│   └── src/main/java/com/xiangqi/
│       ├── rules/            # Port of shared/rules.js
│       ├── ratings/          # Elo store + JSON persistence
│       ├── room/             # Rooms, matchmaking, clocks, undo
│       ├── ws/               # STOMP/WebSocket config + game controller
│       ├── api/              # REST endpoints (/api/v1/*)
│       └── config/           # Static files + CORS
├── public/
│   ├── index.html
│   ├── css/style.css         # Responsive 3/2/1-column layout
│   └── js/
│       ├── main.js           # Bootstrap
│       ├── scene.js          # Three.js scene, camera, lights, orbit
│       ├── board.js          # 3D camps, river, bridges, steles
│       ├── pieces.js         # Per-type sculpted meshes + UV textures
│       ├── fx.js             # Capture bursts, cannon shot, check army
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

- The AI uses iterative-deepening negamax (depth ≤ 6 + quiescence + Zobrist TT, heuristic
  eval). It is not a 16-ply NNUE engine, but it plays sharp tactical games without obvious
  horizon blunders.
- Perpetual-check / repetition rules are not enforced.
- The mock backend stores matches in memory; restarting the server clears them. IndexedDB on the
  client persists offline games across sessions.
- Piece models are built in the page (no external meshes) so the characters and the grid scale stay exact.
