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
npm test            # 19 unit tests
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

# Side-by-side A/B via Docker (Java on 8081; Postgres starts automatically)
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
2. Installs Docker, UFW (allows 22/80/443) and Certbot (Ubuntu 22.04/24.04).
3. Creates `deploy/.env` from `deploy/.env.example` if missing (edit the placeholders).
4. `docker compose up -d --build` → services `xq_postgres`, `xq_redis`, `xq_backend`.
5. Installs the Nginx site (`deploy/nginx/xiangqi.conf`) with SSL termination and
   `proxy_set_header Upgrade $http_upgrade;` for the `/ws` WebSocket route.
6. Requests a Let's Encrypt certificate when `DOMAIN` is set to a real domain.

Files:

| Path                          | Purpose                                   |
| ----------------------------- | ----------------------------------------- |
| `deploy/Dockerfile`           | Multi-target image: `node-runtime` (default) + `java-runtime` |
| `deploy/docker-compose.yml`   | `xq_postgres`, `xq_redis`, `xq_backend`, `xq_backend_java` |
| `deploy/nginx/xiangqi.conf`   | Reverse proxy + WebSocket upgrade + TLS   |
| `deploy/.env.example`         | Credentials / domain template             |
| `deploy/deploy.sh`            | Test-gated deployment runbook (`--java` for Spring Boot) |

---

## What's implemented

### Game modes
- **Solo vs AI (offline):** 10-tier AI (Lv 1 入門 → Lv 10 棋聖) running in a Web Worker.
  Negamax + alpha-beta, MVV-LVA move ordering, material + piece-square evaluation, per-level
  blunder probability and time budget. Unrestricted 2-ply undo and move hints.
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

## Solo play vs AI: level design (Lv 1–10)

Solo games run entirely offline in the browser. The engine lives in
[`public/js/ai.js`](./public/js/ai.js) and executes inside a **Web Worker** (module worker) so
the 3D scene stays responsive while the AI thinks; if Workers are unavailable it falls back to
running on the main thread.

### Engine

- **Search:** negamax with alpha-beta pruning, fixed depth per level, one hard time budget per
  move. If the deadline fires mid-search, that move falls back to a shallow static evaluation
  instead of aborting the turn.
- **Move ordering:** MVV-LVA — captures are searched first, scored as
  `victim value × 10 − attacker value`, so cheap pieces taking valuable ones get priority.
- **Evaluation:** material + piece-square tables (from [`shared/rules.js`](./shared/rules.js)):
  車 R=900, 炮 C=450, 馬 H=400, 仕/士 A=200, 相/象 E=200, 兵/卒 P=100, 帥/將 K=10000. PSTs for
  pawns, horses, rooks and cannons reward crossing the river, central files and developed
  squares; tables are written from Red's perspective and mirrored for Black.
- **Terminal:** checkmate *and* stalemate both lose for the side to move (Xiangqi rules), with a
  mate-distance bias (`-99999 + ply`) so faster mates are preferred over slower ones.

### The ten levels

Difficulty scales along four knobs — **search depth**, **blunder probability**, **score jitter**
and **think time**:

| Lv | Title               | Depth | Blunder | Jitter | Think time |
| -- | ------------------- | ----- | ------- | ------ | ---------- |
| 1  | 入門 Novice          | 1 ply | 40%     | 0.55   | 250 ms     |
| 2  | 初學 Beginner        | 1 ply | 30%     | 0.40   | 400 ms     |
| 3  | 業餘 Amateur         | 2 ply | 22%     | 0.28   | 600 ms     |
| 4  | 熟手 Intermediate    | 2 ply | 15%     | 0.20   | 800 ms     |
| 5  | 好手 Skilled         | 3 ply | 10%     | 0.14   | 1.1 s      |
| 6  | 高手 Advanced        | 3 ply | 6%      | 0.09   | 1.4 s      |
| 7  | 名家 Expert          | 3 ply | 3%      | 0.05   | 1.8 s      |
| 8  | 大師 Master          | 4 ply | 1.5%    | 0.03   | 2.4 s      |
| 9  | 特級大師 Grandmaster  | 4 ply | 0.5%    | 0.015  | 3.2 s      |
| 10 | 棋聖 Chess Sage      | 5 ply | 0%      | 0.005  | 4.5 s      |

- **Blunder injection:** with the listed probability the AI deliberately discards its analysis
  and plays a *random legal move*. This is what makes Lv 1–4 feel human and beatable instead of
  merely shallow.
- **Jitter:** every root move's score gets noise in the range ±(jitter × 30) points, so evenly
  matched positions don't repeat the same game every time. High levels are nearly deterministic.
- **Tie-breaking:** moves scoring within epsilon of the best are picked uniformly at random.

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
