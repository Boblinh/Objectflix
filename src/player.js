









import { VirtualSurround, SURROUND_MODES, SURROUND_MODE_LABELS, HRTF_PROFILES, HRTF_PROFILE_DEFAULT } from "./surround.js";
import { AudioMonitorController } from "./audio-monitor.js";

const JASSUB_CDN = "https://cdn.jsdelivr.net/npm/jassub@2.5.14/dist";





const MEDIA_BUST = Date.now().toString(36);

function supportsAV1() {
  if (supportsAV1._result === undefined) {
    const probe = document.createElement("video");
    supportsAV1._result = [
      'video/mp4; codecs="av01.0.05M.08"',
      'video/mp4; codecs="av01.0.08M.08"',
      'video/webm; codecs="av01.0.05M.08"',
    ].some((type) => {
      try {
        return !!probe.canPlayType(type);
      } catch {
        return false;
      }
    });
  }
  return supportsAV1._result;
}

// Returns the .avc.mp4 twin URL when one exists upstream, else null.
async function probeAvcTwin(url) {
  try {
    const candidate = new URL(url, window.location.href);
    const stem = candidate.pathname.match(/^(.*)\.[a-z0-9]+$/i);
    if (!stem || candidate.pathname.endsWith(".avc.mp4")) return null;
    candidate.pathname = `${stem[1]}.avc.mp4`;
    const response = await fetch(candidate.toString(), {
      method: "GET",
      headers: { Range: "bytes=0-0" },
    });
    return response.ok ? candidate.toString() : null;
  } catch {
    return null;
  }
}

export class ObjectflixPlayer {
  constructor({ video, canvas, controls, centerPlay, playPause, mute, fullscreen, progress, volume, currentTime, totalDuration, subtitleIndicator, message, messageTitle, messageText, fakeDuration, audioMode, hrtfProfile, surroundIntensity, centerLevel, lfeLevel, audioPanel, audioPanelStatus, surroundIntensityValue, centerLevelValue, lfeLevelValue }) {
    this.elements = { video, canvas, controls, centerPlay, playPause, mute, fullscreen, progress, volume, currentTime, totalDuration, subtitleIndicator, message, messageTitle, messageText, audioMode, hrtfProfile, surroundIntensity, centerLevel, lfeLevel, audioPanel, audioPanelStatus, surroundIntensityValue, centerLevelValue, lfeLevelValue };

    
    
    this.canvasHost = this.elements.canvas?.parentElement || null;

    
    
    this.fakeDuration = fakeDuration || null;

    this.state = {
      isSeeking: false,
      controlsTimer: null,
      resizeTimer: null,
      jassub: null,
      workerUrl: null,
      lastVolume: 1,
      destroyed: false,
      canvasTransferred: false,
      jassubWorkerError: null,
      hasMetadata: false,
      
      
      userVolume: video.volume || 1,
      userMuted: Boolean(video.muted),
      audioMode: "original",
      audioModeBusy: false,
    };

    
    
    this.engine = new VirtualSurround(video);

    
    this.monitor = new AudioMonitorController(this.engine);

    this.listenerController = new AbortController();
    this.listenerOptions = { signal: this.listenerController.signal };

    this.bindPlayerEvents();
    this.syncPlaybackUI();
    this.syncVolumeUI();
    this.syncTimeUI();
    this.syncAudioUI();
  }

  load({ src, subtitleUrl }) {
    const { video, canvas } = this.elements;
    this.state.subtitleUrl = subtitleUrl || null;
    this.state.hasMetadata = false;

    this.elements.controls.classList.remove("has-error", "subtitles-ready");
    this.elements.controls.classList.add("is-loading");
    this.setState("video", "loading", "Loading video…");
    if (this.state.jassub) {
      this.state.jassub.destroy();
      this.state.jassub = null;
    }
    if (canvas) {
      
      
    }
    if (this.state.workerUrl) {
      URL.revokeObjectURL(this.state.workerUrl);
      this.state.workerUrl = null;
    }

    
    
    
    video.crossOrigin = "anonymous";
    const loadToken = (this.state.loadToken = (this.state.loadToken || 0) + 1);
    void this.startPlayback(src, subtitleUrl, loadToken);
  }

  async startPlayback(src, subtitleUrl, loadToken) {
    const { video } = this.elements;

    let mediaSrc = src;
    if (!supportsAV1()) {
      const twin = await probeAvcTwin(src);
      if (twin) mediaSrc = twin;
    }
    if (this.state.loadToken !== loadToken || this.state.destroyed) return;

    if (subtitleUrl) {
      mediaSrc += (mediaSrc.includes("?") ? "&" : "?") + "v=" + MEDIA_BUST;
    }
    video.src = mediaSrc;
    video.load();

    if (subtitleUrl) {
      this.initializeSubtitles();
    } else {
      this.setState("subtitle", "idle", "No subtitles for this episode.");
    }
  }

  destroy() {
    if (this.state.destroyed) return;
    this.state.destroyed = true;
    this.listenerController.abort();
    window.clearTimeout(this.state.controlsTimer);
    window.clearTimeout(this.state.resizeTimer);
    if (screen.orientation?.removeEventListener) {
      screen.orientation.removeEventListener("change", this.requestSubtitleResize);
    }
    if (this.state.jassub) {
      this.state.jassub.destroy();
      this.state.jassub = null;
    }
    
    this.monitor.destroy();
    if (this.engine.active) {
      
      this.elements.video.volume = this.state.userVolume;
      this.elements.video.muted = this.state.userMuted;
      void this.engine.destroy();
    }
    if (this.state.workerUrl) {
      URL.revokeObjectURL(this.state.workerUrl);
      this.state.workerUrl = null;
    }
    this.elements.video.removeAttribute("src");
    this.elements.video.load();
  }

  

  formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, "0");
    return hours > 0
      ? `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds}`
      : `${minutes}:${remainingSeconds}`;
  }

  setState(kind, status, message) {
    const key = kind === "video" ? "video" : "subtitle";
    const el = kind === "video" ? this.elements.video : this.elements.subtitleIndicator;
    if (!el) return;
    if (kind === "video") {
      el.dataset.state = status;
      if (this.elements.messageText) this.elements.messageText.textContent = message;
    } else if (el) {
      el.dataset.state = status;
      if (this.elements.messageText) {
        
        if (status === "error") this.elements.messageText.textContent = message;
      }
      el.classList.toggle("is-ready", status === "ready");
      el.classList.toggle("has-error", status === "error");
    }
  }

  updateRangeFill(input, ratio) {
    const percent = Math.min(100, Math.max(0, ratio * 100));
    input.style.setProperty("--range-progress", `${percent}%`);
  }

  syncPlaybackUI() {
    const { video, controls, centerPlay, playPause } = this.elements;
    const isPlaying = !video.paused && !video.ended;
    controls.classList.toggle("is-playing", isPlaying);
    playPause.setAttribute("aria-label", isPlaying ? "Pause video" : "Play video");
    centerPlay.setAttribute("aria-label", isPlaying ? "Pause video" : "Play video");
    if (isPlaying) this.scheduleControlsHide();
    else this.showControls(false);
  }

  
  displayDuration(duration) {
    return this.fakeDuration || this.formatTime(duration);
  }

  syncTimeUI() {
    const { video, progress, currentTime, totalDuration } = this.elements;
    const duration = video.duration;
    const current = video.currentTime;
    currentTime.textContent = this.formatTime(current);
    totalDuration.textContent = this.displayDuration(duration);
    if (!this.state.isSeeking && Number.isFinite(duration) && duration > 0) {
      const percent = (current / duration) * 100;
      progress.value = String(percent);
      progress.setAttribute("aria-valuetext", `${this.formatTime(current)} of ${this.displayDuration(duration)}`);
      this.updateRangeFill(progress, current / duration);
    }
  }

  syncVolumeUI() {
    const { controls, mute, volume } = this.elements;
    const muted = this.state.userMuted || this.state.userVolume === 0;
    controls.classList.toggle("is-muted", muted);
    mute.setAttribute("aria-label", muted ? "Unmute video" : "Mute video");
    volume.value = muted ? "0" : String(this.state.userVolume);
    this.updateRangeFill(volume, muted ? 0 : this.state.userVolume);
  }

  async togglePlayback() {
    const { video, message, messageTitle, messageText } = this.elements;
    if (video.paused || video.ended) {
      try {
        await video.play();
        this.hideMessage();
      } catch (error) {
        this.showMessage("Playback could not start", this.getMediaErrorMessage(error));
      }
    } else {
      video.pause();
    }
  }

  seekBy(seconds) {
    const { video } = this.elements;
    if (!Number.isFinite(video.duration)) return;
    video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + seconds));
    this.syncTimeUI();
  }

  commitProgress() {
    const { video, progress } = this.elements;
    if (!Number.isFinite(video.duration)) return;
    video.currentTime = (Number(progress.value) / 100) * video.duration;
    this.state.isSeeking = false;
    this.syncTimeUI();
  }

  previewProgress() {
    const { video, progress, currentTime } = this.elements;
    if (!Number.isFinite(video.duration)) return;
    this.state.isSeeking = true;
    const previewTime = (Number(progress.value) / 100) * video.duration;
    currentTime.textContent = this.formatTime(previewTime);
    progress.setAttribute("aria-valuetext", `${this.formatTime(previewTime)} of ${this.displayDuration(video.duration)}`);
    this.updateRangeFill(progress, Number(progress.value) / 100);
  }

  toggleMute() {
    if (this.state.userMuted || this.state.userVolume === 0) {
      this.state.userMuted = false;
      this.state.userVolume = this.state.lastVolume || 1;
    } else {
      this.state.lastVolume = this.state.userVolume;
      this.state.userMuted = true;
    }
    this.applyUserVolume();
    this.syncVolumeUI();
  }

  setVolume() {
    const { volume } = this.elements;
    const value = Number(volume.value);
    this.state.userVolume = value;
    this.state.userMuted = value === 0;
    if (value > 0) this.state.lastVolume = value;
    this.applyUserVolume();
    this.syncVolumeUI();
  }

  applyUserVolume() {
    const { video } = this.elements;
    if (this.state.destroyed) return;
    const effective = this.state.userMuted ? 0 : this.state.userVolume;
    if (this.engine.active) {
      
      
      
      video.volume = 1;
      video.muted = false;
      this.engine.setVolume(effective);
    } else {
      video.volume = this.state.userVolume;
      video.muted = this.state.userMuted;
    }
  }

  setAudioMode(mode) {
    if (this.state.audioModeBusy || this.state.destroyed) return;
    const select = this.elements.audioMode;

    if (mode === SURROUND_MODES.virtual) {
      this.state.audioModeBusy = true;
      this.engine
        .setMode(SURROUND_MODES.virtual)
        .then(() => {
          this.state.audioMode = SURROUND_MODES.virtual;
          this.applyUserVolume();
          this.syncAudioUI();
          
          this.monitor.open();
        })
        .catch(() => {
          
          this.state.audioMode = SURROUND_MODES.stereo;
          if (select) select.value = SURROUND_MODES.stereo;
          this.monitor.close();
          this.engine.setMode(SURROUND_MODES.stereo).catch(() => {});
          this.applyUserVolume();
          this.syncAudioUI();
          this.showMessage("Virtual surround unavailable", "HRTF processing could not be initialized. Audio output is set to Stereo.");
        })
        .finally(() => {
          this.state.audioModeBusy = false;
        });
    } else {
      this.state.audioMode = mode;
      this.monitor.close();
      this.engine.setMode(mode).catch(() => {});
      this.applyUserVolume();
      this.syncAudioUI();
    }
  }

  setHrtfProfile(profileId) {
    this.engine.setProfile(profileId);
  }

  setSurroundParams() {
    const { surroundIntensity, centerLevel, lfeLevel, surroundIntensityValue, centerLevelValue, lfeLevelValue } = this.elements;
    const surround = Number(surroundIntensity.value);
    const center = Number(centerLevel.value);
    const lfe = Number(lfeLevel.value);
    this.engine.setParams({ surround, center, lfe });
    this.updateRangeFill(surroundIntensity, (surround - surroundIntensity.min) / (surroundIntensity.max - surroundIntensity.min));
    this.updateRangeFill(centerLevel, (center - centerLevel.min) / (centerLevel.max - centerLevel.min));
    this.updateRangeFill(lfeLevel, (lfe - lfeLevel.min) / (lfeLevel.max - lfeLevel.min));
    if (surroundIntensityValue) surroundIntensityValue.textContent = surround.toFixed(2);
    if (centerLevelValue) centerLevelValue.textContent = center.toFixed(2);
    if (lfeLevelValue) lfeLevelValue.textContent = lfe.toFixed(2);
  }

  syncAudioUI() {
    const { audioMode, hrtfProfile, audioPanel, audioPanelStatus } = this.elements;
    if (audioPanel) audioPanel.classList.toggle("is-hidden", this.state.audioMode !== SURROUND_MODES.virtual);
    if (audioPanelStatus) {
      audioPanelStatus.textContent =
        this.state.audioMode === SURROUND_MODES.virtual
          ? "HRTF headphone virtualization active"
          : "Stereo output (no HRTF processing)";
    }
    if (hrtfProfile) {
      const id = this.engine.profile ? this.engine.profile.id : HRTF_PROFILE_DEFAULT;
      if (hrtfProfile.value !== id) hrtfProfile.value = id;
    }
    if (audioMode && audioMode.value !== this.state.audioMode) audioMode.value = this.state.audioMode;
  }

  showControls(scheduleHide = true) {
    const { controls, video } = this.elements;
    controls.classList.remove("controls-hidden");
    if (scheduleHide && !video.paused) this.scheduleControlsHide();
  }

  scheduleControlsHide() {
    window.clearTimeout(this.state.controlsTimer);
    this.state.controlsTimer = window.setTimeout(() => {
      const { controls, video } = this.elements;
      if (!video.paused && !controls.matches(":focus-within")) {
        controls.classList.add("controls-hidden");
      }
    }, 2600);
  }

  getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  async toggleFullscreen() {
    try {
      if (this.getFullscreenElement()) {
        const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
        if (!exitFullscreen) throw new Error("Fullscreen exit is not supported by this browser.");
        await exitFullscreen.call(document);
      } else {
        const requestFullscreen = this.elements.controls.requestFullscreen || this.elements.controls.webkitRequestFullscreen;
        if (!requestFullscreen) throw new Error("Container fullscreen is not supported by this browser.");
        await requestFullscreen.call(this.elements.controls);
      }
    } catch (error) {
      this.showMessage("Fullscreen unavailable", error.message || "The browser rejected the fullscreen request.");
    }
  }

  syncFullscreenUI() {
    const isFullscreen = this.getFullscreenElement() === this.elements.controls;
    this.elements.controls.classList.toggle("is-fullscreen", isFullscreen);
    this.elements.fullscreen.setAttribute("aria-label", isFullscreen ? "Exit fullscreen" : "Enter fullscreen");
    this.requestSubtitleResize();
  }

  requestSubtitleResize() {
    window.clearTimeout(this.state.resizeTimer);
    this.state.resizeTimer = window.setTimeout(async () => {
      if (!this.state.jassub || this.state.destroyed) return;
      try {
        await this.state.jassub.resize(true);
      } catch {
        this.setState("subtitle", "error", "Subtitle canvas resize failed.");
      }
    }, 120);
  }

  handleKeyboard(event) {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (
      target instanceof HTMLInputElement ||
      target instanceof HTMLButtonElement ||
      target instanceof HTMLSelectElement ||
      target instanceof HTMLTextAreaElement
    ) return;

    const key = event.key.toLowerCase();
    const actions = {
      " ": () => this.togglePlayback(),
      k: () => this.togglePlayback(),
      arrowleft: () => this.seekBy(-5),
      arrowright: () => this.seekBy(5),
      m: () => this.toggleMute(),
      f: () => this.toggleFullscreen(),
    };
    const action = actions[key];
    if (!action) return;
    event.preventDefault();
    this.showControls();
    action();
  }

  getMediaErrorMessage(error) {
    const mediaError = this.elements.video.error;
    if (mediaError?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
      return "This episode's video is missing or its format is not supported by this browser.";
    }
    if (mediaError?.code === MediaError.MEDIA_ERR_NETWORK) {
      return "The video could not be loaded from the media server.";
    }
    if (mediaError?.code === MediaError.MEDIA_ERR_DECODE) {
      return "The browser could not decode this video format.";
    }
    return error?.message || "Check the video URL and browser codec support.";
  }

  handleVideoError() {
    const message = this.getMediaErrorMessage(this.elements.video.error);
    this.elements.controls.classList.remove("is-loading");
    this.elements.controls.classList.add("has-error");
    this.setState("video", "error", message);
    this.showMessage("Video unavailable", message);
  }

  showMessage(title, text) {
    this.elements.messageTitle.textContent = title;
    this.elements.messageText.textContent = text;
    this.elements.message.classList.remove("is-hidden");
  }

  hideMessage() {
    this.elements.message.classList.add("is-hidden");
  }

  

  createWorkerBlobUrl() {
    const workerSource = `
      import "https://cdn.jsdelivr.net/npm/jassub@2.5.14/dist/worker/worker.js/+esm";

      {
        const origError = console.error.bind(console);
        console.error = (...args) => {
          try {
            const text = args
              .map((a) => (a instanceof Error ? a.stack || a.message : String(a)))
              .join("\\n");
            self.postMessage({ __jassubWorkerError: text });
          } catch {}
          origError(...args);
        };
      }
    `;
    return URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
  }

  withTimeout(promise, milliseconds, message) {
    return Promise.race([
      promise,
      new Promise((_, reject) => {
        this.state.initializationTimer = window.setTimeout(() => reject(new Error(message)), milliseconds);
      }),
    ]).finally(() => {
      window.clearTimeout(this.state.initializationTimer);
      this.state.initializationTimer = null;
    });
  }

  describeJassubError(error) {
    const message = String(error?.message || error || "Unknown JASSUB error");
    if (/wasm|webassembly/i.test(message)) return `Subtitle WASM loading failed: ${message}`;
    if (/worker|module script/i.test(message)) return `Subtitle worker failed: ${message}`;
    return `Subtitle rendering failed: ${message}`;
  }

  async setSubtitleTrack(subtitleUrl) {
    this.state.subtitleUrl = subtitleUrl || null;
    if (this.state.jassub) {
      this.state.jassub.destroy();
      this.state.jassub = null;
    }
    const canvas = this.elements.canvas;
    if (canvas) {
      
      
    }
    if (subtitleUrl) {
      await this.initializeSubtitles();
    } else {
      this.setState("subtitle", "idle", "Subtitles disabled.");
    }
  }

  async initializeSubtitles() {
    const { subtitleIndicator } = this.elements;
    subtitleIndicator.classList.remove("has-error");
    this.setState("subtitle", "loading", "Loading subtitles…");
    this.state.jassubWorkerError = null;

    let JASSUB;
    try {
      JASSUB = (await import("jassub")).default;
    } catch {
      this.setState("subtitle", "error", "Subtitle engine (JASSUB) failed to load from the CDN.");
      return;
    }

    this.state.workerUrl = this.createWorkerBlobUrl();

    if (this.state.canvasTransferred && this.elements.canvas) {
      const fresh = document.createElement("canvas");
      fresh.id = this.elements.canvas.id || "watchSubtitleCanvas";
      fresh.className = this.elements.canvas.className || "JASSUB";
      const host = this.canvasHost || this.elements.canvas.parentElement;
      const oldCanvas = this.elements.canvas;
      if (host) {
        if (oldCanvas.isConnected && oldCanvas.parentElement === host) {
          host.insertBefore(fresh, oldCanvas.nextSibling);
        } else {
          host.appendChild(fresh);
        }
      }
      oldCanvas.remove();
      this.elements.canvas = fresh;
    }

    try {
      this.state.jassub = new JASSUB({
        video: this.elements.video,
        canvas: this.elements.canvas,
        subUrl: this.state.subtitleUrl,
        workerUrl: this.state.workerUrl,
        wasmUrl: `${JASSUB_CDN}/wasm/jassub-worker.wasm`,
        modernWasmUrl: `${JASSUB_CDN}/wasm/jassub-worker-modern.wasm`,
        fonts: [new URL("../assets/fonts/Shag-Lounge.woff2", import.meta.url).href],
        libassStyleOverride: "FontName=Shag-Lounge,Force=1",
        queryFonts: false,
        debug: false,
      });
      this.state.canvasTransferred = true;

      if (this.state.jassub._worker) {
        this.state.jassub._worker.addEventListener("message", (event) => {
          if (event.data && event.data.__jassubWorkerError) {
            this.state.jassubWorkerError = event.data.__jassubWorkerError;
            console.error("[JASSUB worker]:", this.state.jassubWorkerError);
          }
        });
      }

      await this.withTimeout(this.state.jassub.ready, 60_000, "Subtitle initialization timed out after 60 seconds.");
      if (this.state.destroyed) return;
      await this.state.jassub.resize(true);
      this.elements.controls.classList.add("subtitles-ready");
      this.setState("subtitle", "ready", "Subtitles ready — ASS effects enabled.");
      subtitleIndicator.classList.add("is-ready");
    } catch (error) {
      const realError = this.state.jassubWorkerError || error;
      const message = this.describeJassubError(realError);
      this.elements.controls.classList.remove("subtitles-ready");
      this.setState("subtitle", "error", message);
      subtitleIndicator.classList.add("has-error");
      this.showMessage("Subtitle renderer error", message);
    }
  }

  

  bindPlayerEvents() {
    const { video, controls, centerPlay, playPause, mute, fullscreen, volume, progress, canvas, message, audioMode, hrtfProfile, surroundIntensity, centerLevel, lfeLevel } = this.elements;

    centerPlay.addEventListener("click", () => this.togglePlayback(), this.listenerOptions);
    playPause.addEventListener("click", () => this.togglePlayback(), this.listenerOptions);
    mute.addEventListener("click", () => this.toggleMute(), this.listenerOptions);
    fullscreen.addEventListener("click", () => this.toggleFullscreen(), this.listenerOptions);
    volume.addEventListener("input", () => this.setVolume(), this.listenerOptions);
    progress.addEventListener("input", () => this.previewProgress(), this.listenerOptions);
    progress.addEventListener("change", () => this.commitProgress(), this.listenerOptions);
    message.addEventListener("click", () => this.hideMessage(), this.listenerOptions);

    audioMode?.addEventListener("change", () => this.setAudioMode(audioMode.value), this.listenerOptions);
    hrtfProfile?.addEventListener("change", () => this.setHrtfProfile(hrtfProfile.value), this.listenerOptions);
    surroundIntensity?.addEventListener("input", () => this.setSurroundParams(), this.listenerOptions);
    centerLevel?.addEventListener("input", () => this.setSurroundParams(), this.listenerOptions);
    lfeLevel?.addEventListener("input", () => this.setSurroundParams(), this.listenerOptions);

    video.addEventListener("play", () => {
      if (this.engine.active) this.engine.resume();
      this.syncPlaybackUI();
    }, this.listenerOptions);
    video.addEventListener("pause", () => {
      if (this.engine.active) this.engine.suspend();
      this.syncPlaybackUI();
    }, this.listenerOptions);
    video.addEventListener("ended", () => this.syncPlaybackUI(), this.listenerOptions);
    video.addEventListener("timeupdate", () => this.syncTimeUI(), this.listenerOptions);
    video.addEventListener("durationchange", () => this.syncTimeUI(), this.listenerOptions);
    video.addEventListener("volumechange", () => this.syncVolumeUI(), this.listenerOptions);
    video.addEventListener("waiting", () => {
      if (!this.state.hasMetadata) controls.classList.add("is-loading");
    }, this.listenerOptions);
    video.addEventListener("stalled", () => {
      if (!this.state.hasMetadata) controls.classList.add("is-loading");
    }, this.listenerOptions);
    video.addEventListener("playing", () => controls.classList.remove("is-loading"), this.listenerOptions);
    video.addEventListener("canplay", () => {
      controls.classList.remove("is-loading");
      this.requestSubtitleResize();
    }, this.listenerOptions);
    video.addEventListener("loadeddata", () => this.requestSubtitleResize(), this.listenerOptions);
    video.addEventListener("error", () => this.handleVideoError(), this.listenerOptions);
    video.addEventListener("loadedmetadata", () => {
      this.state.hasMetadata = true;
      controls.classList.remove("is-loading", "has-error");
      this.setState("video", "ready", `Video ready — ${this.formatTime(video.duration)}.`);
      this.syncTimeUI();
      this.requestSubtitleResize();
    }, this.listenerOptions);

    controls.addEventListener("pointermove", () => this.showControls(), this.listenerOptions);
    controls.addEventListener("pointerdown", () => this.showControls(), this.listenerOptions);
    controls.addEventListener("focusin", () => this.showControls(false), this.listenerOptions);
    document.addEventListener("keydown", (event) => this.handleKeyboard(event), this.listenerOptions);

    document.addEventListener("fullscreenchange", () => this.syncFullscreenUI(), this.listenerOptions);
    document.addEventListener("webkitfullscreenchange", () => this.syncFullscreenUI(), this.listenerOptions);
    window.addEventListener("resize", () => this.requestSubtitleResize(), this.listenerOptions);
    window.addEventListener("orientationchange", () => this.requestSubtitleResize(), this.listenerOptions);
    if (screen.orientation?.addEventListener) {
      screen.orientation.addEventListener("change", () => this.requestSubtitleResize(), this.listenerOptions);
    }
  }
}

window.ObjectflixPlayer = ObjectflixPlayer;
