// Background Music (BGM) controller powered by the official YouTube IFrame Player API.
// Respects browser autoplay policies: starts smoothly on first user gesture when enabled,
// loops seamlessly, and persists mute/volume preferences in localStorage.

const BGM_VIDEO_ID = 'qct0JLjaHDc';
const STORAGE_KEY = 'xiangqi3d.bgm.v1';

function loadBgmPrefs() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : { enabled: true, volume: 35 };
  } catch {
    return { enabled: true, volume: 35 };
  }
}

function saveBgmPrefs(prefs) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(prefs)); } catch { /* ignore */ }
}

export class BgmController {
  constructor({ videoId = BGM_VIDEO_ID, onStateChange = null } = {}) {
    this.videoId = videoId;
    this.onStateChange = onStateChange;
    const prefs = loadBgmPrefs();
    this.enabled = prefs.enabled !== false;
    this.volume = typeof prefs.volume === 'number' ? prefs.volume : 35;
    this.player = null;
    this.ready = false;
    this.playing = false;
    this._wantPlay = false;
    this._apiLoaded = false;

    this._mountHiddenHost();
    this._loadYouTubeApi();
  }

  _mountHiddenHost() {
    let wrap = document.getElementById('bgm-yt-host');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.id = 'bgm-yt-host';
      wrap.setAttribute('aria-hidden', 'true');
      wrap.style.cssText = 'position:fixed;width:1px;height:1px;left:-9999px;top:-9999px;opacity:0;pointer-events:none;overflow:hidden;';
      const inner = document.createElement('div');
      inner.id = 'bgm-yt-player';
      wrap.appendChild(inner);
      document.body.appendChild(wrap);
    }
  }

  _loadYouTubeApi() {
    if (window.YT && window.YT.Player) {
      this._initPlayer();
      return;
    }
    const prevReady = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      prevReady?.();
      this._initPlayer();
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      document.head.appendChild(s);
    }
  }

  _initPlayer() {
    if (this.player || !window.YT?.Player) return;
    this._apiLoaded = true;
    this.player = new window.YT.Player('bgm-yt-player', {
      width: '1',
      height: '1',
      videoId: this.videoId,
      playerVars: {
        autoplay: 0,
        controls: 0,
        disablekb: 1,
        fs: 0,
        iv_load_policy: 3,
        loop: 1,
        playlist: this.videoId,
        playsinline: 1,
        rel: 0
      },
      events: {
        onReady: (e) => {
          this.ready = true;
          e.target.setVolume(this.volume);
          if (this._wantPlay && this.enabled) {
            this._tryPlay();
          }
          this._notify();
        },
        onStateChange: (e) => {
          const YTState = window.YT?.PlayerState;
          if (!YTState) return;
          if (e.data === YTState.PLAYING) {
            this.playing = true;
            this._notify();
          } else if (e.data === YTState.PAUSED) {
            this.playing = false;
            this._notify();
          } else if (e.data === YTState.ENDED) {
            // Defensive loop fallback
            if (this.enabled) {
              e.target.seekTo(0);
              e.target.playVideo();
            }
          }
        },
        onError: () => {
          this.playing = false;
          this._notify();
        }
      }
    });
  }

  _tryPlay() {
    if (!this.ready || !this.player) {
      this._wantPlay = true;
      return;
    }
    try {
      this.player.setVolume(this.volume);
      this.player.unMute?.();
      this.player.playVideo();
    } catch { /* ignore autoplay block */ }
  }

  /** Call from the first user gesture (pointerdown/keydown) to satisfy browser autoplay policy. */
  unlock() {
    if (!this.enabled || this.playing) return;
    this._wantPlay = true;
    this._tryPlay();
  }

  toggle() {
    this.enabled = !this.enabled;
    saveBgmPrefs({ enabled: this.enabled, volume: this.volume });
    if (this.enabled) {
      this._wantPlay = true;
      this._tryPlay();
    } else {
      this._wantPlay = false;
      try { this.player?.pauseVideo(); } catch { /* ignore */ }
      this.playing = false;
    }
    this._notify();
    return this.enabled;
  }

  setVolume(vol) {
    this.volume = Math.max(0, Math.min(100, Number(vol) || 0));
    saveBgmPrefs({ enabled: this.enabled, volume: this.volume });
    if (this.ready && this.player) {
      try { this.player.setVolume(this.volume); } catch { /* ignore */ }
    }
    this._notify();
  }

  _notify() {
    this.onStateChange?.({
      enabled: this.enabled,
      playing: this.playing,
      volume: this.volume,
      ready: this.ready
    });
  }
}
