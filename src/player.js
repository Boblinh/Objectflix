









const JASSUB_CDN = "https://cdn.jsdelivr.net/npm/jassub@2.5.14/dist";





const MEDIA_BUST = Date.now().toString(36);

// Checks once whether the browser can play AV1 media.
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

// Looks for a sibling .avc.mp4 when the supplied video may not play on this browser.
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
  // Stores the player elements and initial volume state, then wires and syncs the UI.
  constructor({ video, canvas, controls, centerPlay, playPause, mute, fullscreen, progress, volume, currentTime, totalDuration, subtitleIndicator, message, messageTitle, messageText, fakeDuration }) {
    this.elements = { video, canvas, controls, centerPlay, playPause, mute, fullscreen, progress, volume, currentTime, totalDuration, subtitleIndicator, message, messageTitle, messageText };

    
    
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
    };

    this.listenerController = new AbortController();
    this.listenerOptions = { signal: this.listenerController.signal };

    this.bindPlayerEvents();
    this.syncPlaybackUI();
    this.syncVolumeUI();
    this.syncTimeUI();
  }

  // Resets subtitle state and begins loading a video and its optional subtitle track.
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

  // Selects a compatible video URL, ignores stale loads, and starts video and subtitles.
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

  // Stops playback and releases event listeners, timers, subtitle resources, and the video source.
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
    
    this.elements.video.volume = this.state.userVolume;
    this.elements.video.muted = this.state.userMuted;
    if (this.state.workerUrl) {
      URL.revokeObjectURL(this.state.workerUrl);
      this.state.workerUrl = null;
    }
    this.elements.video.removeAttribute("src");
    this.elements.video.load();
  }

  

  // Formats nonnegative seconds as mm:ss or h:mm:ss for the player display.
  formatTime(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, "0");
    return hours > 0
      ? `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds}`
      : `${minutes}:${remainingSeconds}`;
  }

  // Updates video or subtitle status attributes and presents relevant error text.
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

  // Sets a range input's visual fill to a clamped fraction of its track.
  updateRangeFill(input, ratio) {
    const percent = Math.min(100, Math.max(0, ratio * 100));
    input.style.setProperty("--range-progress", `${percent}%`);
  }

  // Syncs play controls and auto-hide behavior with the video's current state.
  syncPlaybackUI() {
    const { video, controls, centerPlay, playPause } = this.elements;
    const isPlaying = !video.paused && !video.ended;
    controls.classList.toggle("is-playing", isPlaying);
    playPause.setAttribute("aria-label", isPlaying ? "Pause video" : "Play video");
    centerPlay.setAttribute("aria-label", isPlaying ? "Pause video" : "Play video");
    if (isPlaying) this.scheduleControlsHide();
    else this.showControls(false);
  }

  
  // Uses the configured display override when present, otherwise formats the media duration.
  displayDuration(duration) {
    return this.fakeDuration || this.formatTime(duration);
  }

  // Updates elapsed and total time plus the progress slider when the user is not seeking.
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

  // Updates mute labels and the volume slider from the remembered user volume.
  syncVolumeUI() {
    const { controls, mute, volume } = this.elements;
    const muted = this.state.userMuted || this.state.userVolume === 0;
    controls.classList.toggle("is-muted", muted);
    mute.setAttribute("aria-label", muted ? "Unmute video" : "Mute video");
    volume.value = muted ? "0" : String(this.state.userVolume);
    this.updateRangeFill(volume, muted ? 0 : this.state.userVolume);
  }

  // Starts or pauses the video and shows a readable message if playback is rejected.
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

  // Moves playback by a relative number of seconds, clamped to the media duration.
  seekBy(seconds) {
    const { video } = this.elements;
    if (!Number.isFinite(video.duration)) return;
    video.currentTime = Math.min(video.duration, Math.max(0, video.currentTime + seconds));
    this.syncTimeUI();
  }

  // Applies the selected progress-slider position to the video and refreshes the display.
  commitProgress() {
    const { video, progress } = this.elements;
    if (!Number.isFinite(video.duration)) return;
    video.currentTime = (Number(progress.value) / 100) * video.duration;
    this.state.isSeeking = false;
    this.syncTimeUI();
  }

  // Previews a slider seek without changing the video's actual playback position.
  previewProgress() {
    const { video, progress, currentTime } = this.elements;
    if (!Number.isFinite(video.duration)) return;
    this.state.isSeeking = true;
    const previewTime = (Number(progress.value) / 100) * video.duration;
    currentTime.textContent = this.formatTime(previewTime);
    progress.setAttribute("aria-valuetext", `${this.formatTime(previewTime)} of ${this.displayDuration(video.duration)}`);
    this.updateRangeFill(progress, Number(progress.value) / 100);
  }

  // Toggles mute while remembering the last nonzero volume for unmuting.
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

  // Reads the volume slider, updates mute state, and applies the new volume.
  setVolume() {
    const { volume } = this.elements;
    const value = Number(volume.value);
    this.state.userVolume = value;
    this.state.userMuted = value === 0;
    if (value > 0) this.state.lastVolume = value;
    this.applyUserVolume();
    this.syncVolumeUI();
  }

  // Copies remembered volume settings to the video unless this player was destroyed.
  applyUserVolume() {
    const { video } = this.elements;
    if (this.state.destroyed) return;
    video.volume = this.state.userVolume;
    video.muted = this.state.userMuted;
  }

  // Reveals the controls and optionally schedules them to hide during playback.
  showControls(scheduleHide = true) {
    const { controls, video } = this.elements;
    controls.classList.remove("controls-hidden");
    if (scheduleHide && !video.paused) this.scheduleControlsHide();
  }

  // Hides controls after a delay only while playing and without keyboard focus inside them.
  scheduleControlsHide() {
    window.clearTimeout(this.state.controlsTimer);
    this.state.controlsTimer = window.setTimeout(() => {
      const { controls, video } = this.elements;
      if (!video.paused && !controls.matches(":focus-within")) {
        controls.classList.add("controls-hidden");
      }
    }, 2600);
  }

  // Returns the fullscreen element across standard and WebKit browser APIs.
  getFullscreenElement() {
    return document.fullscreenElement || document.webkitFullscreenElement || null;
  }

  // Enters or exits fullscreen and shows a message if the browser refuses the request.
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

  // Syncs fullscreen styling and accessibility text, then resizes subtitle rendering.
  syncFullscreenUI() {
    const isFullscreen = this.getFullscreenElement() === this.elements.controls;
    this.elements.controls.classList.toggle("is-fullscreen", isFullscreen);
    this.elements.fullscreen.setAttribute("aria-label", isFullscreen ? "Exit fullscreen" : "Enter fullscreen");
    this.requestSubtitleResize();
  }

  // Debounces subtitle-canvas resizing after video or viewport geometry changes.
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

  // Handles player shortcuts while leaving modified keys and focused form controls alone.
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

  // Converts browser media error codes into guidance suitable for the player message.
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

  // Marks the player as failed and shows the browser's video error explanation.
  handleVideoError() {
    const message = this.getMediaErrorMessage(this.elements.video.error);
    this.elements.controls.classList.remove("is-loading");
    this.elements.controls.classList.add("has-error");
    this.setState("video", "error", message);
    this.showMessage("Video unavailable", message);
  }

  // Displays a titled message over the player using text-safe DOM updates.
  showMessage(title, text) {
    this.elements.messageTitle.textContent = title;
    this.elements.messageText.textContent = text;
    this.elements.message.classList.remove("is-hidden");
  }

  // Hides the current player message overlay.
  hideMessage() {
    this.elements.message.classList.add("is-hidden");
  }

  

  // Builds a JASSUB module worker that forwards worker console errors to the page.
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

  // Rejects if initialization exceeds the time limit and always clears its timer.
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

  // Groups JASSUB failures into readable WASM, worker, or rendering messages.
  describeJassubError(error) {
    const message = String(error?.message || error || "Unknown JASSUB error");
    if (/wasm|webassembly/i.test(message)) return `Subtitle WASM loading failed: ${message}`;
    if (/worker|module script/i.test(message)) return `Subtitle worker failed: ${message}`;
    return `Subtitle rendering failed: ${message}`;
  }

  // Replaces the active subtitle track, or reports that subtitles were turned off.
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

  // Loads JASSUB, prepares a usable canvas, and reports subtitle startup success or failure.
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

  

  // Connects player controls, media state, keyboard input, and resize events to their handlers.
  bindPlayerEvents() {
    const { video, controls, centerPlay, playPause, mute, fullscreen, volume, progress, message } = this.elements;

    centerPlay.addEventListener("click", () => this.togglePlayback(), this.listenerOptions);
    playPause.addEventListener("click", () => this.togglePlayback(), this.listenerOptions);
    mute.addEventListener("click", () => this.toggleMute(), this.listenerOptions);
    fullscreen.addEventListener("click", () => this.toggleFullscreen(), this.listenerOptions);
    volume.addEventListener("input", () => this.setVolume(), this.listenerOptions);
    progress.addEventListener("input", () => this.previewProgress(), this.listenerOptions);
    progress.addEventListener("change", () => this.commitProgress(), this.listenerOptions);
    message.addEventListener("click", () => this.hideMessage(), this.listenerOptions);

    video.addEventListener("play", () => this.syncPlaybackUI(), this.listenerOptions);
    video.addEventListener("pause", () => this.syncPlaybackUI(), this.listenerOptions);
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
