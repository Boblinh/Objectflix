












import { MONITOR_CHANNELS } from "./surround.js";

const MONITOR_WINDOW_NAME = "objectflixAudioMonitor";
const MONITOR_PAGE = "audio-monitor.html";
const MONITOR_CHANNEL_NAME = "objectflix-audio-monitor";
const FRAME_INTERVAL_MS = 33; 
const SMOOTH_ALPHA = 0.35; 
const PEAK_DECAY = 0.9; 
const CLOSED_POLL_MS = 2000; 

function audioDebugEnabled() {
  if (typeof window === "undefined" || !window.location) return false;
  const value = new URLSearchParams(window.location.search).get("audioDebug");
  return value === "1" || value === "" || value === "true";
}

export class AudioMonitorController {
  constructor(engine) {
    this.engine = engine;
    this.windowRef = null;
    this.channel = null;
    this.active = false;
    this.ready = false;
    this.raf = 0;
    this.lastFrameTime = 0;
    this.smoothing = {};
    this.closedPoller = 0;
    this._stateFingerprint = null;
  }

  get enabled() {
    return audioDebugEnabled();
  }

  get isOpen() {
    return !!this.windowRef && !this.windowRef.closed;
  }

  open() {
    if (!this.enabled) return;
    try {
      this._open();
    } catch (error) {
      
      console.warn("[audio-monitor] could not open monitor window:", error);
      this._teardown();
    }
  }

  _open() {
    if (this.isOpen) {
      
      try {
        this.windowRef.focus();
      } catch {
        
      }
      this.postState();
      this._startStreaming();
      return;
    }
    if (!this.channel) this._openChannel();
    this.windowRef = window.open(MONITOR_PAGE, MONITOR_WINDOW_NAME, "popup=yes,width=940,height=840");
    if (!this.windowRef) {
      console.warn("[audio-monitor] popup was blocked; open", MONITOR_PAGE, "manually.");
    }
    this.active = true;
    this.postState();
    this._startStreaming();
    if (!this.closedPoller) {
      this.closedPoller = window.setInterval(() => {
        if (this.windowRef && this.windowRef.closed && this.active) this._teardown();
      }, CLOSED_POLL_MS);
    }
  }

  close() {
    if (!this.enabled) return;
    if (this.isOpen) {
      try {
        this.windowRef.close();
      } catch {
        
      }
    }
    this._teardown();
  }

  destroy() {
    this.close();
  }

  _openChannel() {
    this.channel = new BroadcastChannel(MONITOR_CHANNEL_NAME);
    this.channel.onmessage = (event) => {
      const message = event.data;
      if (!message || typeof message !== "object") return;
      if (message.type === "ready") {
        this.ready = true;
        this.postState();
      } else if (message.type === "closed") {
        this._teardown();
      }
    };
  }

  _teardown() {
    this.active = false;
    this.ready = false;
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = 0;
    }
    if (this.closedPoller) {
      window.clearInterval(this.closedPoller);
      this.closedPoller = 0;
    }
    if (this.channel) {
      try {
        this.channel.close();
      } catch {
        
      }
      this.channel = null;
    }
    this.windowRef = null;
    this.smoothing = {};
    this._stateFingerprint = null;
    
    try {
      this.engine.releaseMonitorChannels();
    } catch {
      
    }
  }

  
  
  
  _fingerprint() {
    const e = this.engine;
    return [
      e.mode,
      e.active,
      e.context ? e.context.state : "none",
      e.profile ? e.profile.id : "none",
      e.volume,
      e.params ? `${e.params.surround}|${e.params.center}|${e.params.lfe}` : "",
    ].join("|");
  }

  _maybePostState() {
    const fingerprint = this._fingerprint();
    if (fingerprint !== this._stateFingerprint) {
      this._stateFingerprint = fingerprint;
      this.postState();
    }
  }

  _startStreaming() {
    if (this.raf || !this.active) return;
    const tick = (now) => {
      if (!this.active || !this.channel) {
        this.raf = 0;
        return;
      }
      this._maybePostState();
      if (this.ready && now - this.lastFrameTime >= FRAME_INTERVAL_MS) {
        this.lastFrameTime = now;
        const frame = this._readFrame();
        if (frame) this.channel.postMessage({ type: "frame", data: frame });
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  postState() {
    if (!this.enabled || !this.channel) return;
    const engine = this.engine;
    const profile = engine.profile;
    const context = engine.context;
    const warnings = [];
    if (typeof window !== "undefined" && !window.AudioContext && !window.webkitAudioContext) {
      warnings.push("Web Audio API is not supported by this browser.");
    }
    if (engine.mode === "virtual" && !engine.active) {
      warnings.push("Virtual mode fell back to Stereo — HRTF/graph initialization failed.");
    }
    this.channel.postMessage({
      type: "state",
      mode: engine.mode || "original",
      engineActive: engine.active,
      contextState: context ? context.state : "none",
      profileId: profile ? profile.id : null,
      profileLabel: profile ? profile.label : null,
      azimuths: profile ? profile.azimuths : null,
      params: engine.params ? { ...engine.params } : null,
      volume: engine.volume,
      warnings,
    });
  }

  _readFrame() {
    const taps = this.engine.getMonitorChannels();
    if (!taps) return null;
    const data = {};
    for (const channel of MONITOR_CHANNELS) {
      data[channel] = this._measure(channel, taps.channels[channel]);
    }
    data.masterL = this._measure("masterL", taps.masterL);
    data.masterR = this._measure("masterR", taps.masterR);
    return data;
  }

  _measure(key, analyser) {
    const buffer = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(buffer);
    let sum = 0;
    for (let i = 0; i < buffer.length; i++) sum += buffer[i] * buffer[i];
    const rms = Math.sqrt(sum / buffer.length);
    const prev = this.smoothing[key] || { rms: 0, peak: 0 };
    const smoothed = prev.rms + SMOOTH_ALPHA * (rms - prev.rms);
    const peak = Math.max(smoothed, prev.peak * PEAK_DECAY);
    this.smoothing[key] = { rms: smoothed, peak };
    return { rms: smoothed, peak };
  }
}
