# Plan — 象棋 AI 棋力與手感升級（ID + TT / Quiescence / 思考節奏）

- **狀態**：待審閱（未開始實作）
- **範圍**：離線 AI 對手（`public/js/ai.js`、`public/js/game.js`、`public/js/ui.js`）與其規則底層（`shared/rules.js`）
- **不影響**：線上對戰協議（STOMP / `server/`）、3D 場景、HUD 版面結構

---

## 1. 任務目標與範疇

### 1.1 三個目標

| # | 目標 | 可量化的成功標準 |
|---|---|---|
| A | 迭代加深 + 置換表 | 相同 `timeMs` 下實際完成深度 +1～2 層；`lv10` 在開局能穩定跑完 depth 5 以上（現時常超時退回 1 層靜態評估） |
| B | Quiescence search | 消除地平線效應；「送子」低級失誤在 `lv8+` 的自我對弈中顯著下降 |
| C | 最短思考時間 + 呼吸指示 | AI 不再 0ms 秒行；思考期間該方捲軸卡有呼吸光暈與「思考中」提示 |

### 1.2 明確不做（本次）

- 開局庫 / 殘局庫
- NNUE 或任何機器學習評估
- 多執行緒 Worker 池（單 Worker 已足夠）
- 線上對戰的伺服器端裁決邏輯

---

## 2. 現況分析（瓶頸定位）

| 位置 | 現況 | 問題 |
|---|---|---|
| `ai.js:60 search()` | root 每個走法用 full window `(-∞, +∞)` | 完全無 root 剪枝，且無跨深度重用 |
| `ai.js:39 negamax()` | 純 depth-first，`Date.now()` 每節點檢查 | 時間到直接 `throw`，該層結果全丟，只能退回靜態評估 |
| `ai.js:29 orderMoves()` | 只有 MVV-LVA | 無 TT move / killer / history，非吃子步排序接近隨機 |
| `rules.js:210 legalMoves()` | 每個候選步都 `board.slice()` + `isInCheck()` | 每節點大量 90 格陣列配置 → GC 壓力 |
| `rules.js:170 isSquareAttacked()` | 掃 90 格，每格 `pieceMoves()` | 將軍判定成本 ≈ 全盤走法生成，是最大熱點 |
| 無置換表 | 同一局面經不同走法序列到達時重複搜尋 | 中局浪費 30～60% 節點 |
| 無 quiescence | depth 邊界直接 `evaluate()` | 換子/連吃算唔完，出現「送車」 |

**結論**：`isSquareAttacked` 與 `legalMoves` 的配置成本是真正的天花板；唔先處理，加 TT/ID 的收益會被抵銷。所以本次加入 **A0（規則底層快路徑）** 作為前置。

---

## 3. 架構決策

1. **搜尋仍留在 Web Worker**，不改架構；主執行緒只負責「節奏控制 + 動畫」。
2. **`shared/rules.js` 只做加法**（新增 `makeMove` / `unmakeMove` / `isKingAttacked`），既有 `applyMove` / `legalMoves` / `isInCheck` 的對外語意與輸出完全不變，伺服器與既有測試零影響。
3. **Zobrist 與置換表放在 `ai.js` 內部**（只服務 AI），不污染共用規則引擎。
4. **時間控制改為「硬上限 + 逐層完成」**：每層跑完就保存結果，超時只丟棄當前未完成層。
5. **AI 訊息契約向後兼容**：`{type:'move'}` 新增可選欄位 `depth` / `nodes` / `score`，舊呼叫端不受影響。

---

## 4. 規格 A0 — 規則底層快路徑（前置優化）

### 4.1 `shared/rules.js` 新增 API

```js
// 就地落子，回傳可回滾的 undo 記錄（不複製 90 格陣列）
export function makeMove(board, mv) {
  const from = idx(mv.fromX, mv.fromY);
  const to   = idx(mv.toX,   mv.toY);
  const moving   = board[from];
  const captured = board[to];
  board[to] = moving;
  board[from] = null;
  return { from, to, moving, captured };
}

export function unmakeMove(board, undo) {
  board[undo.from] = undo.moving;
  board[undo.to]   = undo.captured; // 可能為 null
}

// 快速將軍判定：由將帥所在格反向探測，取代「掃 90 格 + 逐子生成走法」
export function isKingAttacked(board, side) { /* 見 4.2 */ }
```

`isInCheck()` 改為 `return findKing(...) < 0 || isKingAttacked(...)`，對外行為不變。
`isSquareAttacked()` 保留原實作（相容用），但加註「僅測試 / 非熱路徑」。

### 4.2 反向探測演算法（只探真正能攻擊將帥的兵種）

將帥必在九宮內，因此敵方 **士、象永遠攻擊不到**，只需檢查：

- **車 / 將帥對臉**：沿 4 個方向射線，遇到第一個棋子；若是敵方 `R`，或同線敵方 `K`（飛將）→ 被攻擊
- **炮**：沿 4 方向射線跳過 **恰好一個** 屏幕後遇到敵方 `C` → 被攻擊
- **馬**：枚舉 8 個攻擊來源格，檢查「馬腿」是否被塞
- **兵/卒**：紅將只會被「下方/側面」的黑卒攻擊（黑卒向上走）；反之亦然
- **士/象**：略過（幾何上不可達九宮）

成本由「90 格 × 走法生成」降到約「4 條射線 + 8 個馬位 + 3 個兵位」≈ 15 次陣列讀取。

### 4.3 AI 內部走法流程（避免雙重複製）

```
pieceMoves(board, x, y)              // 偽合法
  → makeMove(board, mv)
  → isKingAttacked(board, side) || kingsFacing(board) ? 略過
  → 遞迴
  → unmakeMove(board, undo)
```

單一 `board` 實例貫穿整棵搜尋樹，每個節點 0 次 90 格配置（原本 2 次）。

### 4.4 正確性保證

- 新增等價性測試：隨機 3000 個局面，`isKingAttacked` vs 原 `isSquareAttacked` 結果必須 100% 一致
- `makeMove`/`unmakeMove` 在隨機 5000 步序列後，盤面必須與 `applyMove` 版本完全一致（含棋子 `id`）

---

## 5. 規格 A — Zobrist 雜湊 + 置換表 + 迭代加深

### 5.1 Zobrist 雜湊（32×2 位，避免 BigInt 開銷）

```js
// 14 種 (side,type) × 90 格；每格一對 Uint32
const Z_HI = new Uint32Array(14 * 90);
const Z_LO = new Uint32Array(14 * 90);
const sideKey = { hi, lo };   // 輪走方
```

- 開局一次 `zobristHash(board)` 全盤計算；搜尋期間用增量更新：
  `hash ^= Z[mover][from] ^ Z[mover][to] ^ (captured ? Z[captured][to] : 0) ^ sideKey`
- `unmakeMove` 時用同一組 XOR 還原（XOR 自反）
- 因 `makeMove` 回傳 `moving` / `captured`，增量更新可在 AI 層完成，無需改規則引擎

### 5.2 置換表（固定大小、typed arrays、免 GC）

| 欄位 | 型別 | 說明 |
|---|---|---|
| `keyLo` / `keyHi` | `Int32Array` | 完整鍵驗證（避免碰撞誤判） |
| `score` | `Int32Array` | 分數 |
| `move` | `Int32Array` | 最佳走法（`from*90+to` 編碼） |
| `depth` | `Int8Array` | 搜尋深度 |
| `flag` | `Uint8Array` | `EXACT` / `LOWER` / `UPPER` |
| `gen` | `Uint8Array` | 世代（跨手老化，免整表清零） |

- 大小：預設 `1 << 17`（131,072 項，約 1.7 MB）；`lv1–4` 用 `1 << 15`
- 索引：`keyLo & (size - 1)`
- **Mate 分數校正**：`score` 以 `MATE - ply` 表示，存入/取出時加減 `ply`，避免「將死距離」被不同層重用時失真
- 命中條件：`keyLo/keyHi` 相同 **且** `entry.depth >= depth` **且** 窗口判斷成立
- `bestMove` 命中時優先排到走法序列最前（TT move ordering）

### 5.3 迭代加深（Iterative Deepening）

```
for (d = 1; d <= cfg.maxDepth; d++) {
  try {
    result = rootSearch(d, aspiration(d))   // 見 5.4
    best = result                             // 只保留「完整跑完」的層
  } catch (Timeout) {
    break                                     // 丟棄當前未完成層，用上一層
  }
  if (isMateScore(best.score)) break          // 已找到強制殺，無需再深
  if (estimateNextDepthWontFit()) break       // 軟性截止，避免白開新層
}
```

- **軟性截止**：`elapsed * 3 > remaining` 就唔開下一層（branching ≈ 3～4）
- **節點計數器**：每 512 節點檢查一次 `Date.now()`（比每節點呼叫便宜）
- 回傳值額外附帶 `depth`（實際完成層數）、`nodes`、`score`、`pv`

### 5.4 Root 搜尋 + Aspiration Window

- 第一層 `d=1` 用 full window
- 之後用 `prev ± 50` 的窄窗；fail-low / fail-high 就以 `±400` 重搜，再失敗才 full window
- 取代現時「root 每步 full window」，等同多一層剪枝

### 5.5 走法排序升級（分數由高到低）

1. TT best move
2. 吃子（MVV-LVA，現有邏輯保留）
3. Killer moves（同層 2 個，非吃子剪枝成功者）
4. History heuristic（`history[from][to]` 累加，`depth²` 加權）
5. 其餘

---

## 6. 規格 B — Quiescence Search（靜態搜尋）

```
quiesce(board, side, alpha, beta, ply, qdepth):
  if (isKingAttacked(board, side))        // 被將軍：必須應將
      → 搜尋全部合法走法（evasions），不做 stand-pat，qdepth-1
  stand = evaluate(board, side)
  if (stand >= beta) return beta
  if (stand > alpha) alpha = stand
  if (qdepth <= 0) return alpha

  for (mv of capturesOrderedMVVLVA):
      // Delta pruning：即使吃到這隻子仍然遠低於 alpha → 跳過
      if (stand + PIECE_VALUE[mv.captured] + 200 < alpha) continue
      makeMove / recurse(-beta,-alpha) / unmakeMove
  return alpha
```

- 只在 `depth === 0` 進入（取代現時直接 `evaluate()`）
- `qDepth` 上限：`lv1–4 → 2`、`lv5–7 → 4`、`lv8–10 → 6`
- 節點預算保護：quiescence 內共用同一 deadline，超時照樣 `throw`
- 只搜「吃子」與「應將」，唔會爆炸；配合 delta pruning 再省 20～40% 節點

---

## 7. 規格 C — 最短思考時間 + 「AI 思考中」呼吸指示

### 7.1 最短思考時間（`game.js`）

```js
_maybeAIMove() {
  ...
  this._aiReqId = req.reqId;              // 新請求令牌
  this._aiStartedAt = performance.now();
  ...
}

_onWorkerMessage(msg) {
  if (msg.type === 'move') {
    if (msg.reqId !== this._aiReqId) return;   // 過期結果直接丟棄
    const elapsed = performance.now() - this._aiStartedAt;
    const wait = Math.max(0, this._minThinkMs - elapsed) * (0.85 + Math.random() * 0.3);
    this._aiTimer = setTimeout(() => { ...apply... }, wait);
  }
}
```

- `_minThinkMs` 由等級決定：`lv1–3 → 320ms`、`lv4–6 → 450ms`、`lv7–10 → 600ms`
- **防競態**：`reset()` / `undo()` / `resign()` / 重新 `_maybeAIMove()` 時 `clearTimeout(this._aiTimer)` 並遞增 `_aiReqId`
- 線上模式與 hint 完全不走此路徑

### 7.2 呼吸指示（`ui.js` + `index.html` + `style.css`）

- `game.js` 把 `ai-thinking` 改為帶狀態：`emit('ai-thinking', { active: true, side, level })` / `{ active: false }`
- `ui.js`：
  - 對 AI 一方的捲軸卡加 `.thinking` class（`player-red` / `player-black`）
  - `turn-banner` 文字改為 `AI 思考中 · Lv 8`，加 `.thinking` 呼吸樣式
- `style.css`：
  - `.hud-scroll.thinking` → 金色柔光 `box-shadow` 呼吸 + `filter: drop-shadow` 2.2s `ease-in-out infinite alternate`
  - `.hud-scroll.thinking .avatar-badge::after` → 三個跳動小點（`animation-delay` 錯開）
  - `@media (prefers-reduced-motion: reduce)` → 停用動畫，只留靜態金色邊框
- 清除時機：`turn` 事件、`gameover`、`reset`、`ai-thinking {active:false}`

---

## 8. 參數與效能預算

### 8.1 `LEVELS` 新增欄位（`maxDepth` 取代 `depth`，語意不變）

| lv | maxDepth | blunder | jitter | timeMs | minMs | qDepth | TT 大小 |
|---|---|---|---|---|---|---|---|
| 1 | 1 | 0.40 | 0.55 | 250 | 320 | 2 | 1<<15 |
| 2 | 1 | 0.30 | 0.40 | 400 | 320 | 2 | 1<<15 |
| 3 | 2 | 0.22 | 0.28 | 600 | 320 | 2 | 1<<15 |
| 4 | 2 | 0.15 | 0.20 | 800 | 450 | 2 | 1<<15 |
| 5 | 3 | 0.10 | 0.14 | 1100 | 450 | 4 | 1<<17 |
| 6 | 3 | 0.06 | 0.09 | 1400 | 450 | 4 | 1<<17 |
| 7 | 4 | 0.03 | 0.05 | 1800 | 600 | 4 | 1<<17 |
| 8 | 4 | 0.015 | 0.03 | 2400 | 600 | 6 | 1<<17 |
| 9 | 5 | 0.005 | 0.015 | 3200 | 600 | 6 | 1<<17 |
| 10 | 6 | 0.0 | 0.005 | 4500 | 600 | 6 | 1<<17 |

> `maxDepth` 只會在**實際跑得完**時才生效；ID 會自動停在時間容許的深度。
> 上表數字為起始值，實作完成後以自我對弈 benchmark 微調（見 §11 步驟 6）。

### 8.2 效能預期

| 指標 | 現況 | 預期 |
|---|---|---|
| 將軍判定 | ~90 格 × 走法生成 | ~15 次陣列讀取（≈ 10× 快） |
| 每節點配置 | 2 × 90 格陣列 | 0（就地 make/unmake） |
| `lv10` 開局實際深度 | 常停在 1（超時 fallback） | 5～6 |
| 有效節點/秒 | — | 提升 4～8× |

---

## 9. 訊息契約變更

```js
// 主執行緒 → Worker
{ type: 'move',  reqId, boardEnc, side, level }
{ type: 'hint',  reqId, boardEnc, side }

// Worker → 主執行緒（新增欄位全部 optional，向後兼容）
{ type: 'move', reqId, move, elapsed, depth, nodes, score }
{ type: 'hint', reqId, move, depth, nodes }
{ type: 'error', reqId, error }
```

`chooseMove(board, side, level)` 保持回傳 `move | null`（對外簽名不變，內部改為回傳完整 `SearchResult`，另加 `searchMove()` 供測試用）。

---

## 10. 測試計畫（`scripts/test.mjs` 擴充，全部可在 `npm test` 跑）

1. **規則等價性**
   - `isKingAttacked` vs `isSquareAttacked`：3000 隨機局面 100% 一致
   - `makeMove`/`unmakeMove` vs `applyMove`：5000 隨機步序列盤面完全一致
2. **Zobrist**
   - 增量 hash == 全盤重算（1000 步隨機序列，每步驗證）
   - make/unmake 後 hash 必須還原
3. **搜尋合法性**
   - 200 個隨機局面 × `lv1..10`：`chooseMove` 回傳的走法必須通過 `isLegalMove`
4. **將死偵測**
   - 構造「一步將死」局面：`lv10` 必須找到該手；`suggestHint` 亦然
5. **Quiescence 正確性**
   - 構造「免費吃車」局面：有 quiescence 時必須吃；無 quiescence 的舊版會漏
6. **確定性**
   - `blunder:0, jitter:0`、清空 TT 後，同一局面連續 3 次必須回同一手
7. **效能煙霧測試**
   - 開局 `lv10` 必須在 `timeMs + 500ms` 內回傳，且 `depth >= 4`
8. **UI 手動檢查清單**
   - 思考中：捲軸呼吸光暈、banner 文字、`prefers-reduced-motion` 降級
   - 思考中按「悔棋 / 新局 / 認輸」→ 不會有殘留 timer 或錯誤落子
   - 手機（iOS Safari / Android Chrome）確認動畫不掉幀

---

## 11. 分步實作藍圖（每步獨立可驗證，建議分 3 個 commit）

**步驟 0（前置）**
- [ ] `rules.js`：`makeMove` / `unmakeMove` / `isKingAttacked`；`isInCheck` 改用它
- [ ] 測試 1（等價性）通過

**步驟 1 — Commit ①「AI search core: in-place moves, Zobrist, TT, iterative deepening」**
- [ ] `ai.js`：Zobrist 表、TT（typed arrays + 世代老化 + mate 分數校正）
- [ ] `ai.js`：就地走法生成 / make-unmake 搜尋迴圈
- [ ] `ai.js`：迭代加深 + 軟性截止 + 節點計數器 + aspiration window
- [ ] `ai.js`：走法排序加 TT move / killer / history
- [ ] 測試 2、3、6 通過

**步驟 2 — Commit ②「AI: quiescence search」**
- [ ] `ai.js`：`quiesce()`（含應將、delta pruning、qDepth 上限）
- [ ] `ai.js`：`LEVELS` 加 `qDepth` / `minMs` / `maxDepth`
- [ ] 測試 4、5、7 通過

**步驟 3 — Commit ③「AI think pacing + breathing indicator」**
- [ ] `game.js`：`_minThinkMs`、`_aiTimer`、`_aiReqId` 防競態、`ai-thinking` 狀態化
- [ ] `ui.js`：`.thinking` class 綁定、banner 文案
- [ ] `index.html` / `style.css`：呼吸光暈、三點動畫、`prefers-reduced-motion`
- [ ] 測試 8 手動檢查

**步驟 4 — 收尾**
- [ ] `npm test` 全綠（現有 25 項 + 新增）
- [ ] `node --check` 全部前端檔案
- [ ] 自我對弈 benchmark（lv6 vs lv8 各 10 局），必要時微調 §8.1 數值
- [ ] 更新 `README.md` 的 AI 章節（等級表、架構說明）
- [ ] commit + push `main`

---

## 12. 風險與緩解

| 風險 | 影響 | 緩解 |
|---|---|---|
| TT 碰撞導致錯判 | 走出壞棋 | 存完整 64-bit 鍵；落子前 `game.js` 仍會 `isLegalMove` 二次驗證 |
| Quiescence 爆炸 | 超時、卡頓 | qDepth 上限 + delta pruning + 共用 deadline + 節點預算 |
| 就地 make/unmake 破壞盤面 | 嚴重錯誤 | 只新增函式，不動 `applyMove`；等價性測試 + 隨機自我對弈測試把關 |
| 快路徑將軍判定漏掉罕見攻擊 | 規則錯誤 | 等價性測試 3000 局面；保留舊實作對照 |
| 最短思考時間與 undo/reset 競態 | 落錯子 | `reqId` 令牌 + `clearTimeout`，過期訊息直接丟棄 |
| 記憶體（TT 1.7MB × Worker） | 手機壓力 | 低等級用小表；單 Worker 只配置一次 |
| 呼吸動畫在低階手機掉幀 | 手感變差 | 只用 `opacity` / `box-shadow`（合成層）；`prefers-reduced-motion` 降級 |
| 深度上調令低等級變太強 | 難度曲線失衡 | `maxDepth` 受 `timeMs` 限制；實作後以自我對弈校正 blunder/jitter |

---

## 13. 驗收標準

1. `npm test` 全綠，新增測試 ≥ 7 項
2. `lv10` 開局思考完成深度 ≥ 4，且總耗時 ≤ `timeMs + 500ms`
3. 200 隨機局面 × 10 等級，AI 落子 0 次不合法
4. 「一步將死」局面 100% 找到
5. 思考期間：捲軸呼吸光暈 + banner 顯示「AI 思考中」，且 `prefers-reduced-motion` 下無動畫
6. 思考中按悔棋／新局／認輸，無殘留 timer、無錯誤落子
7. 線上對戰、3D 場景、HUD 既有功能無回歸
