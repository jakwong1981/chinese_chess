# Comprehensive Project Specification: 3D Chinese Chess (Xiangqi) Web Game
# 3D 中國象棋網頁遊戲：完整專案規格書

---

## Part 1: English Specification

### 1. Product Overview
A real-time, cross-platform 3D Chinese Chess (Xiangqi) web game featuring realistic physics, intuitive drag-and-drop mechanics, and server-authoritative rule validation. 
* **Target Platform:** Desktop, Tablet, and Mobile Web Browsers.
* **Core Technologies:** Three.js (WebGL), Java 21, Spring Boot 3.3, WebSocket (STOMP), PostgreSQL, Redis.

### 2. Functional Specification (FS)
#### 2.1 Game Modes
* **Mode A: Single-Player (Offline):** 
  * 10-Tier AI Engine (Web Worker / Wasm) ranging from Beginner (1 ply depth, 40% blunder) to Grandmaster (16+ plies, 0% blunder).
  * Features unrestricted 2-ply undo and move hints.
* **Mode B: Online Multiplayer:** 
  * Real-time STOMP WebSocket matchmaking, private room codes, and server-side Fischer increment turn clocks.
  * Consensual 15-second undo requests (casual rooms only).

#### 2.2 Replay & Persistence
* **Save/Load:** Auto-save to IndexedDB (offline) and PostgreSQL (online).
* **Interactive Replay:** Playback historical matches with speed controls ($1\times, 2\times, 4\times$), timeline scrubbing, and branching playback (forking a historical match against AI).

#### 2.3 UI/UX & 3D Interaction Engine
* **Responsive Layout:** 3-column (Desktop) $\to$ 2-column (Tablet) $\to$ Single-column with bottom sheet (Mobile).
* **Dual Interaction:** Supports both Drag-and-Drop and Click-to-Move.
* **Mobile Offset:** Automatic $+0.35$ grid unit vertical-offset when touched to prevent finger obstruction.
* **3D Piece Assets:**
  * **General (帥/將):** Emperor with sword vs. Overlord with shield (Laser warning on Flying General).
  * **Advisor (仕/士):** Scholar with fan vs. Guard with daggers.
  * **Elephant (相/象):** Jade Elephant vs. Armored Beast (Visual chains when blocked).
  * **Horse (傌/馬):** Rearing fiery horse vs. Charging armored horse (Metal barriers on blocked legs).
  * **Soldier (兵/卒):** Upgrades with heavy shields and flaming weapons upon crossing the River.

### 3. Program Specification (PS)
* **Frontend:** HTML5, JS (ES Modules), Three.js (r160+), SockJS, STOMP.js.
* **Backend:** Java 21, Spring Boot 3.3 (Spring WebSocket, Spring Data JPA).
* **Database:** PostgreSQL 16 (Match History, Users), Redis 7 (Room state, Pub/Sub).
* **Key APIs:**
  * `POST /api/v1/matches/save` - Persist match.
  * `GET /api/v1/matches/{matchId}` - Retrieve for replay.
  * STOMP `/app/game/{roomId}/move` - Submit coordinates `{fromX, fromY, toX, toY}`.
  * STOMP `/topic/room/{roomId}` - Broadcasts `MOVE_CONFIRMED`, `MOVE_REJECTED`, `GAME_OVER`.

### 4. Deployment Specification (DS)
* **Infrastructure:** Docker & Docker Compose on Ubuntu 22.04/24.04.
* **Reverse Proxy:** Nginx (Port 80/443) handling SSL termination and WebSocket Upgrade routing to internal Spring Boot port (8080).
* **Operation Menu (Deployment):**
  1. Install Docker, UFW (allow 80, 443, 22), and Certbot.
  2. Configure `.env` with DB/Redis credentials.
  3. Deploy via `docker compose up -d --build` (Services: `xq_postgres`, `xq_redis`, `xq_backend`).
  4. Configure Nginx with `proxy_set_header Upgrade $http_upgrade;`.

---
---

## Part 2: 中文版規格書 (Traditional Chinese)

### 1. 產品概述
一款具備真實物理感、流暢 3D 拖曳交互與伺服器權威校驗的跨平台 3D 中國象棋網頁遊戲。
* **目標平台：** 桌面端、平板與手機現代網頁瀏覽器。
* **核心技術棧：** Three.js (WebGL), Java 21, Spring Boot 3.3, WebSocket (STOMP), PostgreSQL, Redis。

### 2. 功能規格書 (Functional Specification, FS)
#### 2.1 遊戲模式
* **模式 A：單機人機對戰 (離線)：** 
  * 10 級階梯 AI（基於 Web Worker / Wasm），涵蓋入門（深度 1，40% 漏著）至特級大師（深度 16+，0% 失誤）。
  * 支援無限制回退 2 步悔棋與最佳走法提示。
* **模式 B：線上連線對戰：** 
  * 基於 STOMP WebSocket 的即時天梯撮合與自訂房號，配備伺服器端權威防作弊棋鐘。
  * 支援 15 秒雙方同意制悔棋機制（僅限休閒房）。

#### 2.2 存檔與歷史覆盤
* **存檔讀取：** 單機自動寫入 IndexedDB，線上自動同步至 PostgreSQL。
* **3D 互動覆盤：** 支援步進播放、變速自動播放（$1\times, 2\times, 4\times$）、進度條拖曳，以及單機專屬之「從此處開局（分歧挑戰）」功能。

#### 2.3 UI/UX 與 3D 交互引擎
* **響應式佈局：** 桌面三欄式 $\to$ 平板雙欄 $\to$ 手機單欄與底部抽屜 (Bottom Sheet)。
* **雙模操作：** 原生相容「拖曳落子 (Drag-and-Drop)」與「點選移動 (Click-to-Move)」。
* **防遮蔽機制：** 行動裝置觸控時，棋子自動向前上方偏移 $+0.35$ 格，防止手指遮蔽字符。
* **3D 棋子特色雕塑：**
  * **帥/將：** 持劍天子 vs 巨盾霸王（老照面時觸發雷射警示）。
  * **仕/士：** 羽扇文官 vs 面具死士。
  * **相/象：** 背負寶塔白象 vs 披甲戰象（塞象眼時浮現鎖鏈與受阻動作）。
  * **傌/馬：** 烈火赤兔 vs 裝甲烏騅（蹩馬腿時地面突起拒馬刺）。
  * **兵/卒：** 過河後即時動態升級重盾與發光武器。

### 3. 程式規格書 (Program Specification, PS)
* **前端：** HTML5, JS (ES Modules), Three.js (r160+), SockJS, STOMP.js。
* **後端：** Java 21, Spring Boot 3.3 (Spring WebSocket, Spring Data JPA)。
* **資料庫：** PostgreSQL 16（對局紀錄、用戶數據）, Redis 7（房間狀態、訊息廣播）。
* **核心 API：**
  * `POST /api/v1/matches/save` - 盤面狀態持久化。
  * `GET /api/v1/matches/{matchId}` - 獲取歷史對局。
  * STOMP `/app/game/{roomId}/move` - 發送走子座標 `{fromX, fromY, toX, toY}`。
  * STOMP `/topic/room/{roomId}` - 廣播 `MOVE_CONFIRMED`、`MOVE_REJECTED`、`GAME_OVER` 事件。

### 4. 部署運維規格 (Deployment Specification, DS)
* **基礎設施：** Ubuntu 22.04/24.04 環境運行 Docker 與 Docker Compose。
* **反向代理：** Nginx 監聽 80/443 埠，負責 SSL 憑證卸載，並將 WebSocket Upgrade 請求轉發至內部 Spring Boot 容器 (8080 埠)。
* **工程師部署手冊：**
  1. 安裝 Docker、UFW (開放 80, 443, 22) 與 Certbot 工具。
  2. 建立 `.env` 檔配置資料庫與 Redis 密碼。
  3. 執行 `docker compose up -d --build` 啟動所有服務 (`xq_postgres`, `xq_redis`, `xq_backend`)。
  4. 配置 Nginx 加入 `proxy_set_header Upgrade $http_upgrade;` 以維持長連線。