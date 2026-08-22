








import {
  VirtualSurround,
  buildVirtualGraph,
  applyUpmixParams,
  applyHrtfProfile,
  crossfadeBranches,
  setBranchVolume,
  createHrtfPanner,
  azimuthToPosition,
  CHANNELS,
  HRTF_PROFILES,
  SURROUND_MODES,
} from "./src/surround.js";

const out = document.getElementById("results");

function newBlock(title) {
  const el = document.createElement("div");
  el.className = "block";
  const h = document.createElement("div");
  h.className = "step";
  h.textContent = title;
  el.appendChild(h);
  out.appendChild(el);
  return el;
}

function line(block, text) {
  const d = document.createElement("div");
  d.textContent = text;
  block.appendChild(d);
}

function status(block, label, ok, detail) {
  const d = document.createElement("div");
  const span = document.createElement("span");
  span.className = ok ? "pass" : "fail";
  span.textContent = `${ok ? "PASS" : "FAIL"} ${label}`;
  d.appendChild(span);
  if (detail !== undefined) {
    d.appendChild(document.createTextNode(` — ${detail}`));
  }
  block.appendChild(d);
}

function table(block, headers, rows) {
  const t = document.createElement("table");
  const thead = document.createElement("thead");
  const hr = document.createElement("tr");
  headers.forEach((h) => {
    const th = document.createElement("th");
    th.textContent = h;
    hr.appendChild(th);
  });
  thead.appendChild(hr);
  t.appendChild(thead);
  const tb = document.createElement("tbody");
  rows.forEach((r) => {
    const tr = document.createElement("tr");
    r.forEach((c) => {
      const td = document.createElement("td");
      if (typeof c === "number") {
        td.className = "num";
        td.textContent = c.toPrecision(4);
      } else {
        td.textContent = String(c);
      }
      tr.appendChild(td);
    });
    tb.appendChild(tr);
  });
  t.appendChild(tb);
  block.appendChild(t);
}

const settle = (ms = 250) => new Promise((resolve) => window.setTimeout(resolve, ms));

function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}




function fillTestChannels(sampleRate, seconds, chL, chR) {
  const rngL = mulberry32(1234);
  const rngR = mulberry32(5678);
  const n = chL.length;
  const bass = (t) => 0.35 * Math.sin(2 * Math.PI * 60 * t);
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    chL[i] = 0.35 * (2 * rngL() - 1) + bass(t);
    chR[i] = 0.35 * (2 * rngR() - 1) + bass(t);
  }
}

function makeTestBuffer(ctx, seconds = 4) {
  const sr = ctx.sampleRate;
  const buffer = ctx.createBuffer(2, Math.floor(sr * seconds), sr);
  fillTestChannels(sr, seconds, buffer.getChannelData(0), buffer.getChannelData(1));
  return buffer;
}



function makeCorrelatedBuffer(ctx, seconds = 4) {
  const sr = ctx.sampleRate;
  const buffer = ctx.createBuffer(2, Math.floor(sr * seconds), sr);
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);
  const rng = mulberry32(99);
  const bass = (t) => 0.35 * Math.sin(2 * Math.PI * 60 * t);
  for (let i = 0; i < L.length; i++) {
    const t = i / sr;
    const noise = 0.35 * (2 * rng() - 1);
    L[i] = noise + bass(t);
    R[i] = noise + bass(t);
  }
  return buffer;
}



function makeAnticorrelatedBuffer(ctx, seconds = 4) {
  const sr = ctx.sampleRate;
  const buffer = ctx.createBuffer(2, Math.floor(sr * seconds), sr);
  const L = buffer.getChannelData(0);
  const R = buffer.getChannelData(1);
  const rngL = mulberry32(111);
  const rngR = mulberry32(222);
  for (let i = 0; i < L.length; i++) {
    L[i] = 0.35 * (2 * rngL() - 1);
    R[i] = -0.35 * (2 * rngR() - 1);
  }
  return buffer;
}

function makeTestWav(seconds = 2, sr = 44100) {
  const n = Math.floor(sr * seconds);
  const bytes = 44 + n * 4;
  const data = new Uint8Array(bytes);
  const view = new DataView(data.buffer);
  const writeStr = (o, s) => {
    for (let i = 0; i < s.length; i++) view.setUint8(o + i, s.charCodeAt(i));
  };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + n * 4, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sr, true);
  view.setUint32(28, sr * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, n * 4, true);
  const chL = new Float32Array(n);
  const chR = new Float32Array(n);
  fillTestChannels(sr, seconds, chL, chR);
  let idx = 44;
  for (let i = 0; i < n; i++) {
    view.setInt16(idx, Math.max(-1, Math.min(1, chL[i])) * 32767, true);
    idx += 2;
    view.setInt16(idx, Math.max(-1, Math.min(1, chR[i])) * 32767, true);
    idx += 2;
  }
  let bin = "";
  for (let i = 0; i < data.length; i += 0x8000) {
    bin += String.fromCharCode.apply(null, data.subarray(i, i + 0x8000));
  }
  return "data:audio/wav;base64," + btoa(bin);
}


function tapMonoFrom(ctx, node, outIndex = 0) {
  const a = ctx.createAnalyser();
  a.fftSize = 4096;
  node.connect(a, outIndex, 0);
  return a;
}

function tapStereo(ctx, node) {
  const sp = ctx.createChannelSplitter(2);
  node.connect(sp);
  const left = ctx.createAnalyser();
  left.fftSize = 4096;
  const right = ctx.createAnalyser();
  right.fftSize = 4096;
  sp.connect(left, 0, 0);
  sp.connect(right, 1, 0);
  return { left, right };
}

function rms(a) {
  const b = new Float32Array(a.fftSize);
  a.getFloatTimeDomainData(b);
  let s = 0;
  for (let i = 0; i < b.length; i++) s += b[i] * b[i];
  return Math.sqrt(s / b.length);
}

function sample(analyser, repeats = 5) {
  let acc = 0;
  for (let i = 0; i < repeats; i++) {
    acc += rms(analyser);
    window.setTimeout(() => {}, 0);
  }
  return acc / repeats;
}

function capture(a) {
  const b = new Float32Array(a.fftSize);
  a.getFloatTimeDomainData(b);
  return b;
}



function bestCorrelate(x, y, maxLag = 64) {
  const n = Math.min(x.length, y.length);
  let best = -Infinity;
  const xm = x.reduce((s, v) => s + v, 0) / n;
  const ym = y.reduce((s, v) => s + v, 0) / n;
  for (let lag = -maxLag; lag <= maxLag; lag++) {
    let num = 0;
    let dx2 = 0;
    let dy2 = 0;
    for (let i = 0; i < n; i++) {
      const j = i + lag;
      const dx = (j >= 0 && j < n ? x[j] : 0) - xm;
      const dy = y[i] - ym;
      num += dx * dy;
      dx2 += dx * dx;
      dy2 += dy * dy;
    }
    const denom = Math.sqrt(dx2 * dy2);
    const rho = denom === 0 ? 0 : num / denom;
    if (rho > best) best = rho;
  }
  return best;
}





async function syntheticDiagnostics() {
  const block = newBlock(
    "1. Synthetic graph — taps at source / center / side / rear / LFE / each HRTF panner / output",
  );
  const ctx = new AudioContext();
  const buffer = makeTestBuffer(ctx);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  const nodes = buildVirtualGraph(ctx, src);
  applyUpmixParams(ctx, nodes, { surround: 1, center: 1, lfe: 1 });
  applyHrtfProfile(ctx, nodes, HRTF_PROFILES[0]);

  const taps = {
    srcL: tapMonoFrom(ctx, nodes.splitter, 0),
    srcR: tapMonoFrom(ctx, nodes.splitter, 1),
    fl: tapMonoFrom(ctx, nodes.gains.FL, 0),
    fr: tapMonoFrom(ctx, nodes.gains.FR, 0),
    c: tapMonoFrom(ctx, nodes.centerFeed, 0),
    side: tapMonoFrom(ctx, nodes.allpass.SL, 0),
    sr: tapMonoFrom(ctx, nodes.allpass.SR, 0),
    rear: tapMonoFrom(ctx, nodes.allpass.BL, 0),
    lfe: tapMonoFrom(ctx, nodes.lfeFilter, 0),
    pass: tapStereo(ctx, nodes.passthrough),
    master: tapStereo(ctx, nodes.master),
  };
  const pannerTaps = {};
  for (const ch of CHANNELS) pannerTaps[ch] = tapStereo(ctx, nodes.panners[ch]);

  src.start(0);
  await settle(500);

  const readGains = () =>
    `master.gain=${nodes.master.gain.value.toPrecision(3)} passthrough.gain=${nodes.passthrough.gain.value.toPrecision(3)}`;

  line(block, "Phase A: Stereo mode (passthrough branch, master = 0)");
  crossfadeBranches(ctx, nodes, false, 1);
  await settle(800);
  line(block, `gains: ${readGains()}`);
  const stereoL = sample(taps.pass.left);
  const stereoR = sample(taps.pass.right);
  const masterSilentL = sample(taps.master.left);
  const masterSilentR = sample(taps.master.right);

  line(block, "Phase B: Virtual mode (master branch, passthrough = 0)");
  crossfadeBranches(ctx, nodes, true, 1);
  await settle(800);
  line(block, `gains: ${readGains()}`);
  const passInVirtualL = sample(taps.pass.left);
  const passInVirtualR = sample(taps.pass.right);
  const virtL = sample(taps.master.left);
  const virtR = sample(taps.master.right);

  
  const rows = [];
  const pushMono = (label, analyser) => rows.push([label, sample(analyser), "—"]);
  pushMono("source L (post-splitter)", taps.srcL);
  pushMono("source R (post-splitter)", taps.srcR);
  pushMono("FL pre-panner", taps.fl);
  pushMono("FR pre-panner", taps.fr);
  pushMono("C pre-panner", taps.c);
  pushMono("SL pre-panner", taps.side);
  pushMono("BL post-delay", taps.rear);
  pushMono("LFE (low-passed)", taps.lfe);
  for (const ch of CHANNELS) rows.push([`panner ${ch} output`, sample(pannerTaps[ch].left), sample(pannerTaps[ch].right)]);
  rows.push(["PASSTHROUGH branch (must be ≈ 0)", sample(taps.pass.left), sample(taps.pass.right)]);
  rows.push(["MASTER branch (virtual output)", sample(taps.master.left), sample(taps.master.right)]);
  table(block, ["tap", "L rms", "R rms"], rows);

  line(block, "Phase C: volume to 0.5 while still virtual (player's applyUserVolume path)");
  setBranchVolume(ctx, nodes, true, 0.5);
  await settle(600);
  line(block, `gains: ${readGains()}`);
  const passAfterVolL = sample(taps.pass.left);
  const passAfterVolR = sample(taps.pass.right);
  const virtHalfL = sample(taps.master.left);
  const virtHalfR = sample(taps.master.right);
  setBranchVolume(ctx, nodes, true, 1);
  await settle(600);

  line(block, "Phase D: waveform capture for Stereo vs Virtual comparison");
  const virtWave = [capture(taps.master.left), capture(taps.master.right)];
  crossfadeBranches(ctx, nodes, false, 1);
  await settle(800);
  const stereoWave = [capture(taps.pass.left), capture(taps.pass.right)];
  const stereoWave2 = [capture(taps.pass.left), capture(taps.pass.right)];
  await settle(50);

  line(block, `Stereo output rms: L=${stereoL.toPrecision(4)} R=${stereoR.toPrecision(4)}`);
  line(block, `Virtual output rms: L=${virtL.toPrecision(4)} R=${virtR.toPrecision(4)}`);
  line(block, `Virtual output rms @0.5 volume: L=${virtHalfL.toPrecision(4)} R=${virtHalfR.toPrecision(4)}`);
  line(block, `Passthrough rms in Stereo mode: L=${stereoL.toPrecision(4)} R=${stereoR.toPrecision(4)}`);
  line(block, `Passthrough rms in Virtual mode: L=${passInVirtualL.toPrecision(4)} R=${passInVirtualR.toPrecision(4)}`);
  line(block, `Passthrough rms in Virtual mode after setVolume(0.5): L=${passAfterVolL.toPrecision(4)} R=${passAfterVolR.toPrecision(4)}`);

  const corrL = bestCorrelate(stereoWave[0], virtWave[0]);
  const corrR = bestCorrelate(stereoWave[1], virtWave[1]);
  const sanity = bestCorrelate(stereoWave[0], stereoWave2[0]);
  line(block, `Cross-correlation Stereo vs Virtual (best lag): L=${corrL.toPrecision(4)} R=${corrR.toPrecision(4)} (sanity, same-capture: ${sanity.toPrecision(4)})`);

  const slWave = capture(taps.side);
  const srWave = capture(taps.sr);
  const sideCorr = bestCorrelate(slWave, srWave);
  line(block, `SL vs SR pre-panner correlation: ${sideCorr.toPrecision(4)} (exact phase inverse would be −1.000)`);

  
  const passFull = Math.max(stereoL, stereoR, 1e-6);
  status(block, "Virtual branch is audible", virtL > 1e-4 && virtR > 1e-4, `L=${virtL}, R=${virtR}`);
  status(block, "Passthrough muted in Virtual mode", passInVirtualL < passFull * 0.02 && passInVirtualR < passFull * 0.02, `L=${passInVirtualL}, R=${passInVirtualR} vs full=${passFull}`);
  status(block, "Passthrough stays muted after setVolume(0.5)", passAfterVolL < passFull * 0.02 && passAfterVolR < passFull * 0.02, `L=${passAfterVolL}, R=${passAfterVolR}`);
  status(block, "Master silent in Stereo mode", masterSilentL < virtL * 0.02 && masterSilentR < virtR * 0.02, `L=${masterSilentL}, R=${masterSilentR}`);
  status(block, "Volume halving applies to the virtual branch", virtHalfL > virtL * 0.4 && virtHalfL < virtL * 0.6, `0.5*virtL=${virtL * 0.5}, got=${virtHalfL}`);
  const cIn = sample(taps.c);
  const sIn = sample(taps.side);
  const rIn = sample(taps.rear);
  status(block, "C / SL / rear panner inputs are non-zero", cIn > 1e-4 && sIn > 1e-4 && rIn > 1e-4, `C=${cIn}, SL=${sIn}, BL=${rIn}`);
  status(block, "LFE (low-passed bass) is non-zero", sample(taps.lfe) > 1e-4, `lfe=${sample(taps.lfe)}`);
  status(block, "SL and SR are decorrelated (not a phase-inverse pair)", Math.abs(sideCorr) < 0.7, `|corr|=${Math.abs(sideCorr).toPrecision(4)}`);
  const pannerNonZero = CHANNELS.every((ch) => {
    const l = sample(pannerTaps[ch].left);
    const r = sample(pannerTaps[ch].right);
    return l > 1e-4 || r > 1e-4;
  });
  status(block, "All 7 HRTF panners output non-zero audio", pannerNonZero);
  status(block, "Stereo output differs from Virtual output", corrL < 0.9 || corrR < 0.9, `corr L=${corrL}, R=${corrR}`);

  src.stop();
  try {
    await ctx.close();
  } catch {
    
  }
}





async function pannerExperiment() {
  const block = newBlock("2. Panner azimuth / HRTF experiment (mono 2–5 kHz source)");
  const ctx = new AudioContext();
  
  
  
  const oscs = [
    [2000, 0.3],
    [3150, 0.25],
    [5000, 0.2],
  ].map(([f, g]) => {
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.value = f;
    const og = ctx.createGain();
    og.gain.value = g;
    o.connect(og);
    return [o, og];
  });
  const feed = ctx.createGain();
  feed.gain.value = 0.4;
  for (const [, og] of oscs) og.connect(feed);
  const out = ctx.createGain();
  out.gain.value = 0; 
  out.connect(ctx.destination);

  
  
  
  
  const warm = createHrtfPanner(ctx);
  feed.connect(warm);
  warm.connect(out);
  await settle(900);

  const setups = [];
  for (const az of [-90, 0, 90]) {
    const p = createHrtfPanner(ctx);
    const pos = azimuthToPosition(az);
    p.positionX.value = pos.x;
    p.positionY.value = pos.y;
    p.positionZ.value = pos.z;
    const mute = ctx.createGain();
    mute.gain.value = 0;
    const tap = tapStereo(ctx, p);
    feed.connect(mute);
    mute.connect(p);
    p.connect(out);
    setups.push({ az, p, mute, tap, pos });
  }
  for (const [o] of oscs) o.start(0);
  await settle(200);

  const rows = [];
  const ratios = {};
  for (const s of setups) {
    s.mute.gain.value = 1;
    await settle(500);
    const l = sample(s.tap.left);
    const r = sample(s.tap.right);
    s.l = l;
    s.r = r;
    ratios[s.az] = { l, r };
    rows.push([
      `${s.az}°`,
      s.p.panningModel,
      s.pos.x.toFixed(3),
      s.pos.z.toFixed(3),
      l,
      r,
      (l + r) === 0 ? 0 : (l / r),
    ]);
    s.mute.gain.value = 0;
    await settle(60);
  }
  table(block, ["azimuth", "panningModel", "posX", "posZ", "L rms", "R rms", "L/R"], rows);

  const modelsOk = setups.every((s) => ["HRTF", "hrtf"].includes(s.p.panningModel));
  status(block, "panningModel is HRTF on every panner", modelsOk);

  const r90 = ratios[90];
  const l90 = ratios[-90];
  const c0 = ratios[0];
  status(block, "-90°: L clearly above R (head shadow)", l90.l > l90.r * 2, `L=${l90.l}, R=${l90.r}, ratio=${(l90.l / l90.r).toPrecision(3)}`);
  status(block, "+90°: R clearly above L (head shadow)", r90.r > r90.l * 2, `L=${r90.l}, R=${r90.r}, ratio=${(r90.r / r90.l).toPrecision(3)}`);
  status(block, "0° renders both ears roughly equal", c0.l > c0.r * 0.5 && c0.r > c0.l * 0.5, `L=${c0.l}, R=${c0.r}`);

  for (const [o] of oscs) o.stop();
  try {
    await ctx.close();
  } catch {
    
  }
}





async function mediaDiagnostics() {
  const block = newBlock("3. Real VirtualSurround engine on an <audio> element");
  const audio = document.createElement("audio");
  audio.loop = true;
  audio.src = makeTestWav();
  document.body.appendChild(audio);

  const engine = new VirtualSurround(audio);
  const beforeVolume = audio.volume;
  const beforeMuted = audio.muted;

  line(block, "engine.setMode('virtual') …");
  await engine.setMode(SURROUND_MODES.virtual);
  await engine.resume();
  const ctx = engine.context;
  const taps = {
    pass: tapStereo(ctx, engine.nodes.passthrough),
    master: tapStereo(ctx, engine.nodes.master),
    srcL: tapMonoFrom(ctx, engine.nodes.splitter, 0),
    srcR: tapMonoFrom(ctx, engine.nodes.splitter, 1),
  };
  line(block, `context.state=${ctx.state} sampleRate=${ctx.sampleRate} channels=${ctx.destination.channelCount}`);

  await audio.play();
  await settle(600);

  const afterVolume = audio.volume;
  const afterMuted = audio.muted;
  const srcL = sample(taps.srcL);
  const srcR = sample(taps.srcR);
  const virtL = sample(taps.master.left);
  const virtR = sample(taps.master.right);
  const passInVirtualL = sample(taps.pass.left);
  const passInVirtualR = sample(taps.pass.right);

  line(block, `element volume/muted pinned: ${beforeVolume}→${afterVolume}, ${beforeMuted}→${afterMuted}`);
  line(block, `source L/R rms = ${srcL.toPrecision(4)} / ${srcR.toPrecision(4)}`);
  line(block, `virtual output rms = ${virtL.toPrecision(4)} / ${virtR.toPrecision(4)}`);
  line(block, `passthrough rms while virtual = ${passInVirtualL.toPrecision(4)} / ${passInVirtualR.toPrecision(4)}`);

  engine.setVolume(0.5);
  await settle(300);
  const passAfterVolL = sample(taps.pass.left);
  const passAfterVolR = sample(taps.pass.right);
  const virtHalfL = sample(taps.master.left);
  const virtHalfR = sample(taps.master.right);
  line(block, `after engine.setVolume(0.5): virtual rms = ${virtHalfL.toPrecision(4)} / ${virtHalfR.toPrecision(4)}, passthrough rms = ${passAfterVolL.toPrecision(4)} / ${passAfterVolR.toPrecision(4)}`);

  engine.setVolume(1);
  await settle(300);
  engine.setMode(SURROUND_MODES.stereo);
  await settle(500);
  const stereoPassL = sample(taps.pass.left);
  const stereoPassR = sample(taps.pass.right);
  const masterSilentL = sample(taps.master.left);
  const masterSilentR = sample(taps.master.right);
  line(block, `stereo mode: passthrough rms = ${stereoPassL.toPrecision(4)} / ${stereoPassR.toPrecision(4)}, master rms = ${masterSilentL.toPrecision(4)} / ${masterSilentR.toPrecision(4)}`);

  status(block, "Element pinned to unity while graph active", afterVolume === 1 && afterMuted === false, `volume=${afterVolume}, muted=${afterMuted}`);
  status(block, "Source reaches the graph", srcL > 1e-4 && srcR > 1e-4, `L=${srcL}, R=${srcR}`);
  status(block, "Virtual branch audible through real engine", virtL > 1e-4 && virtR > 1e-4, `L=${virtL}, R=${virtR}`);
  status(block, "Passthrough muted in virtual mode", passInVirtualL < srcL * 0.02 && passInVirtualR < srcR * 0.02, `L=${passInVirtualL}, R=${passInVirtualR}`);
  status(block, "Passthrough stays muted after setVolume(0.5)", passAfterVolL < srcL * 0.02 && passAfterVolR < srcR * 0.02, `L=${passAfterVolL}, R=${passAfterVolR}`);
  status(block, "setVolume(0.5) halves virtual output", virtHalfL > virtL * 0.4 && virtHalfL < virtL * 0.6, `half=${virtL * 0.5}, got=${virtHalfL}`);
  status(block, "Stereo mode: master muted, passthrough open", masterSilentL < srcL * 0.02 && stereoPassL > srcL * 0.4, `master=${masterSilentL}, pass=${stereoPassL}`);

  audio.pause();
  await engine.destroy();
  audio.remove();
}








function buildLegacyGraph(ctx, sourceNode) {
  const passthrough = ctx.createGain();
  passthrough.gain.value = 0;
  sourceNode.connect(passthrough);
  passthrough.connect(ctx.destination);
  const splitter = ctx.createChannelSplitter(2);
  sourceNode.connect(splitter);
  const panners = {};
  for (const ch of CHANNELS) panners[ch] = createHrtfPanner(ctx);
  const g = {};
  for (const k of ["FL", "FR", "CL", "CR", "SL_L", "SL_R", "SR_L", "SR_R", "BL_L", "BL_R", "BR_L", "BR_R", "LFE_L", "LFE_R"]) {
    g[k] = ctx.createGain();
  }
  splitter.connect(g.FL, 0);
  g.FL.connect(panners.FL);
  splitter.connect(g.FR, 1);
  g.FR.connect(panners.FR);
  splitter.connect(g.CL, 0);
  g.CL.connect(panners.C);
  splitter.connect(g.CR, 1);
  g.CR.connect(panners.C);
  splitter.connect(g.SL_L, 0);
  g.SL_L.connect(panners.SL);
  splitter.connect(g.SL_R, 1);
  g.SL_R.connect(panners.SL);
  splitter.connect(g.SR_L, 0);
  g.SR_L.connect(panners.SR);
  splitter.connect(g.SR_R, 1);
  g.SR_R.connect(panners.SR);
  const delayBL = ctx.createDelay(0.1);
  delayBL.delayTime.value = 0.02;
  splitter.connect(g.BL_L, 0);
  g.BL_L.connect(delayBL);
  splitter.connect(g.BL_R, 1);
  g.BL_R.connect(delayBL);
  delayBL.connect(panners.BL);
  const delayBR = ctx.createDelay(0.1);
  delayBR.delayTime.value = 0.02;
  splitter.connect(g.BR_L, 0);
  g.BR_L.connect(delayBR);
  splitter.connect(g.BR_R, 1);
  g.BR_R.connect(delayBR);
  delayBR.connect(panners.BR);
  const lfeSum = ctx.createGain();
  lfeSum.gain.value = 1;
  const lfeFilter = ctx.createBiquadFilter();
  lfeFilter.type = "lowpass";
  lfeFilter.frequency.value = 120;
  lfeFilter.Q.value = 0.707;
  splitter.connect(g.LFE_L, 0);
  g.LFE_L.connect(lfeSum);
  splitter.connect(g.LFE_R, 1);
  g.LFE_R.connect(lfeSum);
  lfeSum.connect(lfeFilter);
  const trim = ctx.createGain();
  trim.gain.value = 0.85;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -8;
  comp.knee.value = 20;
  comp.ratio.value = 3;
  comp.attack.value = 0.003;
  comp.release.value = 0.25;
  const master = ctx.createGain();
  master.gain.value = 0;
  for (const ch of CHANNELS) panners[ch].connect(trim);
  lfeFilter.connect(trim);
  trim.connect(comp);
  comp.connect(master);
  master.connect(ctx.destination);
  return { passthrough, master, splitter, panners, gains: g, lfeFilter, delays: { BL: delayBL, BR: delayBR } };
}

function applyLegacyParams(nodes) {
  const g = nodes.gains;
  g.FL.gain.value = 1;
  g.FR.gain.value = 1;
  g.CL.gain.value = 0.5;
  g.CR.gain.value = 0.5;
  g.SL_L.gain.value = 0.5;
  g.SL_R.gain.value = -0.5;
  g.SR_L.gain.value = -0.5;
  g.SR_R.gain.value = 0.5;
  g.BL_L.gain.value = 0.3;
  g.BL_R.gain.value = -0.3;
  g.BR_L.gain.value = -0.3;
  g.BR_R.gain.value = 0.3;
  g.LFE_L.gain.value = 0.5;
  g.LFE_R.gain.value = 0.5;
}

const dbDiff = (a, b) => 20 * Math.log10(Math.max(a, 1e-9) / Math.max(b, 1e-9));

function measureStats(analysers) {
  
  const waves = analysers.map((a) => {
    const b = new Float32Array(a.fftSize);
    a.getFloatTimeDomainData(b);
    return b;
  });
  let sum = 0;
  let peak = 0;
  let clip = 0;
  for (const w of waves) {
    for (let i = 0; i < w.length; i++) {
      const v = Math.abs(w[i]);
      sum += v * v;
      if (v > peak) peak = v;
      if (v >= 0.999) clip++;
    }
  }
  const n = waves.reduce((s, w) => s + w.length, 0);
  return { rms: Math.sqrt(sum / n), peak, clip };
}

async function upmixComparison() {
  const block = newBlock(
    "4. Original vs Legacy vs New upmix — loudness, peaks, clipping, output correlation",
  );
  const ctx = new AudioContext();
  const signals = {
    mixed: makeTestBuffer(ctx),
    mono: makeCorrelatedBuffer(ctx),
    anti: makeAnticorrelatedBuffer(ctx),
  };

  const rows = [];
  const results = {};
  for (const [name, buffer] of Object.entries(signals)) {
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const nw = buildVirtualGraph(ctx, src);
    applyUpmixParams(ctx, nw, { surround: 1, center: 1, lfe: 1 });
    applyHrtfProfile(ctx, nw, HRTF_PROFILES[0]);
    const lg = buildLegacyGraph(ctx, src);
    applyLegacyParams(lg);
    applyHrtfProfile(ctx, lg, HRTF_PROFILES[0]);

    
    nw.passthrough.gain.value = 1;
    nw.master.gain.value = 1;
    lg.master.gain.value = 1;

    const tapsNew = tapStereo(ctx, nw.master);
    const tapsLegacy = tapStereo(ctx, lg.master);
    const tapsOrig = tapStereo(ctx, nw.passthrough);

    src.start(0);
    await settle(1200);

    const stats = (t) => measureStats([t.left, t.right]);
    const orig = stats(tapsOrig);
    const legacy = stats(tapsLegacy);
    const nwe = stats(tapsNew);
    const corrNewOrig = (bestCorrelate(capture(tapsNew.left), capture(tapsOrig.left)) + bestCorrelate(capture(tapsNew.right), capture(tapsOrig.right))) / 2;
    const corrLegacyNew = (bestCorrelate(capture(tapsLegacy.left), capture(tapsNew.left)) + bestCorrelate(capture(tapsLegacy.right), capture(tapsNew.right))) / 2;
    results[name] = { orig, legacy, nwe, corrNewOrig, corrLegacyNew };

    rows.push([
      name,
      orig.rms.toFixed(3),
      legacy.rms.toFixed(3),
      nwe.rms.toFixed(3),
      dbDiff(nwe.rms, orig.rms).toFixed(2) + " dB",
      nwe.peak.toFixed(3),
      nwe.clip,
      legacy.peak.toFixed(3),
      legacy.clip,
      corrNewOrig.toFixed(3),
      corrLegacyNew.toFixed(3),
    ]);
    src.stop();
  }
  table(block, ["signal", "orig rms", "legacy rms", "new rms", "new vs orig", "new peak", "new clip", "legacy peak", "legacy clip", "new↔orig corr", "legacy↔new corr"], rows);

  const m = results.mixed;
  status(block, "Mixed material: new upmix loudness within ±3 dB of original", Math.abs(dbDiff(m.nwe.rms, m.orig.rms)) <= 3, `delta=${dbDiff(m.nwe.rms, m.orig.rms).toFixed(2)} dB`);
  status(block, "No clipping on any test signal (new upmix)", !results.mono.nwe.clip && !results.anti.nwe.clip && !results.mixed.nwe.clip, `clip: mixed=${m.nwe.clip}, mono=${results.mono.nwe.clip}, anti=${results.anti.nwe.clip}`);
  status(block, "New upmix output differs from Original", m.corrNewOrig < 0.9, `corr=${m.corrNewOrig.toPrecision(4)}`);
  status(block, "New upmix differs from Legacy", m.corrLegacyNew < 0.99, `corr=${m.corrLegacyNew.toPrecision(4)}`);
  status(block, "Anti-correlated material still audible (no null)", results.anti.nwe.rms > 1e-4, `rms=${results.anti.nwe.rms.toPrecision(4)}`);
  status(block, "Correlated material loudness stays bounded", dbDiff(results.mono.nwe.rms, results.mono.orig.rms) < 6, `delta=${dbDiff(results.mono.nwe.rms, results.mono.orig.rms).toFixed(2)} dB`);

  try {
    await ctx.close();
  } catch {
    
  }
}

document.getElementById("runSynthetic").addEventListener("click", () => {
  syntheticDiagnostics().catch((error) => line(out, `ERROR: ${error.message}`));
});
document.getElementById("runPanner").addEventListener("click", () => {
  pannerExperiment().catch((error) => line(out, `ERROR: ${error.message}`));
});
document.getElementById("runMedia").addEventListener("click", () => {
  mediaDiagnostics().catch((error) => line(out, `ERROR: ${error.message}`));
});
document.getElementById("runComparison").addEventListener("click", () => {
  upmixComparison().catch((error) => line(out, `ERROR: ${error.message}`));
});
