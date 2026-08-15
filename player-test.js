import JASSUB from "jassub";

const JASSUB_CDN =
  "https://cdn.jsdelivr.net/npm/jassub@2.5.14/dist";

const ASSET_PATHS = {
  video: "./assets/video/BFDI：TPOT 5： Fishes and Dishes.mp4",
  subtitles: "./assets/subtitles/BFDI：TPOT 5： Fishes and Dishes.en.ass",
};


const CUSTOM_FONT_PATHS = [
  "./assets/fonts/Shag-Lounge.woff2",
];

const absoluteAssets = {
  video: new URL(ASSET_PATHS.video, import.meta.url).href,
  subtitles: new URL(ASSET_PATHS.subtitles, import.meta.url).href,
  fonts: CUSTOM_FONT_PATHS.map((path) => new URL(path, import.meta.url).href),
};

const elements = {
  player: document.getElementById("objectflixPlayer"),
  video: document.getElementById("testVideo"),
  subtitleCanvas: document.getElementById("subtitleCanvas"),
  centerPlay: document.getElementById("centerPlayButton"),
  playPause: document.getElementById("playPauseButton"),
  mute: document.getElementById("muteButton"),
  fullscreen: document.getElementById("fullscreenButton"),
  progress: document.getElementById("progressSlider"),
  volume: document.getElementById("volumeSlider"),
  currentTime: document.getElementById("currentTime"),
  totalDuration: document.getElementById("totalDuration"),
  subtitleIndicator: document.getElementById("subtitleIndicator"),
  message: document.getElementById("playerMessage"),
  messageTitle: document.getElementById("playerMessageTitle"),
  messageText: document.getElementById("playerMessageText"),
  statusSummary: document.getElementById("statusSummary"),
  videoStatus: document.getElementById("videoStatus"),
  videoStatusText: document.getElementById("videoStatusText"),
  subtitleStatus: document.getElementById("subtitleStatus"),
  subtitleStatusText: document.getElementById("subtitleStatusText"),
  fontStatus: document.getElementById("fontStatus"),
  fontStatusText: document.getElementById("fontStatusText"),
};

const state = {
  isSeeking: false,
  controlsTimer: null,
  resizeTimer: null,
  initializationTimer: null,
  lastVolume: 1,
  jassub: null,
  workerUrl: null,
  destroyed: false,
};

const listenerController = new AbortController();
const listenerOptions = { signal: listenerController.signal };

function setStatus(target, textTarget, status, message) {
  target.dataset.state = status;
  textTarget.textContent = message;
  updateStatusSummary();
}

function updateStatusSummary() {
  const statuses = [elements.videoStatus, elements.subtitleStatus];
  if (statuses.some((item) => item.dataset.state === "error")) {
    elements.statusSummary.textContent = "Assets needed";
    return;
  }
  if (statuses.every((item) => item.dataset.state === "ready")) {
    elements.statusSummary.textContent = "Player ready";
    return;
  }
  elements.statusSummary.textContent = "Loading…";
}

function showDevelopmentMessage(title, message) {
  elements.messageTitle.textContent = title;
  elements.messageText.textContent = message;
  elements.message.classList.remove("is-hidden");
}

function hideDevelopmentMessage() {
  elements.message.classList.add("is-hidden");
}

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainingSeconds = Math.floor(seconds % 60).toString().padStart(2, "0");
  return hours > 0
    ? `${hours}:${minutes.toString().padStart(2, "0")}:${remainingSeconds}`
    : `${minutes}:${remainingSeconds}`;
}

function updateRangeFill(input, ratio) {
  const percent = Math.min(100, Math.max(0, ratio * 100));
  input.style.setProperty("--range-progress", `${percent}%`);
}

function syncPlaybackUI() {
  const isPlaying = !elements.video.paused && !elements.video.ended;
  elements.player.classList.toggle("is-playing", isPlaying);
  elements.playPause.setAttribute("aria-label", isPlaying ? "Pause video" : "Play video");
  elements.centerPlay.setAttribute("aria-label", isPlaying ? "Pause video" : "Play video");
  if (isPlaying) scheduleControlsHide();
  else showControls(false);
}

function syncTimeUI() {
  const duration = elements.video.duration;
  const current = elements.video.currentTime;
  elements.currentTime.textContent = formatTime(current);
  elements.totalDuration.textContent = formatTime(duration);
  if (!state.isSeeking && Number.isFinite(duration) && duration > 0) {
    const percent = (current / duration) * 100;
    elements.progress.value = String(percent);
    elements.progress.setAttribute("aria-valuetext", `${formatTime(current)} of ${formatTime(duration)}`);
    updateRangeFill(elements.progress, current / duration);
  }
}

function syncVolumeUI() {
  const muted = elements.video.muted || elements.video.volume === 0;
  elements.player.classList.toggle("is-muted", muted);
  elements.mute.setAttribute("aria-label", muted ? "Unmute video" : "Mute video");
  elements.volume.value = muted ? "0" : String(elements.video.volume);
  updateRangeFill(elements.volume, muted ? 0 : elements.video.volume);
}

async function togglePlayback() {
  if (elements.video.paused || elements.video.ended) {
    try {
      await elements.video.play();
      hideDevelopmentMessage();
    } catch (error) {
      showDevelopmentMessage("Playback could not start", getMediaErrorMessage(error));
    }
  } else {
    elements.video.pause();
  }
}

function seekBy(seconds) {
  if (!Number.isFinite(elements.video.duration)) return;
  elements.video.currentTime = Math.min(
    elements.video.duration,
    Math.max(0, elements.video.currentTime + seconds),
  );
  syncTimeUI();
}

function commitProgress() {
  if (!Number.isFinite(elements.video.duration)) return;
  elements.video.currentTime = (Number(elements.progress.value) / 100) * elements.video.duration;
  state.isSeeking = false;
  syncTimeUI();
}

function previewProgress() {
  if (!Number.isFinite(elements.video.duration)) return;
  state.isSeeking = true;
  const previewTime = (Number(elements.progress.value) / 100) * elements.video.duration;
  elements.currentTime.textContent = formatTime(previewTime);
  elements.progress.setAttribute("aria-valuetext", `${formatTime(previewTime)} of ${formatTime(elements.video.duration)}`);
  updateRangeFill(elements.progress, Number(elements.progress.value) / 100);
}

function toggleMute() {
  if (elements.video.muted || elements.video.volume === 0) {
    elements.video.muted = false;
    elements.video.volume = state.lastVolume || 1;
  } else {
    state.lastVolume = elements.video.volume;
    elements.video.muted = true;
  }
  syncVolumeUI();
}

function setVolume() {
  const volume = Number(elements.volume.value);
  elements.video.volume = volume;
  elements.video.muted = volume === 0;
  if (volume > 0) state.lastVolume = volume;
  syncVolumeUI();
}

function showControls(scheduleHide = true) {
  elements.player.classList.remove("controls-hidden");
  if (scheduleHide && !elements.video.paused) scheduleControlsHide();
}

function scheduleControlsHide() {
  window.clearTimeout(state.controlsTimer);
  state.controlsTimer = window.setTimeout(() => {
    if (!elements.video.paused && !elements.player.matches(":focus-within")) {
      elements.player.classList.add("controls-hidden");
    }
  }, 2600);
}

function getFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || null;
}

async function toggleFullscreen() {
  try {
    if (getFullscreenElement()) {
      const exitFullscreen = document.exitFullscreen || document.webkitExitFullscreen;
      if (!exitFullscreen) throw new Error("Fullscreen exit is not supported by this browser.");
      await exitFullscreen.call(document);
    } else {
      
      const requestFullscreen = elements.player.requestFullscreen || elements.player.webkitRequestFullscreen;
      if (!requestFullscreen) throw new Error("Container fullscreen is not supported by this browser.");
      await requestFullscreen.call(elements.player);
    }
  } catch (error) {
    showDevelopmentMessage("Fullscreen unavailable", error.message || "The browser rejected the fullscreen request.");
  }
}

function syncFullscreenUI() {
  const isFullscreen = getFullscreenElement() === elements.player;
  elements.player.classList.toggle("is-fullscreen", isFullscreen);
  elements.fullscreen.setAttribute("aria-label", isFullscreen ? "Exit fullscreen" : "Enter fullscreen");
  requestSubtitleResize();
}

function requestSubtitleResize() {
  window.clearTimeout(state.resizeTimer);
  state.resizeTimer = window.setTimeout(async () => {
    if (!state.jassub || state.destroyed) return;
    try {
      await state.jassub.resize(true);
    } catch {
      setStatus(elements.subtitleStatus, elements.subtitleStatusText, "error", "Subtitle canvas resize failed.");
    }
  }, 120);
}

function handleKeyboard(event) {
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  const target = event.target;
  if (
    target instanceof HTMLInputElement
    || target instanceof HTMLButtonElement
    || target instanceof HTMLSelectElement
    || target instanceof HTMLTextAreaElement
  ) return;

  const key = event.key.toLowerCase();
  const actions = {
    " ": togglePlayback,
    k: togglePlayback,
    arrowleft: () => seekBy(-5),
    arrowright: () => seekBy(5),
    m: toggleMute,
    f: toggleFullscreen,
  };

  const action = actions[key];
  if (!action) return;
  event.preventDefault();
  showControls();
  action();
}

function getMediaErrorMessage(error) {
  const mediaError = elements.video.error;
  if (mediaError?.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
    return "The test video is missing or its format is not supported by this browser.";
  }
  if (mediaError?.code === MediaError.MEDIA_ERR_NETWORK) {
    return "The test video could not be loaded from the local server.";
  }
  if (mediaError?.code === MediaError.MEDIA_ERR_DECODE) {
    return "The browser could not decode this video format.";
  }
  return error?.message || "Check the local video path and browser codec support.";
}

function handleVideoError() {
  const message = getMediaErrorMessage(elements.video.error);
  elements.player.classList.remove("is-loading");
  elements.player.classList.add("has-error");
  setStatus(elements.videoStatus, elements.videoStatusText, "error", message);
  showDevelopmentMessage(
    "Test video missing or unsupported",
    `Place a browser-compatible file at ${ASSET_PATHS.video}. ${message}`,
  );
}

async function verifySubtitleAsset() {
  setStatus(elements.subtitleStatus, elements.subtitleStatusText, "loading", "Checking local ASS file…");
  try {
    const response = await fetch(absoluteAssets.subtitles, { cache: "no-store", signal: listenerController.signal });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const content = await response.text();
    if (!content.includes("[Script Info]")) throw new Error("The file does not look like an ASS subtitle script.");
    return true;
  } catch (error) {
    if (error.name === "AbortError") return false;
    setStatus(
      elements.subtitleStatus,
      elements.subtitleStatusText,
      "error",
      `Missing or invalid file at ${ASSET_PATHS.subtitles}.`,
    );
    elements.subtitleIndicator.classList.add("has-error");
    showDevelopmentMessage(
      "Subtitle test asset needed",
      `Add a valid .ass file at ${ASSET_PATHS.subtitles}. Video controls can still be tested without it.`,
    );
    return false;
  }
}

function createWorkerBlobUrl() {
  
  const workerSource = `import "https://cdn.jsdelivr.net/npm/jassub@2.5.14/dist/worker/worker.js/+esm";`;
  return URL.createObjectURL(new Blob([workerSource], { type: "text/javascript" }));
}

function withTimeout(promise, milliseconds, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      state.initializationTimer = window.setTimeout(() => reject(new Error(message)), milliseconds);
    }),
  ]).finally(() => {
    window.clearTimeout(state.initializationTimer);
    state.initializationTimer = null;
  });
}

function describeJassubError(error) {
  const message = String(error?.message || error || "Unknown JASSUB error");
  if (/wasm|webassembly/i.test(message)) return `WASM loading failed: ${message}`;
  if (/worker|module script/i.test(message)) return `Subtitle worker failed: ${message}`;
  return `JASSUB initialization failed: ${message}`;
}

async function initializeSubtitles() {
  const subtitleExists = await verifySubtitleAsset();
  if (!subtitleExists || state.destroyed) return;

  setStatus(elements.subtitleStatus, elements.subtitleStatusText, "loading", "Loading JASSUB worker and subtitles…");
  state.workerUrl = createWorkerBlobUrl();

  try {
    state.jassub = new JASSUB({
      video: elements.video,
      canvas: elements.subtitleCanvas,
      subUrl: absoluteAssets.subtitles,
      workerUrl: state.workerUrl,
      wasmUrl: `${JASSUB_CDN}/wasm/jassub-worker.wasm`,
      modernWasmUrl: `${JASSUB_CDN}/wasm/jassub-worker-modern.wasm`,
      fonts: absoluteAssets.fonts,
      libassStyleOverride: "FontName=Shag-Lounge,Force=1",
      queryFonts: false,
      debug: false,
    });

    await withTimeout(
      state.jassub.ready,
      60_000,
      "Subtitle initialization timed out after 60 seconds.",
    );

    if (state.destroyed) return;
    await state.jassub.resize(true);
    elements.player.classList.add("subtitles-ready");
    setStatus(elements.subtitleStatus, elements.subtitleStatusText, "ready", "Subtitles ready — ASS effects enabled.");
    elements.subtitleIndicator.classList.add("is-ready");
  } catch (error) {
    const message = describeJassubError(error);
    elements.player.classList.remove("subtitles-ready");
    setStatus(elements.subtitleStatus, elements.subtitleStatusText, "error", message);
    elements.subtitleIndicator.classList.add("has-error");
    showDevelopmentMessage("Subtitle renderer error", message);
  }
}

function initializeFontStatus() {
  if (absoluteAssets.fonts.length) {
    setStatus(
      elements.fontStatus,
      elements.fontStatusText,
      "ready",
      `${absoluteAssets.fonts.length} custom font file(s) configured.`,
    );
  } else {
    setStatus(
      elements.fontStatus,
      elements.fontStatusText,
      "idle",
      "No local fonts configured; add real paths in player-test.js when needed.",
    );
  }
}

function bindPlayerEvents() {
  elements.centerPlay.addEventListener("click", togglePlayback, listenerOptions);
  elements.playPause.addEventListener("click", togglePlayback, listenerOptions);
  elements.mute.addEventListener("click", toggleMute, listenerOptions);
  elements.fullscreen.addEventListener("click", toggleFullscreen, listenerOptions);
  elements.volume.addEventListener("input", setVolume, listenerOptions);
  elements.progress.addEventListener("input", previewProgress, listenerOptions);
  elements.progress.addEventListener("change", commitProgress, listenerOptions);

  elements.video.addEventListener("play", syncPlaybackUI, listenerOptions);
  elements.video.addEventListener("pause", syncPlaybackUI, listenerOptions);
  elements.video.addEventListener("ended", syncPlaybackUI, listenerOptions);
  elements.video.addEventListener("timeupdate", syncTimeUI, listenerOptions);
  elements.video.addEventListener("durationchange", syncTimeUI, listenerOptions);
  elements.video.addEventListener("volumechange", syncVolumeUI, listenerOptions);
  elements.video.addEventListener("waiting", () => elements.player.classList.add("is-loading"), listenerOptions);
  elements.video.addEventListener("stalled", () => elements.player.classList.add("is-loading"), listenerOptions);
  elements.video.addEventListener("playing", () => elements.player.classList.remove("is-loading"), listenerOptions);
  elements.video.addEventListener("canplay", () => {
    elements.player.classList.remove("is-loading");
    requestSubtitleResize();
  }, listenerOptions);
  elements.video.addEventListener("loadeddata", requestSubtitleResize, listenerOptions);
  elements.video.addEventListener("error", handleVideoError, listenerOptions);
  elements.video.addEventListener("loadedmetadata", () => {
    elements.player.classList.remove("is-loading", "has-error");
    setStatus(
      elements.videoStatus,
      elements.videoStatusText,
      "ready",
      `Video ready — ${formatTime(elements.video.duration)}.`,
    );
    syncTimeUI();
    requestSubtitleResize();
  }, listenerOptions);

  elements.player.addEventListener("pointermove", () => showControls(), listenerOptions);
  elements.player.addEventListener("pointerdown", () => showControls(), listenerOptions);
  elements.player.addEventListener("focusin", () => showControls(false), listenerOptions);
  document.addEventListener("keydown", handleKeyboard, listenerOptions);

  document.addEventListener("fullscreenchange", syncFullscreenUI, listenerOptions);
  document.addEventListener("webkitfullscreenchange", syncFullscreenUI, listenerOptions);
  window.addEventListener("resize", requestSubtitleResize, listenerOptions);
  window.addEventListener("orientationchange", requestSubtitleResize, listenerOptions);
  if (screen.orientation?.addEventListener) {
    screen.orientation.addEventListener("change", requestSubtitleResize, listenerOptions);
  }
}

async function cleanup() {
  if (state.destroyed) return;
  state.destroyed = true;
  listenerController.abort();
  window.clearTimeout(state.controlsTimer);
  window.clearTimeout(state.resizeTimer);
  window.clearTimeout(state.initializationTimer);

  if (screen.orientation?.removeEventListener) {
    screen.orientation.removeEventListener("change", requestSubtitleResize);
  }

  if (state.jassub) {
    try {
      await state.jassub.destroy();
    } catch {
      
    }
    state.jassub = null;
  }

  if (state.workerUrl) {
    URL.revokeObjectURL(state.workerUrl);
    state.workerUrl = null;
  }
}

function initializePlayer() {
  bindPlayerEvents();
  elements.video.src = absoluteAssets.video;
  elements.video.load();
  initializeFontStatus();
  syncPlaybackUI();
  syncVolumeUI();
  syncTimeUI();
  initializeSubtitles();
}

window.addEventListener("pagehide", (event) => {
  if (!event.persisted) cleanup();
}, { signal: listenerController.signal });

initializePlayer();
