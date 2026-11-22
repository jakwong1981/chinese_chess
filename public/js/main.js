// Bootstrap: create the Scene, Game, Input, UI, and ReplayController, then start the render loop.
// Also restores the last-used preferences from localStorage.

import { Scene } from './scene.js';
import { Game } from './game.js';
import { Input } from './input.js';
import { UI } from './ui.js';
import { ReplayController } from './replay.js';
import { BgmController } from './bgm.js';
import { RED, BLACK } from '../../shared/rules.js';

const PREFS_KEY = 'xiangqi3d.prefs.v1';
const PLAYER_ID_KEY = 'xiangqi3d.playerId.v1';

// Stable per-browser identity used to key the online ladder (no accounts in the MVP).
function loadPlayerId() {
  try {
    let id = localStorage.getItem(PLAYER_ID_KEY);
    if (!id) {
      id = 'p_' + (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));
      localStorage.setItem(PLAYER_ID_KEY, id);
    }
    return id;
  } catch {
    return 'p_' + Math.random().toString(36).slice(2);
  }
}

function loadPrefs() {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}
function savePrefs(p) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(p)); } catch { /* ignore */ }
}

function boot() {
  const canvas = document.getElementById('board-canvas');
  if (!canvas) throw new Error('Canvas #board-canvas missing');

  const scene = new Scene(canvas);
  const game = new Game(scene);
  const ui = new UI(game);
  const replay = new ReplayController();
  ui.setReplayController(replay);

  // Background Music (YouTube IFrame API, loops qct0JLjaHDc)
  const bgmBtn = document.getElementById('btn-bgm');
  const bgmVol = document.getElementById('bgm-volume');
  const bgmVolOut = document.getElementById('bgm-volume-out');
  const syncBgmUI = ({ enabled, playing, volume }) => {
    if (bgmBtn) {
      bgmBtn.textContent = enabled ? '♪' : '🔇';
      bgmBtn.classList.toggle('muted', !enabled);
      bgmBtn.classList.toggle('playing', enabled && playing);
    }
    if (bgmVol) bgmVol.value = volume;
    if (bgmVolOut) bgmVolOut.textContent = `${Math.round(volume)}%`;
  };
  const bgm = new BgmController({ onStateChange: syncBgmUI });
  syncBgmUI({ enabled: bgm.enabled, playing: bgm.playing, volume: bgm.volume });

  bgmBtn?.addEventListener('click', () => {
    bgm.toggle();
  });
  bgmVol?.addEventListener('input', (e) => {
    bgm.setVolume(e.target.value);
  });
  // Unlock audio on first pointer or key interaction (browser autoplay policy)
  const unlockBgmOnce = () => bgm.unlock();
  window.addEventListener('pointerdown', unlockBgmOnce, { once: true });
  window.addEventListener('keydown', unlockBgmOnce, { once: true });

  // Persistent player identity for the online ladder.
  const playerId = loadPlayerId();
  game.setIdentity({ playerId });

  const input = new Input(scene, canvas, {
    isInteractionEnabled: () => game.isInteractionEnabled(),
    isOwnPiece: (side) => game.isOwnPiece(side),
    getPieceAt: (x, y) => game.getPieceAt(x, y),
    onSelect: (info) => game.onSelect(info),
    onMove: (mv) => game.onMove(mv),
    onHover: (mesh) => game.onHover(mesh),
    onReject: () => game.onReject(),
    onSelectionCleared: () => game.onSelectionCleared()
  });

  // Touch gestures: two-finger pinch to zoom, two-finger drag to orbit.
  let touchCache = [];
  canvas.addEventListener('touchstart', (e) => {
    touchCache = Array.from(e.touches);
    if (touchCache.length >= 2) e.preventDefault();
  }, { passive: false });
  canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length >= 2) {
      e.preventDefault();
      input.handleTouchMulti(Array.from(e.touches));
    }
  }, { passive: false });
  canvas.addEventListener('touchend', (e) => {
    if (e.touches.length < 2) input.endTouchMulti();
    touchCache = Array.from(e.touches);
  });

  // Restore prefs
  const prefs = loadPrefs();
  if (prefs.aiLevel) {
    document.getElementById('ai-level').value = prefs.aiLevel;
    document.getElementById('ai-level-m').value = prefs.aiLevel;
    game.aiLevel = prefs.aiLevel;
    ui._initLevelLabels();
  }
  if (prefs.humanSide) {
    ui.humanSide = prefs.humanSide === 'b' ? BLACK : RED;
    document.querySelectorAll('.segmented .seg-btn[data-side]').forEach(b => {
      b.classList.toggle('active', b.dataset.side === (prefs.humanSide || 'r'));
    });
  }
  if (prefs.playerName) document.getElementById('player-name').value = prefs.playerName;
  if (prefs.camElev) {
    document.getElementById('cam-elev').value = prefs.camElev;
    scene.setElevation(prefs.camElev);
  }
  if (prefs.quality) {
    scene.setQuality(prefs.quality);
  }
  document.querySelectorAll('.segmented .seg-btn[data-quality]').forEach(b => {
    b.classList.toggle('active', b.dataset.quality === scene.quality);
  });

  // Language toggle (English / Traditional Chinese)
  const LANG_KEY = 'xiangqi3d.lang';
  const savedLang = localStorage.getItem(LANG_KEY) || 'en';
  document.body.classList.add('lang-' + savedLang);
  const langBtn = document.getElementById('lang-toggle');
  if (langBtn) {
    langBtn.addEventListener('click', () => {
      const current = document.body.classList.contains('lang-zh') ? 'zh' : 'en';
      const next = current === 'en' ? 'zh' : 'en';
      document.body.classList.remove('lang-' + current);
      document.body.classList.add('lang-' + next);
      localStorage.setItem(LANG_KEY, next);
    });
  }

  // Persist prefs on change
  const persist = () => savePrefs({
    aiLevel: Number(document.getElementById('ai-level').value),
    humanSide: ui.humanSide === BLACK ? 'b' : 'r',
    playerName: document.getElementById('player-name').value,
    camElev: Number(document.getElementById('cam-elev').value),
    quality: scene.quality
  });
  ['ai-level', 'ai-level-m', 'player-name', 'cam-elev'].forEach(id => {
    document.getElementById(id)?.addEventListener('change', persist);
  });
  document.querySelectorAll('.segmented .seg-btn[data-quality]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.segmented .seg-btn[data-quality]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      scene.setQuality(btn.dataset.quality);
      persist();
    });
  });

  // Keyboard shortcuts
  window.addEventListener('keydown', (e) => {
    if (e.target.matches('input, textarea, select')) return;
    switch (e.key.toLowerCase()) {
      case 'u': game.undo(); break;
      case 'h': game.requestHint(); break;
      case 'f': scene.flip(); break;
      case 'n': ui.newOfflineGame(); break;
      case 'r': if (game.mode === 'replay') replay.togglePlay(); break;
      case 'arrowleft': if (game.mode === 'replay') replay.step(-1); break;
      case 'arrowright': if (game.mode === 'replay') replay.step(1); break;
      case 'home': if (game.mode === 'replay') replay.seek(0); break;
      case 'end': if (game.mode === 'replay') replay.seek(Infinity); break;
      case 'escape': input.clearSelection(); break;
    }
  });

  // Start the animation/render loop (true deltaTime, zero per-frame DOM writes)
  scene.startLoop((now, dt) => {
    game.tickAnimations(now, dt);
  });

  // Populate replay list and ladder on first paint
  ui.refreshReplayList();
  ui.refreshLadder();

  // Kick off a fresh offline game so the board isn't empty on load
  game.reset({
    mode: 'offline',
    humanSide: ui.humanSide,
    aiLevel: Number(document.getElementById('ai-level').value || 3)
  });

  // Expose for debugging from the console
  window.__xq = { scene, game, ui, input, replay };

  console.log('%c3D Xiangqi ready', 'color:#f0b429;font-weight:bold');
  console.log('Shortcuts: N=new, U=undo, H=hint, F=flip, ←/→ replay step, Home/End jump, Esc deselect');
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot, { once: true });
} else {
  boot();
}
