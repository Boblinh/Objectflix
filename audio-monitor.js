




const CHANNEL_NAME = "objectflix-audio-monitor";

const SPATIAL_CHANNELS = ["FL", "FR", "C", "SL", "SR", "BL", "BR"];
const MONITOR_CHANNELS = ["FL", "FR", "C", "SL", "SR", "BL", "BR", "LFE"];

const CHANNEL_META = Object.freeze({
  FL: { name: "FL", full: "Front Left" },
  FR: { name: "FR", full: "Front Right" },
  C: { name: "C", full: "Center" },
  SL: { name: "SL", full: "Side Left" },
  SR: { name: "SR", full: "Side Right" },
  BL: { name: "BL", full: "Back Left" },
  BR: { name: "BR", full: "Back Right" },
  LFE: { name: "LFE", full: "Subwoofer (non-spatialized)" },
});

const MODE_LABELS = Object.freeze({
  original: "Original",
  stereo: "Stereo",
  virtual: "Virtual 7.1",
});

const ACTIVE_THRESHOLD = 0.008;
const LEVEL_SCALE = 2.5; 

const $ = (id) => document.getElementById(id);

const ui = {
  engine: $("amEngine"),
  mode: $("amMode"),
  hrtf: $("amHrtf"),
  profile: $("amProfile"),
  context: $("amContext"),
  channels: $("amChannels"),
  output: $("amOutput"),
  outputLevel: $("amOutputLevel"),
  warnings: $("amWarnings"),
  waiting: $("amWaiting"),
  azimuths: $("amAzimuths"),
  ring: $("amRing"),
  lfeChip: $("amLfeChip"),
  cards: $("amCards"),
};

let channel = null;
let raf = 0;
const state = { lastState: null, lastFrame: null };




window.__audioMonitor = {
  get connected() {
    return !!(state.lastState && state.lastFrame);
  },
  get lastState() {
    return state.lastState;
  },
  get lastFrame() {
    return state.lastFrame;
  },
  get hasAudio() {
    if (!state.lastFrame) return false;
    return MONITOR_CHANNELS.some((ch) => (state.lastFrame[ch]?.rms || 0) > ACTIVE_THRESHOLD);
  },
};




channel = new BroadcastChannel(CHANNEL_NAME);
channel.onmessage = (event) => {
  const message = event.data;
  if (!message || typeof message !== "object") return;
  if (message.type === "state") {
    state.lastState = message;
    renderState(message);
    ui.waiting.classList.add("am-waiting--hidden");
  } else if (message.type === "frame") {
    state.lastFrame = message.data;
  }
};
channel.postMessage({ type: "ready" });

window.addEventListener("pagehide", () => {
  cancelAnimationFrame(raf);
  try {
    channel.postMessage({ type: "closed" });
  } catch {
    
  }
  try {
    channel.close();
  } catch {
    
  }
});




function azimuthPosition(degrees) {
  const radians = (degrees * Math.PI) / 180;
  return {
    x: Math.sin(radians), 
    y: -Math.cos(radians), 
  };
}

function buildDiagram(stateMsg) {
  ui.ring.textContent = "";
  const azimuths = stateMsg.azimuths || {};
  for (const name of SPATIAL_CHANNELS) {
    const degrees = azimuths[name];
    const pos = azimuthPosition(typeof degrees === "number" ? degrees : 0);
    const el = document.createElement("div");
    el.className = "am-spk";
    el.dataset.ch = name;
    el.style.left = `${50 + pos.x * 42}%`;
    el.style.top = `${50 + pos.y * 42}%`;
    el.innerHTML =
      `<div class="am-spk__disc"></div>` +
      `<div class="am-spk__label">${name}</div>` +
      `<div class="am-spk__azimuth">${typeof degrees === "number" ? `${degrees}°` : ""}</div>`;
    ui.ring.appendChild(el);
  }
  if (typeof azimuths.LFE === "number" && azimuths.LFE !== 0) {
    ui.lfeChip.textContent = `LFE — MONO (${azimuths.LFE}°)`;
  } else {
    ui.lfeChip.textContent = "LFE — MONO";
  }
}

function renderState(msg) {
  const virtual = msg.mode === "virtual";
  ui.engine.textContent = msg.engineActive ? "ACTIVE" : "INACTIVE";
  ui.engine.classList.toggle("am-on", !!msg.engineActive);
  ui.mode.textContent = MODE_LABELS[msg.mode] || msg.mode;
  ui.hrtf.textContent = virtual && msg.engineActive ? "HRTF" : "—";
  ui.profile.textContent = msg.profileLabel || "—";
  ui.context.textContent = msg.contextState || "none";
  ui.output.textContent = "Stereo / Headphones";
  ui.channels.textContent = "8";

  ui.warnings.textContent = "";
  for (const warning of msg.warnings || []) {
    const line = document.createElement("div");
    line.className = "am-warning";
    line.textContent = "⚠ " + warning;
    ui.warnings.appendChild(line);
  }

  const azimuths = msg.azimuths;
  if (azimuths) {
    const parts = SPATIAL_CHANNELS.map((name) => `${name} ${azimuths[name]}°`);
    parts.push("LFE MONO");
    ui.azimuths.textContent = `(${parts.join("  ·  ")})`;
    buildDiagram(msg);
  } else {
    ui.azimuths.textContent = "";
  }
}




function buildCards() {
  for (const name of MONITOR_CHANNELS) {
    const meta = CHANNEL_META[name];
    const card = document.createElement("article");
    card.className = "am-card";
    card.dataset.ch = name;
    card.innerHTML =
      `<div class="am-card__top">` +
      `<div><span class="am-card__name">${meta.name}</span><span class="am-card__full">${meta.full}</span></div>` +
      `<span class="am-card__dot" title="active"></span>` +
      `</div>` +
      `<div class="am-card__meter"><div class="am-card__meter-fill"></div></div>` +
      `<div class="am-card__readouts">` +
      `<span>RMS <b class="am-rms">0.000</b></span>` +
      `<span>PEAK <b class="am-peak">0.000</b></span>` +
      `</div>`;
    ui.cards.appendChild(card);
  }
}

function scaleLevel(value) {
  return Math.max(0, Math.min(1, value * LEVEL_SCALE));
}

function updateFrame(data) {
  if (!data) return;
  for (const name of MONITOR_CHANNELS) {
    const ch = data[name];
    const card = ui.cards.querySelector(`[data-ch="${name}"]`);
    if (!card || !ch) continue;
    card.classList.toggle("am-card--active", ch.rms > ACTIVE_THRESHOLD);
    card.querySelector(".am-card__dot").classList.toggle("am-on", ch.rms > ACTIVE_THRESHOLD);
    card.querySelector(".am-rms").textContent = ch.rms.toFixed(3);
    card.querySelector(".am-peak").textContent = ch.peak.toFixed(3);
    card.querySelector(".am-card__meter-fill").style.width = `${(scaleLevel(ch.peak) * 100).toFixed(1)}%`;
    const spk = ui.ring.querySelector(`[data-ch="${name}"] .am-spk__disc`);
    if (spk) {
      const level = scaleLevel(ch.rms);
      spk.style.setProperty("--level", level.toFixed(3));
      spk.classList.toggle("am-spk__disc--active", ch.rms > ACTIVE_THRESHOLD);
    }
  }
  if (ui.lfeChip) {
    const lfe = data.LFE;
    const level = lfe ? scaleLevel(lfe.rms) : 0;
    ui.lfeChip.style.setProperty("--level", level.toFixed(3));
    ui.lfeChip.classList.toggle("am-on", !!lfe && lfe.rms > ACTIVE_THRESHOLD);
  }
  const masterL = data.masterL?.rms || 0;
  const masterR = data.masterR?.rms || 0;
  ui.outputLevel.textContent = `${masterL.toFixed(3)} / ${masterR.toFixed(3)}`;
}

function tick() {
  updateFrame(state.lastFrame);
  raf = requestAnimationFrame(tick);
}




buildCards();
raf = requestAnimationFrame(tick);
